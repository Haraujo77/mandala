// Distribution patterns for the mandala.
//
// Every generator returns exactly `n` normalized points (radius in ~[0, 1]),
// ordered from the center outward so that any prefix of the first N points is a
// balanced, recognizable fragment of the whole. That ordering is what lets the
// milestone stages (3/5/10/50/500) nest inside the full form.

import type { Slot } from "./layout";

export type PatternId =
  | "bloom"
  | "hex"
  | "hexrings"
  | "spiral"
  | "rings"
  | "square"
  | "diamond"
  | "flower"
  | "web"
  | "pinwheel";

export interface PatternMeta {
  id: PatternId;
  label: string;
  hint: string;
}

export const PATTERNS: PatternMeta[] = [
  { id: "bloom", label: "Bloom", hint: "golden-angle sunflower" },
  { id: "hex", label: "Honeycomb", hint: "hex packing" },
  { id: "hexrings", label: "Hex rings", hint: "concentric hexagons" },
  { id: "spiral", label: "Spiral", hint: "logarithmic arms" },
  { id: "rings", label: "Rings", hint: "concentric circles" },
  { id: "square", label: "Grid", hint: "square lattice" },
  { id: "diamond", label: "Diamond", hint: "rotated lattice" },
  { id: "flower", label: "Flower", hint: "6-fold rosette" },
  { id: "web", label: "Web", hint: "12-fold radial grid" },
  { id: "pinwheel", label: "Pinwheel", hint: "rotating arms" },
];

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const SQRT3 = Math.sqrt(3);

interface RawPoint {
  x: number;
  y: number;
}

/** Normalize a list of raw points into Slots scaled to a unit disk. */
function finalize(points: RawPoint[]): Slot[] {
  let maxR = 1e-6;
  for (const p of points) {
    const r = Math.hypot(p.x, p.y);
    if (r > maxR) maxR = r;
  }
  return points.map((p, i) => {
    const x = p.x / maxR;
    const y = p.y / maxR;
    return {
      index: i,
      x,
      y,
      angle: Math.atan2(y, x),
      radius: Math.hypot(x, y),
    };
  });
}

const axialToXY = (q: number, r: number): RawPoint => ({
  x: q + r / 2,
  y: r * (SQRT3 / 2),
});

/**
 * Assemble points from concentric shells (each ordered around its perimeter)
 * into exactly `n` points. Whole inner shells are kept; the single shell that
 * would overflow is *evenly subsampled* around its perimeter so the outer
 * boundary stays symmetric instead of stopping mid-shape.
 */
function assembleShells(shells: RawPoint[][], n: number): RawPoint[] {
  const out: RawPoint[] = [];
  for (const shell of shells) {
    if (out.length >= n) break;
    const remaining = n - out.length;
    if (shell.length <= remaining) {
      out.push(...shell);
    } else {
      for (let k = 0; k < remaining; k++) {
        out.push(shell[Math.floor((k * shell.length) / remaining)]);
      }
    }
  }
  return out;
}

/** Golden-angle phyllotaxis (Vogel sunflower). */
function bloom(n: number): RawPoint[] {
  const pts: RawPoint[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt((i + 0.5) / n);
    const a = i * GOLDEN_ANGLE;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

/** Hexagonal lattice, taken as the `n` points closest to the center. */
function hex(n: number): RawPoint[] {
  const candidates: RawPoint[] = [];
  const range = Math.ceil(Math.sqrt(n)) + 4;
  for (let q = -range; q <= range; q++) {
    for (let r = -range; r <= range; r++) {
      candidates.push(axialToXY(q, r));
    }
  }
  candidates.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
  return candidates.slice(0, n);
}

/** Concentric hexagon rings (hex packing with a crisp hexagonal silhouette). */
function hexrings(n: number): RawPoint[] {
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];
  const shells: RawPoint[][] = [[{ x: 0, y: 0 }]];
  let total = 1;
  let k = 1;
  while (total < n) {
    const shell: RawPoint[] = [];
    let q = dirs[4][0] * k;
    let r = dirs[4][1] * k;
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < k; step++) {
        shell.push(axialToXY(q, r));
        q += dirs[side][0];
        r += dirs[side][1];
      }
    }
    shells.push(shell);
    total += shell.length;
    k++;
  }
  return assembleShells(shells, n);
}

