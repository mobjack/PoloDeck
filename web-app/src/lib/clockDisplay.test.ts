import assert from "node:assert/strict";
import test from "node:test";
import { formatGameTimeDisplay, shouldUseGameTimeOnlyDisplay } from "./clockDisplay";

test("display switches to game-time-only mode at exactly 30 seconds and below", () => {
  assert.equal(shouldUseGameTimeOnlyDisplay(30_001), false);
  assert.equal(shouldUseGameTimeOnlyDisplay(30_000), true);
  assert.equal(shouldUseGameTimeOnlyDisplay(1), true);
  assert.equal(shouldUseGameTimeOnlyDisplay(0), true);
});

test("game time uses one shared nearest-tenth formatter", () => {
  assert.equal(formatGameTimeDisplay(11_249), "11.2");
  assert.equal(formatGameTimeDisplay(11_250), "11.3");
});
