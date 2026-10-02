export const ROOM_SIZE = 10;

/** Черги: звичайний FFA і чотири рейтингові режими, кожен зі своїм рейтингом. */
export type QueueMode = 'casual' | 'solo' | 'duo' | 'trio' | 'squad';
export type RankMode = Exclude<QueueMode, 'casual'>;
export const RANK_MODES: readonly RankMode[] = ['solo', 'duo', 'trio', 'squad'];
export const isQueueMode = (m: unknown): m is QueueMode => m === 'casual' || (RANK_MODES as readonly unknown[]).includes(m);

/** Розмір команди й кімнати для кожного режиму. */
export const MODE_SPEC: Record<QueueMode, { teamSize: number; roomSize: number }> = {
  casual: { teamSize: 1, roomSize: 10 },
  solo: { teamSize: 1, roomSize: 10 },
  duo: { teamSize: 2, roomSize: 10 },
  trio: { teamSize: 3, roomSize: 12 },
  squad: { teamSize: 4, roomSize: 16 },
};

export const TEAM_SIZE_BY_MODE: Record<RankMode, number> = { solo: 1, duo: 2, trio: 3, squad: 4 };

/** Місце команди → еквівалент у шкалі 10 місць (для нагород і RP однаковою таблицею). */
export function scaledPlace(teamPlace: number, teams: number): number {
  if (teams <= 1) return 1;
  return Math.round(1 + ((teamPlace - 1) * (ROOM_SIZE - 1)) / (teams - 1));
}
export const QUEUE_WAIT_MS = 15000;
export const WORLD_W = 8000;
export const WORLD_H = 4500;
/** Тік симуляції й розсилки стану: 30 Гц */
export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
export const COUNTDOWN_MS = 3000;
export const MATCH_TIME_LIMIT_MS = 4 * 60 * 1000;
/** Мітка на радарі видима стільки мс після останнього пострілу. */
export const RADAR_VISIBLE_AFTER_FIRE_MS = 1300;
export const HIT_RADIUS = 20;
/** Компенсація лагу: максимум, на скільки сервер "відмотує" цілі назад, і скільки історії тримає */
export const MAX_REWIND_MS = 300;
export const HISTORY_MS = 1000;
/** Затримка інтерполяції клієнта (див. src/net/interp.ts) — типовий відкат для подій без мітки часу */
export const CLIENT_INTERP_MS = 100;
/** Самонавідні ракети (дзеркалить src/game/PvpGame.ts) */
export const MISSILE_SPEED = 520;
export const MISSILE_TURN = 2.2;
export const MISSILE_LIFE = 2.2;
/** Анти-чит руху: найбільша швидкість з форсажем і запасом, плюс ривок */
export const MAX_MOVE_SPEED = 1500;
export const JUMP_ALLOWANCE = 360;

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
const PLACE_COINS = [640, 440, 320, 240, 200, 160, 120, 100, 80, 60];
/** Рейтинговий матч — окрема таблиця цілих чисел (≈ ×1.25), без дробового округлення. */
const PLACE_COINS_RANKED = [800, 550, 400, 300, 250, 200, 150, 125, 100, 75];

export function matchReward(place: number, kills: number, ranked = false): { coins: number; bpXp: number } {
  const table = ranked ? PLACE_COINS_RANKED : PLACE_COINS;
  const placeBonus = table[place - 1] ?? table[table.length - 1];
  return { coins: placeBonus + kills * (ranked ? 25 : 20), bpXp: 50 + kills * 12 + Math.max(0, 11 - place) * 12 };
}
