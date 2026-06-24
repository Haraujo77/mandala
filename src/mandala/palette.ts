// Color logic.
//
// Colors come from an editable multi-stop gradient that is sampled across the
// mandala's radius (center -> edge). This supports arbitrary schemes — including
// duotone looks like "Cosmos" (blue -> white -> orange) that a pure hue range
// can't express.
//
// The number of *enabled* (lit) slots controls how much of the gradient is
// revealed: few lit slots sample a narrow band around the gradient's center;
// the band widens to the full gradient at FULL_SPECTRUM_AT.

import type { Slot } from "./layout";

export const FULL_SPECTRUM_AT = 50;

// Narrowest sampling window (fraction of the gradient) when almost nothing is
// lit, so a couple of enabled slots still show a hint of variation.
const MIN_WINDOW = 0.16;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A single gradient stop: a color at a normalized position (0 = center). */
export interface ColorStop {
  pos: number;
  color: string; // hex, "#rrggbb"
}

export interface GradientPreset {
  id: string;
  label: string;
  stops: ColorStop[];
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    id: "rh",
    label: "RH",
    // White core -> lime -> blue -> deep navy edge.
    stops: [
      { pos: 0.06, color: "#ffffff" },
      { pos: 0.28, color: "#cae84b" },
      { pos: 0.52, color: "#4385c8" },
      { pos: 0.8, color: "#0b1252" },
    ],
  },
  {
    id: "spectrum",
    label: "Spectrum",
    stops: [
      { pos: 0, color: "#ff5a3c" },
      { pos: 0.22, color: "#ffd24d" },
      { pos: 0.45, color: "#4de08f" },
      { pos: 0.68, color: "#4fd6e0" },
      { pos: 0.85, color: "#5a7cff" },
      { pos: 1, color: "#b46bff" },
    ],
  },
  {
    id: "cosmos",
    label: "Cosmos",
    stops: [
      { pos: 0, color: "#2f6bff" },
      { pos: 0.42, color: "#bfe0ff" },
      { pos: 0.56, color: "#ffe6b0" },
      { pos: 0.8, color: "#ff7a1a" },
      { pos: 1, color: "#e02a14" },
    ],
  },
  {
    id: "heatmap",
    label: "Heatmap",
    // Thermal scale from the Paper "heatmap" shader (hot core -> cool edge).
    stops: [
      { pos: 0, color: "#cc3333" },
      { pos: 0.17, color: "#cc9933" },
      { pos: 0.33, color: "#99cc33" },
      { pos: 0.5, color: "#33cc33" },
      { pos: 0.67, color: "#33cc99" },
      { pos: 0.83, color: "#3399cc" },
      { pos: 1, color: "#3333cc" },
    ],
  },
  {
    id: "aurora",
    label: "Aurora",
    stops: [
      { pos: 0, color: "#1ee0c5" },
      { pos: 0.5, color: "#4de08f" },
      { pos: 1, color: "#9b6bff" },
    ],
  },
  {
    id: "ember",
    label: "Ember",
    stops: [
      { pos: 0, color: "#7a0d0d" },
      { pos: 0.5, color: "#ff6a1a" },
      { pos: 1, color: "#ffe24d" },
    ],
  },
  {
    id: "ocean",
    label: "Ocean",
    stops: [
      { pos: 0, color: "#0b2a6b" },
      { pos: 0.5, color: "#2fa7d6" },
      { pos: 1, color: "#eafcff" },
    ],
  },
  {
    id: "mono",
    label: "Mono",
    stops: [
      { pos: 0, color: "#6fa8ff" },
      { pos: 1, color: "#ffffff" },
    ],
  },
];

/** Default gradient (a copy so callers can mutate freely). */
export const DEFAULT_GRADIENT: ColorStop[] = GRADIENT_PRESETS[0].stops.map(
  (s) => ({ ...s }),
);

export interface Palette {
  stops: ColorStop[];
  /** Fraction of the gradient revealed around its center (from the lit count). */
  window: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Parse "#rgb" / "#rrggbb" (with or without #) into an Rgb. */
export function hexToRgb(hex: string): Rgb {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

/** Sample a gradient (any stop order) at t in [0, 1]. */
function sampleStops(stops: ColorStop[], t: number): Rgb {
  if (!stops || stops.length === 0) return { r: 255, g: 255, b: 255 };
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const u = clamp01(t);
  if (u <= sorted[0].pos) return hexToRgb(sorted[0].color);
  const last = sorted[sorted.length - 1];
  if (u >= last.pos) return hexToRgb(last.color);
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (u <= b.pos) {
      const span = b.pos - a.pos || 1;
      const f = (u - a.pos) / span;
      const ca = hexToRgb(a.color);
      const cb = hexToRgb(b.color);
      return {
        r: lerp(ca.r, cb.r, f),
        g: lerp(ca.g, cb.g, f),
        b: lerp(ca.b, cb.b, f),
      };
    }
  }
  return hexToRgb(last.color);
}

/** Build the active palette from the gradient and how many slots are lit. */
export function paletteFor(stops: ColorStop[], onCount: number): Palette {
  const t = clamp01(onCount / FULL_SPECTRUM_AT);
  const eased = t * t * (3 - 2 * t); // smoothstep
  const window = lerp(MIN_WINDOW, 1, eased);
  return { stops, window };
}

/**
 * Color for a single lit slot, sampled from the gradient as a smooth radial
 * field (center -> edge). Neighboring slots share nearly the same color so the
 * whole mandala reads as a continuous gradient. The revealed band widens as
 * more slots light up.
 */
export function colorForSlot(
  slot: Slot,
  _visibleCount: number,
  palette: Palette,
): Rgb {
  const tr = clamp01(slot.radius);
  const t = clamp01(0.5 + (tr - 0.5) * palette.window);
  return sampleStops(palette.stops, t);
}

/** Compact, URL-safe serialization of a gradient. */
export function serializeGradient(stops: ColorStop[]): string {
  return stops
    .map((s) => `${Math.round(clamp01(s.pos) * 1000) / 1000}_${s.color.replace(/^#/, "")}`)
    .join("-");
}

export function parseGradient(str: string): ColorStop[] | null {
  if (!str) return null;
  const parts = str.split("-");
  const stops: ColorStop[] = [];
  for (const part of parts) {
    const [posRaw, colorRaw] = part.split("_");
    const pos = Number(posRaw);
    if (!Number.isFinite(pos) || !colorRaw) return null;
    let h = colorRaw.replace(/^#/, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
    stops.push({ pos: clamp01(pos), color: `#${h.toLowerCase()}` });
  }
  return stops.length >= 2 ? stops : null;
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** Dim, cool color for disabled (ghost) slots — visible but clearly inactive. */
export const GHOST_RGB: Rgb = hslToRgb(206, 0.32, 0.62);

export function rgba({ r, g, b }: Rgb, a: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}
