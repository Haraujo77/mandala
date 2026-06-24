import { useEffect, useMemo, useRef, useState } from "react";
import { viewForStage, type Stage } from "../mandala/layout";
import type { PatternId } from "../mandala/patterns";
import { paletteFor, type ColorStop } from "../mandala/palette";
import { renderMandala, type SizeMode } from "../mandala/render";
import ShaderBackground, { type ShaderStyle } from "./ShaderBackground";

interface MandalaCanvasProps {
  pattern: PatternId;
  stage: Stage;
  on: number;
  sizeMode: SizeMode;
  sizeAmount: number;
  allowOverlap: boolean;
  lightIntensity: number;
  gradient: ColorStop[];
  showConnectors: boolean;
  lightWave: boolean;
  shaderBg: boolean;
  shaderStyle: ShaderStyle;
  shaderSpeed: number;
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
  gradient,
  showConnectors,
  lightWave,
  shaderBg,
  shaderStyle,
  shaderSpeed,
  animate,
}: MandalaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const [displaySize, setDisplaySize] = useState(0);

  const view = useMemo(() => viewForStage(pattern, stage), [pattern, stage]);
  const onCount = Math.max(0, Math.min(on, view.slots.length));
  const palette = useMemo(
    () => paletteFor(gradient, onCount),
    [onCount, gradient],
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
    lightWave,
    shaderBg,
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
    lightWave,
    shaderBg,
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
      setDisplaySize(size);
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
        lightWave: f.lightWave,
        transparentBg: f.shaderBg,
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
      {shaderBg && (
        <ShaderBackground
          style={shaderStyle}
          gradient={gradient}
          speed={shaderSpeed}
          size={displaySize}
        />
      )}
      <canvas ref={canvasRef} className="mandala-canvas mandala-canvas--top" />
    </div>
  );
}
