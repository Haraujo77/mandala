import { useState } from "react";
import { STAGES, type Stage } from "../mandala/layout";
import {
  FULL_SPECTRUM_AT,
  GRADIENT_PRESETS,
  serializeGradient,
  type ColorStop,
} from "../mandala/palette";
import { PATTERNS, type PatternId } from "../mandala/patterns";
import type { SizeMode } from "../mandala/render";
import { SHADER_STYLES, type ShaderStyle } from "./ShaderBackground";

const SIZE_MODES: { id: SizeMode; label: string }[] = [
  { id: "uniform", label: "Uniform" },
  { id: "grow", label: "Grow" },
  { id: "shrink", label: "Shrink" },
];

interface ControlsProps {
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
  onPatternChange: (pattern: PatternId) => void;
  onStageChange: (stage: Stage) => void;
  onOnChange: (on: number) => void;
  onSizeModeChange: (mode: SizeMode) => void;
  onSizeAmountChange: (amount: number) => void;
  onAllowOverlapChange: (allow: boolean) => void;
  onLightIntensityChange: (value: number) => void;
  onGradientChange: (stops: ColorStop[]) => void;
  onShowConnectorsChange: (show: boolean) => void;
  onLightWaveChange: (on: boolean) => void;
  onShaderBgChange: (on: boolean) => void;
  onShaderStyleChange: (style: ShaderStyle) => void;
  onShaderSpeedChange: (value: number) => void;
  onAnimateChange: (animate: boolean) => void;
}

