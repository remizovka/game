import type { MuCard, MuCombo, MuComboKind, MuRank, MuValidationResult } from "./types";

const MU_RANK_ORDER: MuRank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const INTERCEPT_STRENGTH: Record<MuComboKind, number> = {
  single: -1,
  pair: -1,
  double_pairs: -1,
  straight: -1,
  red_joker: 0,
  triple: 1,
  black_joker: 2,
  quad: 3,
};

function rankValue(rank: MuRank): number {
  return MU_RANK_ORDER.indexOf(rank);
}

function isJoker(card: MuCard): boolean {
  return card === "RJ" || card === "BJ";
}

function standardRank(card: MuCard): MuRank | null {
  if (isJoker(card)) return null;
  if (card.startsWith("10")) return "10";
  return card.slice(0, 1) as MuRank;
}

function asCombo(kind: MuComboKind, cards: MuCard[], topRankValue: number, length: number): MuValidationResult {
  return {
    ok: true,
    combo: {
      kind,
      cards: [...cards],
      topRankValue,
      length,
      isIntercept: INTERCEPT_STRENGTH[kind] >= 0,
    },
  };
}

function invalid(error: string): MuValidationResult {
  return { ok: false, error };
}

export function validateMuCombo(cards: MuCard[]): MuValidationResult {
  if (cards.length === 0) return invalid("Empty combination is not allowed");

  if (cards.length === 1) {
    if (cards[0] === "RJ") return asCombo("red_joker", cards, Number.MAX_SAFE_INTEGER - 1, 1);
    if (cards[0] === "BJ") return asCombo("black_joker", cards, Number.MAX_SAFE_INTEGER, 1);
    const rank = standardRank(cards[0]);
    if (!rank) return invalid("Invalid card");
    return asCombo("single", cards, rankValue(rank), 1);
  }

  if (cards.some(isJoker)) {
    return invalid("Jokers cannot be used in pairs, triples, quads, double pairs or straights");
  }

  const ranks = cards.map(standardRank);
  if (ranks.some(r => r === null)) return invalid("Invalid card");
  const values = ranks.map(r => rankValue(r as MuRank)).sort((a, b) => a - b);

  const rankCounts = new Map<number, number>();
  values.forEach(v => {
    rankCounts.set(v, (rankCounts.get(v) ?? 0) + 1);
  });

  if (cards.length === 2) {
    const count = [...rankCounts.values()];
    if (count.length === 1 && count[0] === 2) {
      return asCombo("pair", cards, values[0], 2);
    }
    return invalid("Two-card combination must be a pair");
  }

  if (cards.length === 3) {
    const count = [...rankCounts.values()];
    if (count.length === 1 && count[0] === 3) {
      return asCombo("triple", cards, values[0], 3);
    }
    return invalid("Three-card combination must be a triple");
  }

  if (cards.length === 4) {
    const count = [...rankCounts.values()];
    if (count.length === 1 && count[0] === 4) {
      return asCombo("quad", cards, values[0], 4);
    }
  }

  const sortedUnique = [...rankCounts.keys()].sort((a, b) => a - b);
  const allSequential = sortedUnique.every((v, i) => i === 0 || v === sortedUnique[i - 1] + 1);

  const looksLikeDoublePairs =
    cards.length >= 4 &&
    cards.length % 2 === 0 &&
    [...rankCounts.values()].every(v => v === 2) &&
    allSequential;
  if (looksLikeDoublePairs) {
    return asCombo("double_pairs", cards, sortedUnique[sortedUnique.length - 1], cards.length / 2);
  }

  const looksLikeStraight =
    cards.length >= 5 && rankCounts.size === cards.length && allSequential;
  if (looksLikeStraight) {
    return asCombo("straight", cards, sortedUnique[sortedUnique.length - 1], cards.length);
  }

  return invalid("Invalid Mu combination");
}

function canBeatIntercept(next: MuCombo, prev: MuCombo): boolean {
  const nextPower = INTERCEPT_STRENGTH[next.kind];
  const prevPower = INTERCEPT_STRENGTH[prev.kind];
  if (nextPower > prevPower) return true;
  if (nextPower < prevPower) return false;
  if (next.kind === "quad") return next.topRankValue > prev.topRankValue;
  if (next.kind === "triple") return next.topRankValue > prev.topRankValue;
  return false;
}

function canBeatOrdinary(next: MuCombo, prev: MuCombo): boolean {
  if (next.kind !== prev.kind) return false;

  if (next.kind === "single" || next.kind === "pair") {
    return next.topRankValue > prev.topRankValue;
  }

  if (next.kind === "double_pairs") {
    if (next.length !== prev.length) return false;
    return next.topRankValue > prev.topRankValue;
  }

  if (next.kind === "straight") {
    if (next.length !== prev.length) return false;
    return next.topRankValue > prev.topRankValue;
  }

  return false;
}

export function canBeatMuCombo(next: MuCombo, prev: MuCombo): boolean {
  if (next.isIntercept && prev.isIntercept) return canBeatIntercept(next, prev);
  if (next.isIntercept && !prev.isIntercept) return true;
  if (!next.isIntercept && prev.isIntercept) return false;
  return canBeatOrdinary(next, prev);
}

export function canPlayMuCards(cards: MuCard[], tableCombo: MuCombo | null): MuValidationResult {
  const next = validateMuCombo(cards);
  if (!next.ok) return next;
  if (!tableCombo) return next;
  if (!canBeatMuCombo(next.combo, tableCombo)) {
    return invalid("Combination does not beat the current table combination");
  }
  return next;
}

export { MU_RANK_ORDER };
