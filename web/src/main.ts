import {
  applyMove,
  assignSuitsFromPrevJC,
  cardPoints,
  cardRank,
  cardSuit,
  compareCards,
  defaultRuleset,
  findHolderOfCard,
  isJack,
  legalMoves,
  rankStrength,
  startDeal,
  type Card,
  type GameState,
  type PlayerId,
} from "@engine/index";
import { mountAuthBadge } from "./auth-badge";

const players: PlayerId[] = ["P0", "P1", "P2", "P3"];
mountAuthBadge({ mode: "inline", beforeSelector: "#downloadLog", containerSelector: ".status" });
const teams: Record<"A" | "B", PlayerId[]> = { A: ["P0", "P2"], B: ["P1", "P3"] };
const playerUiNames: Record<PlayerId, string> = {
  P0: "Игрок 1",
  P1: "Игрок 2",
  P2: "Игрок 3",
  P3: "Игрок 4",
};

let dealIndex = 0;
let prevHolderOfJC: PlayerId | null = null;
let currentHolderOfJC: PlayerId | null = null;
let suitAssignment: Record<PlayerId, "C" | "S" | "H" | "D"> | null = null;
let lastDealLeader: PlayerId | null = null;
let state: GameState | null = null;
let shownTrick: { player: PlayerId; card: Card }[] = [];
let trickHold = false;
let botTimer: number | null = null;
let holdTimer: number | null = null;
const BOT_DELAY_MS = 400;
const TRICK_HOLD_MS = 2000;
const NEXT_DEAL_DELAY_MS = 2000;
const SIMULATION_DELAY_MS = 1000;
const PAGE_BASE_URL = new URL(".", window.location.href);
let matchOver = false;
let pendingFinalize = false;
let runTimer: number | null = null;
let simulationMode = false;
const resolvedBelkaCardImageSrc = new Map<string, string | null>();
const resolvedBelkaEyesImageSrc = new Map<string, string | null>();

type LogEvent = (
  | { type: "match_start"; at: number; ruleset: string }
  | { type: "deal_start"; at: number; deal: number; dealer: PlayerId; leader: PlayerId; trump: string; trumpOwner: PlayerId | null; hands: Record<PlayerId, Card[]> }
  | { type: "play"; at: number; deal: number; trickIndex: number; player: PlayerId; card: Card }
  | { type: "trick_end"; at: number; deal: number; trickIndex: number; winner: PlayerId; points: number }
  | { type: "deal_end"; at: number; deal: number; pointsA: number; pointsB: number; eyesA: number; eyesB: number; eyesDelta: number; reasons: string[]; eggsCarry: number }
  | { type: "match_end"; at: number; winner: "A" | "B"; score: { A: number; B: number } }
) & { match?: number };

let matchLog: LogEvent[] = [];
let currentTrickIndex = 0;

const trumpEl = document.querySelector("#trump") as HTMLElement;
const trumpOwnerEl = document.querySelector("#trumpOwner") as HTMLElement;
const leaderEl = document.querySelector("#leader") as HTMLElement;
const lastWinnerEl = document.querySelector("#lastWinner") as HTMLElement;
const matchEl = document.querySelector("#matchScore") as HTMLElement | null;
const bannerEl = document.querySelector("#banner") as HTMLElement | null;
const trumpMarks = {
  P0: document.querySelector('[data-trump-mark="P0"]') as HTMLElement,
  P1: document.querySelector('[data-trump-mark="P1"]') as HTMLElement,
  P2: document.querySelector('[data-trump-mark="P2"]') as HTMLElement,
  P3: document.querySelector('[data-trump-mark="P3"]') as HTMLElement,
};
const dealEl = document.querySelector("#deal") as HTMLElement;
const scoreAEl = document.querySelector("#score-A") as HTMLElement;
const scoreBEl = document.querySelector("#score-B") as HTMLElement;
const gameAEl = document.querySelector("#game-A") as HTMLElement;
const gameBEl = document.querySelector("#game-B") as HTMLElement;
const trickEl = document.querySelector("#trick") as HTMLElement;
const debugEl = document.querySelector("#debug") as HTMLElement | null;
const downloadLogBtn = document.querySelector("#downloadLog") as HTMLButtonElement | null;
const restartBtn = document.querySelector("#restartGame") as HTMLButtonElement | null;
const simulationToggleBtn = document.querySelector("#simulationToggle") as HTMLButtonElement | null;
const fastSimBtn = document.querySelector("#fastSim10") as HTMLButtonElement | null;
const playerPanels: Record<PlayerId, HTMLElement> = {
  P0: document.querySelector("#player-P0") as HTMLElement,
  P1: document.querySelector("#player-P1") as HTMLElement,
  P2: document.querySelector("#player-P2") as HTMLElement,
  P3: document.querySelector("#player-P3") as HTMLElement,
};


function suitSymbolFromSuit(suit: string): string {
  switch (suit) {
    case "C":
      return "♣";
    case "S":
      return "♠";
    case "H":
      return "♥";
    case "D":
      return "♦";
    default:
      return "?";
  }
}

function suitNameRuFromSuit(suit: string): string {
  switch (suit) {
    case "C":
      return "крести";
    case "S":
      return "пики";
    case "H":
      return "черви";
    case "D":
      return "буби";
    default:
      return "";
  }
}

function getBotDelayMs(): number {
  return simulationMode ? SIMULATION_DELAY_MS : BOT_DELAY_MS;
}

function getTrickHoldMs(): number {
  return simulationMode ? SIMULATION_DELAY_MS : TRICK_HOLD_MS;
}

function getNextDealDelayMs(): number {
  return simulationMode ? SIMULATION_DELAY_MS : NEXT_DEAL_DELAY_MS;
}

function canHumanPlay(): boolean {
  return !simulationMode;
}

function playerName(player: PlayerId | null | undefined): string {
  if (!player) return "—";
  return playerUiNames[player] ?? player;
}

function suitColor(card: Card): "red" | "black" {
  const suit = card.slice(card.length - 1);
  return suit === "H" || suit === "D" ? "red" : "black";
}

function suitSymbol(card: Card): string {
  const suit = card.slice(card.length - 1);
  return suitSymbolFromSuit(suit);
}

function verboseBelkaCardAssetName(code: string): string | null {
  if (code === "BACK") return "back";
  const suitCode = code.slice(-1);
  const rankCode = code.slice(0, -1);
  const rankMap: Record<string, string> = {
    A: "ace",
    K: "king",
    Q: "queen",
    J: "jack",
    "10": "10",
    "9": "9",
    "8": "8",
    "7": "7",
    "6": "6",
  };
  const suitMap: Record<string, string> = {
    C: "clubs",
    D: "diamonds",
    H: "hearts",
    S: "spades",
  };
  const rank = rankMap[rankCode];
  const suit = suitMap[suitCode];
  if (!rank || !suit) return null;
  return `${rank}_of_${suit}`;
}

function belkaCardAssetCandidates(code: string): string[] {
  const verbose = verboseBelkaCardAssetName(code);
  const roots = [
    new URL("cards", PAGE_BASE_URL).toString().replace(/\/$/, ""),
    new URL("assets/cards", PAGE_BASE_URL).toString().replace(/\/$/, ""),
  ];
  const names = [code, ...(verbose ? [verbose] : [])];
  const bases = roots.flatMap(root => names.map(name => `${root}/${name}`));
  const v = "cards-v2";
  return [
    ...bases.map(base => `${base}.svg?v=${v}`),
    ...bases.map(base => `${base}.png?v=${v}`),
    ...bases.map(base => `${base}.webp?v=${v}`),
  ];
}