/** Multi-arm logarithmic spiral. */
function spiral(n: number): RawPoint[] {
  const arms = 5;
  const twist = 0.42;
  const layers = Math.ceil(n / arms);
  const pts: RawPoint[] = [];
  for (let i = 0; i < n; i++) {
    const arm = i % arms;
    const t = Math.floor(i / arms);
    const r = Math.sqrt((t + 0.5) / layers);
    const a = arm * (TAU / arms) + t * twist;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

/** Concentric circular rings with a circumference-based count. */
function rings(n: number): RawPoint[] {
  const shells: RawPoint[][] = [];
  let total = 0;
  let ring = 0;
  while (total < n) {
    const count = ring === 0 ? 1 : Math.max(1, Math.round(TAU * ring * 0.55));
    const offset = ring % 2 === 0 ? 0 : Math.PI / Math.max(1, count);
    const shell: RawPoint[] = [];
    for (let j = 0; j < count; j++) {
      const a = offset + (j / count) * TAU;
      shell.push({ x: Math.cos(a) * ring, y: Math.sin(a) * ring });
    }
    shells.push(shell);
    total += count;
    ring++;
  }
  return assembleShells(shells, n);
}

/** Square lattice grown as concentric squares (Chebyshev distance order). */
function square(n: number): RawPoint[] {
  return latticeByDistance(n, (x, y) => Math.max(Math.abs(x), Math.abs(y)));
}

/** Square lattice grown as concentric diamonds (Manhattan distance order). */
function diamond(n: number): RawPoint[] {
  return latticeByDistance(n, (x, y) => Math.abs(x) + Math.abs(y));
}

function latticeByDistance(
  n: number,
  dist: (x: number, y: number) => number,
): RawPoint[] {
  const range = Math.ceil(Math.sqrt(n)) + 2;
  // Group cells into shells of equal distance (Chebyshev or Manhattan).
  const byShell = new Map<number, RawPoint[]>();
  for (let x = -range; x <= range; x++) {
    for (let y = -range; y <= range; y++) {
      const d = dist(x, y);
      const arr = byShell.get(d);
      if (arr) arr.push({ x, y });
      else byShell.set(d, [{ x, y }]);
    }
  }
  const shells = [...byShell.keys()]
    .sort((a, b) => a - b)
    .map((d) =>
      byShell
        .get(d)!
        .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)),
    );
  return assembleShells(shells, n);
}

/** 6-fold concentric rosette (flower-of-life style, smooth rings). */
function flower(n: number): RawPoint[] {
  const k = 6;
  const shells: RawPoint[][] = [[{ x: 0, y: 0 }]];
  let total = 1;
  let ring = 1;
  while (total < n) {
    const count = k * ring; // ~even spacing, exact 6-fold symmetry
    const offset = ring % 2 === 0 ? 0 : Math.PI / count; // petal weave
    const shell: RawPoint[] = [];
    for (let j = 0; j < count; j++) {
      const a = offset + (j / count) * TAU;
      shell.push({ x: Math.cos(a) * ring, y: Math.sin(a) * ring });
    }
    shells.push(shell);
    total += count;
    ring++;
  }
  return assembleShells(shells, n);
}

/** Radially-aligned polar grid: concentric rings snapped to 12 spokes. */
function web(n: number): RawPoint[] {
  const m = 12;
  const shells: RawPoint[][] = [[{ x: 0, y: 0 }]];
  let total = 1;
  let ring = 1;
  while (total < n) {
    let count = Math.round(TAU * ring * 0.55);
    count = Math.max(m, Math.round(count / m) * m); // multiple of m, aligned
    const shell: RawPoint[] = [];
    for (let j = 0; j < count; j++) {
      const a = (j / count) * TAU;
      shell.push({ x: Math.cos(a) * ring, y: Math.sin(a) * ring });
    }
    shells.push(shell);
    total += count;
    ring++;
  }
  return assembleShells(shells, n);
}

