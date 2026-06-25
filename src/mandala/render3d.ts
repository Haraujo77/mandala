// 3D hemisphere renderer.
//
// Lays the slots out on the upper half of a unit sphere using a Fibonacci /
// golden-angle spiral (equal-area in y), then projects them to 2D with a tilt +
// slow spin and painter's-algorithm depth sorting. Lit/ghost/color logic mirrors
// the flat mandala so the two views feel like the same object.

import {
  GHOST_RGB,
  hexToRgb,
  paletteFor,
  rgba,
  sampleStops,
  type ColorStop,
  type Rgb,
} from "./palette";
import { sizeMultiplier, type SizeMode } from "./render";

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MARGIN = 0.9;
const TILT = 1.35; // ~77° — look down onto the dome from the top

interface P3 {
  x: number;
  y: number;
  z: number;
  /** 0 at the pole -> 1 at the equator (drives color, like the flat radius). */
  radius: number;
}

const pointCache = new Map<number, P3[]>();

function hemispherePoints(n: number): P3[] {
  const cached = pointCache.get(n);
  if (cached) return cached;
  const pts: P3[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // y in (0, 1], equal-area on the hemisphere; i=0 near the pole.
    const y = 1 - (i + 0.5) / n;
    const rxy = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * GOLDEN_ANGLE;
    pts[i] = {
      x: Math.cos(th) * rxy,
      y,
      z: Math.sin(th) * rxy,
      radius: n > 1 ? i / (n - 1) : 0,
    };
  }
  pointCache.set(n, pts);
  return pts;
}

export interface RenderSphereOptions {
  width: number;
  height: number;
  count: number;
  onCount: number;
  gradient: ColorStop[];
  lightIntensity: number;
  offColor?: string;
  /** Draw slots as solid opaque discs so nearer ones occlude those behind. */
  opaqueOff?: boolean;
  sizeMode: SizeMode;
  sizeAmount: number;
  sizePulse: boolean;
  time: number;
  animate: boolean;
  /** Global speed multiplier for all ambient motion (1 = base). */
  motionSpeed?: number;
  /** Continuous yaw rotation around the vertical axis. */
  spin?: boolean;
  /** Slow camera "nod" (tilt rock) for kinetic-depth readability. */
  nod?: boolean;
  /** Rock the yaw back and forth instead of (or with) a full spin. */
  rock?: boolean;
  /** Gentle in/out depth breathing of the whole dome. */
  depthBreath?: boolean;
  /** A soft specular highlight that drifts across the surface. */
  specular?: boolean;
}

