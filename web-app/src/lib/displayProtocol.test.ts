import assert from "node:assert/strict";
import test from "node:test";
import {
  crossedClockZero,
  displayFrameAt,
  isNewHornEvent,
  type DisplaySyncResponse,
} from "./displayProtocol";

function response(): DisplaySyncResponse {
  return {
    protocolVersion: 1,
    serverTimeMs: 1_000,
    pollAfterMs: 500,
    device: {
      clientId: "sim-shot-clock-001",
      name: "Browser simulator",
      role: "SHOT_CLOCK",
      gameId: "game-1",
    },
    state: {
      gameId: "game-1",
      status: "IN_PROGRESS",
      homeTeamName: "Home",
      awayTeamName: "Away",
      homeScore: 0,
      awayScore: 0,
      currentPeriod: 2,
      totalPeriods: 4,
      breakPhase: "NONE",
      gameClock: { remainingMs: 125_000, running: true },
      shotClock: { remainingMs: 30_000, running: true },
      horn: null,
    },
  };
}

test("display frame interpolates from the response receipt time", () => {
  const frame = displayFrameAt(response(), 2_000, 4_500);
  assert.equal(frame.gameRemainingMs, 122_500);
  assert.equal(frame.shotRemainingMs, 27_500);
  assert.equal(frame.period, 2);
});

test("display frame compensates for a snapshot already in transit", () => {
  const frame = displayFrameAt(response(), 2_000, 4_500, 125);
  assert.equal(frame.gameRemainingMs, 122_375);
  assert.equal(frame.shotRemainingMs, 27_375);
});

test("display frame clamps running clocks at zero", () => {
  const frame = displayFrameAt(response(), 2_000, 40_000);
  assert.equal(frame.shotRemainingMs, 0);
  assert.equal(frame.gameRemainingMs, 87_000);
});

test("unassigned devices render a safe empty frame", () => {
  const value = response();
  value.device.role = "UNASSIGNED";
  value.device.gameId = null;
  value.state = null;
  assert.deepEqual(displayFrameAt(value, 0, 100), {
    role: "UNASSIGNED",
    gameId: null,
    gameRemainingMs: 0,
    shotRemainingMs: 0,
    gameRunning: false,
    shotRunning: false,
    period: 1,
  });
});

test("horn event detection ignores initial and repeated events but catches a new event", () => {
  assert.equal(isNewHornEvent(undefined, "existing-horn"), false);
  assert.equal(isNewHornEvent("existing-horn", "existing-horn"), false);
  assert.equal(isNewHornEvent("existing-horn", "new-horn"), true);
  assert.equal(isNewHornEvent("existing-horn", null), false);
});

test("clock zero crossing fires only for a running countdown edge", () => {
  assert.equal(crossedClockZero(1, 0, true), true);
  assert.equal(crossedClockZero(0, 0, true), false);
  assert.equal(crossedClockZero(null, 0, true), false);
  assert.equal(crossedClockZero(1, 0, false), false);
  assert.equal(crossedClockZero(1, 1, true), false);
});
