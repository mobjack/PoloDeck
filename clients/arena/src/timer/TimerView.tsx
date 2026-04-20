import { useEffect, useMemo, useState } from "react";
import { hasStoredSetup, resolveConfig, rolePath, saveDeviceSetup, shouldOpenSetup } from "../shared/config";
import { startDevicePresence } from "../shared/device";
import { useGameLive } from "../shared/useGameLive";
import { Setup } from "../shared/Setup";
import { TickClock } from "../shared/TickClock";
import { formatError } from "../shared/errors";
import { useMasterGame } from "../shared/useMasterGame";
import type { DeviceSetup } from "../shared/config";

export function TimerView() {
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [showSetup, setShowSetup] = useState(() => !hasStoredSetup() || shouldOpenSetup());
  const { apiBase, socketUrl, setup } = useMemo(() => resolveConfig(), [settingsVersion]);
  const { gameId, selectedGame, loading: loadingMaster, error: masterError } = useMasterGame(apiBase);

  const saveAndApply = (next: DeviceSetup) => {
    saveDeviceSetup(next);
    const nextPath = rolePath(next.role);
    if (nextPath !== window.location.pathname) {
      window.location.href = `${nextPath}?setup=0`;
      return;
    }
    setShowSetup(false);
    setSettingsVersion((v) => v + 1);
  };

  useEffect(() => {
    if (rolePath(setup.role) !== window.location.pathname) {
      window.location.href = `${rolePath(setup.role)}?setup=0`;
    }
  }, [setup.role]);

  useEffect(() => {
    if (!gameId) return;
    return startDevicePresence(apiBase, setup.role, {
      name: "Arena timer",
      onServerRole: (serverRole) => {
        if (serverRole !== setup.role) {
          saveAndApply({ ...setup, role: serverRole });
        }
      },
    });
  }, [apiBase, gameId, setup.role]);

  const { aggregate, error, loading } = useGameLive(socketUrl, apiBase, gameId || undefined);

  if (showSetup) {
    return <Setup initial={setup} onSave={saveAndApply} onCancel={hasStoredSetup() ? () => setShowSetup(false) : undefined} />;
  }

  if ((loading && !aggregate) || (loadingMaster && !selectedGame)) {
    return (
      <div className="arena-page arena-page--loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (error && !aggregate) {
    return (
      <div className="arena-page arena-page--error">
        <p>Could not load game.</p>
        <pre className="arena-err">{formatError(error)}</pre>
      </div>
    );
  }

  if (masterError && !selectedGame) {
    return (
      <div className="arena-page arena-page--error">
        <p>Could not load game list.</p>
        <pre className="arena-err">{formatError(masterError)}</pre>
      </div>
    );
  }

  if (!aggregate) {
    return (
      <div className="arena-page arena-page--error">
        <p>No active game found yet.</p>
        <button type="button" className="arena-settings-btn" onClick={() => setShowSetup(true)}>
          Settings
        </button>
      </div>
    );
  }

  return (
    <div className="arena-page arena-timer">
      <button type="button" className="arena-settings-btn" onClick={() => setShowSetup(true)}>
        Settings
      </button>
      <div className="arena-timer-period">Quarter {aggregate.currentPeriod}</div>
      <div className="arena-timer-main">
        <TickClock clock={aggregate.gameClock} className="arena-timer-digits" />
      </div>
      <div className="arena-timer-sub">
        {aggregate.homeTeamName} vs {aggregate.awayTeamName}
      </div>
    </div>
  );
}
