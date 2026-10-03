/**
 * Теплові пастки — спільна математика сервера й клієнта (без залежностей).
 *
 * Пастка — це віяло іскор, що вилітають назад від літака й гальмують. Жодного бар'єра навколо
 * літака: збивається лише те, що фізично влучило в іскру (кулі, ракети, лазер), а самонавідні
 * ракети відволікаються на іскри. Траєкторії детерміновані (без випадковості), тож сервер і
 * всі клієнти бачать іскри в тих самих місцях.
 */

/** Перезарядка пасток, мс */
export const FLARE_COOLDOWN_MS = 2300;
/** Скільки іскри збивають снаряди, мс */
export const FLARE_ACTIVE_MS = 900;
/** Скільки іскри ще догорають на екрані після активної фази, мс (лише візуал) */
export const FLARE_FADE_MS = 500;
export const DECOY_COUNT = 8;
/** Радіус "влучання" в іскру — більший за саму іскру, інакше кулі пролітали б між ними */
export const DECOY_RADIUS = 20;
/** Гальмування іскор, 1/с */
const DRAG = 1.6;
/** Віяло назад: відхилення від курсу й швидкості — фіксовані */
const SPREAD = [-1.12, -0.8, -0.48, -0.16, 0.16, 0.48, 0.8, 1.12];
const SPEED = [235, 265, 290, 310, 310, 290, 265, 235];

export interface FlareBurst {
  ownerId: string;
  x: number;
  y: number;
  /** Курс літака в момент пострілу пастками */
  angle: number;
  /** Мітка часу (мс) у годиннику того, хто симулює */
  t0: number;
}

/** Позиція іскри i через dtMs після пострілу (аналітичний розв'язок руху з опором). */
export function decoyPos(b: FlareBurst, i: number, dtMs: number): { x: number; y: number } {
  const a = b.angle + Math.PI + SPREAD[i];
  const s = SPEED[i];
  const t = Math.max(0, dtMs) / 1000;
  const k = (1 - Math.exp(-DRAG * t)) / DRAG;
  return { x: b.x + Math.cos(a) * s * k, y: b.y + Math.sin(a) * s * k };
}

export const burstActive = (b: FlareBurst, now: number): boolean => now - b.t0 >= 0 && now - b.t0 < FLARE_ACTIVE_MS;

/** Найменша відстань від точки до відрізка. */
function segDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2)) : 0;
  return Math.hypot(ax + dx * k - cx, ay + dy * k - cy);
}

/**
 * Чи влучив снаряд (відрізок руху за крок) в активну іскру з цих пасток.
 * Повертає точку зіткнення або null.
 */
export function hitsDecoy(b: FlareBurst, now: number, ax: number, ay: number, bx: number, by: number, radius = DECOY_RADIUS): { x: number; y: number } | null {
  if (!burstActive(b, now)) return null;
  for (let i = 0; i < DECOY_COUNT; i++) {
    const p = decoyPos(b, i, now - b.t0);
    if (segDist(ax, ay, bx, by, p.x, p.y) < radius) return p;
  }
  return null;
}

/** Найближча активна іскра до точки (для самонавідних ракет). */
export function nearestDecoy(b: FlareBurst, now: number, x: number, y: number): { x: number; y: number; d: number } | null {
  if (!burstActive(b, now)) return null;
  let best: { x: number; y: number; d: number } | null = null;
  for (let i = 0; i < DECOY_COUNT; i++) {
    const p = decoyPos(b, i, now - b.t0);
    const d = Math.hypot(p.x - x, p.y - y);
    if (!best || d < best.d) best = { ...p, d };
  }
  return best;
}

/** Відстань уздовж променя до першої іскри (лазер), або null. */
export function rayDecoy(b: FlareBurst, now: number, x: number, y: number, dx: number, dy: number): number | null {
  if (!burstActive(b, now)) return null;
  let best: number | null = null;
  for (let i = 0; i < DECOY_COUNT; i++) {
    const p = decoyPos(b, i, now - b.t0);
    const fx = p.x - x;
    const fy = p.y - y;
    const along = fx * dx + fy * dy;
    if (along < 0) continue;
    const perp2 = fx * fx + fy * fy - along * along;
    if (perp2 > DECOY_RADIUS * DECOY_RADIUS) continue;
    const d = along - Math.sqrt(DECOY_RADIUS * DECOY_RADIUS - perp2);
    if (best === null || d < best) best = d;
  }
  return best;
}
