import {
  applyDurakAction,
  canBeatDurakCard,
  createDurakGame,
  durakCardRank,
  durakCardSuit,
  tableRanks,
  type DurakAction,
  type DurakCard,
  type DurakGameState,
} from "@engine/index";
import { mountAuthBadge } from "./auth-badge";
import {
  centeredIn,
  flightsEnabled,
  flyGhost,
  flyGhostToElement,
  rectOf,
  type FlightRect,
} from "./card-flight";

mountAuthBadge({ mode: "inline", beforeSelector: "#newGameBtn", containerSelector: ".setup" });

const HUMAN_ID = "P0";
const BOT_DELAY_MS = 650;
const PAGE_BASE_URL = new URL(".", window.location.href);

const opponentsEl = document.querySelector("#opponents") as HTMLElement;
const trumpInfoEl = document.querySelector("#trumpInfo") as HTMLElement;
const statusLineEl = document.querySelector("#statusLine") as HTMLElement;
const winnerBannerEl = document.querySelector("#winnerBanner") as HTMLElement;
const centerCardsEl = document.querySelector("#centerCards") as HTMLElement;
const humanPanelEl = document.querySelector("#humanPanel") as HTMLElement;
const humanMetaEl = document.querySelector("#humanMeta") as HTMLElement;
const selectedInfoEl = document.querySelector("#selectedInfo") as HTMLElement;
const handEl = document.querySelector("#hand") as HTMLElement;
const logEl = document.querySelector("#log") as HTMLElement;
const playerCountEl = document.querySelector("#playerCount") as HTMLSelectElement;
const newGameBtn = document.querySelector("#newGameBtn") as HTMLButtonElement;
const attackBtn = document.querySelector("#attackBtn") as HTMLButtonElement;
const defendBtn = document.querySelector("#defendBtn") as HTMLButtonElement;
const takeBtn = document.querySelector("#takeBtn") as HTMLButtonElement;
const passBtn = document.querySelector("#passBtn") as HTMLButtonElement;

let game = createGame(4);
let selectedCards: DurakCard[] = [];
let selectedAttackIndex: number | null = null;
let botTimer: number | null = null;
let botScheduling = false;
let lastLogLine = "";
const resolvedCardImageSrc = new Map<string, string | null>();

function playerById(playerId: string) {
  return game.players.find(player => player.id === playerId) ?? null;
}

function createGame(count: number): DurakGameState {
  const playerIds = Array.from({ length: count }, (_, index) => `P${index}`);
  return createDurakGame({
    playerIds,
    firstRoundMaxCards: 5,
  });
}

function playerLabel(playerId: string): string {
  const idx = Number(playerId.slice(1)) + 1;
  return `Игрок ${idx}`;
}

function playerLabelDative(playerId: string): string {
  if (playerId === HUMAN_ID) return "вам";
  const idx = Number(playerId.slice(1)) + 1;
  return `Игроку ${idx}`;
}

function seatLayout(count: number): string[] {
  if (count <= 1) return ["seat-top"];
  if (count === 2) return ["seat-left", "seat-right"];
  return ["seat-left", "seat-top", "seat-right"];
}

function currentPlayerId(): string | null {
  return game.turnPlayerId;
}

function currentAttackerId(): string | null {
  return game.players[game.currentAttackerIndex]?.id ?? null;
}

function currentDefenderId(): string | null {
  return game.players[game.currentDefenderIndex]?.id ?? null;
}

function humanPlayer() {
  return playerById(HUMAN_ID);
}

function humanTurn(): boolean {
  return !game.finished && currentPlayerId() === HUMAN_ID && !!humanPlayer()?.isActive;
}

function humanIsDefender(): boolean {
  return currentDefenderId() === HUMAN_ID;
}

function unresolvedAttackIndices(): number[] {
  const out: number[] = [];
  game.table.pairs.forEach((pair, index) => {
    if (!pair.defense) out.push(index);
  });
  return out;
}

function canPlayerThrowCards(playerId: string): boolean {
  if (!["throw-in", "take"].includes(game.phase)) return false;
  const player = playerById(playerId);
  if (!player?.isActive) return false;
  if (game.table.pairs.length >= game.table.maxCards) return false;
  if (game.table.pairs.length >= game.table.defenderCardLimit) return false;
  const ranks = new Set(tableRanks(game.table.pairs));
  return player.hand.some(card => ranks.has(durakCardRank(card)));
}

