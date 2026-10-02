export const ROOM_SIZE = 10;
export const QUEUE_WAIT_MS = 15000;
export const WORLD_W = 8000;
export const WORLD_H = 4500;
export const TICK_MS = 50; // 20Hz
export const COUNTDOWN_MS = 3000;
export const MATCH_TIME_LIMIT_MS = 4 * 60 * 1000;
/** Мітка на радарі видима стільки мс після останнього пострілу. */
export const RADAR_VISIBLE_AFTER_FIRE_MS = 1300;
export const HIT_RADIUS = 20;

/** Лут на полі: монети й кристали спавняться весь матч, збитий літак лишає все зібране. */
export const PICKUP_START = 45;
export const PICKUP_MAX = 100;
export const PICKUP_SPAWN_MS = 1500;
export const PICKUP_RADIUS = 38;
export const CRYSTAL_CHANCE = 0.18;

/** Теплові пастки — дзеркалить FLARE_* у src/game/systems/SkillSystem.ts */
export const FLARE_COOLDOWN_MS = 1500;
export const FLARE_DURATION_MS = 500;
export const FLARE_RADIUS = 95;

import type { CrateType } from '../content/crates.js';

/**
 * Ящик за призове місце — випадкової рідкості: вище місце лише підвищує шанси на кращий.
 * Легендарний лишається великою рідкістю навіть за перемогу.
 */
export const PLACE_CRATE_WEIGHTS: Record<number, Record<CrateType, number>> = {
  1: { common: 38, rare: 36, epic: 18, mythic: 6.5, legendary: 1.5 },
  2: { common: 52, rare: 32, epic: 12, mythic: 3.5, legendary: 0.5 },
  3: { common: 66, rare: 26, epic: 6.5, mythic: 1.35, legendary: 0.15 },
};

export function rollPlaceCrate(place: number): CrateType | null {
  const w = PLACE_CRATE_WEIGHTS[place];
  if (!w) return null;
  const entries = Object.entries(w) as [CrateType, number][];
  let roll = Math.random() * entries.reduce((s, [, v]) => s + v, 0);
  for (const [type, v] of entries) {
    if (roll < v) return type;
    roll -= v;
  }
  return 'common';
}

/** Нагорода за місце в матчі: монети + XP сезонного пропуску. */
export function matchReward(place: number, kills: number): { coins: number; bpXp: number } {
  const placeBonus = [800, 550, 400, 300, 230, 180, 140, 110, 90, 70][place - 1] ?? 60;
  return { coins: placeBonus + kills * 50, bpXp: 50 + kills * 12 + Math.max(0, 11 - place) * 12 };
}
