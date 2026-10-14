import assert from "node:assert/strict";
import test from "node:test";
import { buildDisplaySyncResponse } from "./displaySync";

test("display sync returns compact, time-anchored state", () => {
  const response = buildDisplaySyncResponse({
    nowMs: 12_000,
    device: {
      id: "device-1",
      clientId: "esp32-aabbcc",
      type: "SHOT_CLOCK",
      name: "East clock",
      gameId: "game-1",
      homeTeamName: "Home",
      awayTeamName: "Away",
      lastCheckInAt: new Date(12_000).toISOString(),
      updatedAt: new Date(12_000).toISOString(),
    },
    game: {
      id: "game-1",
      status: "IN_PROGRESS",
      homeTeamName: "Home",
      awayTeamName: "Away",
      currentPeriod: 2,
      totalPeriods: 4,
      breakPhase: "NONE",
      score: { homeScore: 5, awayScore: 4 },
      gameClock: { remainingMs: 120_000, running: true, lastStartedAt: new Date(10_000) },
      shotClock: { remainingMs: 30_000, running: true, lastStartedAt: new Date(11_000) },
      events: [
        { id: "goal", eventType: "GOAL_HOME", createdAt: new Date(11_500) },
        { id: "horn", eventType: "HORN_TRIGGERED", createdAt: new Date(11_000) },
      ],
    },
  });

  assert.equal(response.protocolVersion, 1);
  assert.equal(response.device.role, "SHOT_CLOCK");
  assert.equal(response.state?.gameClock.remainingMs, 118_000);
  assert.equal(response.state?.shotClock.remainingMs, 29_000);
  assert.deepEqual(response.state?.horn, { eventId: "horn", triggeredAtMs: 11_000 });
});

test("unassigned display receives no game and a slower poll interval", () => {
  const response = buildDisplaySyncResponse({
    nowMs: 5_000,
    device: {
      id: "device-2",
      clientId: "esp32-ddeeff",
      type: "UNASSIGNED",
      name: null,
      gameId: null,
      homeTeamName: null,
      awayTeamName: null,
      lastCheckInAt: new Date(5_000).toISOString(),
      updatedAt: new Date(5_000).toISOString(),
    },
    game: null,
  });

  assert.equal(response.pollAfterMs, 2000);
  assert.equal(response.state, null);
});