function suitSymbol(card: DurakCard): string {
  const suit = durakCardSuit(card);
  if (suit === "C") return "♣";
  if (suit === "S") return "♠";
  if (suit === "H") return "♥";
  return "♦";
}

function rankText(card: DurakCard): string {
  return durakCardRank(card);
}

function isRed(card: DurakCard): boolean {
  return card.endsWith("H") || card.endsWith("D");
}

function rankValue(card: DurakCard): number {
  const order = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  return order.indexOf(durakCardRank(card));
}

function sortHandForHuman(hand: DurakCard[]): DurakCard[] {
  const suitOrder: Record<string, number> = { C: 0, D: 1, H: 2, S: 3 };
  return [...hand].sort((a, b) => {
    const aTrump = durakCardSuit(a) === game.trumpSuit ? 1 : 0;
    const bTrump = durakCardSuit(b) === game.trumpSuit ? 1 : 0;
    if (aTrump !== bTrump) return aTrump - bTrump;
    const suitDiff = suitOrder[durakCardSuit(a)] - suitOrder[durakCardSuit(b)];
    if (suitDiff !== 0) return suitDiff;
    return rankValue(a) - rankValue(b);
  });
}

function verboseCardAssetName(code: string): string | null {
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

function cardAssetCandidates(code: string): string[] {
  const verbose = verboseCardAssetName(code);
  if (!verbose) return [];
  const root = new URL("cards", PAGE_BASE_URL).toString().replace(/\/$/, "");
  const version = "cards-v2";
  return [`${root}/${verbose}.svg?v=${version}`, `${root}/${verbose}.png?v=${version}`];
}

function attachCardImage(el: HTMLElement, code: string, alt: string): void {
  const resolved = resolvedCardImageSrc.get(code);
  if (resolved === null) return;
  const img = document.createElement("img");
  img.className = "card-img";
  img.alt = alt;
  img.loading = "eager";
  img.decoding = "sync";
  img.draggable = false;
  const candidates = cardAssetCandidates(code);
  let idx = 0;
  const tryNext = (): void => {
    if (idx >= candidates.length) return;
    img.src = candidates[idx];
    idx += 1;
  };
  img.addEventListener("load", () => {
    el.classList.add("has-image");
    resolvedCardImageSrc.set(code, img.currentSrc || img.src);
  });
  img.addEventListener("error", () => {
    if (idx < candidates.length) {
      tryNext();
      return;
    }
    resolvedCardImageSrc.set(code, null);
    el.classList.remove("has-image");
    img.remove();
  });
  el.append(img);
  if (typeof resolved === "string") {
    el.classList.add("has-image");
    img.src = resolved;
  } else {
    tryNext();
  }
}

function renderFaceCard(card: DurakCard, small = false): HTMLElement {
  const el = document.createElement("div");
  el.className = `card${small ? " small" : ""}${isRed(card) ? " red" : ""}`;
  attachCardImage(el, card, `Карта ${card}`);
  const fallback = document.createElement("div");
  fallback.className = "card-fallback";
  const rank = document.createElement("div");
  rank.className = "rank";
  rank.textContent = rankText(card);
  const suit = document.createElement("div");
  suit.className = "suit";
  suit.textContent = suitSymbol(card);
  fallback.append(rank, suit);
  el.append(fallback);
  return el;
}

function renderBackCard(): HTMLElement {
  const el = document.createElement("div");
  el.className = "card small back";
  attachCardImage(el, "BACK", "Рубашка карты");
  return el;
}

// --- Анимация полёта карт -------------------------------------------------

type FlightContext = {
  action: DurakAction;
  prevRound: number;
  prevPairsCount: number;
  prevDiscardCount: number;
  prevDefenderId: string | null;
  cardRects: Map<DurakCard, FlightRect>;
  tableCards: { card: DurakCard; rect: FlightRect }[];
  sourceRect: FlightRect | null;
};

let pendingFlight: FlightContext | null = null;

function captureFlightContext(action: DurakAction): FlightContext {
  const cardRects = new Map<DurakCard, FlightRect>();
  if (action.playerId === HUMAN_ID && (action.type === "attack" || action.type === "defend")) {
    handEl.querySelectorAll<HTMLElement>(".card-btn").forEach(btn => {
      const code = btn.dataset.card as DurakCard | undefined;
      if (code) cardRects.set(code, rectOf(btn));
    });
  }

  const tableCards: { card: DurakCard; rect: FlightRect }[] = [];
  centerCardsEl.querySelectorAll<HTMLElement>(".table-pair .card").forEach(el => {
    const code = el.dataset.card as DurakCard | undefined;
    if (code) tableCards.push({ card: code, rect: rectOf(el) });
  });

  let sourceRect: FlightRect | null = null;
  if (action.playerId === HUMAN_ID) {
    sourceRect = rectOf(handEl);
  } else {
    const opp = opponentsEl.querySelector<HTMLElement>(`[data-player-id="${action.playerId}"]`);
    if (opp) sourceRect = rectOf(opp);
  }

  return {
    action,
    prevRound: game.roundNumber,
    prevPairsCount: game.table.pairs.length,
    prevDiscardCount: game.discardPile.length,
    prevDefenderId: currentDefenderId(),
    cardRects,
    tableCards,
    sourceRect,
  };
}

function runFlights(): void {
  const ctx = pendingFlight;
  pendingFlight = null;
  if (!ctx || !flightsEnabled()) return;

  const roundEnded =
    game.roundNumber !== ctx.prevRound ||
    (game.finished && game.table.pairs.length === 0 && ctx.tableCards.length > 0);

  if (roundEnded) {
    // Собираем всё, что было на столе, плюс карты самого действия.
    const swept: { card: DurakCard; rect: FlightRect }[] = [...ctx.tableCards];
    if (ctx.action.type === "attack") {
      ctx.action.cards.forEach(card => {
        const rect = ctx.cardRects.get(card) ?? ctx.sourceRect;
        if (rect) swept.push({ card, rect });
      });
    } else if (ctx.action.type === "defend") {
      const rect = ctx.cardRects.get(ctx.action.card) ?? ctx.sourceRect;
      if (rect) swept.push({ card: ctx.action.card, rect });
    }
    if (swept.length === 0) return;

    const defenderTook = game.discardPile.length === ctx.prevDiscardCount;
    if (defenderTook && ctx.prevDefenderId) {
      // Карты уходят в руку взявшего.
      const takerIsHuman = ctx.prevDefenderId === HUMAN_ID;
      const destZone = takerIsHuman
        ? rectOf(handEl)
        : (() => {
            const opp = opponentsEl.querySelector<HTMLElement>(
              `[data-player-id="${ctx.prevDefenderId}"]`
            );
            return opp ? rectOf(opp) : null;
          })();
      if (!destZone) return;
      swept.forEach((item, index) => {
        let onDone: (() => void) | undefined;
        if (takerIsHuman) {
          const btn = handEl.querySelector<HTMLElement>(`.card-btn[data-card="${item.card}"]`);
          if (btn) {
            btn.style.visibility = "hidden";
            onDone = () => {
              btn.style.visibility = "";
            };
          }
        }
        flyGhost({
          ghost: renderFaceCard(item.card),
          from: item.rect,
          to: centeredIn(destZone, item.rect),
          delay: index * 50,
          fade: !takerIsHuman,
          onDone,
        });
      });
    } else {
      // Бито: карты улетают к колоде/козырю и растворяются.
      const destZone = rectOf(trumpInfoEl);
      swept.forEach((item, index) => {
        flyGhost({
          ghost: renderFaceCard(item.card),
          from: item.rect,
          to: centeredIn(destZone, item.rect),
          delay: index * 50,
          fade: true,
        });
      });
    }
    return;
  }

  // Раунд продолжается: атака/подкид или отбой летят на свои места на столе.
  const pairEls = centerCardsEl.querySelectorAll<HTMLElement>(".table-pair");
  if (ctx.action.type === "attack") {
    ctx.action.cards.forEach((card, index) => {
      const pairEl = pairEls[ctx.prevPairsCount + index];
      const destEl = pairEl?.querySelector<HTMLElement>(".attack-card");
      const from = ctx.cardRects.get(card) ?? ctx.sourceRect;
      if (destEl && from) flyGhostToElement(renderFaceCard(card), from, destEl, index * 70);
    });
  } else if (ctx.action.type === "defend") {
    const pairEl = pairEls[ctx.action.attackIndex];
    const destEl = pairEl?.querySelector<HTMLElement>(".defense-card");
    const from = ctx.cardRects.get(ctx.action.card) ?? ctx.sourceRect;
    if (destEl && from) flyGhostToElement(renderFaceCard(ctx.action.card), from, destEl, 0);
  }
}

// ---------------------------------------------------------------------------

function setLog(message: string): void {
  if (message === lastLogLine) return;
  lastLogLine = message;
  logEl.textContent = message;
}

function clearLog(): void {
  lastLogLine = "";
  logEl.textContent = "";
}

function sanitizeSelection(): void {
  const hand = humanPlayer()?.hand ?? [];
  selectedCards = selectedCards.filter(card => hand.includes(card));

  if (!humanTurn()) {
    selectedAttackIndex = null;
    return;
  }

  if (!humanIsDefender() || game.phase !== "defense") {
    selectedAttackIndex = null;
    return;
  }

  const unresolved = unresolvedAttackIndices();
  if (selectedAttackIndex !== null && !unresolved.includes(selectedAttackIndex)) {
    selectedAttackIndex = null;
  }
  if (selectedAttackIndex === null && unresolved.length === 1) {
    selectedAttackIndex = unresolved[0];
  }
}

function roleText(playerId: string): string {
  const player = playerById(playerId);
  if (!player?.isActive) return "вне игры";
  const defender = currentDefenderId();
  const target = defender ? playerLabelDative(defender) : "";
  if (playerId === defender) {
    return game.phase === "take" ? "берёт карты" : "защищается";
  }
  if (playerId === currentAttackerId()) {
    return game.phase === "throw-in" || game.phase === "take"
      ? `подкидывает ${target}`
      : `ходит под ${target}`;
  }
  if (
    playerId === currentPlayerId() &&
    (game.phase === "throw-in" || game.phase === "take")
  ) {
    return `подкидывает ${target}`;
  }
  return "ждёт";
}

function playerSpeech(playerId: string): string | null {
  const player = playerById(playerId);
  if (!player) return null;

  if (game.finished) {
    if (playerId === game.loserId) return "Я проиграл";
    return player.isActive ? "Я выиграл" : "Я вышел";
  }

  if (!player.isActive) return "Я вышел";
  if (playerId !== currentPlayerId()) return null;

  if (game.phase === "defense" && playerId === currentDefenderId()) return "Я кроюсь";
  if (game.phase === "attack") return "Я хожу";
  if (game.phase === "throw-in" || game.phase === "take") return "Я подкидываю";
  return null;
}

function humanPrompt(): string {
  const human = humanPlayer();
  if (!human?.isActive) return "Вы уже вышли из партии.";

  if (game.finished) {
    return game.loserId === HUMAN_ID
      ? "Партия закончилась. Вы остались с картами."
      : "Партия закончилась.";
  }

  const defender = currentDefenderId();
  const defenderDat = defender ? playerLabelDative(defender) : "";

  if (!humanTurn()) {
    const turn = currentPlayerId();
    if (!turn) return "Ожидание следующего хода.";
    if (game.phase === "defense") {
      return defender === HUMAN_ID
        ? "Сейчас ваша защита."
        : `${playerLabel(turn)} кроется.`;
    }
    if (game.phase === "attack") return `${playerLabel(turn)} ходит под ${defenderDat}.`;
    if (game.phase === "take") {
      return `${playerLabel(turn)} решает, докинуть ли ${defenderDat}.`;
    }
    return `${playerLabel(turn)} решает, подкинуть ли ${defenderDat}.`;
  }

  if (humanIsDefender() && game.phase === "defense") {
    if (selectedCards.length === 0) {
      return "Вам крыться: выберите карту в руке — или нажмите «Беру».";
    }
    return resolveDefenseTarget(selectedCards[0]) === null
      ? "Выберите карту на столе, которую хотите побить."
      : "Карта подходит. Можно крыть.";
  }

  if (game.phase === "attack" && game.table.pairs.length === 0) {
    return `Ваш ход: атакуйте ${defenderDat} любой картой (несколько — только одного достоинства).`;
  }

  if (game.phase === "take") {
    return `${defender ? playerLabel(defender) : "Соперник"} берёт. Можно докинуть карты тех же достоинств — или «Пусть берёт».`;
  }

  if (game.phase === "throw-in") {
    return `Можно подкинуть ${defenderDat} карты тех же достоинств, что на столе, — или нажмите «Бито».`;
  }

  return selectedCards.length > 0 ? `Выбрано карт: ${selectedCards.length}.` : "Ваш ход.";
}

function renderOpponents(): void {
  opponentsEl.innerHTML = "";
  const turn = currentPlayerId();
  const opponents = game.players.filter(player => player.id !== HUMAN_ID);
  const seats = seatLayout(opponents.length);

  opponents.forEach((player, index) => {
      const wrap = document.createElement("div");
      const seat = seats[index] ?? "seat-top";
      wrap.className = `opp ${seat}${turn === player.id ? " active" : ""}${player.id === currentAttackerId() ? " attacker" : ""}${player.id === currentDefenderId() ? " defender" : ""}${!player.isActive ? " out" : ""}`;
      wrap.dataset.playerId = player.id;

      const speech = playerSpeech(player.id);
      if (speech) {
        const bubble = document.createElement("div");
        bubble.className = "opp-bubble";
        bubble.textContent = speech;
        wrap.append(bubble);
      }

      const head = document.createElement("div");
      head.className = "opp-head";
      const avatar = document.createElement("div");
      avatar.className = "opp-avatar";
      avatar.textContent = String(Number(player.id.slice(1)) + 1);
      head.append(avatar);

      const titleWrap = document.createElement("div");
      const title = document.createElement("div");
      title.className = "opp-title";
      title.textContent = playerLabel(player.id);
      const status = document.createElement("div");
      status.className = "opp-status";
      status.textContent = player.isActive ? roleText(player.id) : "вне игры";
      titleWrap.append(title, status);
      head.append(titleWrap);

      const meta = document.createElement("div");
      meta.className = "opp-meta";
      meta.textContent = player.isActive ? `Карт: ${player.hand.length}` : "";

      const backs = document.createElement("div");
      backs.className = "opp-backs";
      const visibleCount = Math.min(player.hand.length, 12);
      for (let i = 0; i < visibleCount; i += 1) {
        backs.append(renderBackCard());
      }

      wrap.append(head, meta, backs);
      opponentsEl.append(wrap);
  });
}

function renderCenter(): void {
  if (game.finished) {
    winnerBannerEl.innerHTML = "";
    const title = document.createElement("div");
    title.className = "winner-title";
    title.textContent = game.loserId ? "Партия завершена" : "Партия завершилась";
    const text = document.createElement("div");
    text.className = "winner-text";
    text.textContent = game.loserId
      ? `${playerLabel(game.loserId)} остался с картами. Он дурак.`
      : "Партия завершилась без дурака.";
    const actions = document.createElement("div");
    actions.className = "winner-actions";
    const restart = document.createElement("button");
    restart.type = "button";
    restart.textContent = "Новая партия";
    restart.addEventListener("click", () => {
      startNewGameFromUI();
    });
    actions.append(restart);
    winnerBannerEl.append(title, text, actions);
    winnerBannerEl.classList.add("show");
  } else {
    winnerBannerEl.innerHTML = "";
    winnerBannerEl.classList.remove("show");
  }

  centerCardsEl.innerHTML = "";
  if (game.table.pairs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "center-empty";
    empty.textContent = "Стол пуст";
    centerCardsEl.append(empty);
    return;
  }

  const unresolved = unresolvedAttackIndices();
  game.table.pairs.forEach((pair, index) => {
    const wrap = document.createElement("div");
    const selectable =
      humanTurn() &&
      humanIsDefender() &&
      game.phase === "defense" &&
      unresolved.includes(index);
    wrap.className = `table-pair${unresolved.includes(index) ? " unresolved" : ""}${selectable ? " selectable" : ""}${selectedAttackIndex === index ? " selected" : ""}`;
    if (selectable) {
      wrap.addEventListener("click", () => {
        selectedAttackIndex = index;
        render();
      });
    }

    const attack = renderFaceCard(pair.attack);
    attack.classList.add("attack-card");
    attack.dataset.card = pair.attack;
    wrap.append(attack);

    if (pair.defense) {
      const defense = renderFaceCard(pair.defense);
      defense.classList.add("defense-card");
      defense.dataset.card = pair.defense;
      wrap.append(defense);
    }

    centerCardsEl.append(wrap);
  });
}

function renderHand(): void {
  const human = humanPlayer();
  handEl.innerHTML = "";
  if (!human) return;
  const hand = sortHandForHuman(human.hand);
  const canClick = humanTurn() && human.isActive;
  const availableWidth = Math.max(320, handEl.clientWidth || handEl.parentElement?.clientWidth || 760);
  const layout = computeHandLayout(hand.length, availableWidth);

  handEl.style.setProperty("--hand-card-w", `${layout.cardWidth}px`);
  handEl.style.setProperty("--hand-card-h", `${Math.round(layout.cardWidth * (108 / 74))}px`);
  handEl.style.setProperty("--hand-overlap", `${layout.overlap}px`);

  hand.forEach(card => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `card-btn${selectedCards.includes(card) ? " sel" : ""}`;
    btn.disabled = !canClick;
    btn.dataset.card = card;
    btn.append(renderFaceCard(card));
    btn.addEventListener("click", () => {
      if (!humanTurn()) return;
      if (humanIsDefender() && game.phase === "defense") {
        selectedCards = selectedCards[0] === card ? [] : [card];
      } else if (selectedCards.includes(card)) {
        selectedCards = selectedCards.filter(item => item !== card);
      } else {
        selectedCards = [...selectedCards, card];
      }
      render();
    });
    handEl.append(btn);
  });
}