function attachBelkaCardImage(el: HTMLElement, code: string, alt: string): void {
  const resolved = resolvedBelkaCardImageSrc.get(code);
  if (resolved === null) return;
  const img = document.createElement("img");
  img.className = "card-img";
  img.alt = alt;
  img.loading = "eager";
  img.decoding = "sync";
  img.draggable = false;
  const candidates = belkaCardAssetCandidates(code);
  let idx = 0;
  const tryNext = (): void => {
    if (idx >= candidates.length) return;
    img.src = candidates[idx];
    idx += 1;
  };
  el.classList.add("has-image");
  img.addEventListener("load", () => {
    el.classList.add("has-image");
    resolvedBelkaCardImageSrc.set(code, img.currentSrc || img.src);
  });
  img.addEventListener("error", () => {
    if (idx < candidates.length) {
      tryNext();
      return;
    }
    resolvedBelkaCardImageSrc.set(code, null);
    el.classList.remove("has-image");
    img.remove();
  });
  el.append(img);
  if (typeof resolved === "string") {
    img.src = resolved;
  } else {
    tryNext();
  }
}

function renderCard(card: Card, small = false, faceDown = false): HTMLElement {
  const el = document.createElement("div");
  el.className = `card ${small ? "small" : ""} ${faceDown ? "back" : ""} ${faceDown ? "" : suitColor(card)
    }`;
  attachBelkaCardImage(el, faceDown ? "BACK" : card, faceDown ? "Рубашка карты" : `Карта ${card}`);
  if (!faceDown) {
    el.setAttribute("data-suit", suitSymbol(card));
  }
  if (faceDown) return el;

  const fallback = document.createElement("div");
  fallback.className = "card-fallback";
  const rank = document.createElement("div");
  rank.className = "rank";
  rank.textContent = card.slice(0, card.length - 1);

  const suit = document.createElement("div");
  suit.className = "suit";
  suit.textContent = suitSymbol(card);

  fallback.append(rank, suit);
  el.append(fallback);
  return el;
}

function eyesAssetUrl(eyes: number, color: "black" | "red"): string {
  const suitName = color === "black" ? "крести" : "черви";
  const fileName = `${eyes} глаз ${suitName}.svg`;
  return new URL(`cards/${encodeURIComponent(fileName)}`, PAGE_BASE_URL).toString();
}

function renderHand(player: PlayerId, hand: Card[]) {
  const handEl = document.querySelector(`[data-player="${player}"]`) as HTMLElement;
  const metaEl = document.querySelector(`[data-meta="${player}"]`) as HTMLElement;
  handEl.innerHTML = "";

  if (player === "P0") {
    const sorted = state ? sortHand(hand, state) : [...hand];
    const legal = state ? legalMoves(hand, state.trick, state.trump.suit, state.ruleset) : [];
    sorted.forEach(card => {
      const cardEl = renderCard(card);
      if (state && legal.includes(card) && state.leader === player && canHumanPlay()) {
        cardEl.classList.add("legal");
      }
      cardEl.addEventListener("click", () => {
        if (!state) return;
        if (!canHumanPlay()) return;
        if (trickHold) return;
        if (state.leader !== player) return;
        const allowed = legalMoves(hand, state.trick, state.trump.suit, state.ruleset);
        if (!allowed.includes(card)) return;
        const result = applyMove(state, player, card);
        logEvent({
          type: "play",
          at: Date.now(),
          deal: dealIndex + 1,
          trickIndex: currentTrickIndex,
          player,
          card,
        });
        state = result.state;
        updateShownTrick();
        render();
        maybeAdvanceBots();
      });
      handEl.append(cardEl);
    });
    metaEl.textContent = playerUiNames[player];
  } else {
    for (let i = 0; i < hand.length; i += 1) {
      handEl.append(renderCard("7C", true, true));
    }
    metaEl.textContent = playerUiNames[player];
  }
}

function renderTrick(trick: { player: PlayerId; card: Card }[]) {
  const slots: Record<PlayerId, HTMLElement> = {
    P0: trickEl.querySelector('[data-slot="P0"]') as HTMLElement,
    P1: trickEl.querySelector('[data-slot="P1"]') as HTMLElement,
    P2: trickEl.querySelector('[data-slot="P2"]') as HTMLElement,
    P3: trickEl.querySelector('[data-slot="P3"]') as HTMLElement,
  };

  Object.values(slots).forEach(slot => {
    slot.innerHTML = "";
  });

  trick.forEach(play => {
    const cardEl = renderCard(play.card);
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    wrap.append(cardEl);
    slots[play.player].append(wrap);
  });
}

function nextClockwise(player: PlayerId): PlayerId {
  // Visual clockwise order on the table:
  // bottom (P0) -> left (P3) -> top (P2) -> right (P1) -> bottom.
  const visualClockwise: PlayerId[] = ["P0", "P3", "P2", "P1"];
  const idx = visualClockwise.indexOf(player);
  return visualClockwise[(idx + 1) % visualClockwise.length];
}

function getActiveSuitAssignment(): Record<PlayerId, "C" | "S" | "H" | "D"> | null {
  if (suitAssignment) return suitAssignment;
  if (!currentHolderOfJC) return null;
  return assignSuitsFromPrevJC(currentHolderOfJC, [...players]);
}

function getOrCreateEyesLayer(): HTMLElement | null {
  const tableEl = document.querySelector(".table") as HTMLElement | null;
  if (!tableEl) return null;
  let layer = tableEl.querySelector(".eyes-layer") as HTMLElement | null;
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "eyes-layer";
    tableEl.append(layer);
  }
  return layer;
}

function getEyesBoardPosition(player: PlayerId): { left: number; top: number } | null {
  const tableEl = document.querySelector(".table") as HTMLElement | null;
  const playerEl = document.querySelector(`#player-${player}`) as HTMLElement | null;
  const handEl = playerEl?.querySelector(`[data-player="${player}"]`) as HTMLElement | null;
  if (!tableEl || !playerEl || !handEl) return null;

  const tableRect = tableEl.getBoundingClientRect();
  const playerRect = playerEl.getBoundingClientRect();
  const handCards = Array.from(handEl.querySelectorAll(".card")) as HTMLElement[];
  const handRect = handEl.getBoundingClientRect();
  const firstCardRect = handCards[0]?.getBoundingClientRect() ?? handRect;
  const lastCardRect = handCards[handCards.length - 1]?.getBoundingClientRect() ?? handRect;
  const boardWidth = 112;
  const boardHeight = 112;

  switch (player) {
    case "P0":
      return {
        left: firstCardRect.left - tableRect.left - boardWidth - 18,
        top: firstCardRect.top - tableRect.top + (firstCardRect.height - boardHeight) / 2,
      };
    case "P1":
      return {
        left: playerRect.left - tableRect.left + playerRect.width - boardWidth - 18,
        top: handRect.top - tableRect.top + handRect.height + 12,
      };
    case "P2":
      return {
        left: lastCardRect.right - tableRect.left + 18,
        top: lastCardRect.top - tableRect.top + (lastCardRect.height - boardHeight) / 2,
      };
    case "P3":
      return {
        left: firstCardRect.left - tableRect.left + 6,
        top: firstCardRect.top - tableRect.top - boardHeight - 28,
      };
    default:
      return null;
  }
}

