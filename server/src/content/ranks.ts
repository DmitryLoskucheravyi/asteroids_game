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
export const RP_BY_PLACE = [30, 22, 14, 6, -2, -6, -10, -14, -18, -22];

export function rankDelta(place: number, kills: number, rp: number): number {
  // сума по 10 місцях = 0: рейтинг росте лише за реальну перевагу, а не за кількість матчів
  const base = RP_BY_PLACE[place - 1] ?? RP_BY_PLACE[RP_BY_PLACE.length - 1];
  const killBonus = Math.min(8, kills * 2);
  const idx = divisionIndex(rp);
  let delta = base + killBonus;
  if (delta < 0 && idx < 2 * DIVISIONS) delta = Math.round(delta * 0.5);
  if (delta > 0 && idx >= 5 * DIVISIONS) delta = Math.round(delta * 0.85);
  return delta;
}

/** Складність ботів у рейтинговому матчі — за середнім рейтингом гравців у кімнаті. */
export function botStrength(avgRp: number): { tier: number; level: number } {
  // монотонне зростання: щабель 0 = T1·L1 … 14 = T4·L3, без провалів між підрівнями
  const step = Math.round((divisionIndex(avgRp) * 14) / MAX_DIVISION_INDEX);
  return { tier: 1 + Math.floor(step / 4), level: 1 + (step % 4) };
}

/** Нагорода наприкінці сезону за досягнутий підрівень. */
const SEASON_CRATES = ['common', 'common', 'rare', 'rare', 'epic', 'mythic', 'legendary'] as const;
export function seasonReward(rp: number): { crate: (typeof SEASON_CRATES)[number]; crystals: number } {
  const idx = divisionIndex(rp);
  return { crate: SEASON_CRATES[Math.floor(idx / DIVISIONS)], crystals: 5 * (idx + 1) };
}
