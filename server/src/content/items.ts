// Тримати синхронізовано з src/game/items.ts (id/slot/basePrice — геймплейні числа статів лишаються на клієнті).
export type ItemRarity = 'common' | 'rare' | 'epic' | 'mythic' | 'legendary';
export type ItemSlot = 'active' | 'passive';

export const RARITIES: readonly ItemRarity[] = ['common', 'rare', 'epic', 'mythic', 'legendary'];
export const RARITY_PRICE_MUL: Record<ItemRarity, number> = { common: 1, rare: 2.2, epic: 4.5, mythic: 8, legendary: 14 };

interface ItemMeta {
  id: string;
  slot: ItemSlot;
  basePrice: number;
}

export const ITEM_DEFS: readonly ItemMeta[] = [
  { id: 'magnet_booster', slot: 'passive', basePrice: 300 },
  { id: 'armor_plating', slot: 'passive', basePrice: 350 },
  { id: 'nano_coating', slot: 'passive', basePrice: 550 },
  { id: 'emp_pulse', slot: 'active', basePrice: 300 },
  { id: 'decoy_flare', slot: 'active', basePrice: 300 },
  { id: 'nano_repair', slot: 'active', basePrice: 380 },
];

export const getItemDef = (id: string): ItemMeta | undefined => ITEM_DEFS.find((i) => i.id === id);
export const isRarity = (r: string): r is ItemRarity => (RARITIES as readonly string[]).includes(r);

export function itemPrice(def: ItemMeta, rarity: ItemRarity): number {
  return Math.round(def.basePrice * RARITY_PRICE_MUL[rarity]);
}
