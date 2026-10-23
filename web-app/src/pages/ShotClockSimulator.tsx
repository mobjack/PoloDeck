import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { formatGameTimeDisplay, shouldUseGameTimeOnlyDisplay } from "../lib/clockDisplay";
import {
  crossedClockZero,
  displayFrameAt,
  isNewHornEvent,
  type DisplaySyncResponse,
} from "../lib/displayProtocol";

type Mode = "fixture" | "live";
type Fixture = {
  label: string;
  gameMs: number;
  shotMs: number;
  running: boolean;
};

const fixtures: Fixture[] = [
  { label: "Pregame", gameMs: 8 * 60_000, shotMs: 30_000, running: false },
  { label: "Running Q2", gameMs: 4 * 60_000 + 32_400, shotMs: 18_700, running: true },
  { label: "Final minute", gameMs: 42_500, shotMs: 9_300, running: true },
  { label: "Final 30 seconds", gameMs: 26_300, shotMs: 6_300, running: false },
  { label: "Expired", gameMs: 0, shotMs: 0, running: false },
];

function fixtureResponse(fixture: Fixture): DisplaySyncResponse {
  return {
    protocolVersion: 1,
    serverTimeMs: Date.now(),
    pollAfterMs: 500,
    device: {
      clientId: "fixture-shot-clock",
      name: "Fixture simulator",
      role: "SHOT_CLOCK",
      gameId: "fixture-game",
    },
    state: {
      gameId: "fixture-game",
      status: "IN_PROGRESS",
      homeTeamName: "Home",
      awayTeamName: "Away",
      homeScore: 0,
      awayScore: 0,
      currentPeriod: 2,
      totalPeriods: 4,
      breakPhase: "NONE",
      gameClock: { remainingMs: fixture.gameMs, running: fixture.running },
      shotClock: { remainingMs: fixture.shotMs, running: fixture.running },
      horn: null,
    },
  };
}

function formatShotTime(ms: number): string {
  return String(Math.ceil(Math.max(0, ms) / 1000)).padStart(2, "0");
}

