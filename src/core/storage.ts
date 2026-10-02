import { defaultProgress, type PlaneId, type PlaneProgress } from '../game/planes';
import type { ItemRarity } from '../game/items';
import type { Lang } from './i18n';
import type { CrateView, PassView, PlayerStats, QuestView, RankedView, ServerProfile } from './server';

export interface OwnedItem {
  id: string;
  defId: string;
  rarity: ItemRarity;
}

export interface Loadout {
  planeId: PlaneId;
  active: string | null;
  passive: string | null;
  weapon: string | null;
}

export interface SurvivalRecord {
  time: number;
  date: string;
}

export interface SaveData {
  version: 3;
  nickname: string;
  unlocked: number;
  /** Найкраща кількість зірок по кожному рівню (індекс = рівень - 1). */
  stars: number[];
  survivalTop: SurvivalRecord[];
  plane: PlaneId;
  /** Внутрішньоігрова валюта */
  coins: number;
  /** Рідкісна валюта на тір-апи літаків */
  crystals: number;
  /** Куплені літаки */
  owned: PlaneId[];
  /** Тір/рівень прокачки кожного купленого літака (відсутній запис = тір1/рівень1) */
  planeProgress: PlaneProgress[];
  /** Щоденна нагорода: дата останнього отримання (YYYY-MM-DD) і довжина серії */
  daily: { last: string; streak: number };
  /** Досвід і рівень пілота (акаунтний прогрес, окремо від рівнів кампанії) */
  xp: number;
  level: number;
  quests: QuestView[];
  pass: PassView;
  crates: CrateView[];
  /** Кастомне керування: дія → KeyboardEvent.code; відсутня дія = дефолт. */
  keybinds: Record<string, string>;
  items: OwnedItem[];
  loadouts: Loadout[];
  ownedWeapons: string[];
  ranked: RankedView;
  /** Рейтинг кожного режиму (соло, дуо, тріо, сквад) */
  rankedModes: Partial<Record<'solo' | 'duo' | 'trio' | 'squad', RankedView>>;
  stats: PlayerStats | null;
  settings: {
    lang: Lang;
    volume: number;
    shake: boolean;
    /** Режим, який запускає кнопка "Грати" в лобі */
    playMode: PlayMode;
  };
}

export type PlayMode = 'campaign' | 'survival' | 'casual' | 'solo' | 'duo' | 'trio' | 'squad';

const KEY = 'asteroids.save.v3';
/** Ключ попередньої, доакаунтної версії — звідси одноразово мігруємо прогрес при реєстрації. */
export const LEGACY_KEY = 'asteroids.save.v2';

const defaults = (): SaveData => ({
  version: 3,
  nickname: '',
  unlocked: 1,
  stars: [],
  survivalTop: [],
  plane: 'falcon',
  coins: 0,
  crystals: 0,
  owned: ['falcon'],
  planeProgress: [],
  daily: { last: '', streak: 0 },
  xp: 0,
  level: 1,
  quests: [],
  pass: { seasonId: '', bpPoints: 0, premium: false, claimedFree: [], claimedPremium: [] },
  crates: [],
  keybinds: {},
  items: [],
  loadouts: [],
  ownedWeapons: ['machine_gun'],
  ranked: { points: 0, best: 0, matches: 0, wins: 0 },
  rankedModes: {},
  stats: null,
  settings: {
    lang: navigator.language?.toLowerCase().startsWith('uk') || navigator.language?.toLowerCase().startsWith('ru') ? 'uk' : 'en',
    volume: 0.7,
    shake: true,
    playMode: 'campaign',
  },
});