function selectionText(): string {
  const human = humanPlayer();
  if (!human?.isActive) return "";
  if (selectedCards.length === 0) {
    return roleText(HUMAN_ID);
  }
  const cardsText = selectedCards.join(", ");
  if (humanIsDefender() && game.phase === "defense") {
    return selectedAttackIndex === null
      ? `Выбрана карта: ${cardsText}`
      : `Выбрана карта: ${cardsText} против позиции ${selectedAttackIndex + 1}`;
  }
  return `Выбрано: ${cardsText}`;
}

function renderTrumpInfo(): void {
  const deckCount = game.deck.length;
  trumpInfoEl.innerHTML = "";

  const cluster = document.createElement("div");
  cluster.className = "deck-cluster";

  const trumpCluster = document.createElement("div");
  trumpCluster.className = "stack-cluster trump";
  const trumpPile = document.createElement("div");
  trumpPile.className = "stack-pile";

  if (deckCount > 0) {
    const trumpCardEl = renderFaceCard(game.trumpCard, true);
    trumpCardEl.classList.add("stack-trump-card");
    trumpPile.append(trumpCardEl);
  } else {
    const trumpSuitEl = document.createElement("div");
    trumpSuitEl.className = "trump-suit-only";
    trumpSuitEl.textContent = suitSymbol(game.trumpCard);
    trumpPile.append(trumpSuitEl);
  }
  trumpCluster.append(trumpPile);
  cluster.append(trumpCluster);

  if (deckCount > 0) {
    const deckCluster = document.createElement("div");
    deckCluster.className = "stack-cluster deck";
    const deckPile = document.createElement("div");
    deckPile.className = "stack-pile";
    const visibleBacks = Math.max(2, Math.min(4, Math.ceil(deckCount / 6)));
    for (let i = 1; i <= visibleBacks; i += 1) {
      const back = renderBackCard();
      back.classList.add(`stack-back-${i}`);
      deckPile.append(back);
    }
    const deckFront = renderBackCard();
    deckPile.append(deckFront);
    const deckCountEl = document.createElement("div");
    deckCountEl.className = "stack-count";
    deckCountEl.textContent = String(deckCount);
    deckCluster.append(deckPile, deckCountEl);
    cluster.append(deckCluster);
  }

  trumpInfoEl.append(cluster);
}

