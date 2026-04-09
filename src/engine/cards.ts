export type Suit = "C" | "S" | "H" | "D";
export type Rank = "A" | "10" | "K" | "Q" | "J" | "9" | "8" | "7" | "6";
export type Card = `${Rank}${Suit}`;

export const JACK_ORDER: Card[] = ["JC", "JS", "JH", "JD"];
export const RANK_ORDER: Rank[] = ["A", "10", "K", "Q", "J", "9", "8", "7", "6"];

export function parseCard(card: string): Card {
  if (!/^((10)|[AJKQJ9876])[CSHD]$/.test(card)) {
    throw new Error(`Invalid card: ${card}`);
  }
  return card as Card;
}

export function cardToString(card: Card): string {
  return card;
}

export function cardRank(card: Card): Rank {
  return card.slice(0, card.length - 1) as Rank;
}

export function cardSuit(card: Card): Suit {
  return card.slice(card.length - 1) as Suit;
}

export function isJack(card: Card): boolean {
  return cardRank(card) === "J";
}

export function rankStrength(rank: Rank, deckSize: 32 | 36): number {
  const order = deckSize === 32 ? RANK_ORDER.filter(r => r !== "6") : RANK_ORDER;
  const idx = order.indexOf(rank);
  return idx === -1 ? -1 : order.length - idx;
}
