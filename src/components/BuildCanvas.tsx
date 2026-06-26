import { useEffect, useMemo, useRef } from "react";
import { viewForStage } from "../mandala/layout";
import type { PatternId } from "../mandala/patterns";
import { paletteFor, type ColorStop } from "../mandala/palette";
import { renderMandala } from "../mandala/render";

interface BuildCanvasProps {
  pattern: PatternId;
  /** How many slots stay lit at the end (the enabled count). */
  on: number;
  /** Speed multiplier for the whole sequence (1 = base timing). */
  speed: number;
  /** Loop the full sequence forever. */
  loop: boolean;
  playing: boolean;
  /** Bump to replay from the beginning. */
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

// Phase durations (seconds at speed = 1).
const T_APPEAR = 1.8; // staggered fade-in, all lit
const T_SHOWCASE = 7.4; // one size + light animation cycle
const T_RESOLVE = 2.4; // turn off disabled slots + tiers fade in
const T_HOLD = 2.6; // settle on the final form before looping

const APPEAR_WINDOW = 0.55; // fraction of appear each slot takes to fade in
const OFF_WINDOW = 0.55; // fraction of resolve each slot takes to turn off

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smootherstep(x: number): number {
  const t = clamp01(x);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export default function BuildCanvas({
  pattern,
  on,
  speed,
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
}: BuildCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  const onCount = Math.max(0, Math.min(on, FULL));
  // Full spectrum throughout: the showcase shows every slot lit, so the palette
  // window spans the whole gradient (not just the final enabled count).
  const palette = useMemo(() => paletteFor(gradient, FULL), [gradient]);

  // The static 500-slot bloom and per-slot appear/turn-off ranks.
  const data = useMemo(() => {
    const view = viewForStage(pattern, FULL);
    const n = view.slots.length;

    // Appear inner -> outer (rank 0 = appears first).
    const order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => view.slots[a].radius - view.slots[b].radius);
    const appearRank = new Float64Array(n);
    order.forEach((idx, k) => {
      appearRank[idx] = n > 1 ? k / (n - 1) : 0;
    });

    return { view, appearRank };
  }, [pattern]);

  // Turn-off ranks depend on the enabled count: only disabled slots turn off,
  // outermost first.
  const offRank = useMemo(() => {
    const n = data.view.slots.length;
    const ranks = new Float64Array(n);
    const removable: number[] = [];
    for (let i = onCount; i < n; i++) removable.push(i);
    removable.sort(
      (a, b) => data.view.slots[b].radius - data.view.slots[a].radius,
    );
    const m = removable.length;
    removable.forEach((idx, k) => {
      ranks[idx] = m > 1 ? k / (m - 1) : 0;
    });
    return ranks;
  }, [data, onCount]);

  const progressRef = useRef(0);
  const lastTokenRef = useRef(playToken);

  const frameRef = useRef({
    data,
    offRank,
    palette,
    onCount,
    speed,
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
    data,
    offRank,
    palette,
    onCount,
    speed,
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
    const litLevel = new Array<number>(FULL).fill(1);

    const draw = (now: number) => {
      const { width, height, dpr } = sizeRef.current;
      const time = (now - start) / 1000;
      let dt = (now - lastNow) / 1000;
      lastNow = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.1);

      const f = frameRef.current;
      if (f.playing) progressRef.current += dt;

      const sp = Math.max(0.1, f.speed);
      // Scaled timeline position (faster speed advances the phases quicker).
      let s = progressRef.current * sp;

      const tAppearEnd = T_APPEAR;
      const tShowEnd = tAppearEnd + T_SHOWCASE;
      const tResolveEnd = tShowEnd + T_RESOLVE;
      const cycleLen = tResolveEnd + T_HOLD;

      if (f.loop) {
        s = s % cycleLen;
      } else {
        // Hold on the final resolved form once finished.
        s = Math.min(s, tResolveEnd);
      }

      const { view, appearRank } = f.data;
      const n = view.slots.length;
      if (presence.length !== n) presence.length = n;
      if (litLevel.length !== n) litLevel.length = n;

      let tierAlpha = 0;
      let sizeAmp = 0;
      let lightOn = false;

      if (s < tAppearEnd) {
        // --- Phase A: staggered appear, everything lit -------------------
        const aTau = clamp01(s / T_APPEAR);
        for (let i = 0; i < n; i++) {
          const startAt = appearRank[i] * (1 - APPEAR_WINDOW);
          presence[i] = smootherstep(clamp01((aTau - startAt) / APPEAR_WINDOW));
          litLevel[i] = 1;
        }
        tierAlpha = 0;
        sizeAmp = 0;
        lightOn = true;
      } else if (s < tShowEnd) {
        // --- Phase B: showcase the size + light animation ----------------
        const bTau = clamp01((s - tAppearEnd) / T_SHOWCASE);
        for (let i = 0; i < n; i++) {
          presence[i] = 1;
          litLevel[i] = 1;
        }
        tierAlpha = 0;
        // One smooth hump of size-pulse amplitude across the showcase.
        sizeAmp = Math.sin(Math.PI * bTau);
        lightOn = true;
      } else if (s < tResolveEnd) {
        // --- Phase C: turn off the disabled slots + reveal tiers ---------
        const rTau = clamp01((s - tShowEnd) / T_RESOLVE);
        const offR = f.offRank;
        for (let i = 0; i < n; i++) {
          presence[i] = 1;
          if (i < f.onCount) {
            litLevel[i] = 1;
          } else {
            const startAt = offR[i] * (1 - OFF_WINDOW);
            litLevel[i] = 1 - smootherstep(clamp01((rTau - startAt) / OFF_WINDOW));
          }
        }
        tierAlpha = smootherstep(rTau);
        sizeAmp = 0;
        lightOn = false;
      } else {
        // --- Hold: only enabled slots lit, tiers shown -------------------
        for (let i = 0; i < n; i++) {
          presence[i] = 1;
          litLevel[i] = i < f.onCount ? 1 : 0;
        }
        tierAlpha = 1;
        sizeAmp = 0;
        lightOn = false;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderMandala(ctx, {
        width,
        height,
        view,
        onCount: f.onCount,
        palette: f.palette,
        sizeMode: "shrink",
        sizeAmount: 0,
        sizePulse: sizeAmp > 0.001,
        sizePulseAmp: sizeAmp,
        motionSpeed: f.motionSpeed,
        allowOverlap: false,
        lightIntensity: f.lightIntensity,
        showConnectors: f.showConnectors,
        offColor: f.offColor,
        opaqueOff: f.opaqueOff,
        lightWave: lightOn,
        tierRings: f.tierRings,
        tierGaps: f.tierGaps,
        tierBands: f.tierBands,
        tierLabels: f.tierLabels,
        tierValues: f.tierValues,
        tierColor: f.tierColor,
        tierAlpha,
        presence,
        litLevel,
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
