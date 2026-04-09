import type { Card } from "./cards";
import type { GameState, PlayerId, TrickPlay } from "./state";
import { legalMoves } from "./moves";
import { trickWinner } from "./trick";
import { trickPoints } from "./score";

function nextPlayer(current: PlayerId, playersInOrder: PlayerId[]): PlayerId {
  const idx = playersInOrder.indexOf(current);
  if (idx === -1) throw new Error(`Player not in order: ${current}`);
  return playersInOrder[(idx - 1 + playersInOrder.length) % playersInOrder.length];
}

export interface ApplyMoveResult {
  state: GameState;
  trickCompleted: boolean;
  winner: PlayerId | null;
}

export function applyMove(
  state: GameState,
  player: PlayerId,
  card: Card
): ApplyMoveResult {
  const hand = state.hands[player] ?? [];
  if (!hand.includes(card)) {
    throw new Error(`Card ${card} not in hand of ${player}`);
  }

  const allowed = legalMoves(hand, state.trick, state.trump.suit, state.ruleset);
  if (!allowed.includes(card)) {
    throw new Error(`Illegal move ${card} by ${player}`);
  }

  const nextHands = { ...state.hands, [player]: hand.filter(c => c !== card) };
  const nextTrick: TrickPlay[] = [...state.trick, { player, card }];

  let nextState: GameState = { ...state, hands: nextHands, trick: nextTrick };
  if (nextTrick.length < 4) {
    const next = nextPlayer(player, state.players);
    nextState = { ...nextState, leader: next };
    return { state: nextState, trickCompleted: false, winner: null };
  }

  const winningPlay = trickWinner(nextTrick, state.trump.suit, state.ruleset);
  const winner = winningPlay.player;
  const winnerTeam = state.teams.A.includes(winner) ? "A" : "B";
  const points = trickPoints(nextTrick.map(t => t.card));

  nextState = {
    ...nextState,
    leader: winner,
    trick: [],
    history: [...state.history, { trick: nextTrick, winner }],
    dealPoints: {
      ...state.dealPoints,
      [winnerTeam]: state.dealPoints[winnerTeam] + points,
    },
  };

  return { state: nextState, trickCompleted: true, winner };
}
