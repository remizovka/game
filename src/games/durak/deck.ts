import { durakRanks, durakSuits } from "./rules";
import type { DurakCard } from "./types";

export function buildDurakDeck36(): DurakCard[] {
  const deck: DurakCard[] = [];
  durakSuits.forEach(suit => {
    durakRanks.forEach(rank => {
      deck.push(`${rank}${suit}`);
    });
  });
  return deck;
}

export function shuffleDurakDeck(deck: DurakCard[], rng: () => number = Math.random): DurakCard[] {
  const out = [...deck];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
