import type { Card } from "./cards";
import { cardRank } from "./cards";

export function cardPoints(card: Card): number {
  switch (cardRank(card)) {
    case "A":
      return 11;
    case "10":
      return 10;
    case "K":
      return 4;
    case "Q":
      return 3;
    case "J":
      return 2;
    default:
      return 0;
  }
}

export function trickPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + cardPoints(c), 0);
}

export interface DealScoringConfig {
  win1Min: number;
  win2Min: number;
  winMax: number;
  eggsValue: number;
  spasThreshold: number;
  spasBonus: number;
}

export const defaultDealScoring: DealScoringConfig = {
  win1Min: 61,
  win2Min: 91,
  winMax: 120,
  eggsValue: 4,
  spasThreshold: 30,
  spasBonus: 1,
};

export interface DealOutcome {
  eyesA: number;
  eyesB: number;
  eggs: boolean;
  spas: boolean;
}

export function dealOutcome(
  pointsA: number,
  pointsB: number,
  config: DealScoringConfig = defaultDealScoring
): DealOutcome {
  if (pointsA + pointsB !== config.winMax) {
    throw new Error("Total points must be 120");
  }

  if (pointsA === 60 && pointsB === 60) {
    return { eyesA: 0, eyesB: 0, eggs: true, spas: false };
  }

  const winner = pointsA > pointsB ? "A" : "B";
  const winnerPoints = Math.max(pointsA, pointsB);
  const loserPoints = Math.min(pointsA, pointsB);

  let eyes = 0;
  if (winnerPoints >= config.win2Min && winnerPoints <= config.winMax) eyes = 2;
  else if (winnerPoints >= config.win1Min) eyes = 1;

  const spas = loserPoints < config.spasThreshold;
  if (spas) eyes += config.spasBonus;

  return winner === "A"
    ? { eyesA: eyes, eyesB: 0, eggs: false, spas }
    : { eyesA: 0, eyesB: eyes, eggs: false, spas };
}
