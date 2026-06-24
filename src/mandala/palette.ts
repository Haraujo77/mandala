// Color logic.
//
// The number of *enabled* (lit) slots drives how many colors appear:
//   - few lit slots  -> a narrow hue band around teal/cyan (the reference look)
//   - more lit slots -> the band widens
//   - 50+ lit slots  -> the full 360° spectrum (a gradient of all colors)

import type { Slot } from "./layout";

export const FULL_SPECTRUM_AT = 50;

/** Default spread endpoints (degrees) — the full rainbow. */
export const DEFAULT_HUE_START = 0;
export const DEFAULT_HUE_END = 360;
/** Minimum hue span so even a couple of lit slots show a little variation. */
const MIN_SPAN = 42;

export interface Palette {
  /** Starting hue in degrees. */
  hueStart: number;
  /** Total hue span in degrees (up to 360). */
  hueSpan: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Build the active palette from how many slots are currently lit and the
 * user-chosen spread endpoints. The spread is the hue range mapped across the
 * mandala's radius; its endpoints (`hueFrom`/`hueTo`) are editable. As more
 * slots light up, the active band widens from a narrow center toward the full
 * chosen range (reaching it at `FULL_SPECTRUM_AT`).
 */
export function paletteForOn(
  onCount: number,
  hueFrom: number = DEFAULT_HUE_START,
  hueTo: number = DEFAULT_HUE_END,
): Palette {
  const lo = Math.min(hueFrom, hueTo);
  const hi = Math.max(hueFrom, hueTo);
  const fullSpan = Math.max(1, hi - lo);
  const center = (lo + hi) / 2;
  const t = clamp01(onCount / FULL_SPECTRUM_AT);
  // Ease so colors bloom in gracefully, reaching the full range exactly at 50.
  const eased = t * t * (3 - 2 * t); // smoothstep
  const hueSpan = lerp(Math.min(MIN_SPAN, fullSpan), fullSpan, eased);
  const hueStart = center - hueSpan / 2;
  return { hueStart, hueSpan };
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
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

/**
 * Color for a single lit slot. The hue is sampled as a smooth radial field
 * (center -> edge) so neighboring slots share almost the same hue and the whole
 * mandala reads as a continuous gradient rather than discrete color steps. The
 * span widens with the lit count, so more enabled slots reveal more colors.
 */
export function colorForSlot(slot: Slot, _visibleCount: number, palette: Palette): Rgb {
  const t = clamp01(slot.radius);
  const hue = palette.hueStart + t * palette.hueSpan;
  // A touch of radial lightness keeps the center luminous and edges saturated.
  const lightness = lerp(0.68, 0.52, t);
  return hslToRgb(hue, 0.85, lightness);
}

/** Dim, cool color for disabled (ghost) slots — visible but clearly inactive. */
export const GHOST_RGB: Rgb = hslToRgb(206, 0.32, 0.62);

export function rgba({ r, g, b }: Rgb, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
