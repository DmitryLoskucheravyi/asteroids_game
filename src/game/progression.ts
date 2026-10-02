// Дзеркалить server/src/content/economy.ts — потрібно лише для відображення (прогрес-бар XP).
export function xpToNext(level: number): number {
  return 80 + (level - 1) * 45;
}

/** Максимальний рівень пілота. */
export const MAX_PILOT_LEVEL = 50;

const LEVEL_CRATES: Record<number, 'common' | 'rare' | 'epic' | 'mythic' | 'legendary'> = {
  5: 'common', 10: 'rare', 15: 'rare', 20: 'epic', 25: 'epic', 30: 'mythic', 35: 'epic', 40: 'mythic', 45: 'epic', 50: 'legendary',
};

/** Нагорода за досягнення рівня пілота: монети щоразу, ящик кожні 5 рівнів, кристали кожні 10. */
export function pilotLevelReward(level: number): { coins: number; crystals: number; crate?: 'common' | 'rare' | 'epic' | 'mythic' | 'legendary' } {
  return { coins: 50 + level * 10, crystals: level % 10 === 0 ? 20 + level : 0, crate: LEVEL_CRATES[level] };
}
