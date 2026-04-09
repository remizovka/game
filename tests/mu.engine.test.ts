import test from "node:test";
import assert from "node:assert/strict";

import { applyMuCircleAction, canPlayMuCards, createMuCircle, validateMuCombo } from "../src";

test("Mu: validates ordinary combinations", () => {
  const single = validateMuCombo(["AS"]);
  assert.equal(single.ok, true);
  if (single.ok) assert.equal(single.combo.kind, "single");

  const pair = validateMuCombo(["5C", "5D"]);
  assert.equal(pair.ok, true);
  if (pair.ok) assert.equal(pair.combo.kind, "pair");

  const dp = validateMuCombo(["5C", "5D", "6C", "6H"]);
  assert.equal(dp.ok, true);
  if (dp.ok) assert.equal(dp.combo.kind, "double_pairs");

  const straight = validateMuCombo(["10C", "JD", "QH", "KS", "AC"]);
  assert.equal(straight.ok, true);
  if (straight.ok) assert.equal(straight.combo.kind, "straight");
});

test("Mu: rejects invalid joker usage and broken combinations", () => {
  const badPair = validateMuCombo(["RJ", "BJ"]);
  assert.equal(badPair.ok, false);

  const badStraight = validateMuCombo(["5C", "7D", "8H", "9S", "10C"]);
  assert.equal(badStraight.ok, false);
});

test("Mu: intercept chain works", () => {
  const ordinary = validateMuCombo(["8C"]);
  assert.equal(ordinary.ok, true);
  if (!ordinary.ok) return;

  const red = canPlayMuCards(["RJ"], ordinary.combo);
  assert.equal(red.ok, true);
  if (!red.ok) return;

  const triple = canPlayMuCards(["6C", "6D", "6H"], red.combo);
  assert.equal(triple.ok, true);
  if (!triple.ok) return;

  const black = canPlayMuCards(["BJ"], triple.combo);
  assert.equal(black.ok, true);
  if (!black.ok) return;

  const quad = canPlayMuCards(["9C", "9D", "9H", "9S"], black.combo);
  assert.equal(quad.ok, true);
});

test("Mu: ordinary combinations must match structure and length", () => {
  const table = validateMuCombo(["5C", "5D", "6C", "6D"]);
  assert.equal(table.ok, true);
  if (!table.ok) return;

  const wrongLen = canPlayMuCards(["6C", "6D", "7C", "7D", "8C", "8D"], table.combo);
  assert.equal(wrongLen.ok, false);

  const valid = canPlayMuCards(["7C", "7D", "8C", "8D"], table.combo);
  assert.equal(valid.ok, true);
});

test("Mu circle: closes when all other players pass", () => {
  let state = createMuCircle(["P0", "P1", "P2"], "P0");

  const play = applyMuCircleAction(state, { type: "play", playerId: "P0", cards: ["7C"] });
  assert.equal(play.ok, true);
  state = play.state;

  const p1Pass = applyMuCircleAction(state, { type: "pass", playerId: "P1" });
  assert.equal(p1Pass.ok, true);
  state = p1Pass.state;

  const p2Pass = applyMuCircleAction(state, { type: "pass", playerId: "P2" });
  assert.equal(p2Pass.ok, true);
  state = p2Pass.state;

  assert.equal(state.winner, "P0");
  assert.equal(state.tableCleared, true);
});
