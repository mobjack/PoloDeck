import { useState } from "react";
import type { DeviceRole } from "./types";
import type { DeviceSetup } from "./config";

const ROLE_OPTIONS: Array<{ value: DeviceRole; label: string }> = [
  { value: "SCOREBOARD", label: "Scoreboard" },
  { value: "TIMER", label: "Game timer" },
  { value: "SHOT_CLOCK", label: "Shot clock" },
];

export function Setup({
  initial,
  onSave,
  onCancel,
}: {
  initial: DeviceSetup;
  onSave: (next: DeviceSetup) => void;
  onCancel?: () => void;
}) {
  const [serverOrigin, setServerOrigin] = useState(initial.serverOrigin);
  const [role, setRole] = useState<DeviceRole>(initial.role);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      serverOrigin: serverOrigin.trim().replace(/\/+$/, ""),
      role,
    });
  };

  return (
    <div className="setup-backdrop">
      <div className="setup">
        <h1 className="setup-title">PoloDeck arena client</h1>
        <p className="setup-hint">
          Pick the main server URL and this device type. This is saved locally and can be changed later
          from the settings button.
        </p>
        <form className="setup-form" onSubmit={apply}>
          <label className="setup-label">
            Server origin
            <input
              className="setup-input"
              value={serverOrigin}
              onChange={(e) => setServerOrigin(e.target.value)}
              placeholder="http://192.168.1.10:3000"
              autoComplete="off"
            />
          </label>
          <label className="setup-label">
            Client type
            <select className="setup-input" value={role} onChange={(e) => setRole(e.target.value as DeviceRole)}>
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="setup-actions">
            {onCancel ? (
              <button type="button" className="setup-cancel" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
            <button type="submit" className="setup-submit">
              Save and connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
