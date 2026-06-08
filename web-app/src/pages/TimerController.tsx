import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type GameAggregate } from "../api/client";
import { ApiErrorDisplay, formatApiErrorMessage } from "../components/DatabaseUnavailable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useActiveGame } from "../hooks/useActiveGame";
import { useGameLiveState } from "../hooks/useGameLiveState";
import { useHoldToConfirm } from "../hooks/useHoldToConfirm";
import { useTimerOperatorPresence } from "../hooks/useTimerOperatorPresence";
import { useWakeLock } from "../hooks/useWakeLock";
import {
  formatBreakCountdownDisplay,
  formatGameTimeDisplay,
  formatShotClockDisplay,
  formatShotClockDuringBreak,
  getBreakDisplayLabel,
  getBreakRemainingMs,
  getEffectiveRemainingMs,
  getGamePhaseLabel,
  getStartBreakButtonLabel,
  isBreakPending,
  isGameFinal,
  isOnBreak,
} from "../lib/clockDisplay";

type StageKind = "endQuarter" | "startBreak" | "startQuarter" | "complete";

interface StageAction {
  kind: StageKind;
  label: string;
  title: string;
  message: string;
}

function getStageAction(aggregate: GameAggregate): StageAction {
  if (isGameFinal(aggregate)) {
    return { kind: "complete", label: "Game Complete", title: "", message: "" };
  }
  if (isOnBreak(aggregate)) {
    return {
      kind: "startQuarter",
      label: "Start Quarter",
      title: "Start Quarter?",
      message:
        "This will advance the game into the next quarter and reset clocks as configured. It does NOT start the clock.",
    };
  }
  if (isBreakPending(aggregate)) {
    const label = getStartBreakButtonLabel(aggregate) ?? "Start Break";
    return {
      kind: "startBreak",
      label,
      title: `${label}?`,
      message: "This will begin the configured break timer.",
    };
  }
  return {
    kind: "endQuarter",
    label: "End Quarter",
    title: "End Quarter?",
    message: "This will stop the clock and mark the current quarter as ended.",
  };
}

type CommandStatus = "pending" | "success" | "failed";
interface LastCommand {
  label: string;
  status: CommandStatus;
  detail?: string;
}