/** CSS background for a gradient preview bar. */
function gradientCss(stops: ColorStop[]): string {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const parts = sorted.map(
    (s) => `${s.color} ${Math.round(s.pos * 100)}%`,
  );
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

export default function Controls({
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
  onPatternChange,
  onStageChange,
  onOnChange,
  onSizeModeChange,
  onSizeAmountChange,
  onAllowOverlapChange,
  onLightIntensityChange,
  onGradientChange,
  onShowConnectorsChange,
  onLightWaveChange,
  onShaderBgChange,
  onShaderStyleChange,
  onShaderSpeedChange,
  onAnimateChange,
}: ControlsProps) {
  const [tab, setTab] = useState<"design" | "shader">("design");
  const colorProgress = Math.min(1, on / FULL_SPECTRUM_AT);
  const spectrumReached = on >= FULL_SPECTRUM_AT;

  const gradKey = serializeGradient(gradient);

  const setStopColor = (i: number, color: string) => {
    const next = gradient.map((s, idx) => (idx === i ? { ...s, color } : s));
    onGradientChange(next);
  };
  const setStopPos = (i: number, pos: number) => {
    const p = Math.max(0, Math.min(1, pos));
    const next = gradient.map((s, idx) => (idx === i ? { ...s, pos: p } : s));
    onGradientChange(next);
  };
  const removeStop = (i: number) => {
    if (gradient.length <= 2) return;
    onGradientChange(gradient.filter((_, idx) => idx !== i));
  };
  const addStop = () => {
    const sorted = [...gradient].sort((a, b) => a.pos - b.pos);
    // Insert at the widest gap so the new stop lands somewhere useful.
    let gapStart = 0;
    let gapEnd = 1;
    let best = -1;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].pos - sorted[i - 1].pos;
      if (gap > best) {
        best = gap;
        gapStart = sorted[i - 1].pos;
        gapEnd = sorted[i].pos;
      }
    }
    const pos = (gapStart + gapEnd) / 2;
    onGradientChange([...gradient, { pos, color: "#ffffff" }]);
  };

  return (
    <aside className="controls">
      <header className="controls__head">
        <h1 className="controls__title">Mandala</h1>
        <p className="controls__subtitle">Friends brought to the project</p>
      </header>

      <div className="segmented" role="tablist" aria-label="Control tabs">
        <button
          type="button"
          role="tab"
          className={`segmented__btn${tab === "design" ? " is-active" : ""}`}
          aria-selected={tab === "design"}
          onClick={() => setTab("design")}
        >
          Design
        </button>
        <button
          type="button"
          role="tab"
          className={`segmented__btn${tab === "shader" ? " is-active" : ""}`}
          aria-selected={tab === "shader"}
          onClick={() => setTab("shader")}
        >
          Shader
        </button>
      </div>

      {tab === "design" && (
      <>
      <section className="control-group">
        <div className="control-label">
          <span>Pattern</span>
          <span className="control-hint">
            {PATTERNS.find((p) => p.id === pattern)?.hint}
          </span>
        </div>
        <div className="pattern-grid" role="group" aria-label="Distribution pattern">
          {PATTERNS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`pattern-btn${p.id === pattern ? " is-active" : ""}`}
              aria-pressed={p.id === pattern}
              onClick={() => onPatternChange(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="control-group">
        <div className="control-label">
          <span>Form</span>
          <span className="control-hint">slots in view</span>
        </div>
        <div className="segmented" role="group" aria-label="Milestone stage">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className={`segmented__btn${s === stage ? " is-active" : ""}`}
              aria-pressed={s === stage}
              onClick={() => onStageChange(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <section className="control-group">
        <div className="control-label">
          <span>Enabled</span>
          <span className="control-value">
            {on} <span className="control-value__sep">/</span> {stage}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={stage}
          value={on}
          onChange={(e) => onOnChange(Number(e.target.value))}
          aria-label="Enabled slots"
        />
        <div className="control-row">
          <input
            type="number"
            min={0}
            max={stage}
            value={on}
            onChange={(e) => onOnChange(Number(e.target.value))}
            className="number-input"
            aria-label="Enabled slots (number)"
          />
          <div className="btn-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => onOnChange(0)}
            >
              Clear
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() =>
                onOnChange(Math.floor(Math.random() * (stage + 1)))
              }
            >
              Random
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => onOnChange(stage)}
            >
              Fill
            </button>
          </div>
        </div>
      </section>

      <section className="control-group">
        <div className="control-label">
          <span>Slot size</span>
          <span className="control-hint">center to edge</span>
        </div>
        <div className="segmented segmented--3" role="group" aria-label="Slot size">
          {SIZE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`segmented__btn${m.id === sizeMode ? " is-active" : ""}`}
              aria-pressed={m.id === sizeMode}
              onClick={() => onSizeModeChange(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className={`subcontrol${sizeMode === "uniform" ? " is-disabled" : ""}`}>
          <div className="control-label control-label--sub">
            <span>Amount</span>
            <span className="control-value">{Math.round(sizeAmount * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(sizeAmount * 100)}
            disabled={sizeMode === "uniform"}
            onChange={(e) => onSizeAmountChange(Number(e.target.value) / 100)}
            aria-label="Size gradient amount"
          />
        </div>

        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={allowOverlap}
            onChange={(e) => onAllowOverlapChange(e.target.checked)}
          />
          <span>Allow overlap</span>
        </label>
      </section>

      <section className="control-group">
        <div className="control-label">
          <span>Light</span>
          <span className="control-value">
            {Math.round(lightIntensity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(lightIntensity * 100)}
          onChange={(e) => onLightIntensityChange(Number(e.target.value) / 100)}
          aria-label="Light intensity"
        />
        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={lightWave}
            onChange={(e) => onLightWaveChange(e.target.checked)}
          />
          <span>Breathing wave</span>
        </label>
      </section>

      <section className="control-group">
        <div className="control-label">
          <span>Color spread</span>
          <span className="control-hint">
            {spectrumReached ? "full gradient" : "warming up"}
          </span>
        </div>
        <div className="spectrum-meter" aria-hidden="true">
          <div
            className="spectrum-meter__fill"
            style={{ width: `${colorProgress * 100}%` }}
          />
        </div>

        <div className="pattern-grid" role="group" aria-label="Gradient preset">
          {GRADIENT_PRESETS.map((p) => {
            const active = serializeGradient(p.stops) === gradKey;
            return (
              <button
                key={p.id}
                type="button"
                className={`pattern-btn${active ? " is-active" : ""}`}
                aria-pressed={active}
                onClick={() => onGradientChange(p.stops.map((s) => ({ ...s })))}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div
          className="spectrum-preview"
          style={{ background: gradientCss(gradient) }}
          aria-hidden="true"
        />

        <div className="gradient-stops">
          {gradient.map((stop, i) => (
            <div className="gradient-stop" key={i}>
              <input
                type="color"
                className="gradient-stop__color"
                value={stop.color}
                onChange={(e) => setStopColor(i, e.target.value)}
                aria-label={`Stop ${i + 1} color`}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(stop.pos * 100)}
                onChange={(e) => setStopPos(i, Number(e.target.value) / 100)}
                aria-label={`Stop ${i + 1} position`}
              />
              <button
                type="button"
                className="gradient-stop__remove"
                onClick={() => removeStop(i)}
                disabled={gradient.length <= 2}
                aria-label={`Remove stop ${i + 1}`}
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="ghost-btn ghost-btn--block" onClick={addStop}>
          Add color stop
        </button>

        <p className="control-note">
          Pick a preset or edit the stops. More enabled slots reveal more of the
          gradient — the full spread appears at {FULL_SPECTRUM_AT}+ enabled.
        </p>
      </section>

      <section className="control-group control-group--row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showConnectors}
            onChange={(e) => onShowConnectorsChange(e.target.checked)}
          />
          <span>Connectors</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={animate}
            onChange={(e) => onAnimateChange(e.target.checked)}
          />
          <span>Ambient motion</span>
        </label>
      </section>
      </>
      )}

      {tab === "shader" && (
      <>
      <section className="control-group">
        <div className="control-label">
          <span>Shader background</span>
          <span className="control-hint">behind the mandala</span>
        </div>
        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={shaderBg}
            onChange={(e) => onShaderBgChange(e.target.checked)}
          />
          <span>Enable shader</span>
        </label>
      </section>

      <section className={`control-group${shaderBg ? "" : " is-disabled"}`}>
        <div className="control-label">
          <span>Style</span>
          <span className="control-hint">GPU effect</span>
        </div>
        <div className="pattern-grid" role="group" aria-label="Shader style">
          {SHADER_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`pattern-btn${s.id === shaderStyle ? " is-active" : ""}`}
              aria-pressed={s.id === shaderStyle}
              disabled={!shaderBg}
              onClick={() => onShaderStyleChange(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="subcontrol">
          <div className="control-label control-label--sub">
            <span>Speed</span>
            <span className="control-value">
              {Math.round((shaderSpeed / 2) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((shaderSpeed / 2) * 100)}
            disabled={!shaderBg}
            onChange={(e) => onShaderSpeedChange((Number(e.target.value) / 100) * 2)}
            aria-label="Shader speed"
          />
        </div>

        <p className="control-note">
          The shader uses your Color spread gradient. Edit colors in the Design
          tab and they flow here too.
        </p>
      </section>
      </>
      )}
    </aside>
  );
}
