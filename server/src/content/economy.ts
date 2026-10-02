// Тримати синхронізовано з src/game/economy.ts.
export function levelReward(level: number, stars: number, firstClear: boolean): number {
  const base = 20 + level * 5 + stars * 15;
  return firstClear ? base * 2 : base;
}

export function survivalReward(seconds: number): number {
  return Math.floor(seconds / 5);
}

export const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500] as const;

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
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    levelsGained += 1;
  }
  return { level, xp, levelsGained };
}