function renderEyesStack(cards: [Card, Card], eyes: number, color: "black" | "red"): HTMLElement {
  type EyeCardView = {
    show: boolean;
    faceDown: boolean;
    x: number;
    y: number;
    rot: number;
    z: number;
  };
  type EyeLayout = { a: EyeCardView; b: EyeCardView };

  const HIDDEN: EyeCardView = { show: false, faceDown: true, x: 0, y: 0, rot: 0, z: 0 };
  const v = (show: boolean, faceDown: boolean, x: number, y: number, rot = 0, z = 1): EyeCardView => ({
    show, faceDown, x, y, rot, z,
  });

  // Approximate the supplied reference images.
  // a = first card in stack (6C / 6H), b = second card (6S / 6D)
  const layouts: EyeLayout[] = [
    // 0: one closed card (start state 0:0)
    { a: v(true, true, 4, 8, 0, 1), b: HIDDEN },
    // 1..5: one open + one closed (different reveals)
    // 1: open card + closed card diagonally across (reference image)
    { a: v(true, false, 2, 2, 0, 1), b: v(true, true, 10, 4, 32, 2) },
    // 2: open card behind + closed card covering lower part (reference image)
    { a: v(true, false, 2, 0, 0, 1), b: v(true, true, 2, 18, 0, 2) },
    { a: v(true, false, 0, 0, 0, 1), b: v(true, true, 24, 14, 0, 2) },
    { a: v(true, false, 0, 0, 0, 1), b: v(true, true, 2, 12, 0, 2) },
    { a: v(true, false, 0, 0, 0, 1), b: v(true, true, 10, 8, -35, 2) },
    // 6: one open card only
    { a: v(true, false, 4, 0, 0, 1), b: HIDDEN },
    // 7..11: two open cards (different layouts)
    { a: v(true, false, 0, 0, 0, 1), b: v(true, false, 18, 18, 0, 2) },
    { a: v(true, false, 4, 0, 0, 1), b: v(true, false, 4, 24, 0, 2) },
    { a: v(true, false, 0, 0, 0, 1), b: v(true, false, 24, 0, 0, 2) },
    { a: v(true, false, 4, 0, 0, 1), b: v(true, false, 4, 16, 0, 2) },
    { a: v(true, false, 0, 0, 0, 1), b: v(true, false, 8, 6, -35, 2) },
  ];

  const layout = layouts[Math.max(0, Math.min(11, eyes))];

  const stack = document.createElement("div");
  stack.className = "eyes-stack";
  stack.dataset.eyes = String(eyes);

  if (canUseEyesCounterAsset(eyes, color)) {
    const frame = document.createElement("div");
    frame.className = "eyes-counter-frame";
    const img = document.createElement("img");
    img.className = "eyes-counter-image";
    img.alt = `${eyes} глаз ${color === "black" ? "крести" : "черви"}`;
    const src = eyesAssetUrl(eyes, color);
    const cached = resolvedBelkaEyesImageSrc.get(src);
    if (cached !== undefined) {
      if (cached) img.src = cached;
    } else {
      resolvedBelkaEyesImageSrc.set(src, src);
      img.src = src;
      img.addEventListener("error", () => {
        resolvedBelkaEyesImageSrc.set(src, null);
        img.remove();
      }, { once: true });
    }
    frame.append(img);
    stack.append(frame);
    return stack;
  }

  const pile = document.createElement("div");
  pile.className = "eyes-pile";

  const cardA = renderCard(cards[0], true, layout.a.faceDown);
  const cardB = renderCard(cards[1], true, layout.b.faceDown);
  cardA.classList.add("eyes-card", "eyes-card-a");
  cardB.classList.add("eyes-card", "eyes-card-b");

  const applyView = (el: HTMLElement, view: EyeCardView) => {
    if (!view.show) {
      el.classList.add("hidden");
      return;
    }
    el.style.left = `${view.x}px`;
    el.style.top = `${view.y}px`;
    el.style.zIndex = String(view.z);
    el.style.transform = view.rot ? `rotate(${view.rot}deg)` : "none";
    el.style.transformOrigin = "50% 50%";
  };

  applyView(cardA, layout.a);
  applyView(cardB, layout.b);

  pile.append(cardA, cardB);
  stack.append(pile);
  return stack;
}

function renderEyesBoards() {
  const layer = getOrCreateEyesLayer();
  if (!layer) return;
  layer.innerHTML = "";

  if (!state) return;
  if (dealIndex === 0) return;
  const activeAssignment = getActiveSuitAssignment();
  if (!activeAssignment) return;

  const clubAnchor = (Object.keys(activeAssignment) as PlayerId[]).find(p => activeAssignment[p] === "C") ?? null;
  // User expects the second eyes stack to be shown at the next player by visual clockwise order.
  // Example: if P0 has clubs, hearts stack should be shown at P3 (left player).
  const heartAnchor = clubAnchor ? nextClockwise(clubAnchor) : null;
  if (!clubAnchor || !heartAnchor) return;

  const clubTeam: "A" | "B" = teams.A.includes(clubAnchor) ? "A" : "B";
  const heartTeam: "A" | "B" = teams.A.includes(heartAnchor) ? "A" : "B";
  const clubEyes = clubTeam === "A" ? state.score.gameEyesA : state.score.gameEyesB;
  const heartEyes = heartTeam === "A" ? state.score.gameEyesA : state.score.gameEyesB;
  const clubPosition = getEyesBoardPosition(clubAnchor);
  const heartPosition = getEyesBoardPosition(heartAnchor);
  if (!clubPosition || !heartPosition) return;

  const clubBoard = document.createElement("div");
  clubBoard.className = `eyes-board eyes-black eyes-team-${clubTeam.toLowerCase()}`;
  clubBoard.append(renderEyesStack(["6C", "6S"], clubEyes, "black"));
  clubBoard.style.left = `${clubPosition.left}px`;
  clubBoard.style.top = `${clubPosition.top}px`;
  layer.append(clubBoard);

  const heartBoard = document.createElement("div");
  heartBoard.className = `eyes-board eyes-red eyes-team-${heartTeam.toLowerCase()}`;
  heartBoard.append(renderEyesStack(["6H", "6D"], heartEyes, "red"));
  heartBoard.style.left = `${heartPosition.left}px`;
  heartBoard.style.top = `${heartPosition.top}px`;
  layer.append(heartBoard);
}

