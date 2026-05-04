import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortEventsForRerun } from "./gameEventRerun";

describe("sortEventsForRerun", () => {
  it("orders by createdAt then id", () => {
    const arr = [
      { id: "b", createdAt: "2020-01-01T12:00:00.000Z" },
      { id: "a", createdAt: "2020-01-01T12:00:00.000Z" },
    ];
    sortEventsForRerun(arr);
    assert.deepEqual(
      arr.map((x) => x.id),
      ["a", "b"]
    );
  });
});
