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

import { STAGES, type Slot, type StageView } from "./layout";
import {
  colorForSlot,
  GHOST_RGB,
  hexToRgb,
  rgba,
  sampleStops,
  type Palette,
  type Rgb,
} from "./palette";

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
  /** Global speed multiplier for ambient motion (1 = base). */
  motionSpeed?: number;
  /** When false, dots are capped so they never overlap. */
  allowOverlap: boolean;
  /** Brightness/size of the lit slots' glow, 0..1. */
  lightIntensity: number;
  /** Draw the connective mesh between slots. */
  showConnectors: boolean;
  /** Color for disabled (off/ghost) slots, hex string. */
  offColor?: string;
  /** Draw off slots as solid opaque discs (so overlaps occlude). */
  opaqueOff?: boolean;
  /** Animate light intensity as a staggered, outward breathing ripple. */
  lightWave: boolean;
  /** Draw faint divider rings at the milestone tier boundaries. */
  tierRings?: boolean;
  /** Add radial spacing between tier groups so each tier reads as a band. */
  tierGaps?: boolean;
  /** Color each tier as a flat band (sampled at the tier's center). */
  tierBands?: boolean;
  /** Draw numeric labels (3, 5, 10, 50) at the tier boundaries. */
  tierLabels?: boolean;
  /** Show the dollar value instead of the slot count on tier labels. */
  tierValues?: boolean;
  /** Color for tier rings + labels, hex string (distinct from off slots). */
  tierColor?: string;
  /**
   * Optional per-slot presence in [0,1] (length === slots.length). 1 = fully
   * shown; 0 = gone. Drives the Reveal transition: slots fade + shrink out as
   * their presence drops. Positions and the auto-fit are unaffected.
   */
  presence?: number[];
  time: number;
  animate: boolean;
}

// Dollar value shown for each milestone tier boundary when values are on.
const TIER_VALUES: Record<number, string> = {
  3: "$250",
  5: "$500",
  10: "$1,000",
  50: "$5,000",
  500: "$50,000",
};

const TAU = Math.PI * 2;

// How extreme the size gradient gets at full strength (fraction added/removed
// at each end of the center-to-edge range).
const MAX_AMP = 0.85;

// Fraction of the canvas half-size the figure (incl. dots) is allowed to use.
const MARGIN = 0.94;