function render() {
  if (!state) return;

  const trumpSymbol = suitSymbolFromSuit(state.trump.suit);
  const trumpClass = isRedSuit(state.trump.suit) ? "red" : "black";
  trumpEl.innerHTML = `Козырь: <span class="trump-symbol ${trumpClass}">${trumpSymbol}</span> ${state.trump.suit}`;
  trumpOwnerEl.textContent =
    dealIndex === 0 ? "Козырь у: —" : `Козырь у: ${playerName(currentHolderOfJC)}`;
  leaderEl.textContent = `Ходит: ${playerName(state.leader)}`;
  lastWinnerEl.textContent = `Взятку взял: ${playerName(
    state.history.length > 0 ? state.history[state.history.length - 1].winner : null
  )}`;
  dealEl.textContent = `Раздача: ${dealIndex + 1}`;
  scoreAEl.textContent = String(state.dealPoints.A);
  scoreBEl.textContent = String(state.dealPoints.B);
  gameAEl.textContent = String(state.score.gameEyesA);
  gameBEl.textContent = String(state.score.gameEyesB);
  if (matchEl) {
    matchEl.textContent = `Счет: ${state.score.gameEyesA}:${state.score.gameEyesB}`;
  }
  updateTrumpMarks();
  if (simulationToggleBtn) {
    simulationToggleBtn.textContent = simulationMode ? "Симуляция: вкл" : "Симуляция: выкл";
  }

  const currentState = state;
  const lastWinner = currentState.history.length > 0 ? currentState.history[currentState.history.length - 1].winner : null;
  players.forEach(player => {
    const panel = playerPanels[player];
    panel.classList.toggle("is-leader", currentState.leader === player);
    panel.classList.toggle("is-last-winner", lastWinner === player);
    panel.classList.toggle("is-trump-owner", currentHolderOfJC === player);
  });

  renderHand("P0", currentState.hands.P0);
  renderHand("P1", currentState.hands.P1);
  renderHand("P2", currentState.hands.P2);
  renderHand("P3", currentState.hands.P3);
  renderEyesBoards();
  renderTrick(shownTrick);
  renderDebug();
  updateTrumpMarks();
  runBots();
}

function updateTrumpMarks() {
  const symbol = dealIndex === 0 ? "" : suitSymbolFromSuit(state?.trump.suit ?? "C");
  const cls = isRedSuit(state?.trump.suit ?? "C") ? "red" : "black";
  const owner = dealIndex === 0 ? null : currentHolderOfJC;

  (Object.keys(trumpMarks) as PlayerId[]).forEach(player => {
    const mark = (trumpMarks as Record<PlayerId, HTMLElement>)[player];
    if (!mark) return;
    mark.classList.remove("red", "black");
    if (owner && player === owner) {
      mark.textContent = symbol;
      mark.classList.add(cls);
    } else {
      mark.textContent = "";
    }
  });
}

function isRedSuit(suit: string): boolean {
  return suit === "H" || suit === "D";
}


function sortHand(hand: Card[], s: GameState): Card[] {
  const suitOrder = ["C", "S", "H", "D"];
  const jackOrder = s.ruleset.jackOrder;

  const scoreCard = (card: Card): [number, number, number, string] => {
    const isJackCard = isJack(card);
    const isTrumpSuit = !isJackCard && cardSuit(card) === s.trump.suit;

    if (isTrumpSuit) {
      return [0, -rankStrength(cardRank(card), s.ruleset.deckSize), 0, card];
    }

    if (isJackCard) {
      const idx = jackOrder.indexOf(card);
      return [1, idx === -1 ? 99 : idx, 0, card];
    }

    const suitIdx = suitOrder.indexOf(cardSuit(card));
    return [2, suitIdx, -rankStrength(cardRank(card), s.ruleset.deckSize), card];
  };

  return [...hand].sort((a, b) => {
    const sa = scoreCard(a);
    const sb = scoreCard(b);
    for (let i = 0; i < sa.length; i += 1) {
      if (sa[i] < sb[i]) return -1;
      if (sa[i] > sb[i]) return 1;
    }
    return 0;
  });
}

function startNewDeal() {
  clearTimers();
  trickHold = false;
  matchOver = false;
  pendingFinalize = false;
  if (bannerEl) {
    bannerEl.textContent = "";
    bannerEl.classList.remove("active");
  }
  const prevScore = state ? state.score : { gameEyesA: 0, gameEyesB: 0 };
  const prevEggs = state ? state.eggsCarry : 0;
  const trumpSuitOverride = dealIndex === 0 ? "C" : undefined;

  state = startDeal({
    ruleset: defaultRuleset,
    playersInOrder: [...players],
    teams,
    dealer: "P3",
    dealIndex,
    prevHolderOfJC,
    trumpSuitOverride,
  });
  currentHolderOfJC = findHolderOfCard(state.hands, "JC");
  if (dealIndex > 0 && suitAssignment && currentHolderOfJC) {
    state = { ...state, trump: { ...state.trump, suit: suitAssignment[currentHolderOfJC] } };
  }

  let leader: PlayerId;
  if (dealIndex === 0) {
    leader = players[Math.floor(Math.random() * players.length)];
  } else if (lastDealLeader) {
    leader = lastDealLeader;
  } else {
    leader = state.leader;
  }

  state = { ...state, leader, score: prevScore, eggsCarry: prevEggs };
  shownTrick = [];
  currentTrickIndex = 0;
  logEvent({
    type: "deal_start",
    at: Date.now(),
    deal: dealIndex + 1,
    dealer: "P3",
    leader,
    trump: state.trump.suit,
    trumpOwner: currentHolderOfJC,
    hands: state.hands,
  });
  render();
  runBots();
}

