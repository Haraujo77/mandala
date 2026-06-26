import { useEffect, useMemo, useRef } from "react";
import { viewForStage, type Slot, type Stage, type StageView } from "../mandala/layout";
import type { PatternId } from "../mandala/patterns";
import { paletteFor, type ColorStop } from "../mandala/palette";
import { renderMandala } from "../mandala/render";

export type RevealOrder = "outer" | "inner" | "random";

interface RevealCanvasProps {
  pattern: PatternId;
  /** How many of the target slots are lit (enabled). Clamped to the target. */
  on: number;
  /** How many slots remain at the end of the transition (the target stage). */
  target: Stage;
  /** Seconds for a full 500 -> target sweep. */
  duration: number;
  /** Disappearance order of the removed slots. */
  order: RevealOrder;
  /** Ping-pong the transition (target <-> 500) forever. */
  loop: boolean;
  playing: boolean;
  /** Bump to restart the transition from the beginning. */
  playToken: number;
  gradient: ColorStop[];
  lightIntensity: number;
  offColor: string;
  opaqueOff: boolean;
  showConnectors: boolean;
  tierRings: boolean;
  tierGaps: boolean;
  tierBands: boolean;
  tierLabels: boolean;
  tierValues: boolean;
  tierColor: string;
  animate: boolean;
  motionSpeed: number;
}

