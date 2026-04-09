import {
  buildAdvicePayload,
  defaultRuleset,
  simulateDeal,
  startDeal,
} from "./index";

const players = ["P0", "P1", "P2", "P3"] as const;

const state = startDeal({
  ruleset: defaultRuleset,
  playersInOrder: [...players],
  teams: { A: ["P0", "P2"], B: ["P1", "P3"] },
  dealer: "P3",
  dealIndex: 0,
  prevHolderOfJC: null,
});

const finalState = simulateDeal(state, [...players]);

const payload = buildAdvicePayload(finalState, "P0", "fair");

console.log("Final deal points:", finalState.dealPoints);
console.log("Advice payload sample:");
console.log(JSON.stringify(payload, null, 2));