function renderHumanMeta(): void {
  humanPanelEl.className = `player${currentAttackerId() === HUMAN_ID ? " attacker" : ""}${currentDefenderId() === HUMAN_ID ? " defender" : ""}`;
  humanMetaEl.textContent = roleText(HUMAN_ID);
  statusLineEl.textContent = humanPrompt();
  statusLineEl.classList.toggle("your-turn", humanTurn() && !game.finished);
  selectedInfoEl.textContent = selectionText();
}

function canHumanAttackSelection(): boolean {
  if (!humanTurn()) return false;
  if (humanIsDefender() && game.phase === "defense") return false;
  return selectedCards.length > 0;
}

function resolveDefenseTarget(card: DurakCard): number | null {
  const options = unresolvedAttackIndices().filter(index =>
    canBeatDurakCard(card, game.table.pairs[index].attack, game.trumpSuit)
  );
  if (selectedAttackIndex !== null && options.includes(selectedAttackIndex)) {
    return selectedAttackIndex;
  }
  return options.length === 1 ? options[0] : null;
}

function renderButtons(): void {
  const defending = humanTurn() && humanIsDefender() && game.phase === "defense";
  const throwing = humanTurn() && (game.phase === "throw-in" || game.phase === "take" || game.phase === "attack") && !defending;

  attackBtn.textContent =
    game.phase === "throw-in" || game.phase === "take" ? "Подкинуть" : "Хожу";
  defendBtn.textContent = "Крыть";
  takeBtn.textContent = "Беру";
  passBtn.textContent = game.phase === "take" ? "Пусть берёт" : "Бито";

  attackBtn.disabled = !throwing || !canHumanAttackSelection();
  defendBtn.disabled = !defending || selectedCards.length !== 1 || resolveDefenseTarget(selectedCards[0]) === null;
  takeBtn.disabled = !defending;
  passBtn.disabled = !humanTurn() || !["throw-in", "take"].includes(game.phase);

  [attackBtn, defendBtn, takeBtn, passBtn].forEach(btn => {
    btn.classList.remove("is-primary", "is-secondary", "is-danger");
  });
  if (!attackBtn.disabled) attackBtn.classList.add("is-primary");
  if (!defendBtn.disabled) defendBtn.classList.add("is-primary");
  if (!takeBtn.disabled) takeBtn.classList.add("is-primary");
  if (!passBtn.disabled) passBtn.classList.add(game.phase === "take" ? "is-danger" : "is-secondary");
}

