import type { Card } from "./cards";
import type { GameState, PlayerId } from "./state";
import { legalMoves } from "./moves";
import { applyMove } from "./game";

export type MoveSelector = (state: GameState, player: PlayerId, legal: Card[]) => Card;

export function nextPlayer(current: PlayerId, playersInOrder: PlayerId[]): PlayerId {
  const idx = playersInOrder.indexOf(current);
  if (idx === -1) throw new Error(`Player not in order: ${current}`);
  return playersInOrder[(idx + 1) % playersInOrder.length];
}

export function firstLegalMove(state: GameState, player: PlayerId): Card {
  const hand = state.hands[player];
  const legal = legalMoves(hand, state.trick, state.trump.suit, state.ruleset);
  if (legal.length === 0) throw new Error("No legal moves");
  return legal[0];
}

export function simulateDeal(
  initial: GameState,
  playersInOrder: PlayerId[],
  chooseMove: MoveSelector = (s, p, l) => l[0]
): GameState {
  let state = initial;
  let current = state.leader;

  while (state.hands[current].length > 0) {
    const legal = legalMoves(state.hands[current], state.trick, state.trump.suit, state.ruleset);
    const card = chooseMove(state, current, legal);
    const result = applyMove(state, current, card);
    state = result.state;

    if (result.trickCompleted && result.winner) {
      current = result.winner;
    } else {
      current = nextPlayer(current, playersInOrder);
    }
  }

  return state;
}
