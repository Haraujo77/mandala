// Master 500-slot mandala layout.
//
// The full form has 500 slots laid out by a chosen distribution pattern (see
// patterns.ts). Every pattern orders its points from the center outward, so a
// milestone stage simply shows the first N slots and the stages are *literally*
// nested subsets of the final 500-slot image:
//
//   stage 3 ⊂ stage 5 ⊂ stage 10 ⊂ stage 50 ⊂ stage 500
//
// Each prefix reads as a balanced fragment of the complete form.

import { buildPattern, patternEdges, type PatternId } from "./patterns";

export const STAGES = [3, 5, 10, 50, 500] as const;
export type Stage = (typeof STAGES)[number];

export const TOTAL_SLOTS = 500;

export interface Slot {
  /** Activation order, center-outward (0-based). */
  index: number;
  /** Normalized position in [-1, 1]. */
  x: number;
  y: number;
  /** Angle in radians. */
  angle: number;
  /** Normalized distance from center, ~[0, 1]. */
  radius: number;
}

const masterCache = new Map<PatternId, Slot[]>();

/** The full, immutable 500-slot master layout for a given pattern. */
export function masterSlots(pattern: PatternId): Slot[] {
  let slots = masterCache.get(pattern);
  if (!slots) {
    slots = buildPattern(pattern, TOTAL_SLOTS);
    masterCache.set(pattern, slots);
  }
  return slots;
}

const TAU = Math.PI * 2;
const UP = -Math.PI / 2; // point straight up

// The small milestones use dedicated, perfectly symmetric "symbol" layouts so
// they read as clean emblems (triangle, pentagon, pentagon-rosette) instead of
// a lopsided fragment of the dense pattern. The larger stages (50, 500) use the
// selected distribution pattern.
const SYMBOL_STAGES = new Set<Stage>([3, 5, 10]);

interface RingSpec {
  count: number;
  radius: number;
  rotation: number;
}

function rosette(specs: RingSpec[]): Slot[] {
  const raw: { x: number; y: number }[] = [];
  for (const spec of specs) {
    for (let j = 0; j < spec.count; j++) {
      const a = spec.rotation + (j / spec.count) * TAU;
      raw.push({ x: Math.cos(a) * spec.radius, y: Math.sin(a) * spec.radius });
    }
  }
  let maxR = 1e-6;
  for (const p of raw) maxR = Math.max(maxR, Math.hypot(p.x, p.y));
  return raw.map((p, i) => {
    const x = p.x / maxR;
    const y = p.y / maxR;
    return { index: i, x, y, angle: Math.atan2(y, x), radius: Math.hypot(x, y) };
  });
}

function symbolSlots(stage: Stage): Slot[] {
  switch (stage) {
    case 3:
      return rosette([{ count: 3, radius: 1, rotation: UP }]);
    case 5:
      return rosette([{ count: 5, radius: 1, rotation: UP }]);
    case 10:
      return rosette([
        { count: 5, radius: 0.5, rotation: UP },
        { count: 5, radius: 1, rotation: UP + Math.PI / 5 },
      ]);
    default:
      return masterSlots("bloom").slice(0, stage);
  }
}

const stageCache = new Map<string, Slot[]>();

/** Slots visible for a given pattern + milestone stage. */
export function slotsForStage(pattern: PatternId, stage: Stage): Slot[] {
  if (SYMBOL_STAGES.has(stage)) return symbolSlots(stage);
  // Build the pattern at exactly `stage` points so the shell-completion (even
  // subsampling of the outer ring) makes every stage a symmetric figure, not a
  // shape cut off mid-ring.
  const key = `${pattern}:${stage}`;
  let slots = stageCache.get(key);
  if (!slots) {
    slots = stage === TOTAL_SLOTS ? masterSlots(pattern) : buildPattern(pattern, stage);
    stageCache.set(key, slots);
  }
  return slots;
}

/**
 * A fully resolved, ready-to-draw view of a stage: the visible slots, a fit
 * scale so the figure fills the frame, an adaptive dot radius that keeps the
 * packing tight without overlap, and a nearest-neighbor mesh (edges) used to
 * weave the dots together with flowing gradient strokes.
 */