function render(): void {
  sanitizeSelection();
  renderOpponents();
  renderCenter();
  renderHand();
  renderHumanMeta();
  renderTrumpInfo();
  renderButtons();
  runFlights();
  if (!game.finished && currentPlayerId() && currentPlayerId() !== HUMAN_ID) {
    // Deferred to break potential recursion from bot turns
    queueMicrotask(() => scheduleBots());
  }
}

function dispatch(action: DurakAction): boolean {
  const flightContext = captureFlightContext(action);
  const result = applyDurakAction(game, action);
  if (!result.ok) {
    setLog(`Ошибка: ${result.error}`);
    return false;
  }
  game = result.state;
  const flightWorthy =
    flightContext.action.type === "attack" ||
    flightContext.action.type === "defend" ||
    game.roundNumber !== flightContext.prevRound ||
    game.finished;
  if (flightWorthy) {
    pendingFlight = flightContext;
  }
  clearLog();
  sanitizeSelection();
  return true;
}

function autoResolvePendingRound(): void {
  let safety = 0;
  while (safety < 8 && ["throw-in", "take"].includes(game.phase)) {
    const turn = currentPlayerId();
    if (!turn || turn === HUMAN_ID) return;
    if (canPlayerThrowCards(turn)) return;
    const advanced = dispatch({ type: "pass", playerId: turn });
    if (!advanced) return;
    safety += 1;
  }
}