export function renderSphere(
  ctx: CanvasRenderingContext2D,
  opts: RenderSphereOptions,
) {
  const {
    width,
    height,
    count,
    onCount,
    gradient,
    lightIntensity,
    offColor,
    opaqueOff,
    sizeMode,
    sizeAmount,
    sizePulse,
    time,
    animate,
    motionSpeed,
    spin: spinOn = true,
    nod = true,
    rock = false,
    depthBreath = false,
    specular = false,
  } = opts;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const n = Math.max(0, Math.floor(count));
  if (n === 0) return;

  const cx = width / 2;
  const cy = height / 2;
  const S = Math.min(width, height) / 2;

  const ms = Number.isFinite(motionSpeed) ? Math.max(0, motionSpeed as number) : 1;
  const mTime = time * ms;

  // Gentle in/out depth breathing scales the projected radius.
  const breath = animate && depthBreath ? 1 + Math.sin(mTime * 0.4) * 0.035 : 1;
  const P = MARGIN * S * breath;

  const ghost = offColor ? hexToRgb(offColor) : GHOST_RGB;
  const palette = paletteFor(gradient, Math.max(0, Math.min(onCount, n)));
  const li = Number.isFinite(lightIntensity)
    ? Math.max(0, Math.min(1, lightIntensity))
    : 0.5;

  const pts = hemispherePoints(n);

  // Yaw: optional continuous spin plus an optional back-and-forth rock. With no
  // animation we hold a fixed three-quarter angle so the dome still reads as 3D.
  let yaw = animate ? 0 : 0.7;
  if (animate && spinOn) yaw += mTime * 0.12;
  if (animate && rock) yaw += Math.sin(mTime * 0.5) * 0.55;
  const cosS = Math.cos(yaw);
  const sinS = Math.sin(yaw);
  // Camera "nod": slowly rock the tilt so the dome's curvature reads via the
  // kinetic-depth effect (motion parallax) — legible while staying calm.
  const tilt = TILT + (animate && nod ? Math.sin(mTime * 0.3) * 0.14 : 0);
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  // Moving specular light direction (rotates around the dome), in view space.
  const lp = mTime * 0.5;
  let Lx = Math.sin(lp) * 0.65;
  let Ly = 0.55;
  let Lz = Math.cos(lp) * 0.65;
  const Llen = Math.hypot(Lx, Ly, Lz) || 1;
  Lx /= Llen;
  Ly /= Llen;
  Lz /= Llen;

  // Orthographic projection (parallel rays): position maps linearly and dots
  // keep their size regardless of depth. Depth is kept only for sorting.
  const order = new Array<number>(n);
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const depth = new Float64Array(n);
  // View-space unit normals (points sit on a unit sphere) for specular lighting.
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const nz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    // Rotate around Y (spin).
    const x1 = p.x * cosS + p.z * sinS;
    const z1 = -p.x * sinS + p.z * cosS;
    const y1 = p.y;
    // Rotate around X (tilt).
    const y2 = y1 * cosT - z1 * sinT;
    const z2 = y1 * sinT + z1 * cosT;
    const x2 = x1;

    sx[i] = cx + x2 * P;
    sy[i] = cy - y2 * P;
    depth[i] = z2;
    nx[i] = x2;
    ny[i] = y2;
    nz[i] = z2;
    order[i] = i;
  }

  // Painter's algorithm: far (small z) first.
  order.sort((a, b) => depth[a] - depth[b]);

  // Size-scaling gradient (pole = center, equator = edge), with optional pulse.
  const safeAmount = Number.isFinite(sizeAmount)
    ? Math.max(0, Math.min(1, sizeAmount))
    : 0.5;
  let effMode = sizeMode;
  let effAmount = safeAmount;
  let pulseBreath = 1;
  if (sizePulse) {
    // Match the 2D pulse: ease-in/out on each leg so the breathing slows at the
    // grown and shrunk extremes but sweeps through the uniform midpoint.
    const cycle = ((time * 0.85) / TAU) % 1;
    const half = cycle < 0.5 ? cycle / 0.5 : (cycle - 0.5) / 0.5;
    const e = half * half * half * (half * (half * 6 - 15) + 10);
    const signed = cycle < 0.5 ? 1 - 2 * e : -1 + 2 * e;
    if (signed >= 0) {
      effMode = "grow";
      effAmount = signed;
    } else {
      effMode = "shrink";
      effAmount = -signed;
    }
    pulseBreath = 0.72 + 0.28 * (signed + 1) / 2;
  }

  const baseDot = P * (1.05 / Math.sqrt(n));

  // Soft moving sheen: additive white scaled by how directly a slot faces the
  // drifting light. Helps the eye read the rounded surface and slot depth.
  const addSpecular = (x: number, y: number, r: number, i: number, k: number) => {
    const d = nx[i] * Lx + ny[i] * Ly + nz[i] * Lz;
    if (d <= 0) return;
    const intensity = d * d * d * k;
    if (intensity < 0.02) return;
    ctx.globalCompositeOperation = "lighter";
    const sr = r * 1.15;
    const g = ctx.createRadialGradient(x, y, 0, x, y, sr);
    g.addColorStop(0, `rgba(255, 255, 255, ${Math.min(0.9, intensity)})`);
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, sr, 0, TAU);
    ctx.fill();
  };

  for (const i of order) {
    const x = sx[i];
    const y = sy[i];
    const m = sizeMultiplier(pts[i].radius, effMode, effAmount);
    let r = baseDot * m * pulseBreath;
    r = Math.max(0.5, Math.min(r, S * 0.14));
    const lit = i < onCount;

    if (!lit) {
      ctx.globalCompositeOperation = "source-over";
      if (opaqueOff) {
        // Solid disc — occludes whatever is drawn behind it.
        ctx.fillStyle = rgba(ghost, 1);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.lineWidth = Math.max(0.6, r * 0.12);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        if (specular && animate) addSpecular(x, y, r, i, 0.5);
      } else {
        const fill = ctx.createRadialGradient(x, y, 0, x, y, r);
        fill.addColorStop(0, rgba(ghost, 0.3));
        fill.addColorStop(0.7, rgba(ghost, 0.1));
        fill.addColorStop(1, rgba(ghost, 0));
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();

        ctx.lineWidth = Math.max(0.6, r * 0.12);
        ctx.strokeStyle = rgba(ghost, 0.45);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.72, 0, TAU);
        ctx.stroke();
      }
      continue;
    }

    const tr = clamp01(pts[i].radius);
    const ct = clamp01(0.5 + (tr - 0.5) * palette.window);
    const color: Rgb = sampleStops(palette.stops, ct);
    const glowAlphaK = 0.45 + li * 1.4;
    const glowSizeK = 0.7 + li * 0.7;
    const glowR = r * 2.6 * glowSizeK;

    // When opaque, lay a solid base disc first so lit slots occlude too.
    if (opaqueOff) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = rgba(color, 1);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    glow.addColorStop(0, rgba(color, Math.min(1, 0.42 * glowAlphaK)));
    glow.addColorStop(0.35, rgba(color, Math.min(1, 0.18 * glowAlphaK)));
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

    if (specular && animate) addSpecular(x, y, r, i, 0.7);
  }

  ctx.globalCompositeOperation = "source-over";
}