const VIBRATE_PRIMARY = 30;
const VIBRATE_PROTECTED = [20, 40, 20];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function TimerController() {
  const { activeGame, loading: activeLoading, error: activeError } = useActiveGame();
  const gameId = activeGame?.gameId ?? null;
  const { aggregate, loading, error, connection, nowMs, setAggregate } = useGameLiveState(gameId);
  const wakeLock = useWakeLock(Boolean(gameId));
  // Register this open page as a live TIMER device so the "Timer connected" status goes green.
  useTimerOperatorPresence(true);

  const [lastCommand, setLastCommand] = useState<LastCommand | null>(null);
  const [confirm, setConfirm] = useState<null | "undo" | "stage">(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const connectionDown = connection === "offline" || connection === "reconnecting";

  const runCommand = useCallback(
    async (
      label: string,
      fn: () => Promise<GameAggregate>,
      vibrate?: number | number[]
    ) => {
      if (!gameId || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setLastCommand({ label, status: "pending" });
      try {
        const next = await fn();
        setAggregate(next);
        setLastCommand({ label, status: "success" });
        if (vibrate !== undefined && typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(vibrate);
        }
      } catch (e) {
        setLastCommand({ label, status: "failed", detail: formatApiErrorMessage(e) });
      } finally {
        busyRef.current = false;
        setBusy(false);
        setConfirm(null);
      }
    },
    [gameId, setAggregate]
  );

  const gameRunning = aggregate?.gameClock?.running ?? false;
  const onBreak = aggregate ? isOnBreak(aggregate) : false;
  const breakPending = aggregate ? isBreakPending(aggregate) : false;
  const final = aggregate ? isGameFinal(aggregate) : false;

  const canToggleClock = Boolean(aggregate) && !connectionDown && !final && !breakPending;
  const canResetShot = Boolean(aggregate) && !connectionDown && !final && !onBreak && !breakPending;

  const toggleClock = useCallback(() => {
    if (!gameId) return;
    if (gameRunning) {
      void runCommand("Stop clock", () => api.games.gameClockStop(gameId), VIBRATE_PRIMARY);
    } else {
      void runCommand("Start clock", () => api.games.gameClockStart(gameId), VIBRATE_PRIMARY);
    }
  }, [gameId, gameRunning, runCommand]);

  const resetShot = useCallback(() => {
    if (!gameId) return;
    void runCommand("Reset shot clock", () => api.games.shotClockReset(gameId), VIBRATE_PRIMARY);
  }, [gameId, runCommand]);

  // Keyboard shortcuts: Space = Start/Stop clock, R = Reset shot clock.
  // Dangerous actions (horn, undo, quarter/break) are intentionally NOT mapped.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target)) return;
      if (e.code === "Space" || e.key === " ") {
        if (!canToggleClock) return;
        e.preventDefault();
        toggleClock();
      } else if (e.key === "r" || e.key === "R") {
        if (!canResetShot) return;
        e.preventDefault();
        resetShot();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canToggleClock, canResetShot, toggleClock, resetShot]);

  const stage = aggregate ? getStageAction(aggregate) : null;

  const undoDisabled = !aggregate || connectionDown || busy || onBreak || breakPending;

  const horn = useHoldToConfirm({
    durationMs: 1000,
    disabled: !aggregate || connectionDown || busy,
    onComplete: () => {
      if (!gameId) return;
      void runCommand("Horn", () => api.games.hornTrigger(gameId), VIBRATE_PROTECTED);
    },
  });

  // --- Loading / waiting / error states ---
  if (activeLoading && !activeGame) {
    return (
      <div className="page timer-ctrl-page timer-ctrl-page--message">
        <p className="timer-ctrl-message">Connecting to PoloDeck…</p>
      </div>
    );
  }
  if (activeError && !activeGame) {
    return (
      <div className="page timer-ctrl-page timer-ctrl-page--message">
        <ApiErrorDisplay error={activeError} />
      </div>
    );
  }
  if (!gameId) {
    return (
      <div className="page timer-ctrl-page timer-ctrl-page--message">
        <div className="timer-ctrl-waiting">
          <h1 className="timer-ctrl-waiting-title">Waiting for the live game</h1>
          <p className="timer-ctrl-waiting-sub">
            No game is live yet. On the game day page, choose which game is{" "}
            <strong>live on displays</strong>. This timer will connect automatically.
          </p>
        </div>
      </div>
    );
  }
  if (loading && !aggregate) {
    return (
      <div className="page timer-ctrl-page timer-ctrl-page--message">
        <p className="timer-ctrl-message">Loading game…</p>
      </div>
    );
  }
  if (error && !aggregate) {
    return (
      <div className="page timer-ctrl-page timer-ctrl-page--message">
        <ApiErrorDisplay error={error} />
      </div>
    );
  }
  if (!aggregate) {
    return (
      <div className="page timer-ctrl-page timer-ctrl-page--message">
        <p className="timer-ctrl-message">Game not found.</p>
      </div>
    );
  }

  const breakLabel = getBreakDisplayLabel(aggregate);
  const breakMs = onBreak ? getBreakRemainingMs(aggregate, nowMs) : 0;
  const gameMs = onBreak
    ? breakMs
    : aggregate.gameClock
      ? getEffectiveRemainingMs(aggregate.gameClock, nowMs)
      : 0;
  const shotMs = aggregate.shotClock ? getEffectiveRemainingMs(aggregate.shotClock, nowMs) : 0;
  const shotDisplay = onBreak ? formatShotClockDuringBreak() : formatShotClockDisplay(shotMs);

  const runStateText = final ? "FINAL" : gameRunning ? "RUNNING" : "STOPPED";
  const connectionText =
    connection === "connected"
      ? "Connected"
      : connection === "offline"
        ? "Offline"
        : connection === "reconnecting"
          ? "Reconnecting…"
          : "Connecting…";

  return (
    <div className="page timer-ctrl-page">
      <header className="timer-ctrl-header">
        <div className="timer-ctrl-header-top">
          <span className="timer-ctrl-brand">PoloDeck Timer</span>
          <span className="timer-ctrl-phase">{getGamePhaseLabel(aggregate)}</span>
        </div>
        <div className="timer-ctrl-header-bottom">
          <span className="timer-ctrl-gamename">
            {aggregate.homeTeamName} vs {aggregate.awayTeamName}
          </span>
          <span
            className={
              "timer-ctrl-runstate " +
              (final
                ? "timer-ctrl-runstate--final"
                : gameRunning
                  ? "timer-ctrl-runstate--running"
                  : "timer-ctrl-runstate--stopped")
            }
          >
            {runStateText}
          </span>
        </div>
        <div
          className={
            "timer-ctrl-conn " +
            (connection === "connected"
              ? "timer-ctrl-conn--ok"
              : connection === "offline"
                ? "timer-ctrl-conn--off"
                : "timer-ctrl-conn--wait")
          }
          role="status"
        >
          <span className="timer-ctrl-conn-dot" aria-hidden />
          {connectionText}
        </div>
      </header>

      {connectionDown ? (
        <div className="timer-ctrl-banner timer-ctrl-banner--warn" role="alert">
          Connection lost — controls are disabled until reconnected.
        </div>
      ) : null}
      {wakeLock === "unsupported" || wakeLock === "unavailable" ? (
        <div className="timer-ctrl-banner timer-ctrl-banner--info">
          Screen may sleep on this device. Adjust your phone’s auto-lock if needed.
        </div>
      ) : null}

      <div className="timer-ctrl-clocks" aria-live="polite">
        <section
          className="timer-ctrl-clock"
          aria-label={onBreak && breakLabel ? breakLabel : "Game clock"}
        >
          <h2 className="timer-ctrl-clock-label">
            {onBreak && breakLabel ? breakLabel : "Game Clock"}
          </h2>
          <div className="timer-ctrl-clock-digits timer-ctrl-clock-digits--game">
            {onBreak ? formatBreakCountdownDisplay(gameMs) : formatGameTimeDisplay(gameMs)}
          </div>
        </section>
        <section className="timer-ctrl-clock" aria-label="Shot clock">
          <h2 className="timer-ctrl-clock-label">Shot Clock</h2>
          <div className="timer-ctrl-clock-digits timer-ctrl-clock-digits--shot">{shotDisplay}</div>
        </section>
      </div>

      <div className="timer-ctrl-primary">
        <button
          type="button"
          className={
            "btn timer-ctrl-startstop " +
            (gameRunning ? "timer-ctrl-startstop--running" : "timer-ctrl-startstop--stopped")
          }
          disabled={!canToggleClock}
          onClick={toggleClock}
        >
          {gameRunning ? "Stop Clock" : "Start Clock"}
        </button>
        <button
          type="button"
          className="btn timer-ctrl-reset"
          disabled={!canResetShot}
          onClick={resetShot}
        >
          Reset Shot Clock
        </button>
      </div>

      <div className="timer-ctrl-protected" aria-label="Protected actions">
        <button
          type="button"
          className={"btn timer-ctrl-horn" + (horn.holding ? " timer-ctrl-horn--holding" : "")}
          disabled={!aggregate || connectionDown || busy}
          aria-label="Hold one second to sound horn"
          {...horn.handlers}
        >
          <span className="timer-ctrl-horn-fill" aria-hidden style={{ transform: `scaleX(${horn.progress})` }} />
          <span className="timer-ctrl-horn-label">
            {horn.holding ? "Keep holding…" : "Hold to Sound Horn"}
          </span>
        </button>

        <div className="timer-ctrl-protected-row">
          {stage && stage.kind !== "complete" ? (
            <button
              type="button"
              className="btn timer-ctrl-stage"
              disabled={connectionDown || busy}
              onClick={() => setConfirm("stage")}
            >
              {stage.label}
            </button>
          ) : (
            <button type="button" className="btn timer-ctrl-stage" disabled>
              Game Complete
            </button>
          )}
          <button
            type="button"
            className="btn timer-ctrl-undo"
            disabled={undoDisabled}
            onClick={() => setConfirm("undo")}
          >
            Undo
          </button>
        </div>
      </div>

      <div className="timer-ctrl-feedback" aria-live="polite">
        {lastCommand ? (
          <p
            className={
              "timer-ctrl-feedback-line timer-ctrl-feedback-line--" + lastCommand.status
            }
          >
            <span className="timer-ctrl-feedback-cmd">Last command: {lastCommand.label}</span>
            <span className="timer-ctrl-feedback-status">
              {lastCommand.status === "pending"
                ? "Sending…"
                : lastCommand.status === "success"
                  ? "Command sent"
                  : `Command failed${lastCommand.detail ? `: ${lastCommand.detail}` : ""}`}
            </span>
          </p>
        ) : (
          <p className="timer-ctrl-feedback-line timer-ctrl-feedback-line--idle">Ready</p>
        )}
      </div>

      <footer className="timer-ctrl-footer">
        <Link to="/" className="timer-ctrl-footer-link">
          Game day
        </Link>
      </footer>

      <ConfirmDialog
        open={confirm === "stage" && stage != null && stage.kind !== "complete"}
        title={stage?.title ?? ""}
        message={stage?.message}
        confirmLabel={stage?.label ?? "Confirm"}
        destructive={stage?.kind === "endQuarter"}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!gameId || !stage) return;
          const type =
            stage.kind === "endQuarter"
              ? "END_QUARTER"
              : stage.kind === "startBreak"
                ? "START_BREAK"
                : "START_QUARTER";
          void runCommand(stage.label, () => api.games.applyScoreCommand(gameId, { type }), VIBRATE_PROTECTED);
        }}
      />

      <ConfirmDialog
        open={confirm === "undo"}
        title="Undo last shot clock reset?"
        message="This will reverse the most recent shot clock reset if possible."
        confirmLabel="Undo"
        destructive
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!gameId) return;
          void runCommand("Undo shot reset", () => api.games.shotClockUndoReset(gameId), VIBRATE_PROTECTED);
        }}
      />
    </div>
  );
}
