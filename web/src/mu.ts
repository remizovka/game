import {
  applyMuGameAction,
  canPlayMuCards,
  createMuGame,
  validateMuCombo,
  type MuCard,
  type MuCombo,
  type MuGameState,
} from "@engine/index";
import { mountAuthBadge } from "./auth-badge";

mountAuthBadge({ mode: "inline", beforeSelector: "#downloadLogBtn", containerSelector: ".setup" });

const HUMAN_ID = "P0";
const BOT_DELAY_MS = 500;

const opponentsEl = document.querySelector("#opponents") as HTMLElement;
const tableComboEl = document.querySelector("#tableCombo") as HTMLElement;
const winnerBannerEl = document.querySelector("#winnerBanner") as HTMLElement;
const centerCardsEl = document.querySelector("#centerCards") as HTMLElement;
const humanMetaEl = document.querySelector("#humanMeta") as HTMLElement;
const humanLastMoveEl = document.querySelector("#humanLastMove") as HTMLElement;
const selectedEl = document.querySelector("#selected") as HTMLElement;
const hintsEl = document.querySelector("#hints") as HTMLElement;
const humanOneCardEl = document.querySelector("#humanOneCard") as HTMLElement;
const handEl = document.querySelector("#hand") as HTMLElement;
const humanPanelEl = document.querySelector("#humanPanel") as HTMLElement;
const logEl = document.querySelector("#log") as HTMLElement;
const playerCountEl = document.querySelector("#playerCount") as HTMLSelectElement;
const newGameBtn = document.querySelector("#newGameBtn") as HTMLButtonElement;
const downloadLogBtn = document.querySelector("#downloadLogBtn") as HTMLButtonElement;
const playBtn = document.querySelector("#playBtn") as HTMLButtonElement;
const passBtn = document.querySelector("#passBtn") as HTMLButtonElement;

type DisplayedTablePlay = { playerId: string; combo: MuCombo; mode: "active" | "closed" } | null;

let dangerScoreByPlayer: Record<string, number> = {};
let game = createGame(4);
let selectedCards: MuCard[] = [];
let botTimer: number | null = null;
let lastLogLine = "";
let matchLog: MuLogEvent[] = [];
let lastActionByPlayer: Record<string, { action: "play" | "pass" | "announce_one_card"; cards: MuCard[]; round: number }> = {};
let lastHandRenderKey = "";
const resolvedCardImageSrc = new Map<string, string | null>();
let displayedTablePlay: DisplayedTablePlay = null;

type MuLogEvent =
  | { type: "match_start"; at: number; players: string[]; dealerId: string }
  | { type: "move"; at: number; actor: string; action: "play" | "pass"; cards: MuCard[]; round: number; turn: string | null }
  | { type: "round_end"; at: number; round: number; winner: string | null; penalties: Record<string, number> }
  | { type: "match_end"; at: number; winner: string | null; penalties: Record<string, number> };

function createGame(count: number): MuGameState {
  const players = Array.from({ length: count }, (_, i) => `P${i}`);
  const created = createMuGame({
    players,
    dealerId: players[players.length - 1],
  });
  dangerScoreByPlayer = {};
  players.forEach(p => {
    dangerScoreByPlayer[p] = 0;
  });
  return created;
}

function playerLabel(playerId: string): string {
  const idx = Number(playerId.slice(1)) + 1;
  return `Игрок ${idx}`;
}

function currentPlayerId(): string | null {
  if (!game.currentRound) return null;
  return game.currentRound.circle.players[game.currentRound.circle.turnIndex];
}

function suitSymbol(card: MuCard): string {
  if (card === "RJ") return "RJ";
  if (card === "BJ") return "BJ";
  const suit = card.slice(card.length - 1);
  if (suit === "C") return "♣";
  if (suit === "S") return "♠";
  if (suit === "H") return "♥";
  return "♦";
}

function rankText(card: MuCard): string {
  if (card === "RJ") return "RJ";
  if (card === "BJ") return "BJ";
  return card.slice(0, card.length - 1);
}

function isRed(card: MuCard): boolean {
  return card.endsWith("H") || card.endsWith("D") || card === "RJ";
}