function computeHandLayout(cardCount: number, availableWidth: number): { cardWidth: number; overlap: number } {
  if (cardCount <= 1) {
    return { cardWidth: 74, overlap: 0 };
  }

  for (let cardWidth = 74; cardWidth >= 44; cardWidth -= 2) {
    const maxOverlap = Math.floor(cardWidth * 0.62);
    const requiredOverlap = Math.max(10, Math.ceil((cardCount * cardWidth - availableWidth) / (cardCount - 1)));
    if (requiredOverlap <= maxOverlap) {
      return { cardWidth, overlap: requiredOverlap };
    }
  }

  return { cardWidth: 44, overlap: 26 };
}

function lowestCard(cards: DurakCard[]): DurakCard {
  return [...cards].sort((a, b) => {
    const aTrump = durakCardSuit(a) === game.trumpSuit ? 1 : 0;
    const bTrump = durakCardSuit(b) === game.trumpSuit ? 1 : 0;
    if (aTrump !== bTrump) return aTrump - bTrump;
    return rankValue(a) - rankValue(b);
  })[0];
}

function pickBotAttack(playerId: string): DurakCard[] | null {
  const player = game.players.find(item => item.id === playerId);
  if (!player) return null;

  if (game.phase === "attack") {
    const grouped = new Map<string, DurakCard[]>();
    player.hand.forEach(card => {
      const rank = durakCardRank(card);
      if (!grouped.has(rank)) grouped.set(rank, []);
      grouped.get(rank)!.push(card);
    });

    const maxCards = game.table.maxCards;
    const variants = [...grouped.values()]
      .map(cards => sortHandForHuman(cards).slice(0, Math.min(cards.length, maxCards)))
      .sort((a, b) => rankValue(a[0]) - rankValue(b[0]));
    return variants[0] ?? null;
  }

  const allowedRanks = new Set(tableRanks(game.table.pairs));
  const candidates = player.hand.filter(card => allowedRanks.has(durakCardRank(card)));
  if (candidates.length === 0) return null;
  return [lowestCard(candidates)];
}

