import { buildDurakDeck36, shuffleDurakDeck } from "./deck";
import {
  allDurakCardsDefended,
  canBeatDurakCard,
  compareDurakCards,
  durakCardRank,
  durakCardSuit,
  sameRank,
  tableRanks,
} from "./rules";
import type {
  DurakAction,
  DurakCard,
  DurakGameResult,
  DurakGameState,
  DurakPlayer,
  DurakTableState,
} from "./types";

function fail(state: DurakGameState, error: string): DurakGameResult {
  return { ok: false, state, error };
}

function cloneState(state: DurakGameState): DurakGameState {
  return {
    ...state,
    players: state.players.map(player => ({ ...player, hand: [...player.hand] })),
    deck: [...state.deck],
    table: {
      ...state.table,
      pairs: state.table.pairs.map(pair => ({ ...pair })),
      contributors: [...state.table.contributors],
      passedThrowers: [...state.table.passedThrowers],
    },
    discardPile: [...state.discardPile],
  };
}

function activeIndices(state: DurakGameState): number[] {
  return state.players.flatMap((player, index) => (player.isActive ? [index] : []));
}

function nextClockwiseActiveIndex(state: DurakGameState, fromIndex: number): number {
  const actives = activeIndices(state);
  const pos = actives.indexOf(fromIndex);
  if (pos === -1) return actives[0];
  return actives[(pos + 1) % actives.length];
}

function clockwiseOrderFrom(state: DurakGameState, fromIndex: number): number[] {
  const actives = activeIndices(state);
  const pos = actives.indexOf(fromIndex);
  if (pos === -1) return actives;
  return [...actives.slice(pos), ...actives.slice(0, pos)];
}

function findPlayerIndex(state: DurakGameState, playerId: string): number {
  return state.players.findIndex(player => player.id === playerId);
}

function playerById(state: DurakGameState, playerId: string): DurakPlayer | null {
  const index = findPlayerIndex(state, playerId);
  return index === -1 ? null : state.players[index];
}

function removeCardsFromHand(hand: DurakCard[], cards: DurakCard[]): DurakCard[] | null {
  const next = [...hand];
  for (const card of cards) {
    const idx = next.indexOf(card);
    if (idx === -1) return null;
    next.splice(idx, 1);
  }
  return next;
}

function maxCardsForRound(state: DurakGameState, defenderHandCount: number): number {
  const firstRoundLimit = state.roundNumber === 1 && state.firstRoundMaxCards ? state.firstRoundMaxCards : 6;
  return Math.min(6, defenderHandCount, firstRoundLimit);
}

function createEmptyTable(state: DurakGameState): DurakTableState {
  const defender = state.players[state.currentDefenderIndex];
  return {
    pairs: [],
    contributors: [],
    passedThrowers: [],
    maxCards: maxCardsForRound(state, defender.hand.length),
    defenderCardLimit: defender.hand.length,
  };
}

function lowestTrumpAttackerIndex(players: DurakPlayer[], trumpSuit: string): number {
  let bestIndex = 0;
  let bestCard: DurakCard | null = null;
  players.forEach((player, index) => {
    const trumps = player.hand
      .filter(card => durakCardSuit(card) === trumpSuit)
      .sort(compareDurakCards);
    if (trumps.length === 0) return;
    if (!bestCard || compareDurakCards(trumps[0], bestCard) < 0) {
      bestCard = trumps[0];
      bestIndex = index;
    }
  });
  return bestCard ? bestIndex : 0;
}

function setupRound(state: DurakGameState, attackerIndex: number): DurakGameState {
  const nextState = cloneState(state);
  nextState.currentAttackerIndex = attackerIndex;
  nextState.currentDefenderIndex = nextClockwiseActiveIndex(nextState, attackerIndex);
  nextState.table = createEmptyTable(nextState);
  nextState.phase = "attack";
  nextState.turnPlayerId = nextState.players[attackerIndex]?.id ?? null;
  return nextState;
}

function activeLoserId(state: DurakGameState): string | null {
  const active = state.players.filter(player => player.isActive);
  if (active.length === 1) return active[0].id;
  return null;
}

function markFinishedIfNeeded(state: DurakGameState): DurakGameState {
  const active = state.players.filter(player => player.isActive);
  if (active.length > 1) return state;
  return {
    ...state,
    finished: true,
    loserId: activeLoserId(state),
    phase: "end-round",
    turnPlayerId: null,
  };
}

function refillHands(state: DurakGameState): void {
  const defenderIndex = state.currentDefenderIndex;
  const order = [
    ...clockwiseOrderFrom(state, state.currentAttackerIndex).filter(index => index !== defenderIndex),
    defenderIndex,
  ];
  order.forEach(index => {
    const player = state.players[index];
    while (player.hand.length < 6 && state.deck.length > 0) {
      const next = state.deck.shift();
      if (!next) break;
      player.hand.push(next);
    }
  });
}

function updateActiveFlags(state: DurakGameState): void {
  if (state.deck.length > 0) return;
  state.players.forEach(player => {
    player.isActive = player.hand.length > 0;
  });
}

