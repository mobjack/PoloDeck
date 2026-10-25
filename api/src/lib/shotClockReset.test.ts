import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TWENTY_SECOND_RESET_MS, resolveShotClockResetMs } from "./shotClockReset";

const full = { clockDurationMs: 30_000, regulationMs: 30_000 };

describe("resolveShotClockResetMs", () => {
  it("resets to the full possession time when no target is given", () => {
    const result = resolveShotClockResetMs({ ...full, twentyResetEnabled: false });
    assert.deepEqual(result, { ok: true, remainingMs: 30_000 });
  });

  it("resets to 20 seconds when the operator selects that reset", () => {
    const allowed = resolveShotClockResetMs({
      ...full,
      twentyResetEnabled: false,
      requestedMs: TWENTY_SECOND_RESET_MS,
    });
    assert.deepEqual(allowed, { ok: true, remainingMs: 20_000 });
  });

  it("rejects a 20-second reset when the full clock is shorter than 20 seconds", () => {
    const result = resolveShotClockResetMs({
      clockDurationMs: 15_000,
      regulationMs: 15_000,
      twentyResetEnabled: true,
      requestedMs: TWENTY_SECOND_RESET_MS,
    });
    assert.equal(result.ok, false);
  });
});