const FULL = 500;
const WINDOW = 0.55; // fraction of the timeline each slot takes to fully vanish.

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smootherstep(x: number): number {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Deterministic pseudo-random in [0,1) from an integer. */
function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Per-slot stagger rank in [0,1]: 0 = disappears first, 1 = disappears last.
 * Only slots with index >= target are removable; kept slots get rank 0 (unused).
 */
function computeRanks(
  bloom: StageView,
  target: number,
  order: RevealOrder,
): Float64Array {
  const n = bloom.slots.length;
  const ranks = new Float64Array(n);
  const removable: number[] = [];
  for (let i = target; i < n; i++) removable.push(i);

  if (order === "outer") {
    removable.sort((a, b) => bloom.slots[b].radius - bloom.slots[a].radius);
  } else if (order === "inner") {
    removable.sort((a, b) => bloom.slots[a].radius - bloom.slots[b].radius);
  } else {
    removable.sort((a, b) => hash01(a) - hash01(b));
  }

  const m = removable.length;
  removable.forEach((idx, k) => {
    ranks[idx] = m > 1 ? k / (m - 1) : 0;
  });
  return ranks;
}

interface MorphData {
  bloom: StageView;
  targetView: StageView;
  ranks: Float64Array;
  /** Mutable working slots (start as a copy of the bloom layout). */
  slots: Slot[];
  /** Mutable working per-slot spacing. */
  neighbor: number[];
  /** Stable view object handed to the renderer (slots/neighbor mutate in place). */
  view: StageView;
}

export default function RevealCanvas({
  pattern,
  on,
  target,
  duration,
  order,
  loop,
  playing,
  playToken,
  gradient,
  lightIntensity,
  offColor,
  opaqueOff,
  showConnectors,
  tierRings,
  tierGaps,
  tierBands,
  tierLabels,
  tierValues,
  tierColor,
  animate,
  motionSpeed,
}: RevealCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  const onCount = Math.max(0, Math.min(on, target));
  const palette = useMemo(
    () => paletteFor(gradient, onCount),
    [gradient, onCount],
  );

  // Everything tied to (pattern, target): the two layouts being morphed, the
  // disappearance ranks, and mutable working buffers reused every frame.
  const morph = useMemo<MorphData>(() => {
    const bloom = viewForStage(pattern, FULL);
    // The 50-slot milestone always lands on the spiral layout, regardless of the
    // bloom's pattern.
    const targetPattern: PatternId = target === 50 ? "spiral" : pattern;
    const targetView = viewForStage(targetPattern, target);
    const slots = bloom.slots.map((s) => ({ ...s }));
    const neighbor = bloom.neighbor.slice();
    const view: StageView = {
      slots,
      edges: bloom.edges,
      fit: bloom.fit,
      dotRadius: bloom.dotRadius,
      spacing: bloom.spacing,
      neighbor,
    };
    return {
      bloom,
      targetView,
      ranks: computeRanks(bloom, target, order),
      slots,
      neighbor,
      view,
    };
  }, [pattern, target, order]);

  const progressRef = useRef(0);
  const lastTokenRef = useRef(playToken);

  const frameRef = useRef({
    morph,
    palette,
    onCount,
    target,
    duration,
    loop,
    playing,
    lightIntensity,
    offColor,
    opaqueOff,
    showConnectors,
    tierRings,
    tierGaps,
    tierBands,
    tierLabels,
    tierValues,
    tierColor,
    animate,
    motionSpeed,
  });
  frameRef.current = {
    morph,
    palette,
    onCount,
    target,
    duration,
    loop,
    playing,
    lightIntensity,
    offColor,
    opaqueOff,
    showConnectors,
    tierRings,
    tierGaps,
    tierBands,
    tierLabels,
    tierValues,
    tierColor,
    animate,
    motionSpeed,
  };

  useEffect(() => {
    if (lastTokenRef.current !== playToken) {
      lastTokenRef.current = playToken;
      progressRef.current = 0;
    }
  }, [playToken]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
      sizeRef.current = { width: size, height: size, dpr };
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const start = performance.now();
    let lastNow = start;
    const presence = new Array<number>(FULL).fill(1);

    const draw = (now: number) => {
      const { width, height, dpr } = sizeRef.current;
      const time = (now - start) / 1000;
      let dt = (now - lastNow) / 1000;
      lastNow = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.1);

      const f = frameRef.current;
      if (f.playing) progressRef.current += dt;

      const dur = Math.max(0.2, f.duration);
      const phase = progressRef.current / dur;
      // tau: 0 = full 500 bloom, 1 = only the target layout remains.
      let tau: number;
      if (f.loop) {
        const p = phase % 2;
        tau = p <= 1 ? p : 2 - p;
      } else {
        tau = Math.min(phase, 1);
      }
      // With ping-pong off, once the shape has fully assembled it breathes with
      // the 2D size animation (grow <-> shrink). Ramp the pulse in from neutral
      // over ~1.2s so it eases in instead of snapping on mid-swing.
      const settled = !f.loop && phase >= 1;
      const pulseAmp = settled
        ? clamp01((progressRef.current - dur) / 1.2)
        : 0;
      // Tier rings/labels/gaps only belong to the full 500 form: full at the
      // start, faded out as soon as it transitions toward any milestone.
      const tierAlpha = 1 - smootherstep(clamp01(tau / 0.2));

      const { bloom, targetView, ranks, slots, neighbor, view } = f.morph;
      const n = slots.length;
      const tn = targetView.slots.length;

      // Two-beat timeline: the extra slots disappear first (FADE), then the
      // survivors glide into the target shape (MOVE), with a little overlap.
      const FADE_PORTION = 0.55; // extras fully gone by here
      const MOVE_START = 0.4; // survivors start moving here
      const fadeTau = clamp01(tau / FADE_PORTION);
      const moveTau = clamp01((tau - MOVE_START) / (1 - MOVE_START));
      const me = smootherstep(moveTau); // eased position/mesh morph

      // Survivors (indices < target) ease from their bloom position + spacing to
      // the target layout's position + spacing, so the arrival is exactly the 2D
      // stage shape (not just the bloom with slots removed).
      for (let i = 0; i < tn; i++) {
        const bs = bloom.slots[i];
        const ts = targetView.slots[i];
        const sx = bs.x + (ts.x - bs.x) * me;
        const sy = bs.y + (ts.y - bs.y) * me;
        slots[i].x = sx;
        slots[i].y = sy;
        slots[i].radius = bs.radius + (ts.radius - bs.radius) * me;
        slots[i].angle = Math.atan2(sy, sx);
        neighbor[i] = bloom.neighbor[i] + (targetView.neighbor[i] - bloom.neighbor[i]) * me;
      }

      // Presence: kept slots always 1; removed slots fade out on a stagger.
      if (presence.length !== n) presence.length = n;
      for (let i = 0; i < n; i++) {
        if (i < tn) {
          presence[i] = 1;
          continue;
        }
        const startAt = ranks[i] * (1 - WINDOW);
        presence[i] = 1 - smootherstep(clamp01((fadeTau - startAt) / WINDOW));
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderMandala(ctx, {
        width,
        height,
        view,
        onCount: f.onCount, // first `on` survivors are lit; the rest are ghosts
        palette: f.palette,
        sizeMode: settled ? "shrink" : "uniform",
        sizeAmount: settled ? 1 : 0,
        sizePulse: settled,
        sizePulseAmp: pulseAmp,
        motionSpeed: f.motionSpeed,
        allowOverlap: false,
        lightIntensity: f.lightIntensity,
        showConnectors: f.showConnectors,
        offColor: f.offColor,
        opaqueOff: f.opaqueOff,
        lightWave: false,
        tierRings: f.tierRings,
        tierGaps: f.tierGaps,
        tierBands: f.tierBands,
        tierLabels: f.tierLabels,
        tierValues: f.tierValues,
        tierColor: f.tierColor,
        tierAlpha,
        presence,
        edges2: targetView.edges,
        edgeMix: me,
        time,
        animate: f.animate,
      });
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="mandala-stage">
      <canvas ref={canvasRef} className="mandala-canvas mandala-canvas--top" />
    </div>
  );
}
