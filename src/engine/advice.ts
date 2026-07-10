import type { Card } from "./cards";
import type { GameState, PlayerId } from "./state";
import { buildAdvisorContext } from "./advisor";

export type AdviceMode = "fair" | "god";

export interface AdviceRequestPayload {
  task: "suggest_move";
  mode: AdviceMode;
  mySeat: PlayerId;
  state: GameState;
  legalMoves: Card[];
  context: {
    remainingTrumpCount: number;
    remainingJacks: Card[];
    handCounts: Record<PlayerId, number>;
  };
}

function redactHiddenHands(state: GameState, myId: PlayerId): GameState {
  const hands = {} as Record<PlayerId, Card[]>;
  (Object.keys(state.hands) as PlayerId[]).forEach(player => {
    hands[player] = player === myId ? [...state.hands[player]] : [];
  });
  return { ...state, hands };
}

export function buildAdvicePayload(
  state: GameState,
  myId: PlayerId,
  mode: AdviceMode = "fair"
): AdviceRequestPayload {
  const ctx = buildAdvisorContext(state, myId);
  const handCounts = {} as Record<PlayerId, number>;
  (Object.keys(state.hands) as PlayerId[]).forEach(player => {
    handCounts[player] = state.hands[player].length;
  });
  return {
    task: "suggest_move",
    mode,
    mySeat: myId,
    state: mode === "god" ? state : redactHiddenHands(state, myId),
    legalMoves: ctx.legalMoves,
    context: {
      remainingTrumpCount: ctx.remainingTrumpCount,
      remainingJacks: ctx.remainingJacks,
      handCounts,
    },
  };
}
