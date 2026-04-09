import { canPlayMuCards } from "./rules";
import type { MuCard, MuCombo } from "./types";

export interface MuLastPlay {
  playerId: string;
  combo: MuCombo;
}

export interface MuCircleState {
  players: string[];
  turnIndex: number;
  lastPlay: MuLastPlay | null;
  passed: string[];
  winner: string | null;
  tableCleared: boolean;
}

export type MuCircleAction =
  | { type: "play"; playerId: string; cards: MuCard[] }
  | { type: "pass"; playerId: string };

export interface MuCircleResult {
  ok: boolean;
  state: MuCircleState;
  error?: string;
}

function nextTurnIndex(state: MuCircleState): number {
  return (state.turnIndex + 1) % state.players.length;
}

export function createMuCircle(players: string[], leaderPlayerId: string): MuCircleState {
  if (players.length < 3 || players.length > 7) {
    throw new Error("Mu supports 3 to 7 players");
  }
  const leaderIndex = players.indexOf(leaderPlayerId);
  if (leaderIndex === -1) {
    throw new Error("Leader must be one of players");
  }
  return {
    players: [...players],
    turnIndex: leaderIndex,
    lastPlay: null,
    passed: [],
    winner: null,
    tableCleared: false,
  };
}

function fail(state: MuCircleState, error: string): MuCircleResult {
  return { ok: false, state, error };
}

export function applyMuCircleAction(state: MuCircleState, action: MuCircleAction): MuCircleResult {
  if (state.winner) return fail(state, "Circle is already finished");

  const currentPlayer = state.players[state.turnIndex];
  if (action.playerId !== currentPlayer) {
    return fail(state, `Not ${action.playerId}'s turn`);
  }

  if (action.type === "play") {
    const played = canPlayMuCards(action.cards, state.lastPlay?.combo ?? null);
    if (!played.ok) return fail(state, played.error);

    return {
      ok: true,
      state: {
        ...state,
        turnIndex: nextTurnIndex(state),
        lastPlay: { playerId: action.playerId, combo: played.combo },
        passed: [],
        tableCleared: false,
      },
    };
  }

  if (!state.lastPlay) {
    return fail(state, "Cannot pass on an empty table");
  }

  if (!state.passed.includes(action.playerId)) {
    state = { ...state, passed: [...state.passed, action.playerId] };
  }

  const othersCount = state.players.length - 1;
  const allOthersPassed = state.passed.length >= othersCount;

  if (allOthersPassed) {
    const lastPlay = state.lastPlay;
    if (!lastPlay) {
      return fail(state, "Cannot close circle without a last play");
    }
    return {
      ok: true,
      state: {
        ...state,
        winner: lastPlay.playerId,
        tableCleared: true,
        turnIndex: state.players.indexOf(lastPlay.playerId),
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      turnIndex: nextTurnIndex(state),
    },
  };
}
