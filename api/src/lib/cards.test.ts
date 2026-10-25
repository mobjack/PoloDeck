import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countPlayerCards, playerIsRolledByFoulsAndCards } from "./cards";

describe("player cards", () => {
  const cards = [
    { target: "PLAYER", teamSide: "HOME", capNumber: "7", color: "YELLOW" },
    { target: "PLAYER", teamSide: "HOME", capNumber: "7", color: "YELLOW" },
    { target: "PLAYER", teamSide: "AWAY", capNumber: "7", color: "RED" },
    { target: "HEAD_COACH", teamSide: "HOME", color: "RED" },
  ];

  it("counts yellow and red cards for a cap and ignores staff cards", () => {
    assert.deepEqual(countPlayerCards(cards, "HOME", "7"), { yellow: 2, red: 0 });
    assert.deepEqual(countPlayerCards(cards, "AWAY", "7"), { yellow: 0, red: 1 });
    assert.deepEqual(countPlayerCards(cards, "HOME", "2"), { yellow: 0, red: 0 });
  });

  it("rolls on three fouls, a second yellow, or any red", () => {
    assert.equal(playerIsRolledByFoulsAndCards(2, 1, 0), false);
    assert.equal(playerIsRolledByFoulsAndCards(2, 2, 0), true);
    assert.equal(playerIsRolledByFoulsAndCards(0, 0, 1), true);
    assert.equal(playerIsRolledByFoulsAndCards(3, 0, 0), true);
    assert.equal(playerIsRolledByFoulsAndCards(0, 1, 0), false);
  });
});
