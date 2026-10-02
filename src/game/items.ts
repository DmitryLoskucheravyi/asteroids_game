import type { PlaneFeature, PlaneSpec } from './planes';
import type { TKey } from '../core/i18n';

export type ItemRarity = 'common' | 'rare' | 'epic' | 'mythic' | 'legendary';
export type ItemSlot = 'active' | 'passive';
export type ActiveKind = 'emp' | 'decoyFlare' | 'nanoRepair';

export const RARITIES: readonly ItemRarity[] = ['common', 'rare', 'epic', 'mythic', 'legendary'];

/** Мультиплікатор сили ефекту за рідкістю — застосовується поверх базового ефекту предмета. */
export const RARITY_MUL: Record<ItemRarity, number> = { common: 1.0, rare: 1.3, epic: 1.7, mythic: 2.2, legendary: 3.0 };
/** Мультиплікатор ціни за рідкістю (базова ціна — для звичайної). */
export const RARITY_PRICE_MUL: Record<ItemRarity, number> = { common: 1, rare: 2.2, epic: 4.5, mythic: 8, legendary: 14 };

export interface ActiveEffect {
  kind: ActiveKind;
  /** Перезарядка, с (масштабується рідкістю — рідкісні перезаряджаються швидше) */
  cooldown: number;
  duration?: number;
  radius?: number;
}

export interface ItemDef {
  id: string;
  slot: ItemSlot;
  nameKey: TKey;
  descKey: TKey;
  /** Пасив: дельта до PlaneFeature, масштабується RARITY_MUL і додається до статів літака. */
  passiveEffect?: Partial<PlaneFeature>;
  active?: ActiveEffect;
  /** Базова ціна (звичайна рідкість); інші рідкості — basePrice * RARITY_PRICE_MUL. */
  basePrice: number;
}

export const ITEM_DEFS: readonly ItemDef[] = [
  { id: 'magnet_booster', slot: 'passive', nameKey: 'item.magnetBooster', descKey: 'itemDesc.magnetBooster', passiveEffect: { magnetRadius: 90 }, basePrice: 300 },
  { id: 'armor_plating', slot: 'passive', nameKey: 'item.armorPlating', descKey: 'itemDesc.armorPlating', passiveEffect: { shieldRegen: -4 }, basePrice: 350 },
  { id: 'nano_coating', slot: 'passive', nameKey: 'item.nanoCoating', descKey: 'itemDesc.nanoCoating', passiveEffect: { extraLives: 1 }, basePrice: 550 },
  { id: 'emp_pulse', slot: 'active', nameKey: 'item.empPulse', descKey: 'itemDesc.empPulse', active: { kind: 'emp', cooldown: 16, duration: 2.5, radius: 220 }, basePrice: 300 },
  { id: 'decoy_flare', slot: 'active', nameKey: 'item.decoyFlare', descKey: 'itemDesc.decoyFlare', active: { kind: 'decoyFlare', cooldown: 14, duration: 2 }, basePrice: 300 },
  { id: 'nano_repair', slot: 'active', nameKey: 'item.nanoRepair', descKey: 'itemDesc.nanoRepair', active: { kind: 'nanoRepair', cooldown: 22 }, basePrice: 380 },
];

export const getItemDef = (id: string): ItemDef | undefined => ITEM_DEFS.find((i) => i.id === id);

export function itemPrice(def: ItemDef, rarity: ItemRarity): number {
  return Math.round(def.basePrice * RARITY_PRICE_MUL[rarity]);
}

/** Накладає масштабований рідкістю пасив екіпірованого предмета на вже прокачаний PlaneSpec. */
export function applyItemPassive(spec: PlaneSpec, def: ItemDef | undefined, rarity: ItemRarity | undefined): PlaneSpec {
  if (!def || def.slot !== 'passive' || !def.passiveEffect || !rarity) return spec;
  const mul = RARITY_MUL[rarity];
  const f: PlaneFeature = { ...spec.feature };
  for (const [key, delta] of Object.entries(def.passiveEffect) as [keyof PlaneFeature, number | boolean | undefined][]) {
    if (typeof delta !== 'number') continue;
    const scaled = delta * mul;
    const current = (f[key] as number | undefined) ?? 0;
    (f[key] as number) = key === 'shieldRegen' ? Math.max(8, current + scaled) : current + scaled;
  }
  return { ...spec, feature: f };
}

/** Перезарядка/тривалість активного предмета масштабуються рідкістю (рідкісний — швидший і сильніший). */
export function effectiveActive(def: ItemDef, rarity: ItemRarity): { cooldown: number; duration: number; radius: number } {
  const a = def.active!;
  const mul = RARITY_MUL[rarity];
  return {
    cooldown: Math.max(4, a.cooldown / (0.6 + mul * 0.4)),
    duration: (a.duration ?? 0) * (0.7 + mul * 0.3),
    radius: (a.radius ?? 0) * (0.7 + mul * 0.3),
  };
}
