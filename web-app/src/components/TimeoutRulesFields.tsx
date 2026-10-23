import {
  TIMEOUT_PRESET_DETAILS,
  TIMEOUT_PRESETS,
  applyTimeoutPreset,
  presetLabel,
  rulesMatchPreset,
  type TimeoutPreset,
  type TimeoutRulesInput,
} from "../lib/timeoutRules";

export function TimeoutRulesFields({
  value,
  onChange,
}: {
  value: TimeoutRulesInput;
  onChange: (next: TimeoutRulesInput) => void;
}) {
  const presetSummary =
    value.timeoutPreset === "CUSTOM" ? null : TIMEOUT_PRESET_DETAILS[value.timeoutPreset].summary;
  const adjusted = !rulesMatchPreset(value);

  const setCount = (key: "fullTimeoutsRegulation" | "shortTimeouts" | "fullTimeoutsOvertime", raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onChange({ ...value, [key]: Math.max(0, Math.min(20, Math.trunc(next))) });
  };

  const setDuration = (key: "fullTimeoutDurationSec" | "shortTimeoutDurationSec", raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onChange({ ...value, [key]: Math.max(1, Math.min(600, Math.trunc(next))) });
  };

  return (
    <fieldset>
      <legend>Timeout rules</legend>
      <label>
        Level
        <select
          value={value.timeoutPreset}
          onChange={(e) => onChange(applyTimeoutPreset(e.target.value as TimeoutPreset, value))}
        >
          {TIMEOUT_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {presetLabel(preset)}
            </option>
          ))}
        </select>
      </label>
      {presetSummary ? <p className="form-hint">{presetSummary}</p> : null}
      {adjusted ? (
        <p className="form-hint">Counts are adjusted from the {presetLabel(value.timeoutPreset)} defaults.</p>
      ) : null}
      <label>
        Full timeouts in regulation (periods 1–4)
        <input
          type="number"
          min={0}
          max={20}
          value={value.fullTimeoutsRegulation}
          onChange={(e) => setCount("fullTimeoutsRegulation", e.target.value)}
        />
      </label>
      <label>
        Full timeouts in overtime
        <input
          type="number"
          min={0}
          max={20}
          value={value.fullTimeoutsOvertime}
          onChange={(e) => setCount("fullTimeoutsOvertime", e.target.value)}
        />
      </label>
      <label>
        Short timeouts
        <input
          type="number"
          min={0}
          max={20}
          value={value.shortTimeouts}
          onChange={(e) => setCount("shortTimeouts", e.target.value)}
        />
      </label>
      <p className="form-hint">
        {value.separateOvertimeTimeouts
          ? "At the start of overtime, each team gets only the overtime full-timeout count. Timeouts left from regulation are not added. Short timeouts are one pool for the whole game, so an unused one can still be called in overtime."
          : "Full and short timeouts are one pool for the whole game, including overtime."}
      </p>
      <label className="form-checkbox">
        <input
          type="checkbox"
          checked={value.separateOvertimeTimeouts}
          onChange={(e) => onChange({ ...value, separateOvertimeTimeouts: e.target.checked })}
        />
        Overtime uses its own full-timeout count
      </label>
      <label>
        Full timeout length (seconds)
        <input
          type="number"
          min={1}
          max={600}
          value={value.fullTimeoutDurationSec}
          onChange={(e) => setDuration("fullTimeoutDurationSec", e.target.value)}
        />
      </label>
      <label>
        Short timeout length (seconds)
        <input
          type="number"
          min={1}
          max={600}
          value={value.shortTimeoutDurationSec}
          onChange={(e) => setDuration("shortTimeoutDurationSec", e.target.value)}
        />
      </label>
    </fieldset>
  );
}
