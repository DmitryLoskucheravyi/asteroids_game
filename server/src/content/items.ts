// Тримати синхронізовано з src/game/items.ts (id/slot/rarity/price/combat/active).
export type ItemRarity = 'common' | 'rare' | 'epic' | 'mythic' | 'legendary';
export type ItemSlot = 'active' | 'passive';

export interface CombatBonus {
  hp?: number;
  damage?: number;
  fireRate?: number;
  speed?: number;
  cooldown?: number;
}

export interface ItemMeta {
  id: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  price: number;
  combat?: CombatBonus;
  active?: { kind: 'emp' | 'phase' | 'nanoRepair' | 'overdrive' | 'swarm'; cooldown: number; duration?: number; radius?: number; power?: number };
}

export const ITEM_DEFS: readonly ItemMeta[] = [
  { id: 'magnet_booster', slot: 'passive', rarity: 'common', price: 300, combat: { damage: 0.2, speed: 0.03 } },
  { id: 'armor_plating', slot: 'passive', rarity: 'common', price: 350, combat: { damage: 0.2, hp: 25 } },
  { id: 'targeting_cpu', slot: 'passive', rarity: 'rare', price: 900, combat: { damage: 0.45 } },
  { id: 'afterburner', slot: 'passive', rarity: 'rare', price: 950, combat: { damage: 0.3, speed: 0.1 } },
  { id: 'nano_coating', slot: 'passive', rarity: 'epic', price: 2200, combat: { damage: 0.4, hp: 40 } },
  { id: 'overclock_core', slot: 'passive', rarity: 'mythic', price: 4200, combat: { damage: 0.55, fireRate: 0.25, cooldown: 0.15 } },
  { id: 'phoenix_heart', slot: 'passive', rarity: 'legendary', price: 7500, combat: { hp: 50, damage: 0.75 } },
  { id: 'nano_repair', slot: 'active', rarity: 'common', combat: { damage: 0.2 }, price: 380, active: { kind: 'nanoRepair', cooldown: 20, power: 35 } },
  { id: 'emp_pulse', slot: 'active', rarity: 'rare', combat: { damage: 0.3 }, price: 1000, active: { kind: 'emp', cooldown: 16, duration: 2.5, radius: 260, power: 20 } },
  { id: 'decoy_flare', slot: 'active', rarity: 'epic', combat: { damage: 0.4 }, price: 2400, active: { kind: 'phase', cooldown: 18, duration: 2 } },
  { id: 'overdrive', slot: 'active', rarity: 'mythic', combat: { damage: 0.55 }, price: 4500, active: { kind: 'overdrive', cooldown: 22, duration: 4 } },
  { id: 'missile_swarm', slot: 'active', rarity: 'legendary', combat: { damage: 0.75 }, price: 8000, active: { kind: 'swarm', cooldown: 18, power: 20 } },
];

export const getItemDef = (id: string): ItemMeta | undefined => ITEM_DEFS.find((i) => i.id === id);