function selectBotMove(s: GameState, player: PlayerId): Card {
  const hand = s.hands[player];
  const legal = legalMoves(hand, s.trick, s.trump.suit, s.ruleset);
  if (legal.length === 0) throw new Error("No legal moves");

  const sortedByPointsAsc = [...legal].sort((a, b) => cardPoints(a) - cardPoints(b));
  const sortedByPointsDesc = [...legal].sort((a, b) => cardPoints(b) - cardPoints(a));

  const cutInfo = computeCutInfo(s);
  const aceStatus = computeAceStatus(s);
  const jackStatus = computeJackStatus(s);
  const partner = teams.A.includes(player)
    ? teams.A.find(p => p !== player)!
    : teams.B.find(p => p !== player)!;

  const leadSuit = s.trick.length > 0 ? cardSuit(s.trick[0].card) : null;
  const currentWinner = s.trick.length > 0
    ? s.trick.reduce((best: { player: PlayerId; card: Card }, play: { player: PlayerId; card: Card }) => {
      const lead = leadSuit ?? cardSuit(play.card);
      return compareCards(play.card, best.card, lead, s.trump.suit, s.ruleset) > 0
        ? play
        : best;
    })
    : null;
  const partnerWinning = currentWinner ? currentWinner.player === partner : false;
  const trickPoints = s.trick.reduce((sum: number, p: { card: Card }) => sum + cardPoints(p.card), 0);
  const myTeam = teams.A.includes(player) ? "A" : "B";
  const myTeamPoints = s.dealPoints[myTeam];
  const oppPoints = myTeam === "A" ? s.dealPoints.B : s.dealPoints.A;
  const jcTeam =
    currentHolderOfJC && teams.A.includes(currentHolderOfJC) ? "A" : "B";
  const foreignTrump = currentHolderOfJC !== null && jcTeam !== myTeam;
  const tricksPlayed = s.history.length;
  const remainingTricks = 8 - tricksPlayed;
  const endgame = remainingTricks <= 2;
  const inRescueMode =
    (myTeamPoints < 35 && remainingTricks <= 4) ||
    (foreignTrump && myTeamPoints < 45 && remainingTricks <= 3);
  const inHardRescue =
    (myTeamPoints < 30 && remainingTricks <= 3) ||
    (foreignTrump && myTeamPoints < 35 && remainingTricks <= 2);
  const inDefenseMode = myTeamPoints >= 90 && oppPoints >= 30 && !foreignTrump;

  const lastTrick = s.history[s.history.length - 1];
  const lastWinner = lastTrick?.winner;
  const lastPoints = lastTrick ? lastTrick.trick.reduce((sum: number, t: { card: Card }) => sum + cardPoints(t.card), 0) : 0;
  const lastWinnerTeam = lastWinner ? (teams.A.includes(lastWinner) ? "A" : "B") : null;
  const keepTempo = lastWinnerTeam === myTeam && lastPoints >= 20;

  if (s.trick.length === 0) {
    const nonTrump = legal.filter(c => cardSuit(c) !== s.trump.suit && !isJack(c));
    const sortedNonTrumpAsc = [...nonTrump].sort((a, b) => cardPoints(a) - cardPoints(b));
    const aces = nonTrump.filter(c => cardRank(c) === "A");
    const tens = nonTrump.filter(c => cardRank(c) === "10");
    const partnerCut = cutInfo.cutBy[partner];
    const oppCut = new Set<string>();
    Object.keys(cutInfo.cutBy).forEach(p => {
      if (p !== partner && p !== player) {
        cutInfo.cutBy[p as PlayerId].forEach(suit => oppCut.add(suit));
      }
    });

    if (keepTempo) {
      const leadSuit = lastTrick?.trick[0]?.card ? cardSuit(lastTrick.trick[0].card) : null;
      if (leadSuit) {
        const cont = nonTrump.filter(c => cardSuit(c) === leadSuit);
        if (cont.length > 0) return cont.sort((a, b) => cardPoints(a) - cardPoints(b))[0];
      }
    }

    // If we have A+10 of same suit, lead A to set up 10 next.
    const aceWithTen = aces.find(a => {
      const suit = cardSuit(a);
      return tens.some(t => cardSuit(t) === suit) && !cutInfo.cutSuits.has(suit);
    }) ?? aces.find(a => tens.some(t => cardSuit(t) === cardSuit(a)));
    if (aceWithTen) return aceWithTen;

    const safeAce = aces.find(a => !cutInfo.cutSuits.has(cardSuit(a)));
    if (safeAce) return safeAce;
    if (aces.length > 0) return aces[0];

    // If partner has cut a suit, try to lead that suit (prefer low points).
    if (partnerCut && partnerCut.size > 0) {
      const inCutSuit = nonTrump.filter(c => partnerCut.has(cardSuit(c)));
      const zeroPoint = inCutSuit.filter(c => cardPoints(c) === 0);
      if (zeroPoint.length > 0) return zeroPoint.sort((a, b) => cardPoints(a) - cardPoints(b))[0];
      if (inCutSuit.length > 0) return inCutSuit.sort((a, b) => cardPoints(a) - cardPoints(b))[0];
    }

    // If ace of a suit is already played, leading 10 is safer.
    const playedAces = new Set(
      s.history.flatMap((h: { trick: { card: Card }[] }) => h.trick.map((t: { card: Card }) => t.card)).filter((c: Card) => cardRank(c) === "A").map(cardSuit)
    );
    const safeTen = tens.find(t =>
      playedAces.has(cardSuit(t)) &&
      !cutInfo.cutSuits.has(cardSuit(t)) &&
      !oppCut.has(cardSuit(t))
    ) ?? tens.find(t => playedAces.has(cardSuit(t)) && !oppCut.has(cardSuit(t)));
    if (safeTen && !foreignTrump) return safeTen;

    const safeTen2 = tens.find(t =>
      !cutInfo.cutSuits.has(cardSuit(t)) &&
      !aceStatus.aceUnknown.has(cardSuit(t)) &&
      !oppCut.has(cardSuit(t))
    ) ?? tens.find(t => !cutInfo.cutSuits.has(cardSuit(t)) && !oppCut.has(cardSuit(t)));
    if (safeTen2 && !foreignTrump) return safeTen2;

    // If opponent has cut a suit, try to lead that suit to burn trumps.
    const oppCutLead = nonTrump.filter(c => oppCut.has(cardSuit(c)));
    if (!inDefenseMode && oppCutLead.length > 0) {
      return oppCutLead.sort((a, b) => cardPoints(a) - cardPoints(b))[0];
    }

    // Avoid leading weak queens and risky tens unless there is no better non-trump.
    const safeLow = sortedNonTrumpAsc.find(
      c =>
        cardRank(c) !== "Q" &&
        cardRank(c) !== "10" &&
        !cutInfo.cutSuits.has(cardSuit(c)) &&
        !aceStatus.aceUnknown.has(cardSuit(c))
    ) ?? sortedNonTrumpAsc.find(c =>
      cardRank(c) !== "Q" &&
      cardRank(c) !== "10" &&
      !cutInfo.cutSuits.has(cardSuit(c))
    ) ?? sortedNonTrumpAsc.find(c =>
      cardRank(c) !== "Q" &&
      cardRank(c) !== "10"
    ) ?? sortedByPointsAsc.find(
      c => !cutInfo.cutSuits.has(cardSuit(c)) && !aceStatus.aceUnknown.has(cardSuit(c))
    ) ?? sortedByPointsAsc.find(c => !cutInfo.cutSuits.has(cardSuit(c)));
    if (safeLow) return safeLow;
    return sortedByPointsAsc[0];
  }

  const canWin = legal.filter(c => {
    const lead = leadSuit ?? cardSuit(c);
    return compareCards(c, currentWinner!.card, lead, s.trump.suit, s.ruleset) > 0;
  });

  if (partnerWinning) {
    const nonOvertake = legal.filter(c => {
      const lead = leadSuit ?? cardSuit(c);
      return compareCards(c, currentWinner!.card, lead, s.trump.suit, s.ruleset) <= 0;
    });
    if (nonOvertake.length > 0) {
      // "Pour" points to partner when safe, but avoid throwing A if partner already wins.
      const avoidAces = nonOvertake.filter(c => cardRank(c) !== "A");
      const pool = avoidAces.length > 0 ? avoidAces : nonOvertake;
      return [...pool].sort((a, b) => cardPoints(b) - cardPoints(a))[0];
    }
    // If we must overtake partner, do it with minimal cost.
    return sortedByPointsAsc[0];
  }

  if (canWin.length > 0) {
    if (foreignTrump && trickPoints >= 10) {
      // Against foreign trump pressure, secure valuable tricks more aggressively.
      return [...canWin].sort((a, b) => {
        const lead = leadSuit ?? cardSuit(a);
        return compareCards(b, a, lead, s.trump.suit, s.ruleset);
      })[0];
    }

    // Prefer non-trump wins on low-value tricks.
    const nonTrumpWins = canWin.filter(c => !isJack(c) && cardSuit(c) !== s.trump.suit);
    const preferWins = inRescueMode
      ? canWin
      : (trickPoints < 10 && nonTrumpWins.length > 0 ? nonTrumpWins : canWin);

    // Avoid spending top jacks on low-value tricks if possible.
    const avoidHighJacks =
      trickPoints < 10 && !inRescueMode ? preferWins.filter(c => !["JC", "JS"].includes(c)) : preferWins;
    const pool = avoidHighJacks.length > 0 ? avoidHighJacks : preferWins;

    if (inRescueMode && (trickPoints >= 10 || endgame)) {
      return [...canWin].sort((a, b) => {
        const lead = leadSuit ?? cardSuit(a);
        return compareCards(b, a, lead, s.trump.suit, s.ruleset);
      })[0];
    }

    // Choose the cheapest winning card to save power.
    return pool.sort((a, b) => {
      const lead = leadSuit ?? cardSuit(a);
      return compareCards(a, b, lead, s.trump.suit, s.ruleset);
    })[0];
  }

  // If we cannot win: dump low points, unless in rescue mode and trick has points.
  if (foreignTrump) {
    const zeros = sortedByPointsAsc.filter(c => cardPoints(c) === 0);
    if (zeros.length > 0) return zeros[0];
  }
  if (endgame && trickPoints < 10) {
    const avoidHigh = sortedByPointsAsc.filter(c => !["A", "10"].includes(cardRank(c)));
    if (avoidHigh.length > 0) return avoidHigh[0];
  }
  if ((inRescueMode && trickPoints >= 5) || (inHardRescue && trickPoints >= 3)) {
    const trumps = legal.filter(c => isJack(c) || cardSuit(c) === s.trump.suit);
    if (trumps.length > 0) {
      // avoid top jacks if possible
      const safeTrump = trumps.find(c => !["JC", "JS"].includes(c));
      return safeTrump ?? trumps[0];
    }
  }

  // Prefer to "dump" cut suits if this is a low-value trick.
  if (trickPoints < 10) {
    const dumpCut = sortedByPointsAsc.find(c => cutInfo.cutSuits.has(cardSuit(c)));
    if (dumpCut) return dumpCut;
  }

  // Defense mode: avoid giving points, dump zeros first.
  if (inDefenseMode) {
    const zeros = sortedByPointsAsc.filter(c => cardPoints(c) === 0);
    if (zeros.length > 0) return zeros[0];
  }

  // If we have the last remaining jack, use it more aggressively on high-value tricks.
  if (jackStatus.remaining.length === 1 && hand.includes(jackStatus.remaining[0] as Card)) {
    if (trickPoints >= 10) {
      return jackStatus.remaining[0] as Card;
    }
  }

  return sortedByPointsAsc[0];
}

