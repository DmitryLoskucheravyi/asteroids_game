import type { PlaneFeature, PlaneSpec } from './planes';
import type { TKey } from '../core/i18n';

export type ItemRarity = 'common' | 'rare' | 'epic' | 'mythic' | 'legendary';
export type ItemSlot = 'active' | 'passive';
export type ActiveKind = 'emp' | 'phase' | 'nanoRepair' | 'overdrive' | 'swarm';

export const RARITIES: readonly ItemRarity[] = ['common', 'rare', 'epic', 'mythic', 'legendary'];

/** Бойові бонуси пасиву (PvP та стрільба в кампанії). */
export interface CombatBonus {
  /** + до максимального HP у PvP */
  hp?: number;
  /** множник урону зброї (0.15 = +15 %) */
  damage?: number;
  /** множник скорострільності (0.2 = +20 %) */
  fireRate?: number;
  /** множник швидкості (0.08 = +8 %) */
  speed?: number;
  /** скорочення перезарядки навичок (0.15 = −15 %) */
  cooldown?: number;
}

export interface ActiveEffect {
  kind: ActiveKind;
  /** Перезарядка, с */
  cooldown: number;
  duration?: number;
  radius?: number;
  /** Урон (рій ракет) або лікування (нанорепарація) у PvP */
  power?: number;
}

export interface ItemDef {
  id: string;
  slot: ItemSlot;
  /** Рідкість — властивість самого предмета, а не варіант покупки */
  rarity: ItemRarity;
  nameKey: TKey;
  descKey: TKey;
  /** Пасив: дельта до PlaneFeature (кампанія) */
  feature?: Partial<PlaneFeature>;
  combat?: CombatBonus;
  active?: ActiveEffect;
  price: number;
  /** Основний колір зовнішнього вигляду */
  color: string;
}

/** Тримати синхронізовано з server/src/content/items.ts (id/slot/rarity/price/combat/active.power/cooldown). */
export const ITEM_DEFS: readonly ItemDef[] = [
  // ---- пасиви ----
  { id: 'magnet_booster', slot: 'passive', rarity: 'common', nameKey: 'item.magnetBooster', descKey: 'itemDesc.magnetBooster', feature: { magnetRadius: 120 }, combat: { damage: 0.2, speed: 0.03 }, price: 300, color: '#18c8b0' },
  { id: 'armor_plating', slot: 'passive', rarity: 'common', nameKey: 'item.armorPlating', descKey: 'itemDesc.armorPlating', feature: { shieldRegen: -2 }, combat: { damage: 0.2, hp: 25 }, price: 350, color: '#9aa6c0' },
  { id: 'targeting_cpu', slot: 'passive', rarity: 'rare', nameKey: 'item.targetingCpu', descKey: 'itemDesc.targetingCpu', combat: { damage: 0.45 }, price: 900, color: '#58d2ff' },
  { id: 'afterburner', slot: 'passive', rarity: 'rare', nameKey: 'item.afterburner', descKey: 'itemDesc.afterburner', feature: { extraBoost: 1 }, combat: { damage: 0.3, speed: 0.1 }, price: 950, color: '#ff8a3a' },
  { id: 'nano_coating', slot: 'passive', rarity: 'epic', nameKey: 'item.nanoCoating', descKey: 'itemDesc.nanoCoating', feature: { extraLives: 1 }, combat: { damage: 0.4, hp: 40 }, price: 2200, color: '#b77bff' },
  { id: 'overclock_core', slot: 'passive', rarity: 'mythic', nameKey: 'item.overclockCore', descKey: 'itemDesc.overclockCore', feature: { jumpCooldownMul: 0.85 }, combat: { damage: 0.55, fireRate: 0.25, cooldown: 0.15 }, price: 4200, color: '#ff4fa8' },
  { id: 'phoenix_heart', slot: 'passive', rarity: 'legendary', nameKey: 'item.phoenixHeart', descKey: 'itemDesc.phoenixHeart', feature: { extraLives: 1, startShield: true }, combat: { hp: 50, damage: 0.75 }, price: 7500, color: '#ffc23a' },
  // ---- активи ----
  { id: 'nano_repair', slot: 'active', rarity: 'common', nameKey: 'item.nanoRepair', descKey: 'itemDesc.nanoRepair', active: { kind: 'nanoRepair', cooldown: 24, power: 18 }, combat: { damage: 0.2 }, price: 380, color: '#4fe08a' },
  { id: 'emp_pulse', slot: 'active', rarity: 'rare', nameKey: 'item.empPulse', descKey: 'itemDesc.empPulse', active: { kind: 'emp', cooldown: 16, duration: 2.5, radius: 260, power: 20 }, combat: { damage: 0.3 }, price: 1000, color: '#9fe3ff' },
  { id: 'decoy_flare', slot: 'active', rarity: 'epic', nameKey: 'item.phaseShift', descKey: 'itemDesc.phaseShift', active: { kind: 'phase', cooldown: 18, duration: 2 }, combat: { damage: 0.4 }, price: 2400, color: '#c9a7ff' },
  { id: 'overdrive', slot: 'active', rarity: 'mythic', nameKey: 'item.overdrive', descKey: 'itemDesc.overdrive', active: { kind: 'overdrive', cooldown: 22, duration: 4 }, combat: { damage: 0.55 }, price: 4500, color: '#ff5a3a' },
  { id: 'missile_swarm', slot: 'active', rarity: 'legendary', nameKey: 'item.missileSwarm', descKey: 'itemDesc.missileSwarm', active: { kind: 'swarm', cooldown: 18, power: 20 }, combat: { damage: 0.75 }, price: 8000, color: '#ffd24a' },
];

