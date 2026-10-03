/**
 * Магазин — ціни, спільні для сервера й клієнта (без залежностей).
 * Геми = фіолетові кристали. Звичайний ящик — за монети, решта ящиків і бойовий пропуск — за геми;
 * геми можна купити за монети (великий набір вигідніший).
 */

export type StoreCrate = 'common' | 'rare' | 'epic' | 'mythic' | 'legendary';

export const CRATE_PRICES: Record<StoreCrate, { coins?: number; gems?: number }> = {
  common: { coins: 400 },
  rare: { gems: 40 },
  epic: { gems: 110 },
  mythic: { gems: 260 },
  legendary: { gems: 600 },
};

export interface GemPack {
  id: string;
  gems: number;
  coins: number;
  /** Позначка "вигідно" на картці */
  best?: boolean;
}

export const GEM_PACKS: readonly GemPack[] = [
  { id: 'gems_s', gems: 50, coins: 1500 },
  { id: 'gems_m', gems: 130, coins: 3600 },
  { id: 'gems_l', gems: 300, coins: 7800, best: true },
];

/** Преміум бойового пропуску — лише за геми */
export const PREMIUM_PASS_GEMS = 400;

/** Сезонний літак — лише з останнього тьєру преміум-пропуску (ні в магазині, ні в ящиках). */
export const SEASON_PLANE = 'eclipse';

/** Літаки, яких немає в продажу: лише з ящиків (від епічного й вище). */
export const CRATE_ONLY_PLANES: readonly string[] = ['ufo', 'nova', 'phoenix'];
export const CRATE_ONLY_MIN: readonly StoreCrate[] = ['epic', 'mythic', 'legendary'];
