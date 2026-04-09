import type { MuCard, MuRank, MuSuit } from "./types";

const MU_SUITS: MuSuit[] = ["C", "D", "H", "S"];
const MU_RANKS: MuRank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

export function createMuDeck54(): MuCard[] {
  const cards: MuCard[] = [];
  MU_RANKS.forEach(rank => {
    MU_SUITS.forEach(suit => {
      cards.push(`${rank}${suit}` as MuCard);
    });
  });
  cards.push("RJ", "BJ");
  return cards;
}

export function shuffleMuDeck(deck: MuCard[], rng: () => number = Math.random): MuCard[] {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function dealMuCards(
  players: string[],
  dealerId: string,
  rng: () => number = Math.random
): Record<string, MuCard[]> {
  const dealerIdx = players.indexOf(dealerId);
  if (dealerIdx === -1) {
    throw new Error("Dealer must be in players list");
  }

  const deck = shuffleMuDeck(createMuDeck54(), rng);
  const hands: Record<string, MuCard[]> = {};
  players.forEach(p => {
    hands[p] = [];
  });

  for (let i = 0; i < deck.length; i += 1) {
    const turn = (dealerIdx + i) % players.length;
    const player = players[turn];
    hands[player].push(deck[i]);
  }

  return hands;
}