function computeCutInfo(s: GameState): {
  cutSuits: Set<string>;
  cutBy: Record<PlayerId, Set<string>>;
} {
  const cut = new Set<string>();
  const cutBy: Record<PlayerId, Set<string>> = {
    P0: new Set(),
    P1: new Set(),
    P2: new Set(),
    P3: new Set(),
  };
  for (const h of s.history) {
    const lead = h.trick[0]?.card;
    if (!lead) continue;
    const leadIsTrump = isJack(lead) || cardSuit(lead) === s.trump.suit;
    if (leadIsTrump) continue;
    const leadSuit = cardSuit(lead);
    const cutter = h.trick.find((t: { card: Card }) => isJack(t.card) || cardSuit(t.card) === s.trump.suit);
    if (cutter) {
      cut.add(leadSuit);
      cutBy[cutter.player].add(leadSuit);
    }
  }
  return { cutSuits: cut, cutBy };
}

function computeAceStatus(s: GameState): { aceUnknown: Set<string> } {
  const suits = ["C", "S", "H", "D"];
  const seen = new Set<string>();
  for (const h of s.history) {
    for (const t of h.trick) {
      if (cardRank(t.card) === "A") seen.add(cardSuit(t.card));
    }
  }
  for (const t of s.trick) {
    if (cardRank(t.card) === "A") seen.add(cardSuit(t.card));
  }
  const unknown = new Set<string>();
  suits.forEach(suit => {
    if (!seen.has(suit)) unknown.add(suit);
  });
  return { aceUnknown: unknown };
}

function computeJackStatus(s: GameState): { remaining: string[] } {
  const seen = new Set<string>();
  for (const h of s.history) {
    for (const t of h.trick) {
      if (cardRank(t.card) === "J") seen.add(t.card);
    }
  }
  for (const t of s.trick) {
    if (cardRank(t.card) === "J") seen.add(t.card);
  }
  return {
    remaining: ["JC", "JS", "JH", "JD"].filter(j => !seen.has(j)),
  };
}

function botStep() {
  if (!state) return;
  if (state.leader === "P0" && !simulationMode) return;
  const leader = state.leader;
  const legal = legalMoves(state.hands[leader], state.trick, state.trump.suit, state.ruleset);
  if (legal.length === 0) throw new Error(`No legal moves for ${leader}`);

  let card = selectBotMove(state, leader);
  if (!legal.includes(card)) {
    console.warn(`Bot selected illegal move ${card} for ${leader}, using fallback ${legal[0]}`);
    card = legal[0];
  }

  const result = applyMove(state, leader, card);
  logEvent({
    type: "play",
    at: Date.now(),
    deal: dealIndex + 1,
    trickIndex: currentTrickIndex,
    player: leader,
    card,
  });
  state = result.state;
  updateShownTrick();
}

function handleBotError(err: unknown, context: string) {
  const message = err instanceof Error ? err.message : String(err);
  if (bannerEl) {
    bannerEl.textContent = `Ошибка бота (${context}): ${message}`;
    bannerEl.classList.add("active");
  }
  console.error(err);
}

function maybeAdvanceBots() {
  if (!state) return;
  if (trickHold) return;
  skipEmptyLeader();
  runBots();
  if (pendingFinalize) finalizeDealIfEnded();
}

function advanceBotsToPlayer() {
  if (!state) return;
  skipEmptyLeader();
  runBots();
}

function finalizeDealIfEnded() {
  if (!state) return;
  const allEmpty = players.every(p => state!.hands[p].length === 0);
  if (!allEmpty) return;

  const pointsA = state.dealPoints.A;
  const pointsB = state.dealPoints.B;
  const dealScoreText = `${pointsA}:${pointsB}`;
  const winnerTeam = pointsA > pointsB ? "A" : "B";
  const loserTeam = winnerTeam === "A" ? "B" : "A";
  const winnerPoints = Math.max(pointsA, pointsB);
  const loserPoints = Math.min(pointsA, pointsB);

  if (pointsA === 60 && pointsB === 60) {
    state = { ...state, eggsCarry: 4 };
    showBanner(`Раздача: ${dealScoreText}. Жумыртка, следующая на 4 глаза.`);
    // showBanner("Раздача закончена: жумыртка (60:60). Следующая в очко на 4 глаза.");
    lastDealLeader = state.history[state.history.length - 1]?.winner ?? null;
    prevHolderOfJC = currentHolderOfJC;
    if (!suitAssignment && prevHolderOfJC) {
      suitAssignment = assignSuitsFromPrevJC(prevHolderOfJC, [...players]);
    }
    dealIndex += 1;
    logEvent({
      type: "deal_end",
      at: Date.now(),
      deal: dealIndex,
      pointsA,
      pointsB,
      eyesA: state.score.gameEyesA,
      eyesB: state.score.gameEyesB,
      eyesDelta: 0,
      reasons: ["eggs 60:60 -> next deal = 4 eyes"],
      eggsCarry: state.eggsCarry,
    });
    scheduleNextDeal();
    return;
  }

  let eyes = 0;
  const reasons: string[] = [];
  if (state.eggsCarry > 0) {
    eyes = 4;
    reasons.push("eggs carry -> 4 eyes");
  } else {
    if (winnerPoints === 120) {
      eyes = 6;
      reasons.push("golyy 120 -> 6 eyes");
    } else if (winnerPoints >= 61) {
      eyes = 1;
      reasons.push("win -> 1 eye");

      const saved = loserPoints >= 30;
      if (!saved) {
        eyes += 1;
        reasons.push("spas failed (<30) -> +1");
      }

      const jcTeam =
        currentHolderOfJC && teams.A.includes(currentHolderOfJC) ? "A" : "B";
      if (jcTeam !== winnerTeam) {
        eyes += 1;
        reasons.push("foreign trump -> +1");
      }
    }
  }

  const nextScore =
    winnerTeam === "A"
      ? { gameEyesA: state.score.gameEyesA + eyes, gameEyesB: state.score.gameEyesB }
      : { gameEyesA: state.score.gameEyesA, gameEyesB: state.score.gameEyesB + eyes };

  state = { ...state, score: nextScore, eggsCarry: 0 };
  render();

  lastDealLeader = state.history[state.history.length - 1]?.winner ?? null;
  prevHolderOfJC = currentHolderOfJC;
  if (!suitAssignment && prevHolderOfJC) {
    suitAssignment = assignSuitsFromPrevJC(prevHolderOfJC, [...players]);
  }
  dealIndex += 1;
  logEvent({
    type: "deal_end",
    at: Date.now(),
    deal: dealIndex,
    pointsA,
    pointsB,
    eyesA: state.score.gameEyesA,
    eyesB: state.score.gameEyesB,
    eyesDelta: eyes,
    reasons,
    eggsCarry: state.eggsCarry,
  });

  if (state.score.gameEyesA >= 12 || state.score.gameEyesB >= 12) {
    matchOver = true;
    const winner = state.score.gameEyesA >= 12 ? "A" : "B";
    showBanner(`Победила команда ${winner}.`);
    logEvent({
      type: "match_end",
      at: Date.now(),
      winner,
      score: { A: state.score.gameEyesA, B: state.score.gameEyesB },
    });
    render();
    return;
  }

  // showBanner("Раздача закончена: следующая начнется через 4 сек.");
  showBanner(`Раздача: ${dealScoreText}.`);
  scheduleNextDeal();
}

