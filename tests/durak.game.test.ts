import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDurakAction,
  canBeatDurakCard,
  createDurakGame,
  type DurakGameState,
} from "../src";

function baseState(): DurakGameState {
  return {
    players: [
      { id: "P0", hand: ["6C", "6D", "AH"], isActive: true },
      { id: "P1", hand: ["7D", "8C", "AD"], isActive: true },
      { id: "P2", hand: ["7C", "8D", "AS"], isActive: true },
    ],
    deck: [],
    trumpSuit: "H",
    trumpCard: "6H",
    table: {
      pairs: [],
      contributors: [],
      passedThrowers: [],
      maxCards: 6,
      defenderCardLimit: 3,
    },
    discardPile: [],
    currentAttackerIndex: 0,
    currentDefenderIndex: 1,
    turnPlayerId: "P0",
    phase: "attack",
    roundNumber: 1,
    firstRoundMaxCards: 5,
    finished: false,
    loserId: null,
  };
}

test("Durak rules: trump and higher same-suit cards beat correctly", () => {
  assert.equal(canBeatDurakCard("7C", "6C", "H"), true);
  assert.equal(canBeatDurakCard("6H", "AC", "H"), true);
  assert.equal(canBeatDurakCard("7D", "6C", "H"), false);
  assert.equal(canBeatDurakCard("7H", "8H", "H"), false);
});

test("Durak game: first attacker holds the lowest trump", () => {
  const game = createDurakGame({
    playerIds: ["P0", "P1", "P2", "P3"],
    rng: () => 0.12345,
  });

  const lowestTrumpByPlayer = game.players.map(player =>
    player.hand
      .filter(card => card.endsWith(game.trumpSuit))
      .sort((a, b) => {
        const order = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
        return order.indexOf(a.slice(0, -1)) - order.indexOf(b.slice(0, -1));
      })[0] ?? null
  );
  const presentTrumps = lowestTrumpByPlayer.filter(Boolean) as string[];
  const expectedLowest = presentTrumps.sort((a, b) => {
    const order = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    return order.indexOf(a.slice(0, -1)) - order.indexOf(b.slice(0, -1));
  })[0];

  assert.ok(expectedLowest);
  assert.equal(lowestTrumpByPlayer[game.currentAttackerIndex], expectedLowest);
  assert.equal(game.players[game.currentDefenderIndex].id, "P1");
  assert.equal(game.turnPlayerId, game.players[game.currentAttackerIndex].id);
});

test("Durak game: initial attack rejects mixed ranks", () => {
  const game = baseState();
  const result = applyDurakAction(game, {
    type: "attack",
    playerId: "P0",
    cards: ["6C", "AH"],
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /one rank/i);
});

test("Durak game: successful defense discards table and makes defender the next attacker", () => {
  let game = baseState();

  const attack = applyDurakAction(game, {
    type: "attack",
    playerId: "P0",
    cards: ["6C"],
  });
  assert.equal(attack.ok, true);
  game = attack.state;

  const defend = applyDurakAction(game, {
    type: "defend",
    playerId: "P1",
    attackIndex: 0,
    card: "8C",
  });
  assert.equal(defend.ok, true);
  game = defend.state;
  assert.equal(game.phase, "throw-in");
  assert.equal(game.turnPlayerId, "P0");

  const pass0 = applyDurakAction(game, { type: "pass", playerId: "P0" });
  assert.equal(pass0.ok, true);
  game = pass0.state;
  assert.equal(game.turnPlayerId, "P2");

  const pass1 = applyDurakAction(game, { type: "pass", playerId: "P2" });
  assert.equal(pass1.ok, true);
  game = pass1.state;

  assert.equal(game.phase, "attack");
  assert.equal(game.roundNumber, 2);
  assert.equal(game.discardPile.sort().join(","), ["6C", "8C"].sort().join(","));
  assert.equal(game.players[game.currentAttackerIndex].id, "P1");
  assert.equal(game.players[game.currentDefenderIndex].id, "P2");
  assert.equal(game.turnPlayerId, "P1");
});

test("Durak game: defender can take and skips the next attack", () => {
  let game = baseState();

  const attack = applyDurakAction(game, {
    type: "attack",
    playerId: "P0",
    cards: ["6C"],
  });
  assert.equal(attack.ok, true);
  game = attack.state;

  const take = applyDurakAction(game, {
    type: "take",
    playerId: "P1",
  });
  assert.equal(take.ok, true);
  game = take.state;
  assert.equal(game.phase, "take");
  assert.equal(game.turnPlayerId, "P0");

  const throwIn = applyDurakAction(game, {
    type: "attack",
    playerId: "P0",
    cards: ["6D"],
  });
  assert.equal(throwIn.ok, true);
  game = throwIn.state;
  assert.equal(game.phase, "take");

  const pass0 = applyDurakAction(game, { type: "pass", playerId: "P0" });
  assert.equal(pass0.ok, true);
  game = pass0.state;

  const pass1 = applyDurakAction(game, { type: "pass", playerId: "P2" });
  assert.equal(pass1.ok, true);
  game = pass1.state;

  assert.equal(game.phase, "attack");
  assert.equal(game.roundNumber, 2);
  assert.deepEqual(game.players.find(player => player.id === "P1")?.hand.sort(), ["6C", "6D", "7D", "8C", "AD"].sort());
  assert.equal(game.players[game.currentAttackerIndex].id, "P2");
  assert.equal(game.players[game.currentDefenderIndex].id, "P0");
});
