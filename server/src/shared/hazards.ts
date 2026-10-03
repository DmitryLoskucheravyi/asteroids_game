/**
 * Перешкоди PvP-арени — спільне для сервера й клієнта (без залежностей).
 *
 * 1) Рідкі метеорити є в кожному матчі.
 * 2) Кожен режим має свій івент (комети, мисливці, стіни…), що змінюється раз на 3 години.
 *    Розклад детермінований від часу: сервер і клієнт рахують його однаково, у режимів у той самий
 *    час різні івенти, а наступний івент режиму ніколи не повторює попередній.
 *
 * Рух простих перешкод (пряма лінія, рикошет від країв) аналітичний: сервер шле лише подію появи,
 * клієнт рахує позицію сам. Мисливців і боса сервер симулює й періодично синхронізує.
 */

export const EVENT_KINDS = ['comets', 'hunters', 'walls', 'bouncers', 'fog', 'shower', 'mines', 'wind', 'boss'] as const;
export type ArenaEvent = (typeof EVENT_KINDS)[number];

export const EVENT_PERIOD_MS = 3 * 60 * 60 * 1000;
const MODE_ORDER = ['casual', 'solo', 'duo', 'trio', 'squad'];

/** Івент режиму на момент now (мс epoch) і коли він закінчиться. */
export function arenaEventFor(mode: string, now = Date.now()): { kind: ArenaEvent; endsAt: number } {
  const period = Math.floor(now / EVENT_PERIOD_MS);
  const m = Math.max(0, MODE_ORDER.indexOf(mode));
  // крок 4 по колу з 9 — сусідні періоди завжди різні; зсув 2 на режим — у режимів різні івенти
  const idx = (((period * 4 + m * 2) % EVENT_KINDS.length) + EVENT_KINDS.length) % EVENT_KINDS.length;
  return { kind: EVENT_KINDS[idx], endsAt: (period + 1) * EVENT_PERIOD_MS };
}

export type HazardKind = 'rock' | 'comet' | 'hunter' | 'bouncer' | 'mine' | 'boss' | 'shard';

/** Перешкода на полі. Час — мс від старту матчу. */
export interface Hazard {
  id: number;
  kind: HazardKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Коли з'являється (до цього клієнт малює попередження) */
  t0: number;
  /** За скільки мс до появи показувати попередження (0 — без) */
  warn: number;
  /** Рикошет від країв арени */
  bounce?: boolean;
  /** Варіант спрайта */
  v: number;
}

/** Межі арени (дзеркалить WORLD_W/H сервера). */
export const ARENA_W = 8000;
export const ARENA_H = 4500;

/** Відбиття координати в [lo, hi] — "трикутна хвиля" для аналітичного рикошету. */
function reflect(p: number, lo: number, hi: number): number {
  const span = hi - lo;
  if (span <= 0) return lo;
  let q = (p - lo) % (2 * span);
  if (q < 0) q += 2 * span;
  return lo + (q <= span ? q : 2 * span - q);
}

/** Позиція перешкоди на момент t (для прямолінійних і рикошетних). */
export function hazardPos(h: Hazard, t: number): { x: number; y: number } {
  const dt = Math.max(0, t - h.t0) / 1000;
  const x = h.x + h.vx * dt;
  const y = h.y + h.vy * dt;
  if (!h.bounce) return { x, y };
  return { x: reflect(x, h.r, ARENA_W - h.r), y: reflect(y, h.r, ARENA_H - h.r) };
}

/** Скелі арени повільно дрейфують і відбиваються від країв (t — мс від старту матчу). */
export function driftPos(o: { x0: number; y0: number; vx: number; vy: number; r: number }, t: number): { x: number; y: number } {
  const s = Math.max(0, t) / 1000;
  return { x: reflect(o.x0 + o.vx * s, o.r, ARENA_W - o.r), y: reflect(o.y0 + o.vy * s, o.r, ARENA_H - o.r) };
}

/** HP скелі: що більша, то міцніша. */
export const obstacleHp = (r: number): number => Math.round(r * 4.5);

/** Шкода від удару перешкоди об літак. */
export function hazardDamage(kind: HazardKind, r: number): number {
  switch (kind) {
    case 'comet':
      return 26;
    case 'hunter':
      return 20;
    case 'bouncer':
      return 18;
    case 'boss':
      return 34;
    case 'shard':
      return 11;
    case 'mine':
      return 32;
    default:
      return Math.round(8 + r * 0.32);
  }
}

/** Скільки влучань витримує перешкода (мін і боса — окремо). */
export function hazardHp(kind: HazardKind, r: number): number {
  switch (kind) {
    case 'boss':
      return 2400;
    case 'comet':
      return 40;
    case 'shard':
      return 6;
    case 'mine':
      return 1;
    default:
      return Math.round(r * 2.2);
  }
}

/** Сонячний вітер: напрям повільно обертається, сила ~90 px/с. Однаково на сервері й клієнті. */
export function windAt(t: number): { x: number; y: number } {
  const a = (t / 1000) * 0.045 + Math.sin(t / 23_000) * 1.2;
  return { x: Math.cos(a) * 90, y: Math.sin(a) * 90 };
}

/** Туман: видно лише коло навколо свого літака. */
export const FOG_RADIUS = 430;
/** Міни: радіус спрацювання, затримка вибуху й радіус вибуху */
export const MINE_TRIGGER = 130;
export const MINE_FUSE_MS = 1100;
export const MINE_BLAST = 175;
