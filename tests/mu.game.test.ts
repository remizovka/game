import test from "node:test";
import assert from "node:assert/strict";

import { applyMuGameAction, applyMuRoundAction, createMuCircle, createMuGame, createMuRound } from "../src";

test("Mu round: first round starts from holder of 2S", () => {
  const round = createMuRound({
    players: ["P0", "P1", "P2", "P3"],
    dealerId: "P0",
    isFirstRound: true,
    rng: () => 0,
  });

  const leader = round.circle.players[round.circle.turnIndex];
  assert.equal(leader, "P2");
});

test("Mu round: winner does not get extra penalty on one-card state", () => {
  let round = createMuRound({
    players: ["P0", "P1", "P2"],
    dealerId: "P0",
    isFirstRound: true,
    rng: () => 0,
  });

  round = {
    ...round,
    hands: {
      P0: ["7C"],
      P1: ["8C"],
      P2: ["9C"],
    },
    initialHandSizes: {
      P0: 1,
      P1: 1,
      P2: 1,
    },
    oneCardAnnounced: {
      P0: false,
      P1: false,
      P2: false,
    },
    circle: createMuCircle(["P0", "P1", "P2"], "P0"),
  };

  const res = applyMuRoundAction(round, {
    type: "play",
    playerId: "P0",
    cards: ["7C"],
  });

  assert.equal(res.ok, true);
  assert.equal(res.state.finished, true);
  assert.equal(res.state.winner, "P0");
  assert.equal(res.state.penaltyDelta.P0, 0);
  assert.equal(res.state.penaltyDelta.P1, 1);
  assert.equal(res.state.penaltyDelta.P2, 1);
});

test("Mu round: announce_one_card action has no scoring effect", () => {
  let round = createMuRound({
    players: ["P0", "P1", "P2"],
    dealerId: "P0",
    isFirstRound: true,
    rng: () => 0,
  });

  round = {
    ...round,
    hands: {
      P0: ["7C", "8C"],
      P1: ["9C"],
      P2: ["10C"],
    },
    initialHandSizes: {
      P0: 2,
      P1: 1,
      P2: 1,
    },
    circle: createMuCircle(["P0", "P1", "P2"], "P0"),
  };

  const first = applyMuRoundAction(round, {
    type: "play",
    playerId: "P0",
    cards: ["7C"],
  });
  assert.equal(first.ok, true);
  round = first.state;

  const announce = applyMuRoundAction(round, {
    type: "announce_one_card",
    playerId: "P1",
  });
  assert.equal(announce.ok, true);
  round = announce.state;

  const pass1 = applyMuRoundAction(round, { type: "pass", playerId: "P1" });
  assert.equal(pass1.ok, true);
  round = pass1.state;

  const pass2 = applyMuRoundAction(round, { type: "pass", playerId: "P2" });
  assert.equal(pass2.ok, true);
  round = pass2.state;

  const finish = applyMuRoundAction(round, {
    type: "play",
    playerId: "P0",
    cards: ["8C"],
  });

  assert.equal(finish.ok, true);
  assert.equal(finish.state.finished, true);
  assert.equal(finish.state.winner, "P0");
  assert.equal(finish.state.penaltyDelta.P0, 0);
  assert.equal(finish.state.penaltyDelta.P1, 1);
  assert.equal(finish.state.penaltyDelta.P2, 1);
});

test("Mu game: player is eliminated at 50 and match ends with two players", () => {
  let game = createMuGame({
    players: ["P0", "P1", "P2"],
    dealerId: "P0",
    rng: () => 0,
  });

  game = {
    ...game,
    standings: {
      P0: { id: "P0", penalty: 0, eliminated: false },
      P1: { id: "P1", penalty: 49, eliminated: false },
      P2: { id: "P2", penalty: 0, eliminated: false },
    },
    activePlayers: ["P0", "P1", "P2"],
    currentRound: {
      ...game.currentRound!,
      hands: {
        P0: ["7C"],
        P1: ["8C"],
        P2: ["9C"],
      },
      initialHandSizes: {
        P0: 1,
        P1: 1,
        P2: 1,
      },
      oneCardAnnounced: {
        P0: false,
        P1: false,
        P2: false,
      },
      circle: createMuCircle(["P0", "P1", "P2"], "P0"),
    },
  };

  const result = applyMuGameAction(game, {
    type: "play",
    playerId: "P0",
    cards: ["7C"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.state.finished, true);
  assert.equal(result.state.standings.P1.eliminated, true);
  assert.deepEqual(result.state.activePlayers.sort(), ["P0", "P2"]);
  assert.equal(result.state.overallWinner, "P0");
});
