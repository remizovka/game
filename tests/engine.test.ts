import test from "node:test";
import assert from "node:assert/strict";

import { compareCards, legalMoves, trickWinner, computeTrumpSuit, defaultRuleset } from "../src";

test("compareCards: jack order and trump dominance", () => {
  const ruleset = defaultRuleset;
  const leadSuit = "H";
  const trumpSuit = "H";

  assert.ok(compareCards("JS", "JH", leadSuit, trumpSuit, ruleset) > 0);
  assert.ok(compareCards("JD", "AH", leadSuit, trumpSuit, ruleset) > 0);
});

test("legalMoves: jack is trump, not forced as suit follower", () => {
  const ruleset = defaultRuleset;
  const hand = ["JH", "QH", "7D"];
  const trick = [{ player: "P1", card: "7H" }];
  const moves = legalMoves(hand as any, trick as any, "D", ruleset);
  assert.deepEqual(moves, ["QH"]);
});

test("trickWinner: trump lead uses trump suit", () => {
  const ruleset = defaultRuleset;
  const trick = [
    { player: "P0", card: "9D" },
    { player: "P1", card: "AD" },
    { player: "P2", card: "AS" },
    { player: "P3", card: "10D" },
  ];
  const winner = trickWinner(trick as any, "D", ruleset);
  assert.equal(winner.player, "P1");
});

test("computeTrumpSuit: floating trump mapping", () => {
  const ruleset = defaultRuleset;
  const players = ["P0", "P1", "P2", "P3"] as const;
  const suit = computeTrumpSuit(1, "P1", "P3", [...players], ruleset);
  assert.equal(suit, "S");
});
