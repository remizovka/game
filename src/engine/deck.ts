import type { Card, Rank, Suit } from "./cards";
import { RANK_ORDER } from "./cards";
import type { Ruleset } from "./rules";
import type { PlayerId } from "./state";

const SUITS: Suit[] = ["C", "S", "H", "D"];

function ranksForDeck(deckSize: 32 | 36): Rank[] {
  return deckSize === 32 ? RANK_ORDER.filter(r => r !== "6") : RANK_ORDER;
}

export function buildDeck(ruleset: Ruleset): Card[] {
  const ranks = ranksForDeck(ruleset.deckSize);
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of ranks) {
      deck.push(`${rank}${suit}` as Card);
    }
  }

  return deck;
}

export function shuffle<T>(input: T[], rng: () => number = Math.random): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function dealHands(
  deck: Card[],
  playersInOrder: PlayerId[],
  cardsPerPlayer = 8
): { hands: Record<PlayerId, Card[]>; remaining: Card[] } {
  if (playersInOrder.length !== 4) {
    throw new Error("playersInOrder must have exactly 4 players");
  }

  const hands = {} as Record<PlayerId, Card[]>;
  for (const p of playersInOrder) hands[p] = [];

  let idx = 0;
  for (let round = 0; round < cardsPerPlayer; round += 1) {
    for (const p of playersInOrder) {
      const card = deck[idx++];
      if (!card) throw new Error("Not enough cards to deal");
      hands[p].push(card);
    }
  }

  return { hands, remaining: deck.slice(idx) };
}
