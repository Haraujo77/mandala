import {
  GrainGradient,
  MeshGradient,
  Swirl,
  Warp,
} from "@paper-design/shaders-react";
import type { ColorStop } from "../mandala/palette";

export type ShaderStyle = "mesh" | "warp" | "swirl" | "grain";

export const SHADER_STYLES: { id: ShaderStyle; label: string }[] = [
  { id: "mesh", label: "Mesh" },
  { id: "warp", label: "Warp" },
  { id: "swirl", label: "Swirl" },
  { id: "grain", label: "Heatmap" },
];

export function isShaderStyle(v: string): v is ShaderStyle {
  return SHADER_STYLES.some((s) => s.id === v);
}

const BACK = "#05070f";

interface ShaderBackgroundProps {
  style: ShaderStyle;
  gradient: ColorStop[];
  speed: number;
  /** Square render size (px). Rendered offscreen and sampled per slot. */
  size: number;
}

/** Colors sorted center->edge for the shader's `colors` array. */
function colorsFromGradient(gradient: ColorStop[]): string[] {
  return [...gradient]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => s.color)
    .slice(0, 10);
}

export default function ShaderBackground({
  style,
  gradient,
  speed,
  size,
}: ShaderBackgroundProps) {
  if (size <= 0) return null;
  const colors = colorsFromGradient(gradient);

  const common = {
    width: size,
    height: size,
    colors,
    speed,
    style: { display: "block", width: size, height: size },
  } as const;

  switch (style) {
    case "warp":
      return (
        <Warp
          {...common}
          softness={0.95}
          distortion={0.25}
          swirl={0.7}
          swirlIterations={8}
          shape="edge"
          scale={1}
        />
      );
    case "swirl":
      return (
        <Swirl
          {...common}
          colorBack={BACK}
          twist={0.45}
          center={0.15}
          softness={0.85}
        />
      );
    case "grain":
      return (
        <GrainGradient
          {...common}
          colorBack={BACK}
          softness={0.9}
          intensity={0.55}
          noise={0.35}
          shape="sphere"
        />
      );
    case "mesh":
    default:
      return <MeshGradient {...common} distortion={0.85} swirl={0.45} />;
  }
}