/** Кеш акаунтного профілю (джерело правди — сервер) + локальні налаштування. */
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
        settings: { ...base.settings, ...(parsed.settings ?? {}), ...((parsed.settings as { playMode?: string } | undefined)?.playMode === 'ranked' ? { playMode: 'solo' as const } : {}) },
        stars: Array.isArray(parsed.stars) ? parsed.stars : [],
        survivalTop: Array.isArray(parsed.survivalTop) ? parsed.survivalTop : [],
        coins: Math.max(0, Math.floor(Number(parsed.coins) || 0)),
        crystals: Math.max(0, Math.floor(Number(parsed.crystals) || 0)),
        owned: Array.isArray(parsed.owned) && parsed.owned.length ? parsed.owned : ['falcon'],
        planeProgress: Array.isArray(parsed.planeProgress) ? parsed.planeProgress : [],
        daily: { ...base.daily, ...(parsed.daily ?? {}) },
        quests: Array.isArray(parsed.quests) ? parsed.quests : [],
        crates: Array.isArray(parsed.crates) ? parsed.crates : [],
        pass: { ...base.pass, ...(parsed.pass ?? {}) },
        keybinds: { ...(parsed.keybinds ?? {}) },
        items: Array.isArray(parsed.items) ? parsed.items : [],
        loadouts: Array.isArray(parsed.loadouts) ? parsed.loadouts : [],
        ownedWeapons: Array.isArray(parsed.ownedWeapons) && parsed.ownedWeapons.length ? parsed.ownedWeapons : ['machine_gun'],
        ranked: { ...base.ranked, ...(parsed.ranked ?? {}) },
        rankedModes: parsed.rankedModes ?? {},
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

  /** Перезаписує кеш свіжим профілем із сервера (єдина точка правди для прогресу). */
  applyProfile(p: ServerProfile): void {
    this.data = {
      ...this.data,
      nickname: p.nickname,
      coins: p.coins,
      crystals: p.crystals,
      xp: p.xp,
      level: p.level,
      plane: p.selectedPlane,
      owned: p.ownedPlanes,
      planeProgress: p.planeProgress,
      stars: p.stars,
      unlocked: p.unlocked,
      survivalTop: p.survivalTop,
      daily: p.daily,
      quests: p.quests,
      pass: p.pass,
      crates: p.crates,
      keybinds: p.keybinds,
      items: p.items,
      loadouts: p.loadouts,
      ownedWeapons: p.ownedWeapons,
      ranked: p.ranked ?? { points: 0, best: 0, matches: 0, wins: 0 },
      stats: p.stats ?? null,
      rankedModes: p.rankedModes ?? { solo: p.ranked ?? { points: 0, best: 0, matches: 0, wins: 0 } },
    };
    this.save();
  }

  /** Перед реєстрацією/логіном — те, що набрав гравець локально ще без акаунту. */
  hasLegacyProgress(): boolean {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return (parsed.coins ?? 0) > 0 || (parsed.owned?.length ?? 0) > 1 || (parsed.stars?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  legacyProgress(): { coins: number; owned: string[]; stars: number[]; unlocked: number; survivalTop: SurvivalRecord[] } | null {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        coins: Math.max(0, Math.floor(Number(parsed.coins) || 0)),
        owned: Array.isArray(parsed.owned) ? parsed.owned : [],
        stars: Array.isArray(parsed.stars) ? parsed.stars : [],
        unlocked: Number(parsed.unlocked) || 1,
        survivalTop: Array.isArray(parsed.survivalTop) ? parsed.survivalTop : [],
      };
    } catch {
      return null;
    }
  }

  clearLegacyProgress(): void {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Виклик при виході з акаунту — залишаємо лише налаштування. */
  clearProfile(): void {
    const settings = this.data.settings;
    this.data = { ...defaults(), settings };
    this.save();
  }

  owns(id: PlaneId): boolean {
    return this.data.owned.includes(id);
  }

  progressFor(id: PlaneId): PlaneProgress {
    return this.data.planeProgress.find((p) => p.planeId === id) ?? defaultProgress(id);
  }

  loadoutFor(id: PlaneId): Loadout {
    return this.data.loadouts.find((l) => l.planeId === id) ?? { planeId: id, active: null, passive: null, weapon: null };
  }

  /** Рейтинг режиму (соло — з основного профілю). */
  rank(mode: 'solo' | 'duo' | 'trio' | 'squad'): RankedView {
    return this.data.rankedModes[mode] ?? (mode === 'solo' ? this.data.ranked : { points: 0, best: 0, matches: 0, wins: 0 });
  }

  ownsWeapon(id: string): boolean {
    return this.data.ownedWeapons.includes(id);
  }

  itemById(id: string | null): OwnedItem | undefined {
    return id ? this.data.items.find((i) => i.id === id) : undefined;
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

  /** Повертає місце в таблиці (0..4) або -1, якщо результат не потрапив у топ. */
  survivalPlace(time: number): number {
    const t = Math.floor(time);
    return this.data.survivalTop.findIndex((e) => e.time === t);
  }
}

export const Save = new SaveStore();