export interface StageView {
  slots: Slot[];
  /** Pairs of visible slot array-indices forming the connective mesh. */
  edges: Array<[number, number]>;
  /** Multiply each slot's normalized x/y by this so the figure fills the view. */
  fit: number;
  /** Normalized dot radius (multiply by the canvas half-size when drawing). */
  dotRadius: number;
  /** Normalized nearest-neighbor distance after fitting (the packing pitch). */
  spacing: number;
  /**
   * Per-slot nearest-neighbor distance (normalized, pre-fit), aligned to the
   * `slots` array index. Used for local dot sizing so every slot fills its own
   * cell regardless of how uneven the pattern's density is.
   */
  neighbor: number[];
}

const viewCache = new Map<string, StageView>();

// A neighbor is only linked if it's within this factor of the closest one, so
// we don't draw long links across sparse gaps (keeps the mesh tight & clean).
// Tuned so concentric ring neighbors (~1.8x the radial spacing in ring-based
// patterns like Web) stay connected, while long cross-center links are dropped.
const EDGE_THRESHOLD = 2.1;

/** Build the nearest-neighbor mesh: each slot links to its k closest peers. */
function buildEdges(slots: Slot[], k: number): Array<[number, number]> {
  const seen = new Set<number>();
  const edges: Array<[number, number]> = [];
  const n = slots.length;
  const maxRatioSq = EDGE_THRESHOLD * EDGE_THRESHOLD;
  for (let i = 0; i < n; i++) {
    const dists: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = slots[i].x - slots[j].x;
      const dy = slots[i].y - slots[j].y;
      dists.push({ j, d: dx * dx + dy * dy });
    }
    dists.sort((a, b) => a.d - b.d);
    const nearest = dists.length > 0 ? dists[0].d : 0;
    for (let m = 0; m < Math.min(k, dists.length); m++) {
      // Keep the closest link always; longer ones only if reasonably short.
      if (m > 0 && dists[m].d > nearest * maxRatioSq) break;
      const j = dists[m].j;
      const key = i < j ? i * n + j : j * n + i;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }
  return edges;
}

export function viewForStage(pattern: PatternId, stage: Stage): StageView {
  const key = `${pattern}:${stage}`;
  const cached = viewCache.get(key);
  if (cached) return cached;

  const slots = slotsForStage(pattern, stage);

  // Scale so the outermost visible slot sits near the frame edge.
  const maxR = Math.max(1e-6, ...slots.map((s) => s.radius));
  const fit = 0.9 / maxR;

  // Per-slot nearest-neighbor distance (normalized). Drives a *local* dot size
  // so each slot fills its own neighborhood: dense inner rings get small dots,
  // sparse outer rings get large ones. This keeps the grow/shrink gradient just
  // as strong on ring-based patterns (spiral/web/pinwheel) as on uniform ones.
  const neighbor = new Array<number>(slots.length).fill(Infinity);
  let minDist = Infinity;
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const dx = slots[i].x - slots[j].x;
      const dy = slots[i].y - slots[j].y;
      const d = Math.hypot(dx, dy);
      if (d < neighbor[i]) neighbor[i] = d;
      if (d < neighbor[j]) neighbor[j] = d;
      if (d < minDist) minDist = d;
    }
  }
  if (!Number.isFinite(minDist)) minDist = maxR || 1;
  for (let i = 0; i < neighbor.length; i++) {
    if (!Number.isFinite(neighbor[i]) || neighbor[i] <= 0) neighbor[i] = minDist;
  }
  const spacing = minDist * fit;
  const dotRadius = Math.min(spacing * 0.6, 0.4);

  const edges =
    patternEdges(pattern, slots) ?? buildEdges(slots, slots.length <= 12 ? 2 : 4);

  const view: StageView = { slots, edges, fit, dotRadius, spacing, neighbor };
  viewCache.set(key, view);
  return view;
}

/** Clamp an arbitrary number to the nearest valid stage value. */
export function nearestStage(value: number): Stage {
  let best: Stage = STAGES[0];
  let bestDelta = Infinity;
  for (const s of STAGES) {
    const delta = Math.abs(s - value);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = s;
    }
  }
  return best;
}

export function isStage(value: number): value is Stage {
  return (STAGES as readonly number[]).includes(value);
}
