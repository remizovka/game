import type { Card, Suit } from "./cards";
import type { Ruleset } from "./rules";

export type PlayerId = "P0" | "P1" | "P2" | "P3";
export type TeamId = "A" | "B";

export interface TrickPlay {
  player: PlayerId;
  card: Card;
}

export interface TrumpState {
  suit: Suit;
  jacksAlwaysTrump: boolean;
  jackOrder: Card[];
}

export interface GameState {
  ruleset: Ruleset;
  players: PlayerId[];
  teams: Record<TeamId, PlayerId[]>;
  dealer: PlayerId;
  leader: PlayerId;
  trump: TrumpState;
  hands: Record<PlayerId, Card[]>;
  trick: TrickPlay[];
  history: { trick: TrickPlay[]; winner: PlayerId }[];
  score: { gameEyesA: number; gameEyesB: number };
  dealPoints: { A: number; B: number };
  eggsCarry: number;
}
