import { useEffect, useMemo, useState } from "react";
import { hasStoredSetup, resolveConfig, rolePath, saveDeviceSetup, shouldOpenSetup } from "../shared/config";
import { startDevicePresence } from "../shared/device";
import { useGameLive } from "../shared/useGameLive";
import { Setup } from "../shared/Setup";
import { TickClock } from "../shared/TickClock";
import { formatError } from "../shared/errors";
import { useMasterGame } from "../shared/useMasterGame";
import type { DeviceSetup } from "../shared/config";
import { useCapabilities } from "../shared/useCapabilities";

export function ScoreboardView() {
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [showSetup, setShowSetup] = useState(() => !hasStoredSetup() || shouldOpenSetup());
  const { apiBase, socketUrl, setup } = useMemo(() => resolveConfig(), [settingsVersion]);
  const { gameId, selectedGame, loading: loadingMaster, error: masterError } = useMasterGame(apiBase);
  const capabilities = useCapabilities(apiBase);

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
      name: "Arena scoreboard",
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

  const home = aggregate.score?.homeScore ?? 0;
  const away = aggregate.score?.awayScore ?? 0;

  return (
    <div className="arena-page arena-scoreboard">
      <button type="button" className="arena-settings-btn" onClick={() => setShowSetup(true)}>
        Settings
      </button>
      <header className="arena-sb-header">
        <span className="arena-period-top">Q{aggregate.currentPeriod}</span>
      </header>
      <div className="arena-sb-grid">
        <section className="arena-sb-side arena-sb-side--home">
          <div className="arena-sb-label">Home · Dark</div>
          <div className="arena-sb-name">{aggregate.homeTeamName}</div>
          <div className="arena-sb-score">{home}</div>
        </section>
        <section className="arena-sb-side arena-sb-side--away">
          <div className="arena-sb-label">Away · Light</div>
          <div className="arena-sb-name">{aggregate.awayTeamName}</div>
          <div className="arena-sb-score">{away}</div>
        </section>
      </div>
      {capabilities?.hasTimer ? (
        <footer className="arena-sb-clocks">
          <div className="arena-clock-row">
            <span className="arena-clock-label">Game</span>
            <TickClock clock={aggregate.gameClock} className="arena-clock-value" />
          </div>
          <div className="arena-clock-row">
            <span className="arena-clock-label">Shot</span>
            <TickClock clock={aggregate.shotClock} className="arena-clock-value" />
          </div>
        </footer>
      ) : null}
    </div>
  );
}
