import { useEffect, useMemo, useRef } from "react";
import { viewForStage, type StageView } from "../mandala/layout";
import type { PatternId } from "../mandala/patterns";
import { paletteFor, type ColorStop } from "../mandala/palette";
import { renderMandala } from "../mandala/render";

export type RevealOrder = "outer" | "inner" | "random";

interface RevealCanvasProps {
  pattern: PatternId;
  /** How many slots remain at the end of the transition (the target stage). */
  target: number;
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
  view: StageView,
  target: number,
  order: RevealOrder,
): Float64Array {
  const n = view.slots.length;
  const ranks = new Float64Array(n);
  const removable: number[] = [];
  for (let i = target; i < n; i++) removable.push(i);

  if (order === "outer") {
    removable.sort((a, b) => view.slots[b].radius - view.slots[a].radius);
  } else if (order === "inner") {
    removable.sort((a, b) => view.slots[a].radius - view.slots[b].radius);
  } else {
    removable.sort((a, b) => hash01(a) - hash01(b));
  }

  const m = removable.length;
  removable.forEach((idx, k) => {
    ranks[idx] = m > 1 ? k / (m - 1) : 0;
  });
  return ranks;
}

export default function RevealCanvas({
  pattern,
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
  animate,
  motionSpeed,
}: RevealCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  const view = useMemo(() => viewForStage(pattern, FULL), [pattern]);
  const palette = useMemo(
    () => paletteFor(gradient, view.slots.length),
    [gradient, view.slots.length],
  );
  const ranks = useMemo(
    () => computeRanks(view, target, order),
    [view, target, order],
  );

  // Accumulated playback seconds (only advances while playing).
  const progressRef = useRef(0);
  const lastTokenRef = useRef(playToken);

  const frameRef = useRef({
    view,
    palette,
    ranks,
    target,
    duration,
    loop,
    playing,
    lightIntensity,
    offColor,
    opaqueOff,
    showConnectors,
    animate,
    motionSpeed,
  });
  frameRef.current = {
    view,
    palette,
    ranks,
    target,
    duration,
    loop,
    playing,
    lightIntensity,
    offColor,
    opaqueOff,
    showConnectors,
    animate,
    motionSpeed,
  };

  // Restart whenever the play token changes.
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
    const presence = new Array<number>(view.slots.length).fill(1);

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
      // tau: 0 = full 500, 1 = only `target` remain.
      let tau: number;
      if (f.loop) {
        const p = phase % 2;
        tau = p <= 1 ? p : 2 - p;
      } else {
        tau = Math.min(phase, 1);
      }

      const n = f.view.slots.length;
      if (presence.length !== n) presence.length = n;
      for (let i = 0; i < n; i++) {
        if (i < f.target) {
          presence[i] = 1;
          continue;
        }
        const startAt = f.ranks[i] * (1 - WINDOW);
        const local = clamp01((tau - startAt) / WINDOW);
        presence[i] = 1 - smootherstep(local);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderMandala(ctx, {
        width,
        height,
        view: f.view,
        onCount: n, // every present slot is lit (a full, colored bloom)
        palette: f.palette,
        sizeMode: "uniform",
        sizeAmount: 0,
        sizePulse: false,
        motionSpeed: f.motionSpeed,
        allowOverlap: false,
        lightIntensity: f.lightIntensity,
        showConnectors: f.showConnectors,
        offColor: f.offColor,
        opaqueOff: f.opaqueOff,
        lightWave: false,
        presence,
        time,
        animate: f.animate,
      });
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [view.slots.length]);

  return (
    <div className="mandala-stage">
      <canvas ref={canvasRef} className="mandala-canvas mandala-canvas--top" />
    </div>
  );
}