export function ShotClockSimulator() {
  const [mode, setMode] = useState<Mode>("fixture");
  const [response, setResponse] = useState<DisplaySyncResponse>(() => fixtureResponse(fixtures[1]));
  const [receivedAtMs, setReceivedAtMs] = useState(() => performance.now());
  const [snapshotAgeMs, setSnapshotAgeMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => performance.now());
  const [deviceId, setDeviceId] = useState(
    () => localStorage.getItem("polodeckSimulatorDeviceId") ?? "sim-shot-clock-001"
  );
  const [networkPaused, setNetworkPaused] = useState(false);
  const [status, setStatus] = useState("Fixture mode");
  const [brightness, setBrightness] = useState(96);
  const [hornActive, setHornActive] = useState(false);
  const previousGameMs = useRef<number | null>(null);
  const previousShotMs = useRef<number | null>(null);
  const hornTimer = useRef<number | null>(null);
  const lastHornEventId = useRef<string | null | undefined>(undefined);

  const pulseHorn = useCallback(() => {
    setHornActive(true);
    if (hornTimer.current != null) window.clearTimeout(hornTimer.current);
    hornTimer.current = window.setTimeout(() => setHornActive(false), 750);
  }, []);

  const frame = useMemo(
    () => displayFrameAt(response, receivedAtMs, nowMs, snapshotAgeMs),
    [response, receivedAtMs, nowMs, snapshotAgeMs]
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nextNow = performance.now();
      const nextFrame = displayFrameAt(response, receivedAtMs, nextNow, snapshotAgeMs);
      const gameReachedZero = crossedClockZero(
        previousGameMs.current,
        nextFrame.gameRemainingMs,
        nextFrame.gameRunning
      );
      const shotReachedZero = crossedClockZero(
        previousShotMs.current,
        nextFrame.shotRemainingMs,
        nextFrame.shotRunning
      );
      if (gameReachedZero || shotReachedZero) {
        pulseHorn();
      }
      previousGameMs.current = nextFrame.gameRemainingMs;
      previousShotMs.current = nextFrame.shotRemainingMs;
      setNowMs(nextNow);
    }, 50);
    return () => window.clearInterval(timer);
  }, [pulseHorn, receivedAtMs, response, snapshotAgeMs]);

  useEffect(() => () => {
    if (hornTimer.current != null) window.clearTimeout(hornTimer.current);
  }, []);

  useEffect(() => {
    if (mode !== "live" || networkPaused) return;
    let cancelled = false;
    let timer = 0;
    const sync = async () => {
      try {
        localStorage.setItem("polodeckSimulatorDeviceId", deviceId);
        const next = await api.displays.sync(deviceId, {
          name: "Browser shot-clock simulator",
          firmwareVersion: "simulator-0.1.0",
        });
        if (cancelled) return;
        const nextHornEventId = next.state?.horn?.eventId ?? null;
        if (isNewHornEvent(lastHornEventId.current, nextHornEventId)) pulseHorn();
        lastHornEventId.current = nextHornEventId;
        setResponse(next);
        setSnapshotAgeMs(Math.max(0, Date.now() - next.serverTimeMs));
        setReceivedAtMs(performance.now());
        setStatus(next.device.role === "UNASSIGNED" ? "Waiting for assignment" : "Live API connected");
        timer = window.setTimeout(sync, next.pollAfterMs);
      } catch (error) {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "Sync failed");
        timer = window.setTimeout(sync, 2_000);
      }
    };
    void sync();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deviceId, mode, networkPaused, pulseHorn]);

  const applyFixture = (fixture: Fixture) => {
    setResponse(fixtureResponse(fixture));
    setSnapshotAgeMs(0);
    setReceivedAtMs(performance.now());
    previousGameMs.current = fixture.gameMs;
    previousShotMs.current = fixture.shotMs;
    setStatus(`Fixture: ${fixture.label}`);
  };

  const updateFixture = (update: Partial<Fixture>) => {
    const current: Fixture = {
      label: "Custom",
      gameMs: frame.gameRemainingMs,
      shotMs: frame.shotRemainingMs,
      running: frame.gameRunning || frame.shotRunning,
      ...update,
    };
    applyFixture(current);
  };

  const panelStyle = { "--sim-brightness": String(brightness / 255) } as CSSProperties;
  const isWaiting = frame.role === "UNASSIGNED" || !frame.gameId;
  const gameTimeOnly = !isWaiting && shouldUseGameTimeOnlyDisplay(frame.gameRemainingMs);

  return (
    <main className="shot-sim-page">
      <header className="shot-sim-header">
        <div>
          <p className="shot-sim-eyebrow">Future ESP32 display test bed</p>
          <h1>Shot-clock simulator</h1>
          <p>Protocol v1 · game time + shot time · local interpolation</p>
        </div>
        <Link to="/kiosks">Display assignments</Link>
      </header>

      <div className="shot-sim-layout">
        <section
          className={`shot-sim-panel ${hornActive ? "shot-sim-panel--horn" : ""} ${gameTimeOnly ? "shot-sim-panel--game-only" : ""}`}
          style={panelStyle}
        >
          <div className={`shot-sim-game-time ${gameTimeOnly ? "shot-sim-game-time--final-seconds" : ""}`}>
            {isWaiting ? "--:--" : formatGameTimeDisplay(frame.gameRemainingMs)}
          </div>
          {gameTimeOnly ? null : (
            <div className="shot-sim-shot-time" aria-label="Shot clock">
              {isWaiting ? "--" : formatShotTime(frame.shotRemainingMs)}
            </div>
          )}
          <div className="shot-sim-horn" aria-live="polite">{hornActive ? "HORN" : null}</div>
        </section>

        <aside className="shot-sim-controls">
          <div className="shot-sim-mode" role="group" aria-label="Simulator mode">
            <button className={mode === "fixture" ? "active" : ""} onClick={() => setMode("fixture")}>Fixtures</button>
            <button className={mode === "live" ? "active" : ""} onClick={() => {
              lastHornEventId.current = undefined;
              setMode("live");
            }}>Live API</button>
          </div>

          <div className="shot-sim-status"><span className={networkPaused ? "paused" : "connected"} />{networkPaused ? "Network paused" : status}</div>

          {mode === "fixture" ? (
            <>
              <label>Scenario<select onChange={(event) => applyFixture(fixtures[Number(event.target.value)])} defaultValue="1">
                {fixtures.map((fixture, index) => <option value={index} key={fixture.label}>{fixture.label}</option>)}
              </select></label>
              <div className="shot-sim-button-grid">
                <button onClick={() => updateFixture({ running: !frame.gameRunning })}>{frame.gameRunning ? "Pause" : "Run"}</button>
                <button onClick={() => updateFixture({ shotMs: 30_000, running: false })}>Reset 30</button>
                <button onClick={() => updateFixture({ shotMs: 20_000, running: false })}>Reset 20</button>
                <button onClick={() => updateFixture({ gameMs: Math.max(0, frame.gameRemainingMs - 1_000), shotMs: Math.max(0, frame.shotRemainingMs - 1_000), running: false })}>Step −1s</button>
              </div>
            </>
          ) : (
            <>
              <label>Device ID<input value={deviceId} onChange={(event) => setDeviceId(event.target.value.trim())} /></label>
              <button onClick={() => setNetworkPaused((paused) => !paused)}>{networkPaused ? "Restore network" : "Simulate network loss"}</button>
              {frame.role === "UNASSIGNED" && <p className="shot-sim-help">Assign this device to <strong>Shot clock</strong> from Display assignments, then select a game.</p>}
            </>
          )}

          <label>Brightness <strong>{brightness}</strong><input type="range" min="16" max="255" step="16" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} /></label>
          <button onClick={pulseHorn}>Test horn indicator</button>

          <dl className="shot-sim-telemetry">
            <div><dt>Role</dt><dd>{frame.role}</dd></div>
            <div><dt>Polling</dt><dd>{response.pollAfterMs} ms</dd></div>
            <div><dt>Game</dt><dd>{frame.gameRunning ? "Running" : "Stopped"}</dd></div>
            <div><dt>Shot</dt><dd>{frame.shotRunning ? "Running" : "Stopped"}</dd></div>
          </dl>
        </aside>
      </div>
    </main>
  );
}
