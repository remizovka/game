import { applyMuCircleAction, createMuCircle, type MuCircleState } from "./circle";
import { dealMuCards } from "./deck";
import type { MuCard } from "./types";

export interface MuRoundState {
  players: string[];
  dealerId: string;
  hands: Record<string, MuCard[]>;
  initialHandSizes: Record<string, number>;
  oneCardAnnounced: Record<string, boolean>;
  circle: MuCircleState;
  finished: boolean;
  winner: string | null;
  penaltyDelta: Record<string, number>;
}

export type MuRoundAction =
  | { type: "play"; playerId: string; cards: MuCard[]; announceOneCard?: boolean }
  | { type: "pass"; playerId: string }
  | { type: "announce_one_card"; playerId: string };

export interface MuRoundResult {
  ok: boolean;
  state: MuRoundState;
  error?: string;
}

function clonePenalty(players: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  players.forEach(p => {
    out[p] = 0;
  });
  return out;
}

function cloneAnnounced(players: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  players.forEach(p => {
    out[p] = false;
  });
  return out;
}

function holderOfTwoSpades(hands: Record<string, MuCard[]>, players: string[]): string {
  const holder = players.find(p => hands[p].includes("2S"));
  if (!holder) throw new Error("2S must exist in deck");
  return holder;
}

function currentPlayer(state: MuRoundState): string {
  return state.circle.players[state.circle.turnIndex];
}

function fail(state: MuRoundState, error: string): MuRoundResult {
  return { ok: false, state, error };
}

function finishRoundIfNeeded(state: MuRoundState, playerId: string): MuRoundState {
  if (state.hands[playerId].length !== 0) return state;

  const penaltyDelta = clonePenalty(state.players);
  state.players.forEach(p => {
    if (p !== playerId) penaltyDelta[p] = state.hands[p].length;
  });

  return {
    ...state,
    finished: true,
    winner: playerId,
    penaltyDelta,
  };
}

function removeCardsFromHand(hand: MuCard[], cards: MuCard[]): MuCard[] | null {
  const next = [...hand];
  for (const card of cards) {
    const idx = next.indexOf(card);
    if (idx === -1) return null;
    next.splice(idx, 1);
  }
  return next;
}

function resetCircleAfterWin(state: MuRoundState): MuRoundState {
  if (!state.circle.winner || state.finished) return state;
  return {
    ...state,
    circle: createMuCircle(state.players, state.circle.winner),
  };
}

export function createMuRound(params: {
  players: string[];
  dealerId: string;
  isFirstRound: boolean;
  previousRoundWinner?: string | null;
  rng?: () => number;
}): MuRoundState {
  const { players, dealerId, isFirstRound, previousRoundWinner = null, rng } = params;
  if (players.length < 3 || players.length > 7) {
    throw new Error("Mu supports 3 to 7 players");
  }
  const hands = dealMuCards(players, dealerId, rng);
  const leader = isFirstRound ? holderOfTwoSpades(hands, players) : previousRoundWinner;
  if (!leader || !players.includes(leader)) {
    throw new Error("Round leader is invalid");
  }

  const initialHandSizes: Record<string, number> = {};
  players.forEach(p => {
    initialHandSizes[p] = hands[p].length;
  });

  return {
    players: [...players],
    dealerId,
    hands,
    initialHandSizes,
    oneCardAnnounced: cloneAnnounced(players),
    circle: createMuCircle(players, leader),
    finished: false,
    winner: null,
    penaltyDelta: clonePenalty(players),
  };
}

export function applyMuRoundAction(state: MuRoundState, action: MuRoundAction): MuRoundResult {
  if (state.finished) return fail(state, "Round is already finished");
  if (!state.players.includes(action.playerId)) return fail(state, "Unknown player");

  const turnPlayer = currentPlayer(state);
  if (turnPlayer !== action.playerId) return fail(state, `Not ${action.playerId}'s turn`);

  if (action.type === "announce_one_card") {
    // Preserved for backward compatibility, no effect on scoring.
    return {
      ok: true,
      state,
    };
  }

  if (action.type === "play") {
    const updatedHand = removeCardsFromHand(state.hands[action.playerId], action.cards);
    if (!updatedHand) return fail(state, "Player does not have requested cards");

    const nextCircle = applyMuCircleAction(state.circle, action);
    if (!nextCircle.ok) return fail(state, nextCircle.error ?? "Invalid play");

    let nextState: MuRoundState = {
      ...state,
      hands: {
        ...state.hands,
        [action.playerId]: updatedHand,
      },
      circle: nextCircle.state,
    };

    nextState = finishRoundIfNeeded(nextState, action.playerId);
    nextState = resetCircleAfterWin(nextState);
    return { ok: true, state: nextState };
  }

  const nextCircle = applyMuCircleAction(state.circle, action);
  if (!nextCircle.ok) return fail(state, nextCircle.error ?? "Invalid pass");

  const nextState = resetCircleAfterWin({
    ...state,
    circle: nextCircle.state,
  });
  return { ok: true, state: nextState };
}
