import type { Card, Suit } from "./cards";
import { cardRank, cardSuit, isJack, rankStrength } from "./cards";
import type { Ruleset } from "./rules";
import type { TrickPlay } from "./state";
import { isTrump } from "./moves";

function jackStrength(card: Card, ruleset: Ruleset): number {
  const idx = ruleset.jackOrder.indexOf(card);
  return idx === -1 ? -1 : ruleset.jackOrder.length - idx;
}

export function compareCards(
  a: Card,
  b: Card,
  leadSuit: Suit,
  trumpSuit: Suit,
  ruleset: Ruleset
): number {
  const aIsTrump = isTrump(a, trumpSuit, ruleset);
  const bIsTrump = isTrump(b, trumpSuit, ruleset);

  if (aIsTrump && bIsTrump) {
    const aIsJack = isJack(a);
    const bIsJack = isJack(b);
    if (aIsJack || bIsJack) {
      if (aIsJack && bIsJack) return jackStrength(a, ruleset) - jackStrength(b, ruleset);
      return aIsJack ? 1 : -1;
    }
    const ar = rankStrength(cardRank(a), ruleset.deckSize);
    const br = rankStrength(cardRank(b), ruleset.deckSize);
    return ar - br;
  }

  if (aIsTrump !== bIsTrump) return aIsTrump ? 1 : -1;

  const aFollows = !isJack(a) && cardSuit(a) === leadSuit;
  const bFollows = !isJack(b) && cardSuit(b) === leadSuit;
  if (aFollows && bFollows) {
    const ar = rankStrength(cardRank(a), ruleset.deckSize);
    const br = rankStrength(cardRank(b), ruleset.deckSize);
    return ar - br;
  }
  if (aFollows !== bFollows) return aFollows ? 1 : -1;

  return 0;
}

export function trickWinner(
  trick: TrickPlay[],
  trumpSuit: Suit,
  ruleset: Ruleset
): TrickPlay {
  if (trick.length === 0) throw new Error("Empty trick");
  const leadCard = trick[0].card;
  const leadIsTrump = isTrump(leadCard, trumpSuit, ruleset);
  const leadSuit = leadIsTrump ? trumpSuit : cardSuit(leadCard);

  let best = trick[0];
  for (let i = 1; i < trick.length; i += 1) {
    const current = trick[i];
    if (compareCards(current.card, best.card, leadSuit, trumpSuit, ruleset) > 0) {
      best = current;
    }
  }
  return best;
}