function pickBotDefense(playerId: string):
  | { type: "defend"; playerId: string; attackIndex: number; card: DurakCard }
  | { type: "take"; playerId: string } {
  const player = game.players.find(item => item.id === playerId);
  if (!player) return { type: "take", playerId };

  const unresolved = unresolvedAttackIndices();
  for (const attackIndex of unresolved) {
    const attackCard = game.table.pairs[attackIndex].attack;
    const beatingCards = player.hand
      .filter(card => canBeatDurakCard(card, attackCard, game.trumpSuit))
      .sort((a, b) => {
        const aTrump = durakCardSuit(a) === game.trumpSuit ? 1 : 0;
        const bTrump = durakCardSuit(b) === game.trumpSuit ? 1 : 0;
        if (aTrump !== bTrump) return aTrump - bTrump;
        return rankValue(a) - rankValue(b);
      });
    if (beatingCards.length === 0) {
      return { type: "take", playerId };
    }
    return { type: "defend", playerId, attackIndex, card: beatingCards[0] };
  }

  return { type: "take", playerId };
}

function performBotTurn(playerId: string): boolean {
  let ok = false;
  if (game.phase === "defense" && playerId === currentDefenderId()) {
    ok = dispatch(pickBotDefense(playerId));
  } else if (game.phase === "throw-in" || game.phase === "take" || game.phase === "attack") {
    const cards = pickBotAttack(playerId);
    ok = cards
      ? dispatch({ type: "attack", playerId, cards })
      : dispatch({ type: "pass", playerId });
  }
  return ok;
}

