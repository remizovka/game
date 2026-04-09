export type DurakSuit = "C" | "D" | "H" | "S";
export type DurakRank = "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type DurakCard = `${DurakRank}${DurakSuit}`;

export type DurakPhase = "attack" | "defense" | "throw-in" | "take" | "end-round";

export interface DurakPlayer {
  id: string;
  hand: DurakCard[];
  isActive: boolean;
}

export interface DurakTablePair {
  attack: DurakCard;
  defense: DurakCard | null;
  throwerId: string;
}

export interface DurakTableState {
  pairs: DurakTablePair[];
  contributors: string[];
  passedThrowers: string[];
  maxCards: number;
  defenderCardLimit: number;
}

export interface DurakGameState {
  players: DurakPlayer[];
  deck: DurakCard[];
  trumpSuit: DurakSuit;
  trumpCard: DurakCard;
  table: DurakTableState;
  discardPile: DurakCard[];
  currentAttackerIndex: number;
  currentDefenderIndex: number;
  turnPlayerId: string | null;
  phase: DurakPhase;
  roundNumber: number;
  firstRoundMaxCards: number | null;
  finished: boolean;
  loserId: string | null;
}

export type DurakAction =
  | { type: "attack"; playerId: string; cards: DurakCard[] }
  | { type: "defend"; playerId: string; attackIndex: number; card: DurakCard }
  | { type: "take"; playerId: string }
  | { type: "pass"; playerId: string };

export interface DurakGameResult {
  ok: boolean;
  state: DurakGameState;
  error?: string;
}
