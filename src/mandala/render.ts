// Canvas renderer for the mandala.
//
// Layers, back to front:
//   1. background (deep radial vignette)
//   2. connective mesh: nearest-neighbor links drawn as gradient strokes so the
//      color flows smoothly from one slot to the next
//   3. ghost slots: dim but clearly visible outlined rings
//   4. lit slots: additive bloom with a hot white core
//
// The tight golden-angle packing plus the smooth radial color field make the
// whole figure read as a continuous gradient rather than discrete dots.

import type { Slot, StageView } from "./layout";
import { colorForSlot, GHOST_RGB, rgba, type Palette } from "./palette";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export type SizeMode = "uniform" | "grow" | "shrink";

export interface RenderOptions {
  width: number;
  height: number;
  view: StageView;
  onCount: number;
  palette: Palette;
  sizeMode: SizeMode;
  /** Strength of the center-outward size gradient, 0..1. */
  sizeAmount: number;
  /** Continuously animate the size gradient grow<->shrink. */
  sizePulse: boolean;
  /** When false, dots are capped so they never overlap. */
  allowOverlap: boolean;
  /** Brightness/size of the lit slots' glow, 0..1. */
  lightIntensity: number;
  /** Draw the connective mesh between slots. */
  showConnectors: boolean;
  /** Animate light intensity as a staggered, outward breathing ripple. */
  lightWave: boolean;
  time: number;
  animate: boolean;
}

const TAU = Math.PI * 2;

// How extreme the size gradient gets at full strength (fraction added/removed
// at each end of the center-to-edge range).
const MAX_AMP = 0.85;

// Fraction of the canvas half-size the figure (incl. dots) is allowed to use.
const MARGIN = 0.94;

