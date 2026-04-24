import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { Settings } from "lucide-react";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay, formatApiErrorMessage } from "../components/DatabaseUnavailable";
import {
  formatGameTimeDisplay,
  formatShotClockDisplay,
  getEffectiveRemainingMs,
} from "../lib/clockDisplay";
import {
  formatGameTimeForInput,
  formatShotSecondsForInput,
  parseGameTimeInputToMs,
  parseShotSecondsInputToMs,
} from "../lib/timerEditInput";

export function GameTimer() {
  const { id: gameDayId, gameId } = useParams<{ id: string; gameId: string }>();
  const [aggregate, setAggregate] = useState<GameAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [tick, setTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gameTimeInput, setGameTimeInput] = useState("0.0");
  const [shotTimeInput, setShotTimeInput] = useState("0");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    setLoading(true);
    let socket: Socket | null = null;

    api.games
      .getAggregate(gameId)
      .then((agg) => {
        setAggregate(agg);
        socket = io(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000", {
          transports: ["websocket"],
        });
        socket.emit("game:join", { gameId });
        socket.on("game:stateUpdated", (payload: { gameId: string; aggregate: GameAggregate }) => {
          if (payload.gameId === gameId) {
            setAggregate(payload.aggregate);
          }
        });
      })
      .catch((e) => setError(e))
      .finally(() => setLoading(false));

    return () => {
      if (socket) {
        socket.emit("game:leave", { gameId });
        socket.disconnect();
      }
    };
  }, [gameId]);

  const openSettings = useCallback(() => {
    if (!aggregate) return;
    setSettingsError(null);
    const now = Date.now();
    const gMs = aggregate.gameClock
      ? getEffectiveRemainingMs(aggregate.gameClock, now)
      : 0;
    const sMs = aggregate.shotClock
      ? getEffectiveRemainingMs(aggregate.shotClock, now)
      : 0;
    setGameTimeInput(formatGameTimeForInput(gMs));
    setShotTimeInput(formatShotSecondsForInput(sMs));
    setSettingsOpen(true);
  }, [aggregate]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  const saveSettings = useCallback(async () => {
    if (!gameId || !aggregate) return;
    const gameRaw = parseGameTimeInputToMs(gameTimeInput);
    if (gameRaw == null) {
      setSettingsError("Game time: use seconds with tenths (e.g. 38.2) or m:ss (e.g. 1:32 or 0:32.1).");
      return;
    }
    const gameCap = aggregate.gameClock?.durationMs ?? gameRaw;
    const gameMs = Math.min(Math.max(0, gameRaw), gameCap);
    const shotRaw = parseShotSecondsInputToMs(shotTimeInput);
    if (shotRaw == null) {
      setSettingsError("Shot clock: enter whole seconds 0–99 (e.g. 10 or 0).");
      return;
    }
    const shotCap = aggregate.shotClock?.durationMs ?? shotRaw;
    const shotMs = Math.min(Math.max(0, shotRaw), shotCap);
    setSettingsError(null);
    setSavingSettings(true);
    try {
      await api.games.setGameClockRemaining(gameId, gameMs);
      const next = await api.games.setShotClockRemaining(gameId, shotMs);
      setAggregate(next);
      setSettingsOpen(false);
    } catch (e) {
      setSettingsError(formatApiErrorMessage(e));
    } finally {
      setSavingSettings(false);
    }
  }, [gameId, aggregate, gameTimeInput, shotTimeInput]);

  const gameRunning = aggregate?.gameClock?.running ?? false;
  const shotRunning = aggregate?.shotClock?.running ?? false;
  const anyRunning = gameRunning || shotRunning;

  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  const run = useCallback(async (fn: () => Promise<GameAggregate>) => {
    if (!gameId || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setAggregate(next);
    } catch (e) {
      setError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [gameId]);

  if (loading) {
    return (
      <div className="page game-timer-page">
        <p>Loading…</p>
      </div>
    );
  }
  if (error && !aggregate) {
    return (
      <div className="page game-timer-page">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }
  if (!gameId || !aggregate) {
    return (
      <div className="page game-timer-page">
        <p>Game not found.</p>
      </div>
    );
  }

  void tick; // re-render on interval while clocks run
  const now = Date.now();
  const gameMs = aggregate.gameClock
    ? getEffectiveRemainingMs(aggregate.gameClock, now)
    : 0;
  const shotMs = aggregate.shotClock
    ? getEffectiveRemainingMs(aggregate.shotClock, now)
    : 0;

  const toggleGameClock = () => {
    if (gameRunning) {
      void run(() => api.games.gameClockStop(gameId));
    } else {
      void run(() => api.games.gameClockStart(gameId));
    }
  };

  return (
    <div className="page game-timer-page">
      <header className="game-timer-header">
        <div className="game-timer-nav">
          <Link to={gameDayId ? `/game-days/${gameDayId}/games/${gameId}/sheet` : "/"}>
            ← Game progress
          </Link>
          {gameDayId ? (
            <Link to={`/game-days/${gameDayId}`} className="game-timer-nav-secondary">
              Game day
            </Link>
          ) : null}
        </div>
        <div className="game-timer-title-row">
          <h1 className="game-timer-title">Timer</h1>
          <button
            type="button"
            className="btn game-timer-settings-icon"
            onClick={openSettings}
            disabled={Boolean(busy) || !aggregate}
            title="Set active time"
            aria-label="Set active time on game and shot clock"
          >
            <Settings size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <p className="game-timer-sub">
          {aggregate.homeTeamName} vs {aggregate.awayTeamName} — Period {aggregate.currentPeriod} of{" "}
          {aggregate.totalPeriods}
        </p>
        {error ? (
          <div className="game-timer-error" role="alert">
            {error instanceof Error ? error.message : "Something went wrong."}
          </div>
        ) : null}
      </header>

      <div className="game-timer-displays" aria-live="polite">
        <section className="game-timer-block" aria-label="Game time">
          <h2 className="game-timer-block-label">Game time</h2>
          <div className="game-timer-digits game-timer-digits--game">
            {formatGameTimeDisplay(gameMs)}
          </div>
        </section>
        <section className="game-timer-block" aria-label="Shot clock">
          <h2 className="game-timer-block-label">Shot clock</h2>
          <div className="game-timer-digits game-timer-digits--shot">
            {formatShotClockDisplay(shotMs)}
          </div>
        </section>
      </div>

      <div className="game-timer-actions">
        <button
          type="button"
          className={
            "btn game-timer-startstop " +
            (gameRunning ? "game-timer-startstop--running" : "game-timer-startstop--stopped")
          }
          disabled={busy}
          onClick={toggleGameClock}
        >
          {gameRunning ? "Running" : "Start Clock"}
        </button>
        <div className="game-timer-shot-row">
          <button
            type="button"
            className="btn secondary game-timer-reset"
            disabled={busy}
            onClick={() => void run(() => api.games.shotClockReset(gameId))}
          >
            Reset shot clock
          </button>
          <button
            type="button"
            className="btn game-timer-undo"
            disabled={busy}
            onClick={() => void run(() => api.games.shotClockUndoReset(gameId))}
          >
            Undo
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <div
          className="game-timer-modal-overlay"
          role="dialog"
          aria-modal
          aria-labelledby="game-timer-settings-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="game-timer-modal" onMouseDown={(e) => e.stopPropagation()}>
            <h2 id="game-timer-settings-title" className="game-timer-modal-title">
              Set active time
            </h2>
            <p className="game-timer-modal-hint">
              Change the <strong>remaining</strong> time for this game only. Does not change the
              configured period length or shot length (use Edit game for those).
            </p>
            {settingsError ? <p className="game-timer-error game-timer-modal-error">{settingsError}</p> : null}
            <div className="form game-timer-modal-fields">
              <label>
                Game time
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="e.g. 38.2 or 1:32"
                  value={gameTimeInput}
                  onChange={(e) => setGameTimeInput(e.target.value)}
                  disabled={savingSettings}
                />
              </label>
              <label>
                Shot clock (seconds)
                <input
                  type="number"
                  min={0}
                  max={99}
                  step={1}
                  inputMode="numeric"
                  value={shotTimeInput}
                  onChange={(e) => setShotTimeInput(e.target.value)}
                  disabled={savingSettings}
                />
              </label>
            </div>
            <div className="game-timer-modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setSettingsOpen(false)}
                disabled={savingSettings}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void saveSettings()}
                disabled={savingSettings}
              >
                {savingSettings ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
