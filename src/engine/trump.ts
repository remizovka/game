import type { PlayerId } from "./state";
import type { Ruleset } from "./rules";
import type { Suit } from "./cards";

// Suit assignment around the table:
// holder of JC -> C, right -> H, opposite -> S, left -> D.
const SUIT_ORDER: Suit[] = ["C", "H", "S", "D"];

export function assignSuitsFromPrevJC(
  prevHolderOfJC: PlayerId,
  playersInOrder: PlayerId[]
): Record<PlayerId, Suit> {
  if (playersInOrder.length !== 4) {
    throw new Error("playersInOrder must have exactly 4 players");
  }

  const baseIndex = playersInOrder.indexOf(prevHolderOfJC);
  if (baseIndex === -1) {
    throw new Error(`prevHolderOfJC not found in playersInOrder: ${prevHolderOfJC}`);
  }

  // playersInOrder is clockwise. "Right" is previous index.
  const offsets = [0, -1, 2, 1];
  const suitByPlayer = {} as Record<PlayerId, Suit>;
  for (let i = 0; i < 4; i += 1) {
    const offset = offsets[i];
    const player = playersInOrder[(baseIndex + offset + 4) % 4];
    suitByPlayer[player] = SUIT_ORDER[i];
  }

  return suitByPlayer;
}

export function computeTrumpSuit(
  dealIndex: number,
  prevHolderOfJC: PlayerId | null,
  currentHolderOfJC: PlayerId | null,
  playersInOrder: PlayerId[],
  ruleset: Ruleset
): Suit {
  if (dealIndex === 0 || prevHolderOfJC === null) return ruleset.firstTrumpSuit;
  if (currentHolderOfJC === null) {
    throw new Error("currentHolderOfJC is required for dealIndex > 0");
  }

  const suitByPlayer = assignSuitsFromPrevJC(prevHolderOfJC, playersInOrder);
  return suitByPlayer[currentHolderOfJC];
}
