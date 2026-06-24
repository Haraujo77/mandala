import { useEffect, useState } from "react";
import Controls from "./components/Controls";
import MandalaCanvas from "./components/MandalaCanvas";
import { isStage, nearestStage, type Stage } from "./mandala/layout";
import {
  DEFAULT_HUE_END,
  DEFAULT_HUE_START,
} from "./mandala/palette";
import { isPattern, type PatternId } from "./mandala/patterns";
import type { SizeMode } from "./mandala/render";

const SIZE_MODES: SizeMode[] = ["uniform", "grow", "shrink"];

interface AppState {
  pattern: PatternId;
  stage: Stage;
  on: number;
  sizeMode: SizeMode;
  sizeAmount: number;
  allowOverlap: boolean;
  lightIntensity: number;
  hueStart: number;
  hueEnd: number;
  animate: boolean;
}

function clampHue(v: number, fallback: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(360, Math.round(v))) : fallback;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
}

function readStateFromUrl(): AppState {
  const params = new URLSearchParams(window.location.search);

  const rawPattern = params.get("pattern") ?? "";
  const pattern: PatternId = isPattern(rawPattern) ? rawPattern : "bloom";

  const rawStage = Number(params.get("stage"));
  const stage: Stage = isStage(rawStage)
    ? rawStage
    : Number.isFinite(rawStage) && rawStage > 0
      ? nearestStage(rawStage)
      : 50;

  const rawOn = Number(params.get("on"));
  const on = Number.isFinite(rawOn)
    ? Math.max(0, Math.min(Math.round(rawOn), stage))
    : Math.min(12, stage);

  const rawSize = params.get("size") ?? "";
  const sizeMode: SizeMode = (SIZE_MODES as string[]).includes(rawSize)
    ? (rawSize as SizeMode)
    : "uniform";

  const sizeAmount = params.has("amt")
    ? clamp01(Number(params.get("amt")) / 100)
    : 0.5;

  const allowOverlap = params.get("overlap") !== "0";

  const lightIntensity = params.has("light")
    ? clamp01(Number(params.get("light")) / 100)
    : 0.5;

  const hueStart = params.has("h0")
    ? clampHue(Number(params.get("h0")), DEFAULT_HUE_START)
    : DEFAULT_HUE_START;
  const hueEnd = params.has("h1")
    ? clampHue(Number(params.get("h1")), DEFAULT_HUE_END)
    : DEFAULT_HUE_END;

  const animate = params.get("animate") !== "0";

  return {
    pattern,
    stage,
    on,
    sizeMode,
    sizeAmount,
    allowOverlap,
    lightIntensity,
    hueStart,
    hueEnd,
    animate,
  };
}

function writeStateToUrl(state: AppState) {
  const params = new URLSearchParams();
  params.set("pattern", state.pattern);
  params.set("stage", String(state.stage));
  params.set("on", String(state.on));
  if (state.sizeMode !== "uniform") {
    params.set("size", state.sizeMode);
    params.set("amt", String(Math.round(state.sizeAmount * 100)));
  }
  if (!state.allowOverlap) params.set("overlap", "0");
  if (state.lightIntensity !== 0.5) {
    params.set("light", String(Math.round(state.lightIntensity * 100)));
  }
  if (state.hueStart !== DEFAULT_HUE_START) {
    params.set("h0", String(state.hueStart));
  }
  if (state.hueEnd !== DEFAULT_HUE_END) {
    params.set("h1", String(state.hueEnd));
  }
  if (!state.animate) params.set("animate", "0");
  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState(null, "", url);
}

export default function App() {
  const [state, setState] = useState<AppState>(() => readStateFromUrl());

  useEffect(() => {
    writeStateToUrl(state);
  }, [state]);

  const setPattern = (pattern: PatternId) =>
    setState((s) => ({ ...s, pattern }));
  const setStage = (stage: Stage) =>
    setState((s) => ({ ...s, stage, on: Math.min(s.on, stage) }));
  const setOn = (on: number) =>
    setState((s) => ({
      ...s,
      on: Math.max(0, Math.min(Math.round(on || 0), s.stage)),
    }));
  const setSizeMode = (sizeMode: SizeMode) =>
    setState((s) => ({ ...s, sizeMode }));
  const setSizeAmount = (sizeAmount: number) =>
    setState((s) => ({ ...s, sizeAmount: clamp01(sizeAmount) }));
  const setAllowOverlap = (allowOverlap: boolean) =>
    setState((s) => ({ ...s, allowOverlap }));
  const setLightIntensity = (lightIntensity: number) =>
    setState((s) => ({ ...s, lightIntensity: clamp01(lightIntensity) }));
  const setHueStart = (hueStart: number) =>
    setState((s) => ({ ...s, hueStart: clampHue(hueStart, DEFAULT_HUE_START) }));
  const setHueEnd = (hueEnd: number) =>
    setState((s) => ({ ...s, hueEnd: clampHue(hueEnd, DEFAULT_HUE_END) }));
  const setAnimate = (animate: boolean) =>
    setState((s) => ({ ...s, animate }));

  return (
    <div className="app">
      <main className="app__stage">
        <MandalaCanvas
          pattern={state.pattern}
          stage={state.stage}
          on={state.on}
          sizeMode={state.sizeMode}
          sizeAmount={state.sizeAmount}
          allowOverlap={state.allowOverlap}
          lightIntensity={state.lightIntensity}
          hueStart={state.hueStart}
          hueEnd={state.hueEnd}
          animate={state.animate}
        />
      </main>
      <Controls
        pattern={state.pattern}
        stage={state.stage}
        on={state.on}
        sizeMode={state.sizeMode}
        sizeAmount={state.sizeAmount}
        allowOverlap={state.allowOverlap}
        lightIntensity={state.lightIntensity}
        hueStart={state.hueStart}
        hueEnd={state.hueEnd}
        animate={state.animate}
        onPatternChange={setPattern}
        onStageChange={setStage}
        onOnChange={setOn}
        onSizeModeChange={setSizeMode}
        onSizeAmountChange={setSizeAmount}
        onAllowOverlapChange={setAllowOverlap}
        onLightIntensityChange={setLightIntensity}
        onHueStartChange={setHueStart}
        onHueEndChange={setHueEnd}
        onAnimateChange={setAnimate}
      />
    </div>
  );
}