function updateShownTrick() {
  if (!state) return;
  if (state.trick.length > 0) {
    shownTrick = state.trick;
    render();
    return;
  }

  const last = state.history[state.history.length - 1]?.trick ?? [];
  if (last.length > 0) {
    shownTrick = last;
    const lastWinner = state.history[state.history.length - 1]?.winner;
    if (lastWinner) {
      const pts = last.reduce((sum: number, t: { card: Card }) => sum + cardPoints(t.card), 0);
      logEvent({
        type: "trick_end",
        at: Date.now(),
        deal: dealIndex + 1,
        trickIndex: currentTrickIndex,
        winner: lastWinner,
        points: pts,
      });
      currentTrickIndex += 1;
    }
    render();
    pendingFinalize = true;
    holdTrickThenContinue();
  }
}

function holdTrickThenContinue() {
  trickHold = true;
  if (holdTimer !== null) window.clearTimeout(holdTimer);
  holdTimer = window.setTimeout(() => {
    trickHold = false;
    shownTrick = [];
    render();
    if (pendingFinalize) finalizeDealIfEnded();
    pendingFinalize = false;
    maybeAdvanceBots();
  }, getTrickHoldMs());
}

function scheduleBotMove() {
  if (botTimer !== null) return;
  botTimer = window.setTimeout(() => {
    botTimer = null;
    if (!state || trickHold) return;
    try {
      botStep();
      render();
      maybeAdvanceBots();
    } catch (err) {
      handleBotError(err, "schedule");
    }
  }, getBotDelayMs());
}

function clearTimers() {
  if (botTimer !== null) window.clearTimeout(botTimer);
  if (holdTimer !== null) window.clearTimeout(holdTimer);
  if (runTimer !== null) window.clearTimeout(runTimer);
  botTimer = null;
  holdTimer = null;
  runTimer = null;
}

function renderDebug() {
  if (!debugEl || !state) return;
  debugEl.textContent =
    `leader=${playerName(state.leader)} ` +
    `trickHold=${trickHold} ` +
    `hands=${state.hands.P0.length}/${state.hands.P1.length}/` +
    `${state.hands.P2.length}/${state.hands.P3.length} ` +
    `botTimer=${botTimer !== null} ` +
    `runTimer=${runTimer !== null} ` +
    `matchOver=${matchOver} ` +
    `sim=${simulationMode}`;
}

function runBots() {
  if (!state || matchOver) return;
  if (trickHold && shownTrick.length === 0 && state.trick.length === 0) {
    trickHold = false;
  }
  if (trickHold) return;
  skipEmptyLeader();
  if (state.leader === "P0" && !simulationMode) return;
  if (state.hands[state.leader].length === 0) return;
  if (runTimer !== null) return;
  runTimer = window.setTimeout(() => {
    runTimer = null;
    if (!state || trickHold || matchOver) return;
    try {
      botStep();
      render();
      runBots();
    } catch (err) {
      handleBotError(err, "loop");
    }
  }, getBotDelayMs());
}

function scheduleNextDeal() {
  if (matchOver) return;
  window.setTimeout(() => {
    startNewDeal();
    advanceBotsToPlayer();
  }, getNextDealDelayMs());
}

function skipEmptyLeader() {
  if (!state) return;
  // If current leader has no cards but others do, advance to next player with cards.
  let safety = 0;
  while (state.hands[state.leader].length === 0 && safety < players.length) {
    const idx = players.indexOf(state.leader);
    const next = players[(idx - 1 + players.length) % players.length];
    state = { ...state, leader: next };
    safety += 1;
  }
}

function showBanner(text: string) {
  if (!bannerEl) return;
  delete bannerEl.dataset.kind;
  bannerEl.textContent = text;
  bannerEl.classList.remove("trump-hint");
  bannerEl.classList.add("active");
  if (matchOver && restartBtn) {
    restartBtn.classList.add("show");
  }
}

function logEvent(evt: LogEvent) {
  if (matchLog.length === 0) {
    matchLog.push({
      type: "match_start",
      at: Date.now(),
      ruleset: "belka-karaganda",
    });
  }
  matchLog.push(evt);
}

function downloadLogData(events: LogEvent[], filenamePrefix: string) {
  const lines = events.map(e => JSON.stringify(e)).join("\n");
  const blob = new Blob([lines], { type: "application/jsonl" });
  const url = URL.createObjectURL(blob);
  const filename = `${filenamePrefix}-${Date.now()}.jsonl`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();

  if (bannerEl) {
    bannerEl.textContent = "";
    bannerEl.classList.add("active");
    const text = document.createElement("span");
    text.textContent = "Лог готов. Если загрузка не началась, нажми: ";
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.textContent = "Скачать лог";
    link.style.color = "inherit";
    link.style.textDecoration = "underline";
    bannerEl.append(text, link);
  }

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30_000);
}

function downloadLog() {
  downloadLogData(matchLog, "belka-log");
}

