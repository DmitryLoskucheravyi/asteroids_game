/**
 * Прокачка зброї й предметів — спільна для сервера й клієнта (без залежностей).
 *
 * Рівні 1..5. Прокачка підсилює насамперед витривалість (більший магазин / черга, швидша перезарядка,
 * більше HP, сильніший актив), а урон за одне влучання — лише трохи: так розрив новачок/максимум
 * у PvP лишається в межах балансу (≤ 3×), а прокачка все одно відчутна.
 */

export const MAX_GEAR_LEVEL = 5;

export const clampLevel = (l: number | null | undefined): number => Math.max(1, Math.min(MAX_GEAR_LEVEL, Math.floor(Number(l) || 1)));

// ---------- зброя ----------

/** Урон за влучання: +1.5% за рівень (максимум +6%). */
export const weaponDamageMul = (level: number): number => 1 + 0.015 * (clampLevel(level) - 1);
/** Магазин / черга: +8% пострілів за рівень. */
export const weaponCapacityMul = (level: number): number => 1 + 0.08 * (clampLevel(level) - 1);
/** Перезарядка / охолодження черги: −5% за рівень. */
export const weaponReloadMul = (level: number): number => 1 - 0.05 * (clampLevel(level) - 1);

// ---------- предмети ----------

/** HP від пасиву, сила й перезарядка активу. Бонус урону предмета прокачка не змінює (кап балансу). */
export const itemHpMul = (level: number): number => 1 + 0.05 * (clampLevel(level) - 1);
export const itemPowerMul = (level: number): number => 1 + 0.1 * (clampLevel(level) - 1);
export const itemCooldownMul = (level: number): number => 1 - 0.04 * (clampLevel(level) - 1);
/** Інші бонуси пасиву (швидкість, скорострільність, перезарядка навичок): +6% від бонусу за рівень. */
export const itemBonusMul = (level: number): number => 1 + 0.06 * (clampLevel(level) - 1);

/** Рідкість → множник ціни прокачки предмета. */
const RARITY_K: Record<string, number> = { common: 1, rare: 1.4, epic: 1.9, mythic: 2.5, legendary: 3.2 };

/** Ціна переходу з рівня level на level+1. */
export function weaponUpgradeCost(price: number, level: number): { coins: number; crystals: number } {
  const base = Math.max(250, price * 0.3);
  return { coins: Math.round((base * level) / 10) * 10, crystals: level >= 3 ? (level - 2) * 15 : 0 };
}

export function itemUpgradeCost(price: number, rarity: string, level: number): { coins: number; crystals: number } {
  const base = Math.max(200, price * 0.3);
  return { coins: Math.round((base * level) / 10) * 10, crystals: level >= 3 ? Math.round((level - 2) * 10 * (RARITY_K[rarity] ?? 1)) : 0 };
}
