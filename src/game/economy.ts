import { Save } from '../core/storage';

/** Скільки коінс дає один кристал. */
export const CRYSTAL_COINS = 5;

/** Нагорода за проходження рівня: база + бонус за зірки; перше проходження — подвійна. */
export function levelReward(level: number, stars: number, firstClear: boolean): number {
  const base = 20 + level * 5 + stars * 15;
  return firstClear ? base * 2 : base;
}

/** Нагорода за виживання: 1 коінс за кожні 5 секунд. */
export function survivalReward(seconds: number): number {
  return Math.floor(seconds / 5);
}

/** Щоденні нагороди за 7-денну серію; після 7-го дня цикл повторюється. */
export const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500] as const;

/** Локальна дата YYYY-MM-DD (а не UTC — інакше "день" змінювався б не опівночі). */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DailyState {
  /** Чи можна забрати нагороду сьогодні */
  available: boolean;
  /** Який день серії (1..7) буде отримано сьогодні або вже отримано */
  day: number;
  reward: number;
}

/** Поточний стан щоденної нагороди. */
export function dailyState(now = new Date()): DailyState {
  const today = localDate(now);
  const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const { last, streak } = Save.data.daily;
  if (last === today) {
    const day = ((streak - 1) % DAILY_REWARDS.length) + 1;
    return { available: false, day, reward: DAILY_REWARDS[day - 1] };
  }
  // пропустив день — серія починається спочатку
  const continuing = last === yesterday;
  const day = continuing ? (streak % DAILY_REWARDS.length) + 1 : 1;
  return { available: true, day, reward: DAILY_REWARDS[day - 1] };
}

/** Забрати щоденну нагороду. Повертає кількість коінс або 0, якщо вже отримано сьогодні. */
export function claimDaily(now = new Date()): number {
  const st = dailyState(now);
  if (!st.available) return 0;
  const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const continuing = Save.data.daily.last === yesterday;
  Save.data.daily = { last: localDate(now), streak: (continuing ? Save.data.daily.streak : 0) + 1 };
  Save.addCoins(st.reward);
  return st.reward;
}
