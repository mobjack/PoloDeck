import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countPersonalFouls,
  playerIsRolled,
  ROLLED_PLAYER_MESSAGE,
} from "./rolledPlayer";

describe("rolled player fouls", () => {
  const fouls = [
    { teamSide: "HOME", capNumber: "7", isPenalty: false },
    { teamSide: "HOME", capNumber: "7", isPenalty: false },
    { teamSide: "HOME", capNumber: "7", isPenalty: true },
    { teamSide: "AWAY", capNumber: "7", isPenalty: false },
  ];

  it("counts exclusions and penalties together for the same cap", () => {
    assert.equal(countPersonalFouls(fouls, "HOME", "7"), 3);
    assert.equal(countPersonalFouls(fouls, "AWAY", "7"), 1);
  });

  it("allows the foul that rolls the player and blocks the next entry", () => {
    const beforeRollingFoul = countPersonalFouls(fouls.slice(0, 2), "HOME", "7");
    assert.equal(playerIsRolled(beforeRollingFoul), false);

    const afterTwoExclusionsAndOnePenalty = countPersonalFouls(fouls, "HOME", "7");
    assert.equal(playerIsRolled(afterTwoExclusionsAndOnePenalty), true);
    assert.equal(ROLLED_PLAYER_MESSAGE, "Player has been rolled from the game");
  });
});
