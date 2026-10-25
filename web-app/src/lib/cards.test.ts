import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCards,
  formatCardCommand,
  isPlayerRolled,
  parseCardRest,
} from "./cards";

describe("card commands", () => {
  it("parses player yellow and red in either order", () => {
    assert.deepEqual(parseCardRest("b2yc"), {
      color: "YELLOW",
      side: "HOME",
      target: "PLAYER",
      capNumber: "2",
    });
    assert.deepEqual(parseCardRest("yc13w"), {
      color: "YELLOW",
      side: "AWAY",
      target: "PLAYER",
      capNumber: "13",
    });
    assert.deepEqual(parseCardRest("d4rc"), {
      color: "RED",
      side: "HOME",
      target: "PLAYER",
      capNumber: "4",
    });
    assert.deepEqual(parseCardRest("rc7l"), {
      color: "RED",
      side: "AWAY",
      target: "PLAYER",
      capNumber: "7",
    });
  });

  it("parses coach and bench cards without a cap", () => {
    assert.deepEqual(parseCardRest("ychb"), {
      color: "YELLOW",
      side: "HOME",
      target: "HEAD_COACH",
    });
    assert.deepEqual(parseCardRest("bych"), {
      color: "YELLOW",
      side: "HOME",
      target: "HEAD_COACH",
    });
    assert.deepEqual(parseCardRest("yrchw"), {
      color: "YELLOW_RED",
      side: "AWAY",
      target: "HEAD_COACH",
    });
    assert.deepEqual(parseCardRest("lrcn"), {
      color: "RED",
      side: "AWAY",
      target: "BENCH",
    });
    assert.deepEqual(parseCardRest("rcab"), {
      color: "RED",
      side: "HOME",
      target: "ASSISTANT_COACH",
    });
  });

  it("leaves goals and the old single-letter cards alone", () => {
    assert.equal(parseCardRest("b2g"), null);
    assert.equal(parseCardRest("b2e"), null);
    assert.equal(parseCardRest("b2y"), null);
    assert.equal(parseCardRest("b2x"), null);
    assert.equal(parseCardRest("r"), null);
    assert.equal(parseCardRest("by"), null);
  });

  it("formats the command the scorer can retype", () => {
    assert.equal(
      formatCardCommand({ side: "HOME", color: "YELLOW", target: "PLAYER", capNumber: "2" }),
      "b2yc"
    );
    assert.equal(
      formatCardCommand({
        side: "AWAY",
        color: "RED",
        target: "HEAD_COACH",
        timePrefix: "4.13",
      }),
      "4.13rchw"
    );
    assert.equal(
      formatCardCommand({ side: "HOME", color: "YELLOW_RED", target: "HEAD_COACH" }),
      "yrchb"
    );
  });
});

describe("card tallies", () => {
  it("groups player and staff cards and rolls on red or a second yellow", () => {
    const cards = computeCards([
      { eventType: "CARD_ISSUED", payload: { target: "PLAYER", teamSide: "HOME", capNumber: "2", color: "YELLOW" } },
      { eventType: "CARD_ISSUED", payload: { target: "PLAYER", teamSide: "HOME", capNumber: "2", color: "YELLOW" } },
      { eventType: "CARD_ISSUED", payload: { target: "PLAYER", teamSide: "AWAY", capNumber: "5", color: "RED" } },
      { eventType: "CARD_ISSUED", payload: { target: "HEAD_COACH", teamSide: "HOME", color: "YELLOW_RED" } },
      { eventType: "GOAL_HOME", payload: { capNumber: "2" } },
    ]);
    assert.deepEqual(cards.players.HOME["2"], { yellow: 2, red: 0, yellowRed: 0 });
    assert.deepEqual(cards.players.AWAY["5"], { yellow: 0, red: 1, yellowRed: 0 });
    assert.equal(cards.staff.HOME.HEAD_COACH.yellowRed, 1);
    assert.equal(cards.staff.HOME.HEAD_COACH.red, 0);
    assert.equal(isPlayerRolled(0, cards.players.HOME["2"]), true);
    assert.equal(isPlayerRolled(0, cards.players.AWAY["5"]), true);
    assert.equal(isPlayerRolled(2, { yellow: 1, red: 0, yellowRed: 0 }), false);
    assert.equal(isPlayerRolled(3, undefined), true);
  });
});