/** Rotating arms with 8-fold rotational symmetry (chiral pinwheel). */
function pinwheel(n: number): RawPoint[] {
  const m = 8;
  const twist = 0.35;
  const shells: RawPoint[][] = [[{ x: 0, y: 0 }]];
  let total = 1;
  let ring = 1;
  while (total < n) {
    let count = Math.round(TAU * ring * 0.55);
    count = Math.max(m, Math.round(count / m) * m);
    const offset = ring * twist; // rotate each ring -> spiral arms
    const shell: RawPoint[] = [];
    for (let j = 0; j < count; j++) {
      const a = offset + (j / count) * TAU;
      shell.push({ x: Math.cos(a) * ring, y: Math.sin(a) * ring });
    }
    shells.push(shell);
    total += count;
    ring++;
  }
  return assembleShells(shells, n);
}

const GENERATORS: Record<PatternId, (n: number) => RawPoint[]> = {
  bloom,
  hex,
  hexrings,
  spiral,
  rings,
  square,
  diamond,
  flower,
  web,
  pinwheel,
};

// Patterns built as fixed-spoke concentric rings. Their outer rings are
// angularly sparse, so a distance-based mesh only ever finds the radial
// neighbor and the rings never connect. These get explicit structural edges
// instead (concentric ring threads + radial spokes) so they read as a web.
const RING_GRID_PATTERNS = new Set<PatternId>(["web", "pinwheel"]);

/**
 * Structural edges for fixed-spoke ring grids: links every adjacent pair around
 * each concentric ring (the ring threads) and connects each point outward to
 * the nearest-angle point on the previous ring (the radial spokes). Returns
 * null for patterns that should use the default nearest-neighbor mesh.
 */
export function patternEdges(
  id: PatternId,
  slots: Slot[],
): Array<[number, number]> | null {
  if (!RING_GRID_PATTERNS.has(id)) return null;

  // Group slot indices into rings by quantized radius.
  const buckets = new Map<number, number[]>();
  for (const s of slots) {
    const key = Math.round(s.radius * 1000);
    const arr = buckets.get(key);
    if (arr) arr.push(s.index);
    else buckets.set(key, [s.index]);
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  for (const key of keys) {
    buckets.get(key)!.sort((a, b) => slots[a].angle - slots[b].angle);
  }

  const edges: Array<[number, number]> = [];
  const seen = new Set<number>();
  const n = slots.length;
  const add = (a: number, b: number) => {
    if (a === b) return;
    const k = a < b ? a * n + b : b * n + a;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push([a, b]);
  };

  // Ring threads: connect neighbors around each ring (closed polygon).
  for (const key of keys) {
    const ring = buckets.get(key)!;
    if (ring.length < 2) continue;
    for (let i = 0; i < ring.length; i++) {
      add(ring[i], ring[(i + 1) % ring.length]);
    }
  }

  // Radial spokes: link each point to the nearest-angle point one ring inward.
  for (let k = 1; k < keys.length; k++) {
    const inner = buckets.get(keys[k - 1])!;
    const outer = buckets.get(keys[k])!;
    for (const o of outer) {
      let best = -1;
      let bestD = Infinity;
      for (const inn of inner) {
        let d = Math.abs(slots[o].angle - slots[inn].angle);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < bestD) {
          bestD = d;
          best = inn;
        }
      }
      if (best >= 0) add(best, o);
    }
  }

  return edges;
}

export function isPattern(value: string): value is PatternId {
  return value in GENERATORS;
}

export function buildPattern(id: PatternId, n: number): Slot[] {
  const gen = GENERATORS[id] ?? bloom;
  return finalize(gen(n));
}
