import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProgressRows,
  chronologyEventCode,
  computeFoulsByPlayer,
  computeScoreByQuarter,
  computeTimeoutCalls,
  eventCellJustify,
  formatFoulSlot,
  type ScoresheetEvent,
} from "./scoresheetData";

let seq = 0;
/** Build an event with a monotonically increasing createdAt + id (ascending order). */
function ev(
  eventType: string,
  payload: Record<string, unknown> = {}
): ScoresheetEvent {
  seq += 1;
  const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, seq)).toISOString();
  return { id: `e${String(seq).padStart(4, "0")}`, eventType, payload, createdAt: stamp };
}

/** A small but realistic ascending log spanning Q1 -> Q2 -> OT. */
function sampleLog(): ScoresheetEvent[] {
  seq = 0;
  return [
    ev("GAME_CREATED", { totalPeriods: 4 }),
    ev("GAME_CLOCK_STARTED", { period: 1 }),
    ev("GOAL_HOME", { side: "HOME", capNumber: "4", homeScore: 1, awayScore: 0, timeSeconds: 420 }),
    ev("EXCLUSION_STARTED", { teamSide: "AWAY", capNumber: "7", period: 1, timeSeconds: 300 }),
    ev("GOAL_AWAY", { side: "AWAY", capNumber: "7", homeScore: 1, awayScore: 1, timeSeconds: 250 }),
    ev("TIMEOUT_USED", { teamSide: "HOME", type: "full", timeSeconds: 120 }),
    ev("GAME_CLOCK_STOPPED", {}),
    ev("QUARTER_ENDED", { afterPeriod: 1 }),
    ev("PERIOD_ADVANCED", { from: 1, to: 2, homeScore: 1, awayScore: 1 }),
    ev("GAME_CLOCK_STARTED", { period: 2 }),
    ev("GOAL_HOME", { side: "HOME", capNumber: "4", homeScore: 2, awayScore: 1, timeSeconds: 400 }),
    ev("EXCLUSION_STARTED", { teamSide: "HOME", capNumber: "4", period: 2, isPenalty: true, timeSeconds: 200 }),
    ev("TIMEOUT_USED", { teamSide: "AWAY", type: "short", timeSeconds: 90 }),
  ];
}

describe("computeScoreByQuarter", () => {
  it("breaks down goals per period and reports the final", () => {
    const events = sampleLog();
    const s = computeScoreByQuarter(events, 2, 1);
    assert.deepEqual(s.q1, { home: 1, away: 1 });
    assert.deepEqual(s.q2, { home: 1, away: 0 });
    assert.deepEqual(s.final, { home: 2, away: 1 });
  });

  it("aggregates overtime periods into a single OT column", () => {
    seq = 0;
    const events: ScoresheetEvent[] = [
      ev("GAME_CREATED", { totalPeriods: 4 }),
      ev("PERIOD_ADVANCED", { from: 1, to: 2 }),
      ev("PERIOD_ADVANCED", { from: 2, to: 3 }),
      ev("PERIOD_ADVANCED", { from: 3, to: 4 }),
      ev("PERIOD_ADVANCED", { from: 4, to: 5 }),
      ev("GOAL_HOME", { side: "HOME", capNumber: "5", homeScore: 1, awayScore: 0 }),
      ev("PERIOD_ADVANCED", { from: 5, to: 6 }),
      ev("GOAL_AWAY", { side: "AWAY", capNumber: "9", homeScore: 1, awayScore: 1 }),
    ];
    const s = computeScoreByQuarter(events, 1, 1);
    assert.deepEqual(s.ot, { home: 1, away: 1 });
  });
});

describe("computeFoulsByPlayer + formatFoulSlot", () => {
  it("records E/P with the period and caps at three", () => {
    seq = 0;
    const events: ScoresheetEvent[] = [
      ev("GAME_CREATED", {}),
      ev("EXCLUSION_STARTED", { teamSide: "HOME", capNumber: "4", period: 1 }),
      ev("EXCLUSION_STARTED", { teamSide: "HOME", capNumber: "4", period: 2, isPenalty: true }),
      ev("EXCLUSION_STARTED", { teamSide: "HOME", capNumber: "4", period: 3 }),
      ev("EXCLUSION_STARTED", { teamSide: "HOME", capNumber: "4", period: 4 }),
    ];
    const fouls = computeFoulsByPlayer(events);
    assert.deepEqual(fouls.HOME["4"], ["E1", "P2", "E3"]);
    assert.equal(formatFoulSlot("E1"), "E/1");
    assert.equal(formatFoulSlot("P2"), "P/2");
  });
});

