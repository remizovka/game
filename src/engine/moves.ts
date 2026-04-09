import type { Card, Suit } from "./cards";
import { cardSuit, isJack } from "./cards";
import type { Ruleset } from "./rules";
import type { TrickPlay } from "./state";

export function isTrump(card: Card, trumpSuit: Suit, ruleset: Ruleset): boolean {
  return (ruleset.jacksAlwaysTrump && isJack(card)) || cardSuit(card) === trumpSuit;
}

export function legalMoves(
  hand: Card[],
  trick: TrickPlay[],
  trumpSuit: Suit,
  ruleset: Ruleset
): Card[] {
  if (trick.length === 0) return [...hand];

  const leadCard = trick[0].card;
  const leadIsTrump = isTrump(leadCard, trumpSuit, ruleset);
  const leadSuit = cardSuit(leadCard);

  if (leadIsTrump) {
    const trumps = hand.filter(c => isTrump(c, trumpSuit, ruleset));
    return trumps.length > 0 ? trumps : [...hand];
  }

  const suitFollowers = hand.filter(c => !isTrump(c, trumpSuit, ruleset) && cardSuit(c) === leadSuit);
  if (suitFollowers.length > 0) return suitFollowers;

  if (ruleset.mustTrumpIfNoSuit) {
    const trumps = hand.filter(c => isTrump(c, trumpSuit, ruleset));
    return trumps.length > 0 ? trumps : [...hand];
  }

  return [...hand];
}
