import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimeoutMatrix, presetUsesTwentySecondReset } from "./timeoutRules";

describe("presetUsesTwentySecondReset", () => {
  it("turns the 20-second reset on for USA Water Polo, Olympics, and Junior Olympics", () => {
    assert.equal(presetUsesTwentySecondReset("USA_WATER_POLO"), true);
    assert.equal(presetUsesTwentySecondReset("OLYMPICS"), true);
    assert.equal(presetUsesTwentySecondReset("JUNIOR_OLYMPICS"), true);
  });

  it("leaves college and high school on a full reset", () => {
    assert.equal(presetUsesTwentySecondReset("COLLEGE"), false);
    assert.equal(presetUsesTwentySecondReset("HIGH_SCHOOL"), false);
    assert.equal(presetUsesTwentySecondReset("CUSTOM"), false);
  });
});

describe("buildTimeoutMatrix", () => {
  const empty = { HOME: { full: [], short: [] }, AWAY: { full: [], short: [] } };

  it("uses one column per full timeout and one per short timeout from the day", () => {
    const columns = buildTimeoutMatrix(
      {
        fullTimeoutsRegulation: 2,
        fullTimeoutsOvertime: 0,
        separateOvertimeTimeouts: false,
        shortTimeouts: 1,
        fullTimeoutDurationSec: 60,
        shortTimeoutDurationSec: 30,
      },
      empty
    );
    assert.deepEqual(
      columns.map((column) => column.label),
      ["1:00", "1:00", "30s"]
    );
  });

  it("omits the short column when the day has no short timeouts", () => {
    const columns = buildTimeoutMatrix(
      {
        fullTimeoutsRegulation: 2,
        fullTimeoutsOvertime: 0,
        separateOvertimeTimeouts: true,
        shortTimeouts: 0,
        fullTimeoutDurationSec: 60,
        shortTimeoutDurationSec: 30,
      },
      empty
    );
    assert.deepEqual(
      columns.map((column) => column.label),
      ["1:00", "1:00"]
    );
  });

  it("adds an overtime column and keeps a short timeout in its own column", () => {
    const columns = buildTimeoutMatrix(
      {
        fullTimeoutsRegulation: 3,
        fullTimeoutsOvertime: 1,
        separateOvertimeTimeouts: true,
        shortTimeouts: 1,
        fullTimeoutDurationSec: 120,
        shortTimeoutDurationSec: 30,
      },
      {
        HOME: { full: ["6:00/2", "1:00/5"], short: ["4:00/3"] },
        AWAY: { full: [], short: [] },
      }
    );
    assert.deepEqual(
      columns.map((column) => column.label),
      ["2:00", "2:00", "2:00", "OT", "30s"]
    );
    assert.equal(columns[0]?.home, "6:00/2");
    assert.equal(columns[1]?.home, null);
    assert.equal(columns[3]?.home, "1:00/5");
    assert.equal(columns[4]?.home, "4:00/3");
  });
});
