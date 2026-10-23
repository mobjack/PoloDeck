import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HIGH_SCHOOL_TIMEOUT_RULES,
  TIMEOUT_PRESET_RULES,
  remainingTimeouts,
} from "./timeoutRules";

describe("timeout presets", () => {
  it("uses two one-minute timeouts and no overtime for Olympic-style rules", () => {
    for (const key of ["USA_WATER_POLO", "OLYMPICS", "JUNIOR_OLYMPICS"] as const) {
      const rules = TIMEOUT_PRESET_RULES[key];
      assert.equal(rules.fullTimeoutsRegulation, 2);
      assert.equal(rules.shortTimeouts, 0);
      assert.equal(rules.fullTimeoutsOvertime, 0);
      assert.equal(rules.fullTimeoutDurationSec, 60);
      assert.equal(rules.separateOvertimeTimeouts, true);
    }
  });

  it("uses NCAA and NFHS counts for college and high school", () => {
    for (const key of ["COLLEGE", "HIGH_SCHOOL"] as const) {
      const rules = TIMEOUT_PRESET_RULES[key];
      assert.equal(rules.fullTimeoutsRegulation, 3);
      assert.equal(rules.fullTimeoutsOvertime, 1);
      assert.equal(rules.shortTimeouts, 1);
      assert.equal(rules.fullTimeoutDurationSec, 120);
      assert.equal(rules.shortTimeoutDurationSec, 30);
    }
  });
});

describe("remainingTimeouts", () => {
  const rules = HIGH_SCHOOL_TIMEOUT_RULES;

  it("starts each team with the regulation allotment", () => {
    const left = remainingTimeouts(rules, [], 1);
    assert.deepEqual(left.HOME, { full: 3, short: 1 });
    assert.deepEqual(left.AWAY, { full: 3, short: 1 });
  });

  it("does not carry unused regulation full timeouts into overtime", () => {
    const events = [
      { eventType: "TIMEOUT_USED", payload: { teamSide: "HOME", type: "full" } },
      { eventType: "PERIOD_ADVANCED", payload: { from: 4, to: 5 } },
    ];
    const left = remainingTimeouts(rules, events, 5);
    assert.equal(left.HOME.full, 1);
    assert.equal(left.AWAY.full, 1);
    assert.equal(left.HOME.short, 1);
  });

  it("keeps an unused 30-second timeout available in overtime and spends it once", () => {
    const events = [
      { eventType: "PERIOD_ADVANCED", payload: { from: 4, to: 5 } },
      { eventType: "TIMEOUT_USED", payload: { teamSide: "AWAY", type: "short" } },
    ];
    const left = remainingTimeouts(rules, events, 5);
    assert.equal(left.AWAY.short, 0);
    assert.equal(left.HOME.short, 1);
    assert.equal(left.AWAY.full, 1);
  });

  it("counts a 30-second timeout used in regulation against the overtime pool", () => {
    const events = [
      { eventType: "TIMEOUT_USED", payload: { teamSide: "HOME", type: "short" } },
      { eventType: "PERIOD_ADVANCED", payload: { from: 4, to: 5 } },
    ];
    const left = remainingTimeouts(rules, events, 5);
    assert.equal(left.HOME.short, 0);
  });

  it("keeps one pool for the whole game when overtime is not separate", () => {
    const legacy = {
      ...rules,
      fullTimeoutsRegulation: 2,
      shortTimeouts: 1,
      separateOvertimeTimeouts: false,
    };
    const events = [
      { eventType: "TIMEOUT_USED", payload: { teamSide: "HOME", type: "full" } },
      { eventType: "PERIOD_ADVANCED", payload: { from: 4, to: 5 } },
    ];
    const left = remainingTimeouts(legacy, events, 5);
    assert.equal(left.HOME.full, 1);
    assert.equal(left.AWAY.full, 2);
  });
});