/** Per-slot size multiplier from the center-outward gradient. */
export function sizeMultiplier(
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
  ctx.fillStyle = "#000000";
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

/**
 * Draw `text` centered on the top of a circle of the given radius, with each
 * glyph rotated tangent to the circle so the label follows the ring path.
 * The context must already be translated to the circle's center.
 */
function drawTextOnArc(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  color: Rgb,
) {
  const r = Math.max(radius, 1);
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0);
  // Start at the left edge of the centered span (top of circle = -PI/2).
  let angle = -Math.PI / 2 - total / 2 / r;
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i];
    const a = angle + w / 2 / r;
    ctx.save();
    ctx.rotate(a + Math.PI / 2);
    ctx.translate(0, -r);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.strokeText(chars[i], 0, 0);
    ctx.fillStyle = rgba(color, 1);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
    angle += w / r;
  }
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
    offColor,
    opaqueOff,
    lightWave,
    tierRings,
    tierGaps,
    tierBands,
    tierLabels,
    tierValues,
    tierColor,
    presence,
    time,
    animate,
    motionSpeed,
  } = opts;
  const { slots, edges, fit } = view;
  const presOf = (i: number) =>
    presence && Number.isFinite(presence[i]) ? clamp01(presence[i]) : 1;
  const PRES_EPS = 0.004;
  const ghost = offColor ? hexToRgb(offColor) : GHOST_RGB;
  const tierRgb = tierColor ? hexToRgb(tierColor) : ghost;

  drawBackground(ctx, width, height);
  if (slots.length === 0) return;

  const cx = width / 2;
  const cy = height / 2;
  const S = Math.min(width, height) / 2;

  const ms = Number.isFinite(motionSpeed) ? Math.max(0, motionSpeed as number) : 1;
  const mTime = time * ms;
  const rotation = animate ? mTime * 0.05 : 0;
  const breathe = animate ? 1 + Math.sin(mTime * 0.7) * 0.012 : 1;
  const pulse = animate ? (Math.sin(mTime * 1.5) + 1) / 2 : 0.5;
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
  // back, continuously. A cosine gives smooth turnarounds; running its [0,1]
  // phase through smootherstep adds organic easing that *lingers* at the
  // fully-grown and fully-shrunk extremes and eases gently through the middle,
  // so the breathing feels alive rather than metronomic. A synced global
  // "breath" (pulseBreath) scales every dot too, so the motion reads clearly
  // even when the fit-to-frame normalization keeps the largest dot near-constant.
  const SIZE_PULSE_SPEED = 0.85; // ~7.4s for a full grow<->shrink<->grow cycle
  let effMode = sizeMode;
  let effAmount = safeAmount;
  let pulseBreath = 1;
  let posBreath = 1;
  if (sizePulse) {
    // One full grow -> shrink -> grow cycle, with ease-in/out applied to each
    // leg. This slows the motion smoothly at the grown and shrunk extremes
    // (most visible on the single-ring 3/5 stages) while still sweeping briskly
    // through the uniform midpoint — so it eases at the ends without "stopping"
    // in the middle.
    const cycle = ((time * SIZE_PULSE_SPEED) / TAU) % 1; // 0..1
    const half = cycle < 0.5 ? cycle / 0.5 : (cycle - 0.5) / 0.5; // 0..1 per leg
    const e = half * half * half * (half * (half * 6 - 15) + 10); // smootherstep
    const signed = cycle < 0.5 ? 1 - 2 * e : -1 + 2 * e; // +1 grow .. -1 shrink
    if (signed >= 0) {
      effMode = "grow";
      effAmount = signed;
    } else {
      effMode = "shrink";
      effAmount = -signed;
    }
    const u = (signed + 1) / 2; // 0..1
    // grow extreme -> 1.0 (largest), shrink extreme -> 0.72 (smallest).
    pulseBreath = 0.72 + 0.28 * u;
    // A gentle, uniform radial drift so the slots actually gather and spread a
    // little (kept small + stage-independent so the 3/5 stages don't fly apart).
    posBreath = 1 + Math.sin(time * SIZE_PULSE_SPEED * 0.5) * 0.05;
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

  // ---- Milestone tiers -----------------------------------------------------
  // Slots are ordered so each milestone (3, 5, 10, 50, 500) is a prefix; tier k
  // owns slot indices [THRESHOLDS[k-1], THRESHOLDS[k]).
  const THRESHOLDS = STAGES as readonly number[];
  const tierOf = (i: number) => {
    let k = 0;
    for (const th of THRESHOLDS) {
      if (i >= th) k++;
      else break;
    }
    return k;
  };
  const tierCount = tierOf(n - 1) + 1;
  const boundaryThresholds = THRESHOLDS.filter((th) => th > 0 && th < n);

  // Optional radial gaps: push each slot outward by a per-tier offset so the
  // tiers separate into distinct bands.
  const TIER_GAP = 0.12; // normalized radial gap added per crossed tier
  const dispX = new Array<number>(n);
  const dispY = new Array<number>(n);
  const dispR = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    if (tierGaps && s.radius > 1e-6) {
      const scale = (s.radius + TIER_GAP * tierOf(i)) / s.radius;
      dispX[i] = s.x * scale;
      dispY[i] = s.y * scale;
      dispR[i] = s.radius * scale;
    } else {
      dispX[i] = s.x;
      dispY[i] = s.y;
      dispR[i] = s.radius;
    }
  }

  // Per-tier radial extent (in displaced space) -> ring/label boundary radii.
  const tierMinR = new Array<number>(tierCount).fill(Infinity);
  const tierMaxR = new Array<number>(tierCount).fill(0);
  for (let i = 0; i < n; i++) {
    const k = tierOf(i);
    if (dispR[i] < tierMinR[k]) tierMinR[k] = dispR[i];
    if (dispR[i] > tierMaxR[k]) tierMaxR[k] = dispR[i];
  }
  const boundaryRadiusNorm = (th: number): number => {
    const k = tierOf(th);
    const below = Number.isFinite(tierMaxR[k - 1]) ? tierMaxR[k - 1] : 0;
    const above = Number.isFinite(tierMinR[k]) ? tierMinR[k] : below;
    return (below + above) / 2;
  };

  // Color for a lit slot — a flat per-tier band, or the smooth radial gradient.
  const litColorOf = (i: number, slot: Slot): Rgb =>
    tierBands
      ? sampleStops(palette.stops, (tierOf(i) + 0.5) / tierCount)
      : colorForSlot(slot, visibleCount, palette);

  // Pre-compute each slot's size multiplier and the largest figure extent
  // (position + dot + glow) so we can pick a scale P that never crops.
  const mult = new Array<number>(n);
  let maxMult = 1e-6;
  let maxExtent = 1e-6;
  for (let i = 0; i < n; i++) {
    const rNorm = slots[i].radius * radiusNorm;
    const m = sizeMultiplier(rNorm, effMode, effAmount);
    mult[i] = m;
    if (m > maxMult) maxMult = m;
    // Fit to a frame-stable dot size. While the size pulse animates, the actual
    // multiplier swings each frame; if we fit to it, the auto-fit rescales and
    // the slot positions visibly drift apart and back (very pronounced on the
    // 3/5 stages where the dot is a big share of the figure). Reserving the
    // worst-case size the slot ever reaches keeps P — and the positions — fixed,
    // so only the dots breathe.
    const tN = rNorm < 0 ? 0 : rNorm > 1 ? 1 : rNorm;
    const fitM = sizePulse ? 1 + MAX_AMP * Math.abs(2 * tN - 1) : m;
    const ext = dispR[i] + dotFrac * baseOf(i) * fitM * glowAllow;
    if (ext > maxExtent) maxExtent = ext;
  }
  let P = maxExtent > 0 ? (MARGIN * S) / maxExtent : S;
  P *= breathe * posBreath;
  if (!Number.isFinite(P) || P <= 0) P = S;

  // When overlap is off, shrink ALL dots by one uniform factor so the biggest
  // (largest-multiplier) dot just fits its cell. Scaling uniformly preserves
  // the full size gradient instead of clamping every grown dot to "touching".
  const overlapScale = allowOverlap
    ? 1
    : Math.min(1, 0.5 / (dotFrac * maxMult));

  // Resolve a pixel dot radius per slot. pulseBreath only scales DOWN from the
  // non-overlapping baseline, so it never introduces crops or overlaps.
  const rArr = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let r = dotFrac * baseOf(i) * mult[i] * P * overlapScale * pulseBreath;
    r = Math.min(r, S * 0.18); // never let a single dot dominate the frame
    // Disappearing slots shrink as they fade (eased presence -> radius).
    const pr = presOf(i);
    if (pr < 1) r *= 0.35 + 0.65 * pr;
    rArr[i] = Number.isFinite(r) && r > 0 ? r : 0.5;
  }

  const rOf = (i: number) => rArr[i];
  const px = (i: number) => dispX[i] * P;
  const py = (i: number) => dispY[i] * P;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // ---- Tier divider rings --------------------------------------------------
  if (tierRings && boundaryThresholds.length) {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = rgba(tierRgb, 0.55);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    for (const th of boundaryThresholds) {
      const rr = boundaryRadiusNorm(th) * P;
      if (rr > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }

  // ---- Connective mesh -----------------------------------------------------
  // Links taper from thick at a lit slot to thin at an off slot.
  ctx.globalCompositeOperation = "source-over";
  const litHalf = (i: number) => Math.max(1, rOf(i) * 0.16);
  const offHalf = 0.5;
  for (const [ai, bi] of showConnectors ? edges : []) {
    const linkPres = Math.min(presOf(ai), presOf(bi));
    if (linkPres < PRES_EPS) continue;
    ctx.globalAlpha = linkPres;
    const a = slots[ai];
    const b = slots[bi];
    const ax = px(ai);
    const ay = py(ai);
    const bx = px(bi);
    const by = py(bi);
    const aLit = ai < onCount;
    const bLit = bi < onCount;

    if (aLit || bLit) {
      const ca = aLit ? litColorOf(ai, a) : ghost;
      const cb = bLit ? litColorOf(bi, b) : ghost;
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
      ctx.strokeStyle = rgba(ghost, meshAlpha * 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // ---- Ghost slots (disabled) ---------------------------------------------
  for (let i = onCount; i < slots.length; i++) {
    const pr = presOf(i);
    if (pr < PRES_EPS) continue;
    ctx.globalAlpha = pr;
    const x = px(i);
    const y = py(i);
    const r = rOf(i);

    if (opaqueOff) {
      ctx.fillStyle = rgba(ghost, 1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.lineWidth = Math.max(0.75, r * 0.1);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
    } else {
      const fill = ctx.createRadialGradient(x, y, 0, x, y, r);
      fill.addColorStop(0, rgba(ghost, 0.26));
      fill.addColorStop(0.7, rgba(ghost, 0.09));
      fill.addColorStop(1, rgba(ghost, 0));
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();

      ctx.lineWidth = Math.max(0.75, r * 0.1);
      ctx.strokeStyle = rgba(ghost, 0.5);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.72, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

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
    const pr = presOf(i);
    if (pr < PRES_EPS) continue;
    ctx.globalAlpha = pr;
    const slot = slots[i];
    const x = px(i);
    const y = py(i);
    const r = rOf(i);
    const color = litColorOf(i, slot);

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

  // ---- Tier labels ---------------------------------------------------------
  // Curved along each ring's path. Drawn unrotated in screen space (the rings
  // are concentric, so they're identical regardless of ambient rotation).
  if (tierLabels && boundaryThresholds.length) {
    const fontPx = Math.max(10, S * 0.03);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, fontPx * 0.3);
    for (const th of boundaryThresholds) {
      const radius = boundaryRadiusNorm(th) * P;
      if (radius <= 0) continue;
      const label = tierValues ? TIER_VALUES[th] ?? String(th) : String(th);
      drawTextOnArc(ctx, label, radius, tierRgb);
    }
    ctx.restore();
  }
}