describe("computeTimeoutCalls", () => {
  it("formats as time/quarter and separates full vs short", () => {
    const events = sampleLog();
    const to = computeTimeoutCalls(events);
    assert.deepEqual(to.HOME.full, ["2:00/1"]);
    assert.deepEqual(to.AWAY.short, ["1:30/2"]);
  });
});

describe("chronologyEventCode + eventCellJustify", () => {
  it("maps events to traditional codes", () => {
    assert.equal(chronologyEventCode("GOAL_HOME"), "G");
    assert.equal(chronologyEventCode("EXCLUSION_STARTED", {}), "E");
    assert.equal(chronologyEventCode("EXCLUSION_STARTED", { isPenalty: true }), "P");
    assert.equal(chronologyEventCode("TIMEOUT_USED", { type: "full" }), "T/O");
    assert.equal(chronologyEventCode("TIMEOUT_USED", { type: "short" }), "T/O 20");
    assert.equal(chronologyEventCode("GAME_CLOCK_STARTED", { period: 1 }), null);
  });

  it("justifies goals left, fouls right, everything else centered", () => {
    assert.equal(eventCellJustify("G"), "left");
    assert.equal(eventCellJustify("E"), "right");
    assert.equal(eventCellJustify("P"), "right");
    assert.equal(eventCellJustify("T/O"), "center");
    assert.equal(eventCellJustify("YC"), "center");
  });
});

describe("buildProgressRows", () => {
  it("assigns the correct period and chronology code, hiding clock ops", () => {
    const events = sampleLog();
    const rows = buildProgressRows(events, computeFoulsByPlayer(events));

    // GAME_CLOCK_STOPPED is hidden from the progress table.
    assert.equal(rows.some((r) => r.eventType === "GAME_CLOCK_STOPPED"), false);

    const homeGoalQ1 = rows.find(
      (r) => r.eventType === "GOAL_HOME" && r.period === 1
    );
    assert.ok(homeGoalQ1, "expected a Q1 home goal row");
    assert.equal(homeGoalQ1?.chronologyCode, "G");
    assert.equal(homeGoalQ1?.score, "1-0");

    const homeGoalQ2 = rows.find(
      (r) => r.eventType === "GOAL_HOME" && r.period === 2
    );
    assert.ok(homeGoalQ2, "expected a Q2 home goal row");

    const penalty = rows.find(
      (r) => r.eventType === "EXCLUSION_STARTED" && r.period === 2
    );
    assert.equal(penalty?.chronologyCode, "P");

    const timeout = rows.find((r) => r.eventType === "TIMEOUT_USED" && r.period === 1);
    assert.equal(timeout?.chronologyCode, "T/O");
  });

  it("marks quarter-end rows for blacking out", () => {
    const events = sampleLog();
    const rows = buildProgressRows(events, computeFoulsByPlayer(events));
    const ended = rows.find((r) => r.eventType === "QUARTER_ENDED");
    assert.ok(ended, "expected a QUARTER_ENDED row");
    assert.equal(ended?.isQuarterEnd, true);
    assert.equal(ended?.period, 1);
  });

  it("advances the period even when the advance is hidden behind a break", () => {
    seq = 0;
    const events: ScoresheetEvent[] = [
      ev("GAME_CREATED", {}),
      ev("GAME_CLOCK_STARTED", { period: 1 }),
      ev("GOAL_AWAY", { side: "AWAY", capNumber: "11", homeScore: 0, awayScore: 1, timeSeconds: 410 }),
      ev("QUARTER_ENDED", { afterPeriod: 1 }),
      ev("BREAK_STARTED", {}),
      ev("BREAK_ENDED", {}),
      // The actual period advance is hidden from the progress table (fromBreak).
      ev("PERIOD_ADVANCED", { from: 1, to: 2, fromBreak: true }),
      ev("GOAL_HOME", { side: "HOME", capNumber: "3", homeScore: 1, awayScore: 1, timeSeconds: 390 }),
      ev("EXCLUSION_STARTED", { teamSide: "AWAY", capNumber: "3", period: 2, isPenalty: true, timeSeconds: 370 }),
    ];
    const rows = buildProgressRows(events, computeFoulsByPlayer(events));

    // The hidden break advance must not appear as its own row...
    assert.equal(rows.some((r) => r.eventType === "PERIOD_ADVANCED"), false);
    // ...but the post-break events must land in Q2, after the Q1 end marker.
    const q2Goal = rows.find((r) => r.eventType === "GOAL_HOME");
    assert.equal(q2Goal?.period, 2);
    const q2Penalty = rows.find((r) => r.eventType === "EXCLUSION_STARTED");
    assert.equal(q2Penalty?.period, 2);
    const q1End = rows.find((r) => r.eventType === "QUARTER_ENDED");
    assert.equal(q1End?.period, 1);
  });
});