function clearTable(state: DurakGameState): void {
  state.table = createEmptyTable(state);
}

function collectTableCards(table: DurakTableState): DurakCard[] {
  const cards: DurakCard[] = [];
  table.pairs.forEach(pair => {
    cards.push(pair.attack);
    if (pair.defense) cards.push(pair.defense);
  });
  return cards;
}

function resolveSuccessfulDefense(state: DurakGameState): DurakGameState {
  const nextState = cloneState(state);
  nextState.discardPile.push(...collectTableCards(nextState.table));
  refillHands(nextState);
  updateActiveFlags(nextState);
  clearTable(nextState);
  nextState.roundNumber += 1;

  const defenderStillActive = nextState.players[nextState.currentDefenderIndex]?.isActive;
  const nextAttacker = defenderStillActive
    ? nextState.currentDefenderIndex
    : nextClockwiseActiveIndex(nextState, nextState.currentDefenderIndex);
  return markFinishedIfNeeded(setupRound(nextState, nextAttacker));
}

function resolveTake(state: DurakGameState): DurakGameState {
  const nextState = cloneState(state);
  const defender = nextState.players[nextState.currentDefenderIndex];
  defender.hand.push(...collectTableCards(nextState.table));
  refillHands(nextState);
  updateActiveFlags(nextState);
  clearTable(nextState);
  nextState.roundNumber += 1;

  const nextAttacker = nextClockwiseActiveIndex(nextState, nextState.currentDefenderIndex);
  return markFinishedIfNeeded(setupRound(nextState, nextAttacker));
}

function eligibleThrowerIndices(state: DurakGameState): number[] {
  const attacker = state.currentAttackerIndex;
  const out = [attacker];
  if (activeIndices(state).length >= 3) {
    const otherNeighbor = nextClockwiseActiveIndex(state, state.currentDefenderIndex);
    if (!out.includes(otherNeighbor) && otherNeighbor !== state.currentDefenderIndex) {
      out.push(otherNeighbor);
    }
  }
  const clockwise = clockwiseOrderFrom(state, attacker);
  return clockwise.filter(index => out.includes(index) && index !== state.currentDefenderIndex);
}

function firstEligibleThrowerId(state: DurakGameState): string | null {
  const eligible = eligibleThrowerIndices(state)
    .map(index => state.players[index].id)
    .filter(id => !state.table.passedThrowers.includes(id));
  return eligible[0] ?? null;
}

function nextEligibleThrowerId(state: DurakGameState, afterPlayerId: string): string | null {
  const eligible = eligibleThrowerIndices(state)
    .map(index => state.players[index].id)
    .filter(id => !state.table.passedThrowers.includes(id));
  if (eligible.length === 0) return null;
  const pos = eligible.indexOf(afterPlayerId);
  if (pos === -1) return eligible[0];
  return eligible[pos + 1] ?? null;
}

function allThrowersPassed(state: DurakGameState): boolean {
  const eligible = eligibleThrowerIndices(state).map(index => state.players[index].id);
  return eligible.every(id => state.table.passedThrowers.includes(id));
}

function ensureContributor(state: DurakGameState, playerId: string): void {
  if (!state.table.contributors.includes(playerId)) {
    state.table.contributors.push(playerId);
  }
}

function validateAttackCards(state: DurakGameState, cards: DurakCard[]): string | null {
  if (cards.length === 0) return "Choose at least one card";
  if (state.table.pairs.length === 0 && !sameRank(cards)) {
    return "Initial attack must use cards of one rank";
  }
  if (state.table.pairs.length + cards.length > state.table.maxCards) {
    return "Round card limit exceeded";
  }
  if (state.table.pairs.length + cards.length > state.table.defenderCardLimit) {
    return "Cannot exceed defender card limit";
  }
  if (state.table.pairs.length > 0) {
    const allowedRanks = new Set(tableRanks(state.table.pairs));
    const invalid = cards.some(card => !allowedRanks.has(durakCardRank(card)));
    if (invalid) return "Throw-in cards must match ranks already on table";
  }
  return null;
}

export function createDurakGame(params: {
  playerIds: string[];
  rng?: () => number;
  firstRoundMaxCards?: number | null;
}): DurakGameState {
  const { playerIds, rng = Math.random, firstRoundMaxCards = 5 } = params;
  if (playerIds.length < 2 || playerIds.length > 6) {
    throw new Error("Durak supports 2 to 6 players");
  }

  const shuffled = shuffleDurakDeck(buildDurakDeck36(), rng);
  const players: DurakPlayer[] = playerIds.map(id => ({
    id,
    hand: [],
    isActive: true,
  }));

  for (let round = 0; round < 6; round += 1) {
    for (const player of players) {
      const card = shuffled.shift();
      if (!card) throw new Error("Not enough cards to deal");
      player.hand.push(card);
    }
  }

  const trumpCard = shuffled[shuffled.length - 1];
  if (!trumpCard) throw new Error("Deck must contain a trump card");
  const trumpSuit = durakCardSuit(trumpCard);
  const attackerIndex = lowestTrumpAttackerIndex(players, trumpSuit);
  const baseState: DurakGameState = {
    players,
    deck: shuffled,
    trumpSuit,
    trumpCard,
    table: {
      pairs: [],
      contributors: [],
      passedThrowers: [],
      maxCards: 0,
      defenderCardLimit: 0,
    },
    discardPile: [],
    currentAttackerIndex: attackerIndex,
    currentDefenderIndex: attackerIndex,
    turnPlayerId: null,
    phase: "attack",
    roundNumber: 1,
    firstRoundMaxCards,
    finished: false,
    loserId: null,
  };

  return setupRound(baseState, attackerIndex);
}

