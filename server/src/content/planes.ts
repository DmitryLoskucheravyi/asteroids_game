// Тримати синхронізовано з src/game/planes.ts (id і price) — тут потрібні лише для
// валідації купівлі й для розіграшу ящиків, геймплейні характеристики лишаються на клієнті.
export const PLANE_IDS = ['falcon', 'phantom', 'blaze', 'wasp', 'collector', 'swift', 'titan', 'chronos', 'viper', 'thunder', 'bastion', 'ufo', 'nova', 'phoenix'] as const;
export type PlaneId = (typeof PLANE_IDS)[number];

export const PLANE_PRICES: Record<PlaneId, number> = {
  falcon: 0,
  phantom: 150,
  blaze: 250,
  wasp: 400,
  collector: 600,
  swift: 800,
  titan: 1100,
  chronos: 1400,
  viper: 1600,
  thunder: 1800,
  bastion: 2000,
  ufo: 2300,
  nova: 2600,
  phoenix: 3000,
};

export const isPlaneId = (id: string): id is PlaneId => (PLANE_IDS as readonly string[]).includes(id);

export const MAX_TIER = 4;
export const MAX_LEVEL_IN_TIER = 4;

// Тримати синхронізовано з src/game/planes.ts (upgradeRate/levelUpCost/tierUpCost).
export function upgradeRate(price: number): number {
  if (price >= 3000) return 225;
  if (price >= 2300) return 175;
  if (price >= 1800) return 135;
  if (price >= 1400) return 105;
  if (price >= 1100) return 85;
  return 60;
}

export function levelUpCost(price: number, tier: number, level: number): number {
  return upgradeRate(price) * tier * level;
}

export function tierUpCost(price: number, tier: number): { coins: number; crystals: number } {
  const crystalsByTier = [0, 30, 80, 160];
  return { coins: 24 * upgradeRate(price) * tier, crystals: crystalsByTier[tier] ?? 160 };
}

/** Бойові характеристики PvP. Тримати синхронізовано з src/game/planes.ts (combat + planeCombat). */
const PLANE_COMBAT: Record<PlaneId, { hp: number; damage: number }> = {
  falcon: { hp: 100, damage: 1.0 },
  phantom: { hp: 90, damage: 1.0 },
  blaze: { hp: 105, damage: 1.08 },
  wasp: { hp: 80, damage: 1.0 },
  collector: { hp: 108, damage: 1.05 },
  swift: { hp: 98, damage: 1.05 },
  titan: { hp: 136, damage: 0.95 },
  chronos: { hp: 100, damage: 1.05 },
  viper: { hp: 92, damage: 1.08 },
  thunder: { hp: 105, damage: 1.12 },
  bastion: { hp: 132, damage: 0.98 },
  ufo: { hp: 100, damage: 1.1 },
  nova: { hp: 100, damage: 1.12 },
  phoenix: { hp: 105, damage: 1.1 },
};

export function planeCombat(planeId: string, tier: number, level: number): { hp: number; damageMul: number } {
  const base = isPlaneId(planeId) ? PLANE_COMBAT[planeId] : PLANE_COMBAT.falcon;
  const t = Math.min(MAX_TIER, Math.max(1, tier));
  const l = Math.min(MAX_LEVEL_IN_TIER, Math.max(1, level));
  // HP +4% від бази й урон +2% за крок прокачки, у PvP — наполовину (коефіцієнт 0.5)
  const step = ((t - 1) * MAX_LEVEL_IN_TIER + (l - 1)) * 0.5;
  return { hp: Math.round(base.hp * (1 + 0.04 * step)), damageMul: base.damage * (1 + 0.02 * step) };
}
