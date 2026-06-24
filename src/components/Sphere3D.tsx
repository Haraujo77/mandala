import { useEffect, useRef } from "react";
import type { ColorStop } from "../mandala/palette";
import { renderSphere } from "../mandala/render3d";
import type { SizeMode } from "../mandala/render";

interface Sphere3DProps {
  count: number;
  on: number;
  gradient: ColorStop[];
  lightIntensity: number;
  offColor: string;
  sizeMode: SizeMode;
  sizeAmount: number;
  sizePulse: boolean;
  animate: boolean;
}

export default function Sphere3D({
  count,
  on,
  gradient,
  lightIntensity,
  offColor,
  sizeMode,
  sizeAmount,
  sizePulse,
  animate,
}: Sphere3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

  const frameRef = useRef({
    count,
    on,
    gradient,
    lightIntensity,
    offColor,
    sizeMode,
    sizeAmount,
    sizePulse,
    animate,
  });
  frameRef.current = {
    count,
    on,
    gradient,
    lightIntensity,
    offColor,
    sizeMode,
    sizeAmount,
    sizePulse,
    animate,
  };

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

    const draw = (now: number) => {
      const { width, height, dpr } = sizeRef.current;
      const time = (now - start) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = frameRef.current;
      renderSphere(ctx, {
        width,
        height,
        count: f.count,
        onCount: f.on,
        gradient: f.gradient,
        lightIntensity: f.lightIntensity,
        offColor: f.offColor,
        sizeMode: f.sizeMode,
        sizeAmount: f.sizeAmount,
        sizePulse: f.sizePulse,
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
