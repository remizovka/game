import type { Card, Suit } from "./cards";
import type { Ruleset } from "./rules";
import { buildDeck, dealHands, shuffle } from "./deck";
import type { GameState, PlayerId, TeamId, TrumpState } from "./state";
import { computeTrumpSuit } from "./trump";

export interface StartGameOptions {
  ruleset: Ruleset;
  playersInOrder: PlayerId[];
  teams: Record<TeamId, PlayerId[]>;
  dealer: PlayerId;
  dealIndex: number;
  prevHolderOfJC: PlayerId | null;
  rng?: () => number;
  trumpSuitOverride?: Suit;
}

export function findHolderOfCard(hands: Record<PlayerId, Card[]>, card: Card): PlayerId | null {
  for (const player of Object.keys(hands) as PlayerId[]) {
    if (hands[player].includes(card)) return player;
  }
  return null;
}

export function createTrumpState(
  suit: Suit,
  ruleset: Ruleset
): TrumpState {
  return {
    suit,
    jacksAlwaysTrump: ruleset.jacksAlwaysTrump,
    jackOrder: ruleset.jackOrder,
  };
}

export function startDeal(options: StartGameOptions): GameState {
  const {
    ruleset,
    playersInOrder,
    teams,
    dealer,
    dealIndex,
    prevHolderOfJC,
    rng,
    trumpSuitOverride,
  } = options;

  const deck = shuffle(buildDeck(ruleset), rng);
  const { hands } = dealHands(deck, playersInOrder, 8);
  const currentHolderOfJC = findHolderOfCard(hands, "JC") as PlayerId | null;

  const computedTrumpSuit = computeTrumpSuit(
    dealIndex,
    prevHolderOfJC,
    currentHolderOfJC,
    playersInOrder,
    ruleset
  );
  const trumpSuit = trumpSuitOverride ?? computedTrumpSuit;

  const leader = playersInOrder[(playersInOrder.indexOf(dealer) + 1) % 4];

  return {
    ruleset,
    players: [...playersInOrder],
    teams,
    dealer,
    leader,
    trump: createTrumpState(trumpSuit, ruleset),
    hands,
    trick: [],
    history: [],
    score: { gameEyesA: 0, gameEyesB: 0 },
    dealPoints: { A: 0, B: 0 },
    eggsCarry: 0,
  };
}
