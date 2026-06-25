import { STAGES, type Stage } from "../mandala/layout";
import {
  FULL_SPECTRUM_AT,
  GRADIENT_PRESETS,
  serializeGradient,
  type ColorStop,
} from "../mandala/palette";
import { PATTERNS, type PatternId } from "../mandala/patterns";
import type { SizeMode } from "../mandala/render";
import type { RevealOrder } from "./RevealCanvas";
import type { ViewMode } from "../App";

const SIZE_MODES: { id: SizeMode; label: string }[] = [
  { id: "uniform", label: "Uniform" },
  { id: "grow", label: "Grow" },
  { id: "shrink", label: "Shrink" },
];

const REVEAL_ORDERS: { id: RevealOrder; label: string }[] = [
  { id: "outer", label: "Outer in" },
  { id: "inner", label: "Inner out" },
  { id: "random", label: "Random" },
];

interface ControlsProps {
  mode: ViewMode;
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
  opaqueOff: boolean;
  showConnectors: boolean;
  lightWave: boolean;
  tierRings: boolean;
  tierGaps: boolean;
  tierBands: boolean;
  tierLabels: boolean;
  tierValues: boolean;
  tierColor: string;
  animate: boolean;
  motionSpeed: number;
  spin3d: boolean;
  nod3d: boolean;
  rock3d: boolean;
  breathe3d: boolean;
  specular3d: boolean;
  revealTarget: Stage;
  revealDuration: number;
  revealOrder: RevealOrder;
  revealLoop: boolean;
  revealPlaying: boolean;
  onPatternChange: (pattern: PatternId) => void;
  onStageChange: (stage: Stage) => void;
  onOnChange: (on: number) => void;
  onSizeModeChange: (mode: SizeMode) => void;
  onSizeAmountChange: (amount: number) => void;
  onSizePulseChange: (on: boolean) => void;
  onAllowOverlapChange: (allow: boolean) => void;
  onLightIntensityChange: (value: number) => void;
  onGradientChange: (stops: ColorStop[]) => void;
  onOffColorChange: (color: string) => void;
  onOpaqueOffChange: (on: boolean) => void;
  onShowConnectorsChange: (show: boolean) => void;
  onLightWaveChange: (on: boolean) => void;
  onTierRingsChange: (on: boolean) => void;
  onTierGapsChange: (on: boolean) => void;
  onTierBandsChange: (on: boolean) => void;
  onTierLabelsChange: (on: boolean) => void;
  onTierValuesChange: (on: boolean) => void;
  onTierColorChange: (color: string) => void;
  onModeChange: (mode: ViewMode) => void;
  onAnimateChange: (animate: boolean) => void;
  onMotionSpeedChange: (value: number) => void;
  onSpin3dChange: (on: boolean) => void;
  onNod3dChange: (on: boolean) => void;
  onRock3dChange: (on: boolean) => void;
  onBreathe3dChange: (on: boolean) => void;
  onSpecular3dChange: (on: boolean) => void;
  onRevealTargetChange: (stage: Stage) => void;
  onRevealDurationChange: (value: number) => void;
  onRevealOrderChange: (order: RevealOrder) => void;
  onRevealLoopChange: (on: boolean) => void;
  onRevealPlayingChange: (on: boolean) => void;
  onReplayReveal: () => void;
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
  mode,
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
  opaqueOff,
  showConnectors,
  lightWave,
  tierRings,
  tierGaps,
  tierBands,
  tierLabels,
  tierValues,
  tierColor,
  animate,
  motionSpeed,
  spin3d,
  nod3d,
  rock3d,
  breathe3d,
  specular3d,
  revealTarget,
  revealDuration,
  revealOrder,
  revealLoop,
  revealPlaying,
  onPatternChange,
  onStageChange,
  onOnChange,
  onSizeModeChange,
  onSizeAmountChange,
  onSizePulseChange,
  onAllowOverlapChange,
  onLightIntensityChange,
  onGradientChange,
  onOffColorChange,
  onOpaqueOffChange,
  onShowConnectorsChange,
  onLightWaveChange,
  onTierRingsChange,
  onTierGapsChange,
  onTierBandsChange,
  onTierLabelsChange,
  onTierValuesChange,
  onTierColorChange,
  onModeChange,
  onAnimateChange,
  onMotionSpeedChange,
  onSpin3dChange,
  onNod3dChange,
  onRock3dChange,
  onBreathe3dChange,
  onSpecular3dChange,
  onRevealTargetChange,
  onRevealDurationChange,
  onRevealOrderChange,
  onRevealLoopChange,
  onRevealPlayingChange,
  onReplayReveal,
}: ControlsProps) {
  const is3d = mode === "3d";
  const isReveal = mode === "reveal";
  const is2d = mode === "2d";
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

      <div className="segmented segmented--3" role="tablist" aria-label="View mode">
        <button
          type="button"
          role="tab"
          className={`segmented__btn${is2d ? " is-active" : ""}`}
          aria-selected={is2d}
          onClick={() => onModeChange("2d")}
        >
          2D
        </button>
        <button
          type="button"
          role="tab"
          className={`segmented__btn${is3d ? " is-active" : ""}`}
          aria-selected={is3d}
          onClick={() => onModeChange("3d")}
        >
          3D
        </button>
        <button
          type="button"
          role="tab"
          className={`segmented__btn${isReveal ? " is-active" : ""}`}
          aria-selected={isReveal}
          onClick={() => onModeChange("reveal")}
        >
          Reveal
        </button>
      </div>

      {!is3d && (
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
      )}

      {isReveal && (
        <section className="control-group">
          <div className="control-label">
            <span>Transition</span>
            <span className="control-hint">500 → target</span>
          </div>
          <div className="control-label control-label--sub">
            <span>End on</span>
          </div>
          <div className="segmented" role="group" aria-label="Reveal target stage">
            {STAGES.filter((s) => s !== 500).map((s) => (
              <button
                key={s}
                type="button"
                className={`segmented__btn${s === revealTarget ? " is-active" : ""}`}
                aria-pressed={s === revealTarget}
                onClick={() => onRevealTargetChange(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="control-label control-label--sub">
            <span>Enabled</span>
            <span className="control-value">
              {Math.min(on, revealTarget)}{" "}
              <span className="control-value__sep">/</span> {revealTarget}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={revealTarget}
            value={Math.min(on, revealTarget)}
            onChange={(e) => onOnChange(Number(e.target.value))}
            aria-label="Enabled slots"
          />

          <div className="control-label control-label--sub">
            <span>Disappear</span>
          </div>
          <div className="segmented segmented--3" role="group" aria-label="Reveal order">
            {REVEAL_ORDERS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`segmented__btn${o.id === revealOrder ? " is-active" : ""}`}
                aria-pressed={o.id === revealOrder}
                onClick={() => onRevealOrderChange(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="control-label control-label--sub">
            <span>Duration</span>
            <span className="control-value">{revealDuration.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            min={5}
            max={120}
            value={Math.round(revealDuration * 10)}
            onChange={(e) => onRevealDurationChange(Number(e.target.value) / 10)}
            aria-label="Reveal duration (seconds)"
          />

          <div className="control-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={onReplayReveal}
            >
              Replay
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => onRevealPlayingChange(!revealPlaying)}
            >
              {revealPlaying ? "Pause" : "Play"}
            </button>
          </div>

          <label className="toggle toggle--row">
            <input
              type="checkbox"
              checked={revealLoop}
              onChange={(e) => onRevealLoopChange(e.target.checked)}
            />
            <span>Loop (ping-pong)</span>
          </label>
        </section>
      )}

      {!isReveal && (
      <section className="control-group">
        <div className="control-label">
          <span>Form</span>
          <span className="control-hint">
            {is3d ? "slots on the dome" : "slots in view"}
          </span>
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
      )}

      {!isReveal && (
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
      )}

      {!isReveal && (
      <section className="control-group">
        <div className="control-label">
          <span>Slot size</span>
          <span className="control-hint">
            {is3d ? "pole to equator" : "center to edge"}
          </span>
        </div>
        <div className="segmented segmented--3" role="group" aria-label="Slot size">
          {SIZE_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`segmented__btn${m.id === sizeMode ? " is-active" : ""}`}
              aria-pressed={m.id === sizeMode}
              disabled={sizePulse}
              onClick={() => onSizeModeChange(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div
          className={`subcontrol${sizeMode === "uniform" || sizePulse ? " is-disabled" : ""}`}
        >
          <div className="control-label control-label--sub">
            <span>Amount</span>
            <span className="control-value">{Math.round(sizeAmount * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(sizeAmount * 100)}
            disabled={sizeMode === "uniform" || sizePulse}
            onChange={(e) => onSizeAmountChange(Number(e.target.value) / 100)}
            aria-label="Size gradient amount"
          />
        </div>

        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={sizePulse}
            onChange={(e) => onSizePulseChange(e.target.checked)}
          />
          <span>Animate size (grow ↔ shrink)</span>
        </label>

        {!is3d && (
        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={allowOverlap}
            onChange={(e) => onAllowOverlapChange(e.target.checked)}
          />
          <span>Allow overlap</span>
        </label>
        )}
      </section>
      )}

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

        <div className="gradient-stop gradient-stop--off">
          <input
            type="color"
            className="gradient-stop__color"
            value={offColor}
            onChange={(e) => onOffColorChange(e.target.value)}
            aria-label="Off slot color"
          />
          <span className="off-color-label">Off slot color</span>
        </div>

        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={opaqueOff}
            onChange={(e) => onOpaqueOffChange(e.target.checked)}
          />
          <span>Opaque off slots</span>
        </label>

        <p className="control-note">
          Pick a preset or edit the stops. More enabled slots reveal more of the
          gradient — the full spread appears at {FULL_SPECTRUM_AT}+ enabled.
        </p>
      </section>

      {is2d && (
      <section className="control-group">
        <div className="control-label">
          <span>Tiers</span>
          <span className="control-hint">3 · 5 · 10 · 50 · 500</span>
        </div>
        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={tierRings}
            onChange={(e) => onTierRingsChange(e.target.checked)}
          />
          <span>Divider rings</span>
        </label>
        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={tierGaps}
            onChange={(e) => onTierGapsChange(e.target.checked)}
          />
          <span>Separate into bands (gaps)</span>
        </label>
        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={tierBands}
            onChange={(e) => onTierBandsChange(e.target.checked)}
          />
          <span>Color per tier</span>
        </label>
        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={tierLabels}
            onChange={(e) => onTierLabelsChange(e.target.checked)}
          />
          <span>Tier labels</span>
        </label>
        <label
          className={`toggle toggle--row toggle--sub${tierLabels ? "" : " is-disabled"}`}
        >
          <input
            type="checkbox"
            checked={tierValues}
            disabled={!tierLabels}
            onChange={(e) => onTierValuesChange(e.target.checked)}
          />
          <span>Show values ($)</span>
        </label>

        <div className="gradient-stop gradient-stop--off">
          <input
            type="color"
            className="gradient-stop__color"
            value={tierColor}
            onChange={(e) => onTierColorChange(e.target.value)}
            aria-label="Tier ring and label color"
          />
          <span className="off-color-label">Ring &amp; label color</span>
        </div>
      </section>
      )}

      {!is3d && (
      <section className="control-group control-group--row">
        <label className="toggle">
          <input
            type="checkbox"
            checked={showConnectors}
            onChange={(e) => onShowConnectorsChange(e.target.checked)}
          />
          <span>Connectors</span>
        </label>
      </section>
      )}

      <section className="control-group">
        <div className="control-label">
          <span>Motion</span>
          <span className="control-hint">
            {is3d ? "spin · nod · sheen" : "ambient drift"}
          </span>
        </div>
        <label className="toggle toggle--row">
          <input
            type="checkbox"
            checked={animate}
            onChange={(e) => onAnimateChange(e.target.checked)}
          />
          <span>Ambient motion</span>
        </label>

        <div className={`subcontrol${animate ? "" : " is-disabled"}`}>
          <div className="control-label control-label--sub">
            <span>Speed</span>
            <span className="control-value">
              {Math.round(motionSpeed * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={150}
            value={Math.round(motionSpeed * 100)}
            disabled={!animate}
            onChange={(e) => onMotionSpeedChange(Number(e.target.value) / 100)}
            aria-label="Ambient motion speed"
          />
        </div>

        {is3d && (
          <>
            <label
              className={`toggle toggle--row toggle--sub${animate ? "" : " is-disabled"}`}
            >
              <input
                type="checkbox"
                checked={spin3d}
                disabled={!animate}
                onChange={(e) => onSpin3dChange(e.target.checked)}
              />
              <span>Spin (continuous)</span>
            </label>
            <label
              className={`toggle toggle--row toggle--sub${animate ? "" : " is-disabled"}`}
            >
              <input
                type="checkbox"
                checked={rock3d}
                disabled={!animate}
                onChange={(e) => onRock3dChange(e.target.checked)}
              />
              <span>Rock (oscillating spin)</span>
            </label>
            <label
              className={`toggle toggle--row toggle--sub${animate ? "" : " is-disabled"}`}
            >
              <input
                type="checkbox"
                checked={nod3d}
                disabled={!animate}
                onChange={(e) => onNod3dChange(e.target.checked)}
              />
              <span>Camera nod (tilt)</span>
            </label>
            <label
              className={`toggle toggle--row toggle--sub${animate ? "" : " is-disabled"}`}
            >
              <input
                type="checkbox"
                checked={breathe3d}
                disabled={!animate}
                onChange={(e) => onBreathe3dChange(e.target.checked)}
              />
              <span>Depth breathing</span>
            </label>
            <label
              className={`toggle toggle--row toggle--sub${animate ? "" : " is-disabled"}`}
            >
              <input
                type="checkbox"
                checked={specular3d}
                disabled={!animate}
                onChange={(e) => onSpecular3dChange(e.target.checked)}
              />
              <span>Specular sweep (sheen)</span>
            </label>
          </>
        )}
      </section>
    </aside>
  );
}
