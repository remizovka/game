import type { Card, Suit } from "./cards";
import { isJack } from "./cards";
import type { Ruleset } from "./rules";
import type { GameState, PlayerId } from "./state";
import { legalMoves, isTrump } from "./moves";
import { buildDeck } from "./deck";

export function playedCardsFromState(state: GameState): Card[] {
  const fromHistory = state.history.flatMap(h => h.trick.map(t => t.card));
  const fromTrick = state.trick.map(t => t.card);
  return [...fromHistory, ...fromTrick];
}

export function computeUnseenCards(
  ruleset: Ruleset,
  playedCards: Card[],
  myHand: Card[],
  knownCards: Card[] = []
): Card[] {
  const deck = buildDeck(ruleset);
  const seen = new Set<Card>([...playedCards, ...myHand, ...knownCards]);
  return deck.filter(c => !seen.has(c));
}

export function countRemainingTrumps(
  cards: Card[],
  trumpSuit: Suit,
  ruleset: Ruleset
): number {
  return cards.filter(c => isTrump(c, trumpSuit, ruleset)).length;
}

export function listRemainingJacks(cards: Card[]): Card[] {
  return cards.filter(isJack);
}

export interface AdvisorContext {
  myHand: Card[];
  legalMoves: Card[];
  playedCards: Card[];
  unseenCards: Card[];
  remainingTrumpCount: number;
  remainingJacks: Card[];
}

export function buildAdvisorContext(
  state: GameState,
  myId: PlayerId,
  knownCards: Card[] = []
): AdvisorContext {
  const myHand = state.hands[myId] ?? [];
  const playedCards = playedCardsFromState(state);
  const unseenCards = computeUnseenCards(state.ruleset, playedCards, myHand, knownCards);
  const remainingTrumpCount = countRemainingTrumps(unseenCards, state.trump.suit, state.ruleset);
  const remainingJacks = listRemainingJacks(unseenCards);
  const moves = legalMoves(myHand, state.trick, state.trump.suit, state.ruleset);

  return {
    myHand,
    legalMoves: moves,
    playedCards,
    unseenCards,
    remainingTrumpCount,
    remainingJacks,
  };
}
