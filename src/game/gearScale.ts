import { clampLevel, itemBonusMul, itemCooldownMul, itemHpMul, itemPowerMul, weaponCapacityMul, weaponDamageMul, weaponReloadMul } from '../../server/src/shared/gear';
import type { ItemDef } from './items';
import type { WeaponDef } from './weapons';

/** Зброя з урахуванням рівня прокачки: більший магазин / черга, швидша перезарядка, трохи більший урон. */
export function scaledWeapon(def: WeaponDef, level: number): WeaponDef {
  const l = clampLevel(level);
  if (l === 1) return def;
  const cap = weaponCapacityMul(l);
  const reload = weaponReloadMul(l);
  return {
    ...def,
    damage: def.damage * weaponDamageMul(l),
    ammo: def.ammo === 'infinite' ? 'infinite' : Math.round(def.ammo * cap),
    reloadTime: def.reloadTime !== undefined ? def.reloadTime * reload : undefined,
    burst: def.burst && { shots: Math.round(def.burst.shots * cap), cooldown: def.burst.cooldown * reload },
  };
}

/** Предмет із урахуванням рівня (дзеркалить сервер: бонус урону не змінюється). */
export function scaledItem(def: ItemDef | undefined, level: number | undefined): ItemDef | undefined {
  if (!def) return undefined;
  const l = clampLevel(level);
  if (l === 1) return def;
  const c = def.combat;
  return {
    ...def,
    combat: c && {
      ...c,
      hp: c.hp !== undefined ? Math.round(c.hp * itemHpMul(l)) : undefined,
      speed: c.speed !== undefined ? c.speed * itemBonusMul(l) : undefined,
      fireRate: c.fireRate !== undefined ? c.fireRate * itemBonusMul(l) : undefined,
      cooldown: c.cooldown !== undefined ? c.cooldown * itemBonusMul(l) : undefined,
    },
    active: def.active && { ...def.active, power: def.active.power !== undefined ? def.active.power * itemPowerMul(l) : undefined, cooldown: def.active.cooldown * itemCooldownMul(l) },
  };
}
