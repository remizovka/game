import type { DurakCard, DurakRank, DurakSuit, DurakTablePair } from "./types";

export const durakRanks: readonly DurakRank[] = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const durakSuits: readonly DurakSuit[] = ["C", "D", "H", "S"] as const;

export function durakCardRank(card: DurakCard): DurakRank {
  return card.slice(0, card.length - 1) as DurakRank;
}

export function durakCardSuit(card: DurakCard): DurakSuit {
  return card.slice(card.length - 1) as DurakSuit;
}

export function durakRankValue(rank: DurakRank): number {
  return durakRanks.indexOf(rank);
}

export function compareDurakCards(a: DurakCard, b: DurakCard): number {
  return durakRankValue(durakCardRank(a)) - durakRankValue(durakCardRank(b));
}

export function canBeatDurakCard(defense: DurakCard, attack: DurakCard, trumpSuit: DurakSuit): boolean {
  const attackSuit = durakCardSuit(attack);
  const defenseSuit = durakCardSuit(defense);
  if (defenseSuit === attackSuit) {
    return compareDurakCards(defense, attack) > 0;
  }
  if (defenseSuit === trumpSuit && attackSuit !== trumpSuit) {
    return true;
  }
  return false;
}

export function tableRanks(table: DurakTablePair[]): DurakRank[] {
  const ranks = new Set<DurakRank>();
  table.forEach(pair => {
    ranks.add(durakCardRank(pair.attack));
    if (pair.defense) ranks.add(durakCardRank(pair.defense));
  });
  return [...ranks];
}

export function unresolvedAttackIndices(table: DurakTablePair[]): number[] {
  const out: number[] = [];
  table.forEach((pair, index) => {
    if (!pair.defense) out.push(index);
  });
  return out;
}

export function allDurakCardsDefended(table: DurakTablePair[]): boolean {
  return table.length > 0 && unresolvedAttackIndices(table).length === 0;
}

export function sameRank(cards: DurakCard[]): boolean {
  if (cards.length <= 1) return true;
  const rank = durakCardRank(cards[0]);
  return cards.every(card => durakCardRank(card) === rank);
}
