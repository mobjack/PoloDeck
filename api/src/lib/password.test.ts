import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a matching password", async () => {
    const hash = await hashPassword("coach-secret-1");
    assert.equal(await verifyPassword("coach-secret-1", hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);
  });
});
