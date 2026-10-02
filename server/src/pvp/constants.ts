export const ROOM_SIZE = 5;
export const QUEUE_WAIT_MS = 15000;
export const WORLD_W = 6400;
export const WORLD_H = 3600;
export const TICK_MS = 50; // 20Hz
export const COUNTDOWN_MS = 3000;
export const MATCH_TIME_LIMIT_MS = 4 * 60 * 1000;
/** Мітка на радарі видима стільки мс після останнього пострілу. */
export const RADAR_VISIBLE_AFTER_FIRE_MS = 1300;
export const HIT_RADIUS = 20;

/** Лут на полі: монети й кристали спавняться весь матч, збитий літак лишає все зібране. */
export const PICKUP_START = 30;
export const PICKUP_MAX = 70;
export const PICKUP_SPAWN_MS = 1500;
export const PICKUP_RADIUS = 38;
export const CRYSTAL_CHANCE = 0.18;

/** Теплові пастки — дзеркалить FLARE_* у src/game/systems/SkillSystem.ts */
export const FLARE_COOLDOWN_MS = 9000;
export const FLARE_DURATION_MS = 1400;
export const FLARE_RADIUS = 95;

/** Гарантований ящик за призове місце. */
export const PLACE_CRATES: Record<number, 'legendary' | 'epic' | 'rare'> = { 1: 'legendary', 2: 'epic', 3: 'rare' };

/** Нагорода за місце в матчі: монети + XP сезонного пропуску. */
export function matchReward(place: number, kills: number): { coins: number; bpXp: number } {
  const placeBonus = [700, 450, 300, 200, 120][place - 1] ?? 100;
  return { coins: placeBonus + kills * 60, bpXp: 60 + kills * 15 + Math.max(0, 6 - place) * 20 };
}