function cardAssetCandidates(code: string): string[] {
  const verbose = verboseCardAssetName(code);
  const roots = ["/cards", "/assets/cards"];
  const names = [code, ...(verbose ? [verbose] : [])];
  const bases = roots.flatMap(root => names.map(name => `${root}/${name}`));
  const v = "cards-v2";
  return [
    ...bases.map(base => `${base}.svg?v=${v}`),
    ...bases.map(base => `${base}.png?v=${v}`),
    ...bases.map(base => `${base}.webp?v=${v}`),
  ];
}

function verboseCardAssetName(code: string): string | null {
  if (code === "RJ") return "red_joker";
  if (code === "BJ") return "black_joker";
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
    "5": "5",
    "4": "4",
    "3": "3",
    "2": "2",
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
  el.classList.add("has-image");
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
    img.src = resolved;
  } else {
    tryNext();
  }
}

function renderFaceCard(card: MuCard): HTMLElement {
  const el = document.createElement("div");
  el.className = `card${isRed(card) ? " red" : ""}`;
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
  el.className = "card back";
  attachCardImage(el, "BACK", "Рубашка карты");
  return el;
}

function setLog(message: string): void {
  if (!message || message === lastLogLine) return;
  lastLogLine = message;
  logEl.textContent = message;
}

function clearLog(): void {
  lastLogLine = "";
  logEl.textContent = "";
}

function currentPenalties(): Record<string, number> {
  const out: Record<string, number> = {};
  game.playersOrder.forEach(p => {
    out[p] = game.standings[p]?.penalty ?? 0;
  });
  return out;
}

function pushLogEvent(event: MuLogEvent): void {
  matchLog.push(event);
  try {
    localStorage.setItem("mu_last_log_jsonl", matchLog.map(e => JSON.stringify(e)).join("\n"));
  } catch {
    // Ignore storage errors.
  }
}

