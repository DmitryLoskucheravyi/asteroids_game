// Тримати синхронізовано з src/game/planes.ts (id і price) — тут потрібні лише для
// валідації купівлі й для розіграшу ящиків, геймплейні характеристики лишаються на клієнті.
export const PLANE_IDS = ['falcon', 'phantom', 'blaze', 'wasp', 'collector', 'swift', 'titan', 'chronos', 'thunder', 'ufo', 'phoenix'] as const;
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
  thunder: 1800,
  ufo: 2300,
  phoenix: 3000,
};

export const isPlaneId = (id: string): id is PlaneId => (PLANE_IDS as readonly string[]).includes(id);

export const MAX_TIER = 4;
export const MAX_LEVEL_IN_TIER = 4;

// Тримати синхронізовано з src/game/planes.ts (levelUpCost/tierUpCost).
export function levelUpCost(price: number, tier: number, level: number): number {
  return Math.max(20, Math.round((price || 60) * 0.08 * tier * level));
}

export function tierUpCost(price: number, tier: number): { coins: number; crystals: number } {
  const crystalsByTier = [0, 40, 120, 300];
  return {
    coins: levelUpCost(price, tier, MAX_LEVEL_IN_TIER) * 6,
    crystals: crystalsByTier[tier] ?? 300,
  };
}

/** Бойові характеристики PvP. Тримати синхронізовано з src/game/planes.ts (combat + planeCombat). */
const PLANE_COMBAT: Record<PlaneId, { hp: number; damage: number }> = {
  falcon: { hp: 100, damage: 1.0 },
  phantom: { hp: 90, damage: 1.05 },
  blaze: { hp: 110, damage: 1.15 },
  wasp: { hp: 80, damage: 1.0 },
  collector: { hp: 105, damage: 0.95 },
  swift: { hp: 95, damage: 1.05 },
  titan: { hp: 140, damage: 0.95 },
  chronos: { hp: 100, damage: 1.05 },
  thunder: { hp: 105, damage: 1.15 },
  ufo: { hp: 100, damage: 1.1 },
  phoenix: { hp: 115, damage: 1.2 },
};

export function planeCombat(planeId: string, tier: number, level: number): { hp: number; damageMul: number } {
  const base = isPlaneId(planeId) ? PLANE_COMBAT[planeId] : PLANE_COMBAT.falcon;
  const t = Math.min(MAX_TIER, Math.max(1, tier));
  const l = Math.min(MAX_LEVEL_IN_TIER, Math.max(1, level));
  return { hp: base.hp + (t - 1) * 20 + (l - 1) * 5, damageMul: base.damage * (1 + 0.08 * (t - 1) + 0.02 * (l - 1)) };
}
