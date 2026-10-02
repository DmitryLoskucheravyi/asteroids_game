import { Save } from '../core/storage';

/** Скільки коінс дає один кристал (для довідки — сама нагорода рахується на сервері). */
export const CRYSTAL_COINS = 5;

/** Щоденні нагороди за 7-денну серію; після 7-го дня цикл повторюється. */
export const DAILY_REWARDS = [40, 60, 80, 120, 160, 240, 400] as const;

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

