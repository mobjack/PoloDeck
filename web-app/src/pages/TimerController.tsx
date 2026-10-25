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

  const fullShotSeconds = Math.max(
    1,
    Math.round((aggregate?.shotClockDurationMs ?? 30_000) / 1000)
  );
  const twentyReset = aggregate?.shotClockTwentyReset === true;

  const resetShot = useCallback(
    (remainingMs?: number) => {
      if (!gameId) return;
      const label = remainingMs === 20_000 ? "Reset shot clock to 20" : "Reset shot clock";
      void runCommand(label, () => api.games.shotClockReset(gameId, remainingMs), VIBRATE_PRIMARY);
    },
    [gameId, runCommand]
  );

  const stage = aggregate ? getStageAction(aggregate) : null;

  const undoDisabled = !aggregate || connectionDown || busy || onBreak || breakPending;
  const hornDisabled = !aggregate || connectionDown || busy;

  const soundHorn = useCallback(() => {
    if (!gameId) return;
    void runCommand("Horn", () => api.games.hornTrigger(gameId), VIBRATE_PROTECTED);
  }, [gameId, runCommand]);

  const horn = useHoldToConfirm({
    durationMs: 1000,
    disabled: hornDisabled,
    onComplete: soundHorn,
  });

  // Space = start/stop, R = full reset, 2 = 20 reset, H = horn, U = undo confirm.
  // Quarter and break stay on the confirm button only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target) || confirm) return;
      if (e.code === "Space" || e.key === " ") {
        if (!canToggleClock) return;
        e.preventDefault();
        toggleClock();
      } else if (e.key === "r" || e.key === "R") {
        if (!canResetShot) return;
        e.preventDefault();
        resetShot();
      } else if (e.key === "2") {
        if (!twentyReset || !canResetShot) return;
        e.preventDefault();
        resetShot(20_000);
      } else if (e.key === "h" || e.key === "H") {
        if (hornDisabled) return;
        e.preventDefault();
        soundHorn();
      } else if (e.key === "u" || e.key === "U") {
        if (undoDisabled) return;
        e.preventDefault();
        setConfirm("undo");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    confirm,
    canToggleClock,
    canResetShot,
    twentyReset,
    hornDisabled,
    undoDisabled,
    toggleClock,
    resetShot,
    soundHorn,
  ]);

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
      <div className="timer-ctrl-main">
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

      <div className={"timer-ctrl-primary" + (twentyReset ? " timer-ctrl-primary--twenty" : "")}>
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
        <div className={"timer-ctrl-resets" + (twentyReset ? " timer-ctrl-resets--twenty" : "")}>
          <button
            type="button"
            className="btn timer-ctrl-reset"
            disabled={!canResetShot}
            title={`Shortcut: R. Resets to ${fullShotSeconds} seconds.`}
            onClick={() => resetShot()}
          >
            Reset {fullShotSeconds}
          </button>
          {twentyReset ? (
            <button
              type="button"
              className="btn timer-ctrl-reset timer-ctrl-reset--twenty"
              disabled={!canResetShot}
              title="Shortcut: 2. Use when the offense keeps the ball after a shot."
              onClick={() => resetShot(20_000)}
            >
              Reset 20
            </button>
          ) : null}
        </div>
      </div>

      <div className="timer-ctrl-protected" aria-label="Protected actions">
        <button
          type="button"
          className={"btn timer-ctrl-horn" + (horn.holding ? " timer-ctrl-horn--holding" : "")}
          disabled={hornDisabled}
          title="Shortcut: H"
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
            title="Shortcut: U"
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

      <div className="timer-ctrl-bottom">
      <footer className="timer-ctrl-footer">
        <Link to="/" className="timer-ctrl-footer-link">
          Game day
        </Link>
      </footer>

      <aside className="timer-ctrl-keys" aria-label="Keyboard shortcuts">
        <ul>
          <li>
            <kbd>Space</kbd>
            <span>Start / Stop</span>
          </li>
          <li>
            <kbd>R</kbd>
            <span>Reset {fullShotSeconds}</span>
          </li>
          {twentyReset ? (
            <li>
              <kbd>2</kbd>
              <span>Reset 20</span>
            </li>
          ) : null}
          <li>
            <kbd>H</kbd>
            <span>Horn</span>
          </li>
          <li>
            <kbd>U</kbd>
            <span>Undo</span>
          </li>
        </ul>
      </aside>
      </div>
      </div>

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
