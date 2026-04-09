import type { Card, Suit } from "./cards";

export interface Ruleset {
  deckSize: 32 | 36;
  jacksAlwaysTrump: boolean;
  jackOrder: Card[];
  mustTrumpIfNoSuit: boolean;
  firstTrumpSuit: Suit;
}

export const defaultRuleset: Ruleset = {
  deckSize: 32,
  jacksAlwaysTrump: true,
  jackOrder: ["JC", "JS", "JH", "JD"],
  mustTrumpIfNoSuit: false,
  firstTrumpSuit: "C",
};
