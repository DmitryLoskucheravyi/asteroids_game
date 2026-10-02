// Тримати синхронізовано з src/game/ranks.ts
export const RANK_IDS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'galaxy'] as const;
export type RankId = (typeof RANK_IDS)[number];

/** Очок рейтингу на один підрівень; у ранга 5 підрівнів (V → I). */
export const RP_PER_DIVISION = 100;
export const DIVISIONS = 5;
export const MAX_DIVISION_INDEX = RANK_IDS.length * DIVISIONS - 1;

/** Глобальний індекс підрівня 0..34 (Бронза V = 0, Галактика I = 34; далі RP росте без нового рангу). */
export function divisionIndex(rp: number): number {
  return Math.min(MAX_DIVISION_INDEX, Math.floor(Math.max(0, rp) / RP_PER_DIVISION));
}

/**
 * Зміна рейтингу за матч: місце + бонус за фраги.
 * На Бронзі й Сріблі поразки коштують удвічі менше — новачків не "закопує".
 * На високих рангах перемога дає трохи менше.
 */
export function rankDelta(place: number, kills: number, rp: number): number {
  // 10 місць: топ-4 у плюсі, далі мінус наростає
  const base = [35, 25, 16, 8, -2, -6, -10, -14, -17, -20][place - 1] ?? -20;
  const killBonus = Math.min(15, kills * 3);
  const idx = divisionIndex(rp);
  let delta = base + killBonus;
  if (delta < 0 && idx < 2 * DIVISIONS) delta = Math.round(delta * 0.5);
  if (delta > 0 && idx >= 5 * DIVISIONS) delta = Math.round(delta * 0.8);
  return delta;
}

/** Складність ботів у рейтинговому матчі — за середнім рейтингом гравців у кімнаті. */
export function botStrength(avgRp: number): { tier: number; level: number } {
  const idx = divisionIndex(avgRp);
  return { tier: Math.min(4, 1 + Math.floor(idx / 9)), level: 1 + (idx % 4) };
}
