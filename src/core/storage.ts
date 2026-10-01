import type { PlaneId } from '../game/planes';
import type { Lang } from './i18n';

export interface SurvivalRecord {
  time: number;
  date: string;
}

export interface SaveData {
  version: 2;
  unlocked: number;
  /** Найкраща кількість зірок по кожному рівню (індекс = рівень - 1). */
  stars: number[];
  survivalTop: SurvivalRecord[];
  plane: PlaneId;
  /** Внутрішньоігрова валюта */
  coins: number;
  /** Куплені літаки */
  owned: PlaneId[];
  /** Щоденна нагорода: дата останнього отримання (YYYY-MM-DD) і довжина серії */
  daily: { last: string; streak: number };
  settings: {
    lang: Lang;
    volume: number;
    shake: boolean;
  };
}

const KEY = 'asteroids.save.v2';

const defaults = (): SaveData => ({
  version: 2,
  unlocked: 1,
  stars: [],
  survivalTop: [],
  plane: 'falcon',
  coins: 0,
  owned: ['falcon'],
  daily: { last: '', streak: 0 },
  settings: {
    lang: navigator.language?.toLowerCase().startsWith('uk') || navigator.language?.toLowerCase().startsWith('ru') ? 'uk' : 'en',
    volume: 0.7,
    shake: true,
  },
});

/** Збереження прогресу, рекордів і налаштувань (замість progress.txt / records.txt). */
class SaveStore {
  data: SaveData = this.load();

  private load(): SaveData {
    const base = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings ?? {}) },
        stars: Array.isArray(parsed.stars) ? parsed.stars : [],
        survivalTop: Array.isArray(parsed.survivalTop) ? parsed.survivalTop : [],
        coins: Math.max(0, Math.floor(Number(parsed.coins) || 0)),
        owned: Array.isArray(parsed.owned) && parsed.owned.length ? parsed.owned : ['falcon'],
        daily: { ...base.daily, ...(parsed.daily ?? {}) },
      };
    } catch {
      return base;
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // приватний режим / заблоковане сховище — гра працює й без збереження
    }
  }

  owns(id: PlaneId): boolean {
    return this.data.owned.includes(id);
  }

  addCoins(n: number): void {
    this.data.coins += Math.max(0, Math.floor(n));
    this.save();
  }

  /** Купівля літака: true, якщо вистачило коінс. */
  buy(id: PlaneId, price: number): boolean {
    if (this.owns(id) || this.data.coins < price) return false;
    this.data.coins -= price;
    this.data.owned.push(id);
    this.save();
    return true;
  }

  get bestSurvival(): number {
    return this.data.survivalTop[0]?.time ?? 0;
  }

  get totalStars(): number {
    return this.data.stars.reduce((s, v) => s + (v || 0), 0);
  }

  starsFor(level: number): number {
    return this.data.stars[level - 1] ?? 0;
  }

  completeLevel(level: number, stars: number, maxLevel: number): void {
    this.data.stars[level - 1] = Math.max(this.starsFor(level), stars);
    if (level < maxLevel) this.data.unlocked = Math.max(this.data.unlocked, level + 1);
    this.save();
  }

  /** Повертає місце в таблиці (0..4) або -1, якщо результат не потрапив у топ. */
  addSurvival(time: number): number {
    const t = Math.floor(time);
    const top = this.data.survivalTop;
    const entry = { time: t, date: new Date().toISOString().slice(0, 10) };
    top.push(entry);
    top.sort((a, b) => b.time - a.time);
    top.length = Math.min(top.length, 5);
    this.save();
    return top.indexOf(entry);
  }

  resetProgress(): void {
    // коінс і куплені літаки теж скидаються, тож обраний літак повертається на стартовий
    const settings = this.data.settings;
    this.data = { ...defaults(), settings };
    this.save();
  }
}

export const Save = new SaveStore();