function downloadMatchLog(): void {
  if (matchLog.length === 0) {
    setLog("Лог пуст: сыграйте хотя бы один ход.");
    return;
  }
  const data = matchLog.map(e => JSON.stringify(e)).join("\n");
  const blob = new Blob([data], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mu-log-${Date.now()}.jsonl`;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  setLog("Лог сохранен в файл.");
}

function renderLastMove(target: HTMLElement, playerId: string): void {
  target.innerHTML = "";
  const last = lastActionByPlayer[playerId];
  if (!last || last.round !== game.roundNumber) {
    target.textContent = "Ход: -";
    return;
  }

  if (last.action === "pass") {
    target.textContent = "Ход: Пас";
    return;
  }

  const label = document.createElement("span");
  label.className = "last-move-label";
  label.textContent = "Ход:";
  target.append(label);

  const cardsWrap = document.createElement("div");
  cardsWrap.className = "last-move-cards";
  last.cards.slice(0, 7).forEach(card => {
    const cardEl = renderFaceCard(card);
    cardEl.classList.add("mini");
    cardsWrap.append(cardEl);
  });
  if (last.cards.length > 7) {
    const more = document.createElement("span");
    more.className = "last-move-more";
    more.textContent = `+${last.cards.length - 7}`;
    cardsWrap.append(more);
  }
  target.append(cardsWrap);
}

function comboText(displayed: DisplayedTablePlay): string {
  const turn = currentPlayerId();
  if (!displayed) {
    return turn ? `Стол пуст. Ходит ${playerLabel(turn)}` : "На столе пусто";
  }
  const suffix = displayed.mode === "closed" ? " · стол забран" : "";
  return `${playerLabel(displayed.playerId)}: ${displayed.combo.kind}${suffix}`;
}

function winnerBannerText(): string {
  const winner = game.overallWinner;
  if (!winner) return "Партия завершена";
  const label = playerLabel(winner);
  const winnerPenalty = game.standings[winner]?.penalty ?? 0;
  const finalists = [...game.activePlayers];
  const finalistText =
    finalists.length === 2
      ? `Финал: ${playerLabel(finalists[0])} (${game.standings[finalists[0]]?.penalty ?? 0}) vs ${playerLabel(finalists[1])} (${game.standings[finalists[1]]?.penalty ?? 0})`
      : "";
  return finalistText
    ? `Победитель: ${label} (штраф ${winnerPenalty}) · ${finalistText}`
    : `Победитель: ${label} (штраф ${winnerPenalty})`;
}

function renderOpponents(): void {
  opponentsEl.innerHTML = "";
  const turn = currentPlayerId();
  const active = new Set(game.activePlayers);
  const tableOwner = game.currentRound?.circle.lastPlay?.playerId ?? null;
  const denseMode = game.playersOrder.length >= 6;
  opponentsEl.classList.toggle("dense", denseMode);

  game.playersOrder
    .filter(p => p !== HUMAN_ID)
    .forEach(player => {
      const wrap = document.createElement("div");
      wrap.className = `opp${turn === player ? " active" : ""}${tableOwner === player ? " on-table" : ""}${!active.has(player) ? " out" : ""}`;

      const title = document.createElement("div");
      title.className = "opp-title";
      title.textContent = playerLabel(player);

      const meta = document.createElement("div");
      meta.className = "opp-meta";
      const handCount = game.currentRound?.hands[player]?.length ?? 0;
      const penalty = game.standings[player]?.penalty ?? 0;
      const eliminated = game.standings[player]?.eliminated ?? false;
      meta.textContent = `Набрано очков: ${penalty}${eliminated ? " | выбыл" : ""}`;
      if (handCount === 1 && !eliminated) {
        const oneCard = document.createElement("span");
        oneCard.className = "one-card-badge show";
        oneCard.textContent = "Одна карта";
        meta.append(" | ", oneCard);
      }

      const backs = document.createElement("div");
      backs.className = "opp-backs";
      const viewCount = Math.min(handCount, denseMode ? 7 : 12);
      for (let i = 0; i < viewCount; i += 1) {
        backs.append(renderBackCard());
      }

      const move = document.createElement("div");
      move.className = "last-move";
      renderLastMove(move, player);

      wrap.append(title, meta, backs, move);
      opponentsEl.append(wrap);
    });
}

function renderTableOwnerHighlight(): void {
  const tableOwner = game.currentRound?.circle.lastPlay?.playerId ?? null;
  humanPanelEl.classList.toggle("on-table", tableOwner === HUMAN_ID);
}

function renderCenter(): void {
  const lastPlay = game.currentRound?.circle.lastPlay;
  const visiblePlay = lastPlay
    ? { playerId: lastPlay.playerId, combo: lastPlay.combo, mode: "active" as const }
    : displayedTablePlay;
  tableComboEl.textContent = comboText(visiblePlay);
  if (game.finished) {
    winnerBannerEl.textContent = winnerBannerText();
    winnerBannerEl.classList.add("show");
  } else {
    winnerBannerEl.textContent = "";
    winnerBannerEl.classList.remove("show");
  }
  centerCardsEl.innerHTML = "";
  centerCardsEl.dataset.state = visiblePlay ? visiblePlay.mode : "empty";

  if (visiblePlay) {
    visiblePlay.combo.cards.forEach(card => {
      centerCardsEl.append(renderFaceCard(card));
    });
  } else {
    const empty = document.createElement("div");
    empty.className = "center-empty";
    empty.textContent = "Ожидаем первый ход";
    centerCardsEl.append(empty);
  }
}

function cardRankValueForSort(card: MuCard): number {
  if (card === "RJ" || card === "BJ") return 100;
  const rank = card.startsWith("10") ? "10" : card.slice(0, 1);
  const order = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  return order.indexOf(rank);
}

function suitSortValue(card: MuCard): number {
  if (card === "RJ") return 0;
  if (card === "BJ") return 1;
  const suit = card.slice(card.length - 1);
  if (suit === "C") return 0;
  if (suit === "S") return 1;
  if (suit === "H") return 2;
  return 3;
}

function sortHandForHuman(hand: MuCard[]): MuCard[] {
  return [...hand].sort((a, b) => {
    const jokerA = a === "RJ" || a === "BJ";
    const jokerB = b === "RJ" || b === "BJ";
    if (jokerA && !jokerB) return -1;
    if (!jokerA && jokerB) return 1;
    if (jokerA && jokerB) {
      if (a === b) return 0;
      return a === "BJ" ? -1 : 1; // black joker left, red joker right
    }
    const rankDiff = cardRankValueForSort(b) - cardRankValueForSort(a);
    if (rankDiff !== 0) return rankDiff;
    return suitSortValue(a) - suitSortValue(b);
  });
}

function buildHandHints(hand: MuCard[]): string {
  const byRank = groupByRank(hand);
  const hints: string[] = [];
  const ranksAsc = [...byRank.keys()].sort((a, b) => rankValue(a) - rankValue(b));

  const quads = [...byRank.values()].filter(cards => cards.length >= 4).length;
  if (quads > 0) hints.push(`Карэ: ${quads}`);

  const triples = [...byRank.values()].filter(cards => cards.length >= 3).length;
  if (triples > 0) hints.push(`Тройники: ${triples}`);

  let hasDoublePairs = false;
  for (let i = 0; i < ranksAsc.length - 1; i += 1) {
    if ((byRank.get(ranksAsc[i])?.length ?? 0) < 2) continue;
    let len = 1;
    for (let j = i + 1; j < ranksAsc.length; j += 1) {
      const sequential = rankValue(ranksAsc[j]) === rankValue(ranksAsc[j - 1]) + 1;
      const hasPair = (byRank.get(ranksAsc[j])?.length ?? 0) >= 2;
      if (!sequential || !hasPair) break;
      len += 1;
      if (len >= 2) {
        hasDoublePairs = true;
        break;
      }
    }
    if (hasDoublePairs) break;
  }
  if (hasDoublePairs) hints.push("Есть спаренные пары");

  let hasStraight = false;
  for (let i = 0; i < ranksAsc.length; i += 1) {
    let len = 1;
    for (let j = i + 1; j < ranksAsc.length; j += 1) {
      if (rankValue(ranksAsc[j]) !== rankValue(ranksAsc[j - 1]) + 1) break;
      len += 1;
      if (len >= 5) {
        hasStraight = true;
        break;
      }
    }
    if (hasStraight) break;
  }
  if (hasStraight) hints.push("Есть стрит");

  return hints.length > 0 ? `Подсказка: ${hints.join(" | ")}` : "Подсказка: -";
}

function renderHand(): void {
  handEl.classList.remove("compact", "tiny", "wide3", "overlap");
  if (!game.currentRound) {
    handEl.innerHTML = "";
    lastHandRenderKey = "";
    hintsEl.textContent = "Подсказка: -";
    return;
  }
  const turn = currentPlayerId();
  const humanTurn = turn === HUMAN_ID;
  const hand = sortHandForHuman(game.currentRound.hands[HUMAN_ID] ?? []);
  const players = game.playersOrder.length;
  let cardWidth = players <= 3 ? 70 : players === 4 ? 66 : players <= 6 ? 62 : 58;
  if (hand.length >= 16) cardWidth -= 6;
  else if (hand.length >= 13) cardWidth -= 4;
  else if (hand.length >= 10) cardWidth -= 2;
  if (players >= 6 && hand.length >= 10) cardWidth -= 2;
  if (players >= 5 && hand.length <= 9) cardWidth += 1;
  cardWidth = Math.max(50, Math.min(74, cardWidth));
  const cardHeight = Math.round(cardWidth * (88 / 60));

  let overlap = 0;
  if (hand.length >= 16) overlap = 14;
  else if (hand.length >= 13) overlap = 12;
  else if (hand.length >= 10) overlap = 10;
  else if (hand.length >= 8) overlap = 6;
  else overlap = 4;
  if (players >= 6) overlap += 2;

  const layoutKey = [
    hand.join(","),
    players,
    cardWidth,
    overlap,
  ].join("|");
  if (layoutKey === lastHandRenderKey) {
    hintsEl.textContent = buildHandHints(hand);
    const buttons = Array.from(handEl.querySelectorAll(".card-btn")) as HTMLButtonElement[];
    if (buttons.length === hand.length) {
      buttons.forEach((btn, idx) => {
        const card = hand[idx];
        btn.disabled = !humanTurn;
        btn.classList.toggle("sel", selectedCards.includes(card));
      });
      return;
    }
  }
  lastHandRenderKey = layoutKey;

  handEl.innerHTML = "";
  handEl.classList.add("overlap");
  handEl.style.setProperty("--hand-card-w", `${cardWidth}px`);
  handEl.style.setProperty("--hand-card-h", `${cardHeight}px`);
  handEl.style.setProperty("--hand-overlap", `${overlap}px`);

  hintsEl.textContent = buildHandHints(hand);

  hand.forEach(card => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `card-btn${selectedCards.includes(card) ? " sel" : ""}`;
    btn.disabled = !humanTurn;
    btn.dataset.card = card;
    btn.append(renderFaceCard(card));
    btn.addEventListener("click", () => {
      if (currentPlayerId() !== HUMAN_ID || game.finished) return;
      if (selectedCards.includes(card)) {
        const idx = selectedCards.indexOf(card);
        selectedCards.splice(idx, 1);
      } else {
        selectedCards.push(card);
      }
      renderHand();
      renderButtons();
    });
    handEl.append(btn);
  });
}

function renderButtons(): void {
  const turn = currentPlayerId();
  const humanTurn = !game.finished && turn === HUMAN_ID;
  const humanCards = game.currentRound?.hands[HUMAN_ID]?.length ?? 0;
  playBtn.disabled = !humanTurn;
  passBtn.disabled = !humanTurn;
  humanPanelEl.classList.toggle("is-active-turn", humanTurn);
  humanPanelEl.classList.toggle("is-waiting-turn", !humanTurn && !game.finished);
  const humanPenalty = game.standings[HUMAN_ID]?.penalty ?? 0;
  const eliminated = game.standings[HUMAN_ID]?.eliminated ?? false;
  humanMetaEl.textContent = `Набрано очков: ${humanPenalty}${eliminated ? " | выбыл" : ""}`;
  renderLastMove(humanLastMoveEl, HUMAN_ID);
  if (humanTurn) {
    selectedEl.textContent =
      selectedCards.length > 0
        ? `Ваш ход. Выбрано: ${selectedCards.join(", ")}`
        : "Ваш ход: выберите карты и нажмите «Ходить»";
  } else if (turn) {
    selectedEl.textContent = `Сейчас ходит ${playerLabel(turn)}`;
  } else {
    selectedEl.textContent = "Ожидаем новый круг";
  }
  if (humanCards === 1 && !game.finished) {
    humanOneCardEl.classList.add("show");
  } else {
    humanOneCardEl.classList.remove("show");
  }
}

function render(): void {
  renderOpponents();
  renderCenter();
  renderHand();
  renderButtons();
  renderTableOwnerHighlight();
}

function dispatch(action: Parameters<typeof applyMuGameAction>[1]): boolean {
  const prevRound = game.roundNumber;
  const prevWinner = game.lastRoundWinner;
  const prevLastPlay = game.currentRound?.circle.lastPlay ?? null;
  const result = applyMuGameAction(game, action);
  if (!result.ok) {
    setLog(`Ошибка: ${result.error}`);
    return false;
  }
  game = result.state;
  const currentLastPlay = game.currentRound?.circle.lastPlay ?? null;
  if (game.roundNumber !== prevRound) {
    displayedTablePlay = null;
  } else if (action.type === "play") {
    if (currentLastPlay && currentLastPlay.playerId === action.playerId) {
      displayedTablePlay = { playerId: currentLastPlay.playerId, combo: currentLastPlay.combo, mode: "active" };
    } else {
      const validated = validateMuCombo(action.cards);
      if (validated.ok) {
        displayedTablePlay = { playerId: action.playerId, combo: validated.combo, mode: "active" };
      }
    }
  } else if (!currentLastPlay && prevLastPlay) {
    displayedTablePlay =
      currentPlayerId() === HUMAN_ID
        ? null
        : { playerId: prevLastPlay.playerId, combo: prevLastPlay.combo, mode: "closed" };
  }
  lastActionByPlayer[action.playerId] = {
    action: action.type,
    cards: action.type === "play" ? [...action.cards] : [],
    round: prevRound,
  };

  if (action.type === "play" && prevLastPlay) {
    const nextCombo = validateMuCombo(action.cards);
    if (nextCombo.ok) {
      const prevCombo = prevLastPlay.combo;
      const overtakeLowSingle =
        prevCombo.kind === "single" &&
        nextCombo.combo.kind === "single" &&
        prevCombo.topRankValue <= rankValue("8") &&
        nextCombo.combo.topRankValue - prevCombo.topRankValue >= 3;
      const interceptOverLow =
        prevCombo.topRankValue <= rankValue("9") &&
        !prevCombo.isIntercept &&
        nextCombo.combo.isIntercept;
      if (overtakeLowSingle || interceptOverLow) {
        dangerScoreByPlayer[action.playerId] = (dangerScoreByPlayer[action.playerId] ?? 0) + 1;
      }
    }
    Object.keys(dangerScoreByPlayer).forEach(p => {
      dangerScoreByPlayer[p] = Math.max(0, (dangerScoreByPlayer[p] ?? 0) - 0.05);
    });
  }

  pushLogEvent({
    type: "move",
    at: Date.now(),
    actor: action.playerId,
    action: action.type === "play" ? "play" : "pass",
    cards: action.type === "play" ? [...action.cards] : [],
    round: prevRound,
    turn: currentPlayerId(),
  });

  if (game.roundNumber !== prevRound || game.lastRoundWinner !== prevWinner) {
    pushLogEvent({
      type: "round_end",
      at: Date.now(),
      round: prevRound,
      winner: game.lastRoundWinner,
      penalties: currentPenalties(),
    });
  }
  if (game.finished) {
    pushLogEvent({
      type: "match_end",
      at: Date.now(),
      winner: game.overallWinner,
      penalties: currentPenalties(),
    });
  }
  return true;
}
function groupByRank(hand: MuCard[]): Map<string, MuCard[]> {
  const map = new Map<string, MuCard[]>();
  hand.forEach(card => {
    if (card === "RJ" || card === "BJ") return;
    const rank = card.startsWith("10") ? "10" : card.slice(0, 1);
    if (!map.has(rank)) map.set(rank, []);
    map.get(rank)!.push(card);
  });
  return map;
}

function rankValue(rank: string): number {
  const order = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  return order.indexOf(rank);
}

function nextPlayer(players: string[], playerId: string): string {
  const idx = players.indexOf(playerId);
  if (idx === -1) return players[0];
  return players[(idx + 1) % players.length];
}

function generateBotCandidates(hand: MuCard[]): MuCard[][] {
  const out: MuCard[][] = [];
  hand.forEach(card => out.push([card]));

  const byRank = groupByRank(hand);
  const ranks = [...byRank.keys()].sort((a, b) => rankValue(a) - rankValue(b));

  ranks.forEach(rank => {
    const cards = byRank.get(rank)!;
    if (cards.length >= 2) out.push(cards.slice(0, 2));
    if (cards.length >= 3) out.push(cards.slice(0, 3));
    if (cards.length >= 4) out.push(cards.slice(0, 4));
  });

  for (let i = 0; i < ranks.length; i += 1) {
    for (let j = i + 1; j < ranks.length; j += 1) {
      const segment = ranks.slice(i, j + 1);
      const sequential = segment.every((rank, idx) => idx === 0 || rankValue(rank) === rankValue(segment[idx - 1]) + 1);
      if (!sequential) break;
      if (segment.length >= 2 && segment.every(rank => (byRank.get(rank)?.length ?? 0) >= 2)) {
        out.push(segment.flatMap(rank => byRank.get(rank)!.slice(0, 2)));
      }
      if (segment.length >= 5 && segment.every(rank => (byRank.get(rank)?.length ?? 0) >= 1)) {
        out.push(segment.map(rank => byRank.get(rank)![0]));
      }
    }
  }

  const uniq = new Map<string, MuCard[]>();
  out.forEach(cards => {
    const key = [...cards].sort().join("|");
    if (!uniq.has(key)) uniq.set(key, cards);
  });
  return [...uniq.values()];
}

function rankFromCard(card: MuCard): string | null {
  if (card === "RJ" || card === "BJ") return null;
  return card.startsWith("10") ? "10" : card.slice(0, 1);
}

function inLongStraightPotential(byRank: Map<string, MuCard[]>, rank: string): boolean {
  const ranksAsc = [...byRank.keys()].sort((a, b) => rankValue(a) - rankValue(b));
  const idx = ranksAsc.indexOf(rank);
  if (idx === -1) return false;

  for (let start = Math.max(0, idx - 4); start <= idx; start += 1) {
    const end = start + 4;
    if (end >= ranksAsc.length) continue;
    const segment = ranksAsc.slice(start, end + 1);
    const sequential = segment.every((r, i) => i === 0 || rankValue(r) === rankValue(segment[i - 1]) + 1);
    if (sequential && segment.includes(rank)) return true;
  }
  return false;
}

function singleStructureBreakCost(hand: MuCard[], card: MuCard): number {
  const rank = rankFromCard(card);
  if (!rank) return 6;

  const byRank = groupByRank(hand);
  const count = byRank.get(rank)?.length ?? 0;
  let cost = 0;

  if (count >= 2) cost += 4; // breaks pair
  if (count >= 3) cost += 2; // breaks triple potential

  if (count === 1 && inLongStraightPotential(byRank, rank)) {
    cost += 4; // removes a needed rank for straight
  }

  if (count === 2) {
    const prevRank = [...byRank.keys()].find(r => rankValue(r) === rankValue(rank) - 1);
    const nextRank = [...byRank.keys()].find(r => rankValue(r) === rankValue(rank) + 1);
    const prevPair = prevRank ? (byRank.get(prevRank)?.length ?? 0) >= 2 : false;
    const nextPair = nextRank ? (byRank.get(nextRank)?.length ?? 0) >= 2 : false;
    if (prevPair || nextPair) cost += 3; // may break double-pairs chain
  }

  if (rankValue(rank) >= rankValue("Q")) cost += 1; // keep top cards a bit
  return cost;
}

function pickBotMove(
  hand: MuCard[],
  tableCombo: MuCombo | null,
  context: {
    botId: string;
    players: string[];
    hands: Record<string, MuCard[]>;
    lastPlayActor: string | null;
  }
): MuCard[] | null {
  const candidates = generateBotCandidates(hand);
  const valid: Array<{ cards: MuCard[]; combo: MuCombo }> = [];
  candidates.forEach(cards => {
    const validation = canPlayMuCards(cards, tableCombo as any);
    if (!validation.ok) return;
    valid.push({ cards, combo: validation.combo });
  });
  if (valid.length === 0) return null;

  const interceptCost = (combo: MuCombo): number => {
    if (combo.kind === "red_joker") return 4;
    if (combo.kind === "triple") return 5;
    if (combo.kind === "black_joker") return 6;
    if (combo.kind === "quad") return 7;
    return 0;
  };

  const leadPriority = (combo: MuCombo): number => {
    if (combo.kind === "straight") return 0;
    if (combo.kind === "double_pairs") return 1;
    if (combo.kind === "pair") return 2;
    if (combo.kind === "single") return 3;
    return 4;
  };

  const handSize = hand.length;
  const next = nextPlayer(context.players, context.botId);
  const nextCards = context.hands[next]?.length ?? 99;
  const nextDanger = nextCards <= 3;
  const tableActorDanger = context.lastPlayActor ? (dangerScoreByPlayer[context.lastPlayActor] ?? 0) : 0;

  if (!tableCombo) {
    const ordinary = valid.filter(v => !v.combo.isIntercept);
    if (ordinary.length > 0) {
      ordinary.sort((a, b) => {
        if (nextDanger) {
          const as = a.combo.kind === "single" ? 1 : 0;
          const bs = b.combo.kind === "single" ? 1 : 0;
          if (as !== bs) return as - bs;
          if (a.combo.topRankValue !== b.combo.topRankValue) return b.combo.topRankValue - a.combo.topRankValue;
        }
        const d = leadPriority(a.combo) - leadPriority(b.combo);
        if (d !== 0) return d;
        if (a.combo.length !== b.combo.length) return b.combo.length - a.combo.length;
        return a.combo.topRankValue - b.combo.topRankValue;
      });
      return ordinary[0]?.cards ?? null;
    }
    valid.sort((a, b) => interceptCost(a.combo) - interceptCost(b.combo));
    return valid[0]?.cards ?? null;
  }

  const ordinary = valid.filter(v => !v.combo.isIntercept);
  const intercept = valid.filter(v => v.combo.isIntercept);

  if (ordinary.length === 0 && intercept.length > 0) {
    // Be less passive: keep intercepts only in deep mid-game.
    if (handSize > 6 && tableActorDanger < 2) return null;
    intercept.sort((a, b) => interceptCost(a.combo) - interceptCost(b.combo));
    return intercept[0]?.cards ?? null;
  }

  if (ordinary.length > 0) {
    ordinary.sort((a, b) => {
      if (tableCombo.kind === "single" && a.combo.kind === "single" && b.combo.kind === "single") {
        const ac = singleStructureBreakCost(hand, a.cards[0]);
        const bc = singleStructureBreakCost(hand, b.cards[0]);
        if (ac !== bc) return ac - bc;
      }
      if (tableActorDanger >= 2) {
        if (a.combo.length !== b.combo.length) return b.combo.length - a.combo.length;
        if (a.combo.topRankValue !== b.combo.topRankValue) return b.combo.topRankValue - a.combo.topRankValue;
      }
      if (a.combo.length !== b.combo.length) return a.combo.length - b.combo.length;
      return a.combo.topRankValue - b.combo.topRankValue;
    });
    const best = ordinary[0];
    if (!best) return null;

    if (tableCombo.kind === "single" && best.combo.kind === "single") {
      const breakCost = singleStructureBreakCost(hand, best.cards[0]);
      const canSpend = handSize <= 4 || tableActorDanger >= 2 || nextDanger;
      if (breakCost >= 5 && !canSpend) {
        return null;
      }
    }

    const costlySingle =
      tableCombo.kind === "single" &&
      best.combo.kind === "single" &&
      best.combo.topRankValue >= rankValue("Q");
    const costlyPair =
      tableCombo.kind === "pair" &&
      best.combo.kind === "pair" &&
      best.combo.topRankValue >= rankValue("Q");
    const costlyLong =
      (tableCombo.kind === "straight" || tableCombo.kind === "double_pairs") &&
      best.combo.topRankValue >= rankValue("Q");

    // Keep very expensive cards only with very large hands.
    if (handSize > 10 && (costlySingle || costlyPair || costlyLong) && tableActorDanger < 1 && !nextDanger) {
      return null;
    }

    // Do not auto-pass on ordinary singles anymore: users expect active beating.
    return best.cards;
  }

  if (intercept.length > 0 && handSize <= 3) {
    intercept.sort((a, b) => interceptCost(a.combo) - interceptCost(b.combo));
    return intercept[0]?.cards ?? null;
  }

  return null;
}

function scheduleBots(): void {
  if (botTimer !== null) {
    window.clearTimeout(botTimer);
    botTimer = null;
  }

  if (game.finished) return;
  const turn = currentPlayerId();
  if (!turn || turn === HUMAN_ID) return;

  botTimer = window.setTimeout(() => {
    botTimer = null;
    if (!game.currentRound || game.finished) return;
    const botId = currentPlayerId();
    if (!botId || botId === HUMAN_ID) return;

    const hand = game.currentRound.hands[botId];
    const tableCombo = game.currentRound.circle.lastPlay?.combo ?? null;
    const move = pickBotMove(hand, tableCombo, {
      botId,
      players: game.currentRound.circle.players,
      hands: game.currentRound.hands,
      lastPlayActor: game.currentRound.circle.lastPlay?.playerId ?? null,
    });
    if (!move) {
      dispatch({ type: "pass", playerId: botId });
      clearLog();
      render();
      scheduleBots();
      return;
    }

    const ok = dispatch({ type: "play", playerId: botId, cards: move });
    if (ok) {
      clearLog();
    }
    render();
    scheduleBots();
  }, BOT_DELAY_MS);
}

function startNewGameFromUI(): void {
  const count = Number(playerCountEl.value);
  game = createGame(count);
  selectedCards = [];
  displayedTablePlay = null;
  lastHandRenderKey = "";
  lastActionByPlayer = {};
  matchLog = [];
  lastLogLine = "";
  pushLogEvent({
    type: "match_start",
    at: Date.now(),
    players: [...game.playersOrder],
    dealerId: game.dealerId,
  });
  clearLog();
  render();
  scheduleBots();
}

newGameBtn.addEventListener("click", () => {
  startNewGameFromUI();
});

downloadLogBtn.addEventListener("click", () => {
  downloadMatchLog();
});

playBtn.addEventListener("click", () => {
  if (game.finished || !game.currentRound) return;
  if (currentPlayerId() !== HUMAN_ID) return;
  if (selectedCards.length === 0) {
    setLog("Выберите карты для хода");
    return;
  }

  const ok = dispatch({
    type: "play",
    playerId: HUMAN_ID,
    cards: [...selectedCards],
  });
  if (!ok) return;

  clearLog();
  selectedCards = [];
  render();
  scheduleBots();
});

passBtn.addEventListener("click", () => {
  if (game.finished || !game.currentRound) return;
  if (currentPlayerId() !== HUMAN_ID) return;
  const ok = dispatch({
    type: "pass",
    playerId: HUMAN_ID,
  });
  if (!ok) return;
  clearLog();
  selectedCards = [];
  render();
  scheduleBots();
});

render();
if (matchLog.length === 0) {
  pushLogEvent({
    type: "match_start",
    at: Date.now(),
    players: [...game.playersOrder],
    dealerId: game.dealerId,
  });
}
scheduleBots();