/** Per-slot size multiplier from the center-outward gradient. */
function sizeMultiplier(
  radius: number,
  mode: SizeMode,
  amount: number,
): number {
  if (mode === "uniform") return 1;
  const t = radius < 0 ? 0 : radius > 1 ? 1 : radius;
  const amp = MAX_AMP * Math.max(0, Math.min(1, amount));
  // grow: small center -> big edge; shrink: big center -> small edge.
  return mode === "grow" ? 1 - amp + 2 * amp * t : 1 + amp - 2 * amp * t;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const g = ctx.createRadialGradient(
    width / 2,
    height / 2,
    0,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  g.addColorStop(0, "#0c1228");
  g.addColorStop(0.55, "#070a16");
  g.addColorStop(1, "#02030a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Fill a link between A and B as a quad that is `halfA` thick at A and `halfB`
 * thick at B, so it can taper (e.g. thick at a lit slot, thin at an off slot).
 * The caller sets ctx.fillStyle (typically a linear gradient).
 */
function fillTaperedLink(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfA: number,
  halfB: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  // Unit perpendicular.
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(ax + nx * halfA, ay + ny * halfA);
  ctx.lineTo(bx + nx * halfB, by + ny * halfB);
  ctx.lineTo(bx - nx * halfB, by - ny * halfB);
  ctx.lineTo(ax - nx * halfA, ay - ny * halfA);
  ctx.closePath();
  ctx.fill();
}

export function renderMandala(
  ctx: CanvasRenderingContext2D,
  opts: RenderOptions,
) {
  const {
    width,
    height,
    view,
    onCount,
    palette,
    sizeMode,
    sizeAmount,
    sizePulse,
    allowOverlap,
    lightIntensity,
    showConnectors,
    lightWave,
    time,
    animate,
  } = opts;
  const { slots, edges, fit } = view;

  drawBackground(ctx, width, height);
  if (slots.length === 0) return;

  const cx = width / 2;
  const cy = height / 2;
  const S = Math.min(width, height) / 2;

  const rotation = animate ? time * 0.03 : 0;
  const breathe = animate ? 1 + Math.sin(time * 0.7) * 0.012 : 1;
  const pulse = animate ? (Math.sin(time * 1.5) + 1) / 2 : 0.5;
  const visibleCount = slots.length;
  const n = slots.length;

  // Mesh intensity: stronger for small stages, faint for the full bloom.
  const t = (visibleCount - 3) / (500 - 3);
  const meshAlpha = 0.55 * (1 - t) + 0.1;

  // Per-slot local spacing (normalized). Defensive fallback for stale views.
  const fallbackSpacing =
    (Number.isFinite(view.spacing) && view.spacing > 0
      ? view.spacing
      : (view.dotRadius || 0.05) / 0.6) / (fit > 0 ? fit : 0.9);
  const neighbor =
    Array.isArray(view.neighbor) && view.neighbor.length === n
      ? view.neighbor
      : new Array<number>(n).fill(fallbackSpacing);

  const safeAmount = Number.isFinite(sizeAmount)
    ? Math.max(0, Math.min(1, sizeAmount))
    : 0.5;

  // Size pulse: sweep the gradient from full grow -> uniform -> full shrink and
  // back, continuously. cos() gives a smooth signed amount in [-1, 1] where
  // +1 = grow 100%, 0 = uniform, -1 = shrink 100%.
  const SIZE_PULSE_SPEED = 0.6; // ~10.5s for a full grow<->shrink<->grow cycle
  let effMode = sizeMode;
  let effAmount = safeAmount;
  if (sizePulse) {
    const signed = Math.cos(time * SIZE_PULSE_SPEED);
    if (signed >= 0) {
      effMode = "grow";
      effAmount = signed;
    } else {
      effMode = "shrink";
      effAmount = -signed;
    }
  }

  const dotFrac = 0.58; // dot radius as a fraction of the spacing
  const glowAllow = 1.55; // reserve a little extra for the soft bloom

  // Normalize the size gradient to THIS view's radius so grow/shrink spans the
  // full effect at every stage.
  let maxPointR = 1e-6;
  for (let i = 0; i < n; i++) maxPointR = Math.max(maxPointR, slots[i].radius);
  const radiusNorm = maxPointR > 0 ? 1 / maxPointR : 1;

  // Base spacing per slot.
  //   - Overlap allowed: a single representative (median) spacing so the dot
  //     size is uniform and the grow/shrink gradient reads as a clean, strongly
  //     visible center->edge ramp (driven purely by the multiplier).
  //   - Overlap disallowed: each slot's own local spacing so it fills its cell
  //     without colliding, scaled uniformly (below) to keep the gradient.
  // Either way ring-dense patterns (spiral/web/pinwheel) get usefully sized
  // dots instead of being shrunk to nothing by their tightest inner ring.
  const sorted = [...neighbor].sort((a, b) => a - b);
  const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0.08;
  const baseOf = (i: number) => (allowOverlap ? typical : neighbor[i]);

  // Pre-compute each slot's size multiplier and the largest figure extent
  // (position + dot + glow) so we can pick a scale P that never crops.
  const mult = new Array<number>(n);
  let maxMult = 1e-6;
  let maxExtent = 1e-6;
  for (let i = 0; i < n; i++) {
    const m = sizeMultiplier(slots[i].radius * radiusNorm, effMode, effAmount);
    mult[i] = m;
    if (m > maxMult) maxMult = m;
    const ext = slots[i].radius + dotFrac * baseOf(i) * m * glowAllow;
    if (ext > maxExtent) maxExtent = ext;
  }
  let P = maxExtent > 0 ? (MARGIN * S) / maxExtent : S;
  P *= breathe;
  if (!Number.isFinite(P) || P <= 0) P = S;

  // When overlap is off, shrink ALL dots by one uniform factor so the biggest
  // (largest-multiplier) dot just fits its cell. Scaling uniformly preserves
  // the full size gradient instead of clamping every grown dot to "touching".
  const overlapScale = allowOverlap
    ? 1
    : Math.min(1, 0.5 / (dotFrac * maxMult));

  // Resolve a pixel dot radius per slot.
  const rArr = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let r = dotFrac * baseOf(i) * mult[i] * P * overlapScale;
    r = Math.min(r, S * 0.18); // never let a single dot dominate the frame
    rArr[i] = Number.isFinite(r) && r > 0 ? r : 0.5;
  }

  const rOf = (i: number) => rArr[i];
  const px = (i: number) => slots[i].x * P;
  const py = (i: number) => slots[i].y * P;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // ---- Connective mesh -----------------------------------------------------
  // Links taper from thick at a lit slot to thin at an off slot.
  ctx.globalCompositeOperation = "source-over";
  const litHalf = (i: number) => Math.max(1, rOf(i) * 0.16);
  const offHalf = 0.5;
  for (const [ai, bi] of showConnectors ? edges : []) {
    const a = slots[ai];
    const b = slots[bi];
    const ax = px(ai);
    const ay = py(ai);
    const bx = px(bi);
    const by = py(bi);
    const aLit = ai < onCount;
    const bLit = bi < onCount;

    if (aLit || bLit) {
      const ca = aLit ? colorForSlot(a, visibleCount, palette) : GHOST_RGB;
      const cb = bLit ? colorForSlot(b, visibleCount, palette) : GHOST_RGB;
      const grad = ctx.createLinearGradient(ax, ay, bx, by);
      grad.addColorStop(0, rgba(ca, aLit ? 0.6 : meshAlpha * 0.6));
      grad.addColorStop(1, rgba(cb, bLit ? 0.6 : meshAlpha * 0.6));
      ctx.fillStyle = grad;
      fillTaperedLink(
        ctx,
        ax,
        ay,
        bx,
        by,
        aLit ? litHalf(ai) : offHalf,
        bLit ? litHalf(bi) : offHalf,
      );
    } else {
      ctx.strokeStyle = rgba(GHOST_RGB, meshAlpha * 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }

  // ---- Ghost slots (disabled) ---------------------------------------------
  for (let i = onCount; i < slots.length; i++) {
    const x = px(i);
    const y = py(i);
    const r = rOf(i);

    const fill = ctx.createRadialGradient(x, y, 0, x, y, r);
    fill.addColorStop(0, rgba(GHOST_RGB, 0.26));
    fill.addColorStop(0.7, rgba(GHOST_RGB, 0.09));
    fill.addColorStop(1, rgba(GHOST_RGB, 0));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.lineWidth = Math.max(0.75, r * 0.1);
    ctx.strokeStyle = rgba(GHOST_RGB, 0.5);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, TAU);
    ctx.stroke();
  }

  // ---- Lit slots (enabled) -------------------------------------------------
  // Light intensity scales the bloom's brightness and reach.
  const li = Number.isFinite(lightIntensity)
    ? Math.max(0, Math.min(1, lightIntensity))
    : 0.5;
  // Staggered breathing: an outward-traveling wave offsets each slot's phase by
  // its (normalized) radius, so the light ripples smoothly from center to edge.
  const WAVE_SPEED = 1.5; // radians/second
  const WAVE_SPREAD = 1.6; // wavelengths across the radius
  const WAVE_DEPTH = 0.7; // how deeply the intensity dips (fraction of base)
  const liFor = (slot: Slot) => {
    if (!lightWave) return li;
    const tr = clamp01(slot.radius * radiusNorm);
    const phase = time * WAVE_SPEED - tr * (TAU * WAVE_SPREAD);
    const wave = (Math.sin(phase) + 1) / 2; // 0..1
    return clamp01(li * (1 - WAVE_DEPTH + WAVE_DEPTH * wave));
  };
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < onCount && i < slots.length; i++) {
    const slot = slots[i];
    const x = px(i);
    const y = py(i);
    const r = rOf(i);
    const color = colorForSlot(slot, visibleCount, palette);

    const liSlot = liFor(slot);
    const glowAlphaK = 0.45 + liSlot * 1.4; // ~0.45..1.85
    const glowSizeK = 0.7 + liSlot * 0.7; // ~0.7..1.4
    const glowR = r * (2.8 + pulse * 0.3) * glowSizeK;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    glow.addColorStop(0, rgba(color, Math.min(1, 0.46 * glowAlphaK)));
    glow.addColorStop(0.35, rgba(color, Math.min(1, 0.2 * glowAlphaK)));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, TAU);
    ctx.fill();

    const coreR = r * 0.95;
    const core = ctx.createRadialGradient(x, y, 0, x, y, coreR);
    core.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    core.addColorStop(0.3, rgba(color, 0.96));
    core.addColorStop(1, rgba(color, 0.06));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, coreR, 0, TAU);
    ctx.fill();
  }

  ctx.restore();
  ctx.globalCompositeOperation = "source-over";
}