function simulateFastMatches(matchCount: number): LogEvent[] {
  const log: LogEvent[] = [];
  let ts = Date.now();
  const tick = () => {
    ts += 1;
    return ts;
  };

  for (let match = 1; match <= matchCount; match += 1) {
    log.push({
      type: "match_start",
      at: tick(),
      ruleset: "belka-karaganda",
      match,
    });

    let dealIndex = 0;
    let prevHolderOfJC: PlayerId | null = null;
    let currentHolderOfJC: PlayerId | null = null;
    let suitAssignment: Record<PlayerId, "C" | "S" | "H" | "D"> | null = null;
    let lastDealLeader: PlayerId | null = null;
    let score = { gameEyesA: 0, gameEyesB: 0 };
    let eggsCarry = 0;

    while (score.gameEyesA < 12 && score.gameEyesB < 12) {
      const trumpSuitOverride = dealIndex === 0 ? "C" : undefined;
      let dealState = startDeal({
        ruleset: defaultRuleset,
        playersInOrder: [...players],
        teams,
        dealer: "P3",
        dealIndex,
        prevHolderOfJC,
        trumpSuitOverride,
      });

      currentHolderOfJC = findHolderOfCard(dealState.hands, "JC");
      if (dealIndex > 0 && suitAssignment && currentHolderOfJC) {
        dealState = { ...dealState, trump: { ...dealState.trump, suit: suitAssignment[currentHolderOfJC] } };
      }

      let leader: PlayerId;
      if (dealIndex === 0) {
        leader = players[Math.floor(Math.random() * players.length)];
      } else if (lastDealLeader) {
        leader = lastDealLeader;
      } else {
        leader = dealState.leader;
      }

      dealState = { ...dealState, leader, score, eggsCarry };
      log.push({
        type: "deal_start",
        at: tick(),
        deal: dealIndex + 1,
        dealer: "P3",
        leader,
        trump: dealState.trump.suit,
        trumpOwner: currentHolderOfJC,
        hands: dealState.hands,
        match,
      });

      let state = dealState;
      let trickIndex = 0;
      while (players.some(p => state.hands[p].length > 0)) {
        const player = state.leader;
        const legal = legalMoves(state.hands[player], state.trick, state.trump.suit, state.ruleset);
        if (legal.length === 0) {
          throw new Error(`No legal moves for ${player}`);
        }
        let card = selectBotMove(state, player);
        if (!legal.includes(card)) {
          card = legal[0];
        }
        const result = applyMove(state, player, card);
        log.push({
          type: "play",
          at: tick(),
          deal: dealIndex + 1,
          trickIndex,
          player,
          card,
          match,
        });
        state = result.state;
        if (result.trickCompleted && result.winner) {
          const lastTrick = state.history[state.history.length - 1];
          const pts = lastTrick.trick.reduce((sum: number, t: { card: Card }) => sum + cardPoints(t.card), 0);
          log.push({
            type: "trick_end",
            at: tick(),
            deal: dealIndex + 1,
            trickIndex,
            winner: lastTrick.winner,
            points: pts,
            match,
          });
          trickIndex += 1;
        }
      }

      const pointsA = state.dealPoints.A;
      const pointsB = state.dealPoints.B;
      const winnerTeam = pointsA > pointsB ? "A" : "B";
      const winnerPoints = Math.max(pointsA, pointsB);
      const loserPoints = Math.min(pointsA, pointsB);

      if (pointsA === 60 && pointsB === 60) {
        eggsCarry = 4;
        lastDealLeader = state.history[state.history.length - 1]?.winner ?? null;
        prevHolderOfJC = currentHolderOfJC;
        if (!suitAssignment && prevHolderOfJC) {
          suitAssignment = assignSuitsFromPrevJC(prevHolderOfJC, [...players]);
        }
        dealIndex += 1;
        log.push({
          type: "deal_end",
          at: tick(),
          deal: dealIndex,
          pointsA,
          pointsB,
          eyesA: score.gameEyesA,
          eyesB: score.gameEyesB,
          eyesDelta: 0,
          reasons: ["eggs 60:60 -> next deal = 4 eyes"],
          eggsCarry,
          match,
        });
        continue;
      }

      let eyes = 0;
      const reasons: string[] = [];
      if (eggsCarry > 0) {
        eyes = 4;
        reasons.push("eggs carry -> 4 eyes");
      } else {
        if (winnerPoints === 120) {
          eyes = 6;
          reasons.push("golyy 120 -> 6 eyes");
        } else if (winnerPoints >= 61) {
          eyes = 1;
          reasons.push("win -> 1 eye");

          const saved = loserPoints >= 30;
          if (!saved) {
            eyes += 1;
            reasons.push("spas failed (<30) -> +1");
          }

          const jcTeam =
            currentHolderOfJC && teams.A.includes(currentHolderOfJC) ? "A" : "B";
          if (jcTeam !== winnerTeam) {
            eyes += 1;
            reasons.push("foreign trump -> +1");
          }
        }
      }

      score =
        winnerTeam === "A"
          ? { gameEyesA: score.gameEyesA + eyes, gameEyesB: score.gameEyesB }
          : { gameEyesA: score.gameEyesA, gameEyesB: score.gameEyesB + eyes };
      eggsCarry = 0;

      lastDealLeader = state.history[state.history.length - 1]?.winner ?? null;
      prevHolderOfJC = currentHolderOfJC;
      if (!suitAssignment && prevHolderOfJC) {
        suitAssignment = assignSuitsFromPrevJC(prevHolderOfJC, [...players]);
      }
      dealIndex += 1;
      log.push({
        type: "deal_end",
        at: tick(),
        deal: dealIndex,
        pointsA,
        pointsB,
        eyesA: score.gameEyesA,
        eyesB: score.gameEyesB,
        eyesDelta: eyes,
        reasons,
        eggsCarry,
        match,
      });

      if (score.gameEyesA >= 12 || score.gameEyesB >= 12) {
        const winner = score.gameEyesA >= 12 ? "A" : "B";
        log.push({
          type: "match_end",
          at: tick(),
          winner,
          score: { A: score.gameEyesA, B: score.gameEyesB },
          match,
        });
      }
    }
  }

  return log;
}
if (downloadLogBtn) {
  downloadLogBtn.addEventListener("click", () => {
    downloadLog();
  });
}

if (fastSimBtn) {
  fastSimBtn.addEventListener("click", () => {
    const label = fastSimBtn.textContent ?? "Быстрая симуляция x10";
    fastSimBtn.disabled = true;
    fastSimBtn.textContent = "Быстрая симуляция…";
    try {
      const fastLog = simulateFastMatches(10);
      downloadLogData(fastLog, "belka-fast-10");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (bannerEl) {
        bannerEl.textContent = `Ошибка быстрой симуляции: ${message}`;
        bannerEl.classList.add("active");
      }
      console.error(err);
    } finally {
      fastSimBtn.disabled = false;
      fastSimBtn.textContent = label;
    }
  });
}

if (simulationToggleBtn) {
  simulationToggleBtn.addEventListener("click", () => {
    simulationMode = !simulationMode;
    if (runTimer !== null) {
      window.clearTimeout(runTimer);
      runTimer = null;
    }
    if (botTimer !== null) {
      window.clearTimeout(botTimer);
      botTimer = null;
    }
    render();
    runBots();
  });
}

if (restartBtn) {
  restartBtn.addEventListener("click", () => {
    matchOver = false;
    pendingFinalize = false;
    dealIndex = 0;
    prevHolderOfJC = null;
    currentHolderOfJC = null;
    suitAssignment = null;
    lastDealLeader = null;
    matchLog = [];
    currentTrickIndex = 0;
    if (bannerEl) {
      bannerEl.textContent = "";
      bannerEl.classList.remove("active");
    }
    restartBtn.classList.remove("show");
    startNewDeal();
    runBots();
  });
}

startNewDeal();
advanceBotsToPlayer();
function canUseEyesCounterAsset(eyes: number, color: "black" | "red"): boolean {
  return eyes >= 1 && eyes <= 11;
}