export const getItemDef = (id: string): ItemDef | undefined => ITEM_DEFS.find((i) => i.id === id);

/** Накладає пасив екіпірованого предмета на вже прокачаний PlaneSpec. */
export function applyItemPassive(spec: PlaneSpec, def: ItemDef | undefined): PlaneSpec {
  if (!def || def.slot !== 'passive') return spec;
  const f: PlaneFeature = { ...spec.feature };
  for (const [key, delta] of Object.entries(def.feature ?? {}) as [keyof PlaneFeature, number | boolean | undefined][]) {
    if (typeof delta === 'boolean') {
      (f[key] as boolean) = delta;
      continue;
    }
    if (typeof delta !== 'number') continue;
    if (key === 'jumpCooldownMul') {
      f.jumpCooldownMul = (f.jumpCooldownMul ?? 1) * delta;
      continue;
    }
    const current = (f[key] as number | undefined) ?? (key === 'shieldRegen' ? 26 : 0);
    (f[key] as number) = key === 'shieldRegen' ? Math.max(8, current + delta) : current + delta;
  }
  const speed = 1 + (def.combat?.speed ?? 0);
  return { ...spec, maxSpeed: spec.maxSpeed * speed, accel: spec.accel * speed, feature: f };
}

/** Сумарний бонус урону від екіпірованих предметів (і актив, і пасив). Дзеркалить server/src/pvp/room.ts. */
export function loadoutDamageBonus(...defs: (ItemDef | undefined)[]): number {
  return defs.reduce((sum, d) => sum + (d?.combat?.damage ?? 0), 0);
}

/** Список рядків "характеристика → значення" для картки предмета. */
export function itemStatLines(def: ItemDef): { key: TKey; value: string }[] {
  const out: { key: TKey; value: string }[] = [];
  const pct = (v: number) => `+${Math.round(v * 100)}%`;
  const c = def.combat ?? {};
  if (c.hp) out.push({ key: 'stat.hp', value: `+${c.hp}` });
  if (c.damage) out.push({ key: 'stat.damage', value: pct(c.damage) });
  if (c.fireRate) out.push({ key: 'stat.fireRate', value: pct(c.fireRate) });
  if (c.speed) out.push({ key: 'stat.speed', value: pct(c.speed) });
  if (c.cooldown) out.push({ key: 'stat.cooldown', value: `−${Math.round(c.cooldown * 100)}%` });
  const f = def.feature ?? {};
  if (f.magnetRadius) out.push({ key: 'stat.magnet', value: `+${f.magnetRadius}` });
  if (f.extraLives) out.push({ key: 'stat.lives', value: `+${f.extraLives}` });
  if (f.extraBoost) out.push({ key: 'stat.boost', value: `+${f.extraBoost}` });
  if (f.startShield) out.push({ key: 'stat.startShield', value: '✓' });
  const a = def.active;
  if (a) {
    out.push({ key: 'stat.itemCooldown', value: `${a.cooldown} s` });
    if (a.duration) out.push({ key: 'stat.duration', value: `${a.duration} s` });
    if (a.radius) out.push({ key: 'stat.radius', value: String(a.radius) });
    if (a.kind === 'nanoRepair' && a.power) out.push({ key: 'stat.heal', value: `+${a.power} HP` });
    if (a.kind === 'emp' && a.power) out.push({ key: 'stat.pulseDamage', value: String(a.power) });
    if (a.kind === 'swarm' && a.power) out.push({ key: 'stat.pulseDamage', value: `6 × ${a.power}` });
  }
  return out;
}
