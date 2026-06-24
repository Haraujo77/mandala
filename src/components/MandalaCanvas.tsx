import { useEffect, useMemo, useRef } from "react";
import { viewForStage, type Stage } from "../mandala/layout";
import type { PatternId } from "../mandala/patterns";
import { paletteForOn } from "../mandala/palette";
import { renderMandala, type SizeMode } from "../mandala/render";

interface MandalaCanvasProps {
  pattern: PatternId;
  stage: Stage;
  on: number;
  sizeMode: SizeMode;
  sizeAmount: number;
  allowOverlap: boolean;
  lightIntensity: number;
  hueStart: number;
  hueEnd: number;
  showConnectors: boolean;
  animate: boolean;
}

export default function MandalaCanvas({
  pattern,
  stage,
  on,
  sizeMode,
  sizeAmount,
  allowOverlap,
  lightIntensity,
  hueStart,
  hueEnd,
  showConnectors,
  animate,
}: MandalaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  const view = useMemo(() => viewForStage(pattern, stage), [pattern, stage]);
  const onCount = Math.max(0, Math.min(on, view.slots.length));
  const palette = useMemo(
    () => paletteForOn(onCount, hueStart, hueEnd),
    [onCount, hueStart, hueEnd],
  );

  // Keep the latest render inputs in a ref so the RAF loop stays stable.
  const frameRef = useRef({
    view,
    onCount,
    palette,
    sizeMode,
    sizeAmount,
    allowOverlap,
    lightIntensity,
    showConnectors,
    animate,
  });
  frameRef.current = {
    view,
    onCount,
    palette,
    sizeMode,
    sizeAmount,
    allowOverlap,
    lightIntensity,
    showConnectors,
    animate,
  };

  // Handle resizing and device-pixel-ratio for a crisp canvas.
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

  // Animation / render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let start = performance.now();

    const draw = (now: number) => {
      const { width, height, dpr } = sizeRef.current;
      const time = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = frameRef.current;
      renderMandala(ctx, {
        width,
        height,
        view: f.view,
        onCount: f.onCount,
        palette: f.palette,
        sizeMode: f.sizeMode,
        sizeAmount: f.sizeAmount,
        allowOverlap: f.allowOverlap,
        lightIntensity: f.lightIntensity,
        showConnectors: f.showConnectors,
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
      <canvas ref={canvasRef} className="mandala-canvas" />
    </div>
  );
}