export function applyDurakAction(state: DurakGameState, action: DurakAction): DurakGameResult {
  if (state.finished) return fail(state, "Game is already finished");
  const player = playerById(state, action.playerId);
  if (!player || !player.isActive) return fail(state, "Player is not active");

  if (state.turnPlayerId !== action.playerId && action.type !== "defend") {
    return fail(state, "Not this player's turn");
  }

  if (action.type === "attack") {
    if (!["attack", "throw-in", "take"].includes(state.phase)) {
      return fail(state, "Attack is not allowed now");
    }
    const nextState = cloneState(state);
    const attacker = playerById(nextState, action.playerId);
    if (!attacker) return fail(state, "Unknown player");
    const removed = removeCardsFromHand(attacker.hand, action.cards);
    if (!removed) return fail(state, "Player does not have selected cards");
    const validationError = validateAttackCards(nextState, action.cards);
    if (validationError) return fail(state, validationError);

    attacker.hand = removed;
    action.cards.forEach(card => {
      nextState.table.pairs.push({
        attack: card,
        defense: null,
        throwerId: action.playerId,
      });
    });
    ensureContributor(nextState, action.playerId);
    nextState.table.passedThrowers = [];

    if (state.phase === "take") {
      nextState.phase = "take";
      if (nextState.table.pairs.length >= nextState.table.maxCards) {
        return { ok: true, state: resolveTake(nextState) };
      }
      nextState.turnPlayerId = firstEligibleThrowerId(nextState);
    } else {
      nextState.phase = "defense";
      nextState.turnPlayerId = nextState.players[nextState.currentDefenderIndex].id;
    }
    return { ok: true, state: nextState };
  }

  if (action.type === "defend") {
    if (state.phase !== "defense") return fail(state, "Defense is not allowed now");
    if (state.players[state.currentDefenderIndex].id !== action.playerId) {
      return fail(state, "Only defender may defend");
    }
    const nextState = cloneState(state);
    const defender = playerById(nextState, action.playerId);
    if (!defender) return fail(state, "Unknown defender");
    const pair = nextState.table.pairs[action.attackIndex];
    if (!pair) return fail(state, "Unknown attack slot");
    if (pair.defense) return fail(state, "Attack is already defended");
    if (!defender.hand.includes(action.card)) return fail(state, "Defender does not have this card");
    if (!canBeatDurakCard(action.card, pair.attack, nextState.trumpSuit)) {
      return fail(state, "Selected card does not beat attack");
    }

    defender.hand = removeCardsFromHand(defender.hand, [action.card])!;
    pair.defense = action.card;

    if (allDurakCardsDefended(nextState.table.pairs)) {
      if (defender.hand.length === 0) {
        return { ok: true, state: resolveSuccessfulDefense(nextState) };
      }
      nextState.phase = "throw-in";
      nextState.table.passedThrowers = [];
      nextState.turnPlayerId = firstEligibleThrowerId(nextState);
    } else {
      nextState.turnPlayerId = action.playerId;
    }
    return { ok: true, state: nextState };
  }

  if (action.type === "take") {
    if (state.phase !== "defense") return fail(state, "Take is allowed only during defense");
    if (state.players[state.currentDefenderIndex].id !== action.playerId) {
      return fail(state, "Only defender may take");
    }
    const nextState = cloneState(state);
    nextState.phase = "take";
    nextState.table.passedThrowers = [];
    nextState.turnPlayerId = firstEligibleThrowerId(nextState);
    if (!nextState.turnPlayerId || nextState.table.pairs.length >= nextState.table.maxCards) {
      return { ok: true, state: resolveTake(nextState) };
    }
    return { ok: true, state: nextState };
  }

  if (!["throw-in", "take"].includes(state.phase)) {
    return fail(state, "Pass is not allowed now");
  }
  const nextState = cloneState(state);
  if (!nextState.table.passedThrowers.includes(action.playerId)) {
    nextState.table.passedThrowers.push(action.playerId);
  }
  const nextThrower = nextEligibleThrowerId(nextState, action.playerId);
  if (nextThrower) {
    nextState.turnPlayerId = nextThrower;
    return { ok: true, state: nextState };
  }

  if (nextState.phase === "take") {
    return { ok: true, state: resolveTake(nextState) };
  }
  if (allDurakCardsDefended(nextState.table.pairs) && allThrowersPassed(nextState)) {
    return { ok: true, state: resolveSuccessfulDefense(nextState) };
  }
  nextState.phase = "defense";
  nextState.turnPlayerId = nextState.players[nextState.currentDefenderIndex].id;
  return { ok: true, state: nextState };
}