function scheduleBots(): void {
  if (botScheduling) return;
  botScheduling = true;

  try {
    if (botTimer !== null) {
      window.clearTimeout(botTimer);
      botTimer = null;
    }

    autoResolvePendingRound();
    if (game.finished) return;
    const turn = currentPlayerId();
    if (!turn || turn === HUMAN_ID) return;

    botTimer = window.setTimeout(() => {
      botTimer = null;
      if (game.finished) return;
      const playerId = currentPlayerId();
      if (!playerId || playerId === HUMAN_ID) return;

      const ok = performBotTurn(playerId);
      if (!ok) {
        // If bot action failed (e.g. during throw-in with no valid cards),
        // force a pass to prevent softlock
        if (["throw-in", "take"].includes(game.phase)) {
          dispatch({ type: "pass", playerId });
        }
      }
      autoResolvePendingRound();
      render();
    }, BOT_DELAY_MS);
  } finally {
    botScheduling = false;
  }
}

function startNewGameFromUI(): void {
  if (botTimer !== null) {
    window.clearTimeout(botTimer);
    botTimer = null;
  }
  botScheduling = false;
  const count = Number(playerCountEl.value);
  game = createGame(count);
  selectedCards = [];
  selectedAttackIndex = null;
  clearLog();
  render();
  scheduleBots();
}

newGameBtn.addEventListener("click", () => {
  startNewGameFromUI();
});

attackBtn.addEventListener("click", () => {
  if (!canHumanAttackSelection()) return;
  const ok = dispatch({
    type: "attack",
    playerId: HUMAN_ID,
    cards: [...selectedCards],
  });
  if (!ok) return;
  selectedCards = [];
  selectedAttackIndex = null;
  autoResolvePendingRound();
  render();
  scheduleBots();
});

defendBtn.addEventListener("click", () => {
  if (!humanTurn() || !humanIsDefender() || game.phase !== "defense" || selectedCards.length !== 1) return;
  const target = resolveDefenseTarget(selectedCards[0]);
  if (target === null) {
    setLog("Выберите конкретную карту на столе, которую хотите побить.");
    return;
  }
  const ok = dispatch({
    type: "defend",
    playerId: HUMAN_ID,
    attackIndex: target,
    card: selectedCards[0],
  });
  if (!ok) return;
  selectedCards = [];
  selectedAttackIndex = null;
  autoResolvePendingRound();
  render();
  scheduleBots();
});

takeBtn.addEventListener("click", () => {
  if (!humanTurn() || !humanIsDefender() || game.phase !== "defense") return;
  const ok = dispatch({
    type: "take",
    playerId: HUMAN_ID,
  });
  if (!ok) return;
  selectedCards = [];
  selectedAttackIndex = null;
  autoResolvePendingRound();
  render();
  scheduleBots();
});

passBtn.addEventListener("click", () => {
  if (!humanTurn() || !["throw-in", "take"].includes(game.phase)) return;
  const ok = dispatch({
    type: "pass",
    playerId: HUMAN_ID,
  });
  if (!ok) return;
  selectedCards = [];
  selectedAttackIndex = null;
  autoResolvePendingRound();
  render();
  scheduleBots();
});

render();
scheduleBots();

