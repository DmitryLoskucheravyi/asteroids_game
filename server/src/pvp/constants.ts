export const ROOM_SIZE = 5;
export const QUEUE_WAIT_MS = 15000;
export const WORLD_W = 6400;
export const WORLD_H = 3600;
export const TICK_MS = 50; // 20Hz
export const MATCH_TIME_LIMIT_MS = 4 * 60 * 1000;
/** Мітка на радарі видима стільки мс після останнього пострілу. */
export const RADAR_VISIBLE_AFTER_FIRE_MS = 1300;

export function baseHpFor(tier: number, level: number): number {
  return 100 + (tier - 1) * 20 + (level - 1) * 5;
}

/** Нагорода за місце в матчі: монети + XP сезонного пропуску. */
export function matchReward(place: number, kills: number): { coins: number; bpXp: number } {
  const placeBonus = [260, 160, 110, 70, 40][place - 1] ?? 30;
  return { coins: placeBonus + kills * 15, bpXp: 25 + kills * 6 + Math.max(0, 6 - place) * 8 };
}
