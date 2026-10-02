import { getItemDef, type ItemRarity } from './items.js';
import { getWeaponDef } from './weapons.js';
import { PLANE_PRICES, isPlaneId } from './planes.js';

/** 1 кристал ≈ 45 монет — єдина шкала вартості для дублікатів у ящиках і пропуску. */
export const COINS_PER_CRYSTAL = 45;

const ITEM_DUP: Record<ItemRarity, number> = { common: 5, rare: 12, epic: 25, mythic: 50, legendary: 85 };

/** Скільки кристалів дати замість предмета/зброї/літака, які вже є в гравця. */
export function duplicateCrystals(kind: 'item' | 'weapon' | 'plane', id: string): number {
  if (kind === 'item') {
    const def = getItemDef(id);
    return def ? ITEM_DUP[def.rarity] : 5;
  }
  if (kind === 'weapon') {
    const def = getWeaponDef(id);
    return Math.max(5, Math.round((def?.price ?? 0) / COINS_PER_CRYSTAL));
  }
  return Math.max(5, Math.round((isPlaneId(id) ? PLANE_PRICES[id] : 0) / COINS_PER_CRYSTAL));
}
