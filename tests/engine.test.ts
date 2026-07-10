import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMove,
  cardPoints,
  compareCards,
  legalMoves,
  startDeal,
  trickWinner,
  computeTrumpSuit,
  defaultRuleset,
  type Ruleset,
} from "../src";

function dealForTests(ruleset: Ruleset = defaultRuleset) {
  return startDeal({
    ruleset,
    playersInOrder: ["P0", "P1", "P2", "P3"],
    teams: { A: ["P0", "P2"], B: ["P1", "P3"] },
    dealer: "P3",
    dealIndex: 0,
    prevHolderOfJC: null,
    rng: () => 0.42,
  });
}

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

test("applyMove: rejects out-of-turn plays", () => {
  const state = dealForTests();
  assert.equal(state.leader, "P0");

  const wrongPlayer = "P2";
  const card = state.hands[wrongPlayer][0];
  assert.throws(() => applyMove(state, wrongPlayer, card), /turn/i);
});

test("applyMove: play rotates in dealing direction and dealer acts last", () => {
  let state = dealForTests();
  const order: string[] = [];

  for (let i = 0; i < 4; i += 1) {
    const player = state.leader;
    order.push(player);
    const legal = legalMoves(state.hands[player], state.trick, state.trump.suit, state.ruleset);
    const result = applyMove(state, player, legal[0]);
    state = result.state;
    if (i < 3) {
      assert.equal(result.trickCompleted, false);
    } else {
      assert.equal(result.trickCompleted, true);
      assert.equal(state.leader, result.winner);
    }
  }

  assert.deepEqual(order, ["P0", "P1", "P2", "P3"]);
});

test("compareCards: jacks are plain suit cards when jacksAlwaysTrump is off", () => {
  const ruleset: Ruleset = { ...defaultRuleset, jacksAlwaysTrump: false };

  assert.ok(compareCards("JH", "AH", "H", "H", ruleset) < 0);

  const trick = [
    { player: "P0", card: "9D" },
    { player: "P1", card: "JD" },
  ];
  const winner = trickWinner(trick as any, "H", ruleset);
  assert.equal(winner.player, "P1");
});

test("startDeal: 36-card deck deals all cards and keeps 120 points in play", () => {
  const ruleset: Ruleset = { ...defaultRuleset, deckSize: 36 };
  const state = dealForTests(ruleset);

  const players = ["P0", "P1", "P2", "P3"] as const;
  players.forEach(player => {
    assert.equal(state.hands[player].length, 9);
  });

  const allCards = players.flatMap(player => state.hands[player]);
  assert.equal(allCards.length, 36);
  assert.equal(new Set(allCards).size, 36);
  assert.ok(allCards.includes("JC"));

  const totalPoints = allCards.reduce((sum, card) => sum + cardPoints(card), 0);
  assert.equal(totalPoints, 120);
});

test("startDeal: trump override skips JC-based computation", () => {
  const ruleset: Ruleset = { ...defaultRuleset, deckSize: 36 };
  const state = startDeal({
    ruleset,
    playersInOrder: ["P0", "P1", "P2", "P3"],
    teams: { A: ["P0", "P2"], B: ["P1", "P3"] },
    dealer: "P0",
    dealIndex: 3,
    prevHolderOfJC: null,
    rng: () => 0.42,
    trumpSuitOverride: "D",
  });
  assert.equal(state.trump.suit, "D");
});
