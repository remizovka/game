import { applyMuRoundAction, createMuRound, type MuRoundAction, type MuRoundState } from "./round";

export interface MuPlayerStanding {
  id: string;
  penalty: number;
  eliminated: boolean;
}

export interface MuGameState {
  playersOrder: string[];
  standings: Record<string, MuPlayerStanding>;
  activePlayers: string[];
  dealerId: string;
  roundNumber: number;
  currentRound: MuRoundState | null;
  lastRoundWinner: string | null;
  finished: boolean;
  overallWinner: string | null;
}

export interface MuGameResult {
  ok: boolean;
  state: MuGameState;
  error?: string;
}

function nextDealerInActivePlayers(activePlayers: string[], dealerId: string): string {
  const idx = activePlayers.indexOf(dealerId);
  if (idx === -1) return activePlayers[0];
  return activePlayers[(idx + 1) % activePlayers.length];
}

function fail(state: MuGameState, error: string): MuGameResult {
  return { ok: false, state, error };
}

function createStandings(players: string[]): Record<string, MuPlayerStanding> {
  const standings: Record<string, MuPlayerStanding> = {};
  players.forEach(player => {
    standings[player] = {
      id: player,
      penalty: 0,
      eliminated: false,
    };
  });
  return standings;
}

function resolveOverallWinner(activePlayers: string[], standings: Record<string, MuPlayerStanding>, lastRoundWinner: string | null): string | null {
  if (activePlayers.length === 1) return activePlayers[0];
  if (activePlayers.length !== 2) return null;

  const [a, b] = activePlayers;
  const pa = standings[a].penalty;
  const pb = standings[b].penalty;
  if (pa < pb) return a;
  if (pb < pa) return b;
  return lastRoundWinner;
}

function openNextRound(state: MuGameState, rng?: () => number): MuGameState {
  if (state.finished) return state;
  if (state.activePlayers.length <= 2) return state;
  if (!state.lastRoundWinner) return state;

  const nextDealer = nextDealerInActivePlayers(state.activePlayers, state.dealerId);
  const nextRound = createMuRound({
    players: state.activePlayers,
    dealerId: nextDealer,
    isFirstRound: false,
    previousRoundWinner: state.lastRoundWinner,
    rng,
  });

  return {
    ...state,
    dealerId: nextDealer,
    roundNumber: state.roundNumber + 1,
    currentRound: nextRound,
  };
}

export function createMuGame(params: { players: string[]; dealerId: string; rng?: () => number }): MuGameState {
  const { players, dealerId, rng } = params;
  if (players.length < 3 || players.length > 7) {
    throw new Error("Mu supports 3 to 7 players");
  }
  if (!players.includes(dealerId)) {
    throw new Error("Dealer must be one of players");
  }

  const firstRound = createMuRound({
    players,
    dealerId,
    isFirstRound: true,
    rng,
  });

  return {
    playersOrder: [...players],
    standings: createStandings(players),
    activePlayers: [...players],
    dealerId,
    roundNumber: 1,
    currentRound: firstRound,
    lastRoundWinner: null,
    finished: false,
    overallWinner: null,
  };
}

export function applyMuGameAction(state: MuGameState, action: MuRoundAction, rng?: () => number): MuGameResult {
  if (state.finished) return fail(state, "Game is already finished");
  if (!state.currentRound) return fail(state, "No active round");

  const roundResult = applyMuRoundAction(state.currentRound, action);
  if (!roundResult.ok) {
    return fail(state, roundResult.error ?? "Round action failed");
  }

  let nextState: MuGameState = {
    ...state,
    currentRound: roundResult.state,
  };

  if (!roundResult.state.finished || !roundResult.state.winner) {
    return { ok: true, state: nextState };
  }

  const winner = roundResult.state.winner;
  const updatedStandings: Record<string, MuPlayerStanding> = { ...nextState.standings };
  nextState.activePlayers.forEach(player => {
    const prev = updatedStandings[player];
    const nextPenalty = prev.penalty + (roundResult.state.penaltyDelta[player] ?? 0);
    updatedStandings[player] = {
      ...prev,
      penalty: nextPenalty,
      eliminated: nextPenalty >= 50,
    };
  });

  const stillActive = nextState.activePlayers.filter(player => !updatedStandings[player].eliminated);
  const gameFinished = stillActive.length <= 2;
  const overallWinner = gameFinished ? resolveOverallWinner(stillActive, updatedStandings, winner) : null;

  nextState = {
    ...nextState,
    standings: updatedStandings,
    activePlayers: stillActive,
    lastRoundWinner: winner,
    finished: gameFinished,
    overallWinner,
    currentRound: gameFinished ? null : nextState.currentRound,
  };

  if (!nextState.finished) {
    nextState = openNextRound(nextState, rng);
  }

  return { ok: true, state: nextState };
}
