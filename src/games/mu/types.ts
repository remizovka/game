export type MuSuit = "C" | "D" | "H" | "S";
export type MuRank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type MuStandardCard = `${MuRank}${MuSuit}`;
export type MuJokerCard = "RJ" | "BJ";
export type MuCard = MuStandardCard | MuJokerCard;

export type MuComboKind =
  | "single"
  | "pair"
  | "double_pairs"
  | "straight"
  | "triple"
  | "quad"
  | "red_joker"
  | "black_joker";

export interface MuCombo {
  kind: MuComboKind;
  cards: MuCard[];
  topRankValue: number;
  length: number;
  isIntercept: boolean;
}

export interface MuValidationSuccess {
  ok: true;
  combo: MuCombo;
}

export interface MuValidationError {
  ok: false;
  error: string;
}

export type MuValidationResult = MuValidationSuccess | MuValidationError;
