// Тримати синхронізовано з src/game/economy.ts.
export function levelReward(level: number, stars: number, firstClear: boolean): number {
  // перше проходження — подвійна нагорода, повтор — половина (щоб кампанію не фармили замість PvP)
  const base = 20 + level * 5 + stars * 15;
  return firstClear ? base * 2 : Math.round(base * 0.5);
}

export function survivalReward(seconds: number): number {
  return Math.floor(seconds / 2.5);
}

export const DAILY_REWARDS = [40, 60, 80, 120, 160, 240, 400] as const;

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DailyState {
  available: boolean;
  day: number;
  reward: number;
}

export function dailyState(daily: { last: string; streak: number }, now = new Date()): DailyState {
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const { last, streak } = daily;
  if (last === today) {
    const day = ((streak - 1) % DAILY_REWARDS.length) + 1;
    return { available: false, day, reward: DAILY_REWARDS[day - 1] };
  }
  const continuing = last === yesterday;
  const day = continuing ? (streak % DAILY_REWARDS.length) + 1 : 1;
  return { available: true, day, reward: DAILY_REWARDS[day - 1] };
}

export { localDate };

/** XP, потрібний щоб дійти з рівня level до level+1. */
export function xpToNext(level: number): number {
  return 80 + (level - 1) * 45;
}

/** Додає XP і повертає, скільки рівнів здобуто (з каскадним переходом через кілька рівнів). */
export function applyXp(current: { xp: number; level: number }, amount: number): { level: number; xp: number; levelsGained: number } {
  let { xp, level } = current;
  xp += Math.max(0, Math.floor(amount));
  let levelsGained = 0;
  while (level < MAX_PILOT_LEVEL && xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    levelsGained += 1;
  }
  // на максимальному рівні досвід більше не накопичується
  if (level >= MAX_PILOT_LEVEL) xp = 0;
  return { level, xp, levelsGained };
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
