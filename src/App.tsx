import { useEffect, useState } from "react";
import Controls from "./components/Controls";
import MandalaCanvas from "./components/MandalaCanvas";
import { isStage, nearestStage, type Stage } from "./mandala/layout";
import {
  DEFAULT_GRADIENT,
  DEFAULT_OFF_COLOR,
  parseGradient,
  serializeGradient,
  type ColorStop,
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
  sizePulse: boolean;
  allowOverlap: boolean;
  lightIntensity: number;
  gradient: ColorStop[];
  offColor: string;
  showConnectors: boolean;
  lightWave: boolean;
  tierRings: boolean;
  tierGaps: boolean;
  tierBands: boolean;
  tierLabels: boolean;
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
  sizePulse: false,
  allowOverlap: false,
  lightIntensity: 0.5,
  gradient: DEFAULT_GRADIENT,
  offColor: DEFAULT_OFF_COLOR,
  showConnectors: true,
  lightWave: false,
  tierRings: false,
  tierGaps: false,
  tierBands: false,
  tierLabels: false,
  animate: true,
};

const DEFAULT_GRADIENT_KEY = serializeGradient(DEFAULTS.gradient);

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

  const sizePulse = params.has("spulse")
    ? params.get("spulse") === "1"
    : DEFAULTS.sizePulse;

  const allowOverlap = params.has("overlap")
    ? params.get("overlap") === "1"
    : DEFAULTS.allowOverlap;

  const lightIntensity = params.has("light")
    ? clamp01(Number(params.get("light")) / 100)
    : DEFAULTS.lightIntensity;

  const parsedGradient = params.has("grad")
    ? parseGradient(params.get("grad") ?? "")
    : null;
  const gradient = parsedGradient ?? DEFAULTS.gradient;

  const rawOff = (params.get("off") ?? "").replace(/^#/, "");
  const offColor =
    /^[0-9a-fA-F]{6}$/.test(rawOff) ? `#${rawOff.toLowerCase()}` : DEFAULTS.offColor;

  const showConnectors = params.has("links")
    ? params.get("links") === "1"
    : DEFAULTS.showConnectors;

  const lightWave = params.has("wave")
    ? params.get("wave") === "1"
    : DEFAULTS.lightWave;

  const tierRings = params.has("trings")
    ? params.get("trings") === "1"
    : DEFAULTS.tierRings;
  const tierGaps = params.has("tgaps")
    ? params.get("tgaps") === "1"
    : DEFAULTS.tierGaps;
  const tierBands = params.has("tbands")
    ? params.get("tbands") === "1"
    : DEFAULTS.tierBands;
  const tierLabels = params.has("tlabels")
    ? params.get("tlabels") === "1"
    : DEFAULTS.tierLabels;

  const animate = params.has("animate")
    ? params.get("animate") === "1"
    : DEFAULTS.animate;

  return {
    pattern,
    stage,
    on,
    sizeMode,
    sizeAmount,
    sizePulse,
    allowOverlap,
    lightIntensity,
    gradient,
    offColor,
    showConnectors,
    lightWave,
    tierRings,
    tierGaps,
    tierBands,
    tierLabels,
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
  if (state.sizePulse !== DEFAULTS.sizePulse) {
    params.set("spulse", state.sizePulse ? "1" : "0");
  }
  if (state.allowOverlap !== DEFAULTS.allowOverlap) {
    params.set("overlap", state.allowOverlap ? "1" : "0");
  }
  if (state.lightIntensity !== DEFAULTS.lightIntensity) {
    params.set("light", String(Math.round(state.lightIntensity * 100)));
  }
  const gradKey = serializeGradient(state.gradient);
  if (gradKey !== DEFAULT_GRADIENT_KEY) {
    params.set("grad", gradKey);
  }
  if (state.offColor !== DEFAULTS.offColor) {
    params.set("off", state.offColor.replace(/^#/, ""));
  }
  if (state.showConnectors !== DEFAULTS.showConnectors) {
    params.set("links", state.showConnectors ? "1" : "0");
  }
  if (state.lightWave !== DEFAULTS.lightWave) {
    params.set("wave", state.lightWave ? "1" : "0");
  }
  if (state.tierRings !== DEFAULTS.tierRings) {
    params.set("trings", state.tierRings ? "1" : "0");
  }
  if (state.tierGaps !== DEFAULTS.tierGaps) {
    params.set("tgaps", state.tierGaps ? "1" : "0");
  }
  if (state.tierBands !== DEFAULTS.tierBands) {
    params.set("tbands", state.tierBands ? "1" : "0");
  }
  if (state.tierLabels !== DEFAULTS.tierLabels) {
    params.set("tlabels", state.tierLabels ? "1" : "0");
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
  const setSizePulse = (sizePulse: boolean) =>
    setState((s) => ({ ...s, sizePulse }));
  const setAllowOverlap = (allowOverlap: boolean) =>
    setState((s) => ({ ...s, allowOverlap }));
  const setLightIntensity = (lightIntensity: number) =>
    setState((s) => ({ ...s, lightIntensity: clamp01(lightIntensity) }));
  const setGradient = (gradient: ColorStop[]) =>
    setState((s) => ({ ...s, gradient }));
  const setOffColor = (offColor: string) =>
    setState((s) => ({ ...s, offColor }));
  const setShowConnectors = (showConnectors: boolean) =>
    setState((s) => ({ ...s, showConnectors }));
  const setLightWave = (lightWave: boolean) =>
    setState((s) => ({ ...s, lightWave }));
  const setTierRings = (tierRings: boolean) =>
    setState((s) => ({ ...s, tierRings }));
  const setTierGaps = (tierGaps: boolean) =>
    setState((s) => ({ ...s, tierGaps }));
  const setTierBands = (tierBands: boolean) =>
    setState((s) => ({ ...s, tierBands }));
  const setTierLabels = (tierLabels: boolean) =>
    setState((s) => ({ ...s, tierLabels }));
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
          sizePulse={state.sizePulse}
          allowOverlap={state.allowOverlap}
          lightIntensity={state.lightIntensity}
          gradient={state.gradient}
          offColor={state.offColor}
          showConnectors={state.showConnectors}
          lightWave={state.lightWave}
          tierRings={state.tierRings}
          tierGaps={state.tierGaps}
          tierBands={state.tierBands}
          tierLabels={state.tierLabels}
          animate={state.animate}
        />
      </main>
      <Controls
        pattern={state.pattern}
        stage={state.stage}
        on={state.on}
        sizeMode={state.sizeMode}
        sizeAmount={state.sizeAmount}
        sizePulse={state.sizePulse}
        allowOverlap={state.allowOverlap}
        lightIntensity={state.lightIntensity}
        gradient={state.gradient}
        offColor={state.offColor}
        showConnectors={state.showConnectors}
        lightWave={state.lightWave}
        tierRings={state.tierRings}
        tierGaps={state.tierGaps}
        tierBands={state.tierBands}
        tierLabels={state.tierLabels}
        animate={state.animate}
        onPatternChange={setPattern}
        onStageChange={setStage}
        onOnChange={setOn}
        onSizeModeChange={setSizeMode}
        onSizeAmountChange={setSizeAmount}
        onSizePulseChange={setSizePulse}
        onAllowOverlapChange={setAllowOverlap}
        onLightIntensityChange={setLightIntensity}
        onGradientChange={setGradient}
        onOffColorChange={setOffColor}
        onShowConnectorsChange={setShowConnectors}
        onLightWaveChange={setLightWave}
        onTierRingsChange={setTierRings}
        onTierGapsChange={setTierGaps}
        onTierBandsChange={setTierBands}
        onTierLabelsChange={setTierLabels}
        onAnimateChange={setAnimate}
      />
    </div>
  );
}
