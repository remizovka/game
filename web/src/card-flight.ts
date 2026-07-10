// Общий слой "полёта карт": FLIP-анимация призраков поверх страницы.
// Каждая игра создает призрак карты своим рендером и указывает откуда/куда.

export type FlightRect = { left: number; top: number; width: number; height: number };

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let layerEl: HTMLElement | null = null;

function flightLayer(): HTMLElement {
  if (!layerEl) {
    layerEl = document.createElement("div");
    layerEl.className = "flight-layer";
    document.body.append(layerEl);
  }
  return layerEl;
}

export function flightsEnabled(): boolean {
  return !reducedMotion.matches && typeof HTMLElement.prototype.animate === "function";
}

export function rectOf(el: Element): FlightRect {
  const rect = el.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function centeredIn(zone: FlightRect, size: FlightRect): FlightRect {
  return {
    left: zone.left + (zone.width - size.width) / 2,
    top: zone.top + (zone.height - size.height) / 2,
    width: size.width,
    height: size.height,
  };
}

export function flyGhost(opts: {
  ghost: HTMLElement;
  from: FlightRect;
  to: FlightRect;
  delay?: number;
  duration?: number;
  fade?: boolean;
  onDone?: () => void;
}): void {
  if (!flightsEnabled()) {
    opts.onDone?.();
    return;
  }
  const ghost = opts.ghost;
  ghost.classList.add("flying-card");
  ghost.style.width = `${opts.from.width}px`;
  ghost.style.height = `${opts.from.height}px`;
  flightLayer().append(ghost);

  const scaleX = opts.to.width / Math.max(1, opts.from.width);
  const scaleY = opts.to.height / Math.max(1, opts.from.height);
  const animation = ghost.animate(
    [
      { transform: `translate(${opts.from.left}px, ${opts.from.top}px) scale(1, 1)`, opacity: 1 },
      {
        transform: `translate(${opts.to.left}px, ${opts.to.top}px) scale(${scaleX}, ${scaleY})`,
        opacity: opts.fade ? 0 : 1,
      },
    ],
    {
      duration: opts.duration ?? 360,
      delay: opts.delay ?? 0,
      easing: "cubic-bezier(0.25, 0.8, 0.3, 1)",
      fill: "both",
    }
  );
  const finish = () => {
    ghost.remove();
    opts.onDone?.();
  };
  animation.addEventListener("finish", finish);
  animation.addEventListener("cancel", finish);
}

export function flyGhostToElement(
  ghost: HTMLElement,
  from: FlightRect,
  destEl: HTMLElement,
  delay = 0
): void {
  const to = rectOf(destEl);
  destEl.style.visibility = "hidden";
  flyGhost({
    ghost,
    from,
    to,
    delay,
    onDone: () => {
      destEl.style.visibility = "";
    },
  });
}
