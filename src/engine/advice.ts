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
  };
}

export function buildAdvicePayload(
  state: GameState,
  myId: PlayerId,
  mode: AdviceMode = "fair"
): AdviceRequestPayload {
  const ctx = buildAdvisorContext(state, myId);
  return {
    task: "suggest_move",
    mode,
    mySeat: myId,
    state,
    legalMoves: ctx.legalMoves,
    context: {
      remainingTrumpCount: ctx.remainingTrumpCount,
      remainingJacks: ctx.remainingJacks,
    },
  };
}
