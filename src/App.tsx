import { useEffect, useState } from "react";
import Controls from "./components/Controls";
import MandalaCanvas from "./components/MandalaCanvas";
import { isStage, nearestStage, type Stage } from "./mandala/layout";
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

// The default view (used when no URL params are present). Params are only
// written to the URL when they differ from these, keeping shared links tidy.
const DEFAULTS: AppState = {
  pattern: "bloom",
  stage: 500,
  on: 2,
  sizeMode: "shrink",
  sizeAmount: 1,
  allowOverlap: false,
  lightIntensity: 0.5,
  hueStart: 0,
  hueEnd: 278,
  animate: true,
};

function clampHue(v: number, fallback: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(360, Math.round(v))) : fallback;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
}

function readStateFromUrl(): AppState {
  const params = new URLSearchParams(window.location.search);

  const rawPattern = params.get("pattern") ?? "";
  const pattern: PatternId = isPattern(rawPattern) ? rawPattern : DEFAULTS.pattern;

  const rawStage = Number(params.get("stage"));
  const stage: Stage = isStage(rawStage)
    ? rawStage
    : Number.isFinite(rawStage) && rawStage > 0
      ? nearestStage(rawStage)
      : DEFAULTS.stage;

  const rawOn = Number(params.get("on"));
  const on = Number.isFinite(rawOn)
    ? Math.max(0, Math.min(Math.round(rawOn), stage))
    : Math.min(DEFAULTS.on, stage);

  const rawSize = params.get("size") ?? "";
  const sizeMode: SizeMode = (SIZE_MODES as string[]).includes(rawSize)
    ? (rawSize as SizeMode)
    : DEFAULTS.sizeMode;

  const sizeAmount = params.has("amt")
    ? clamp01(Number(params.get("amt")) / 100)
    : DEFAULTS.sizeAmount;

  const allowOverlap = params.has("overlap")
    ? params.get("overlap") === "1"
    : DEFAULTS.allowOverlap;

  const lightIntensity = params.has("light")
    ? clamp01(Number(params.get("light")) / 100)
    : DEFAULTS.lightIntensity;

  const hueStart = params.has("h0")
    ? clampHue(Number(params.get("h0")), DEFAULTS.hueStart)
    : DEFAULTS.hueStart;
  const hueEnd = params.has("h1")
    ? clampHue(Number(params.get("h1")), DEFAULTS.hueEnd)
    : DEFAULTS.hueEnd;

  const animate = params.has("animate")
    ? params.get("animate") === "1"
    : DEFAULTS.animate;

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
  if (state.pattern !== DEFAULTS.pattern) params.set("pattern", state.pattern);
  if (state.stage !== DEFAULTS.stage) params.set("stage", String(state.stage));
  if (state.on !== DEFAULTS.on) params.set("on", String(state.on));
  if (state.sizeMode !== DEFAULTS.sizeMode) params.set("size", state.sizeMode);
  if (state.sizeAmount !== DEFAULTS.sizeAmount) {
    params.set("amt", String(Math.round(state.sizeAmount * 100)));
  }
  if (state.allowOverlap !== DEFAULTS.allowOverlap) {
    params.set("overlap", state.allowOverlap ? "1" : "0");
  }
  if (state.lightIntensity !== DEFAULTS.lightIntensity) {
    params.set("light", String(Math.round(state.lightIntensity * 100)));
  }
  if (state.hueStart !== DEFAULTS.hueStart) {
    params.set("h0", String(state.hueStart));
  }
  if (state.hueEnd !== DEFAULTS.hueEnd) {
    params.set("h1", String(state.hueEnd));
  }
  if (state.animate !== DEFAULTS.animate) {
    params.set("animate", state.animate ? "1" : "0");
  }
  const query = params.toString();
  const url = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
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
    setState((s) => ({ ...s, hueStart: clampHue(hueStart, DEFAULTS.hueStart) }));
  const setHueEnd = (hueEnd: number) =>
    setState((s) => ({ ...s, hueEnd: clampHue(hueEnd, DEFAULTS.hueEnd) }));
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
