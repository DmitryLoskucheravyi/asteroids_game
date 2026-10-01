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
    const settings = this.data.settings;
    const plane = this.data.plane;
    this.data = { ...defaults(), settings, plane };
    this.save();
  }
}

export const Save = new SaveStore();
