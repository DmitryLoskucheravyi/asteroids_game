import type { TKey } from '../core/i18n';

export type WeaponKind = 'bullet' | 'rocket';

export interface WeaponDef {
  id: string;
  kind: WeaponKind;
  nameKey: TKey;
  descKey: TKey;
  /** Пострілів за секунду */
  fireRate: number;
  projectileSpeed: number;
  damage: number;
  /** Лише для rocket — радіус ураження вибуху */
  splashRadius?: number;
  ammo: number | 'infinite';
  reloadTime?: number;
  /** 0 — стартова зброя, доступна всім безкоштовно */
  price: number;
}

/** Відкритий список — лазер/шотган/рейка додаються новим записом, без зміни коду стрільби. */
export const WEAPON_DEFS: readonly WeaponDef[] = [
  { id: 'machine_gun', kind: 'bullet', nameKey: 'weapon.machineGun', descKey: 'weaponDesc.machineGun', fireRate: 6, projectileSpeed: 760, damage: 1, ammo: 'infinite', price: 0 },
  { id: 'rocket_launcher', kind: 'rocket', nameKey: 'weapon.rocketLauncher', descKey: 'weaponDesc.rocketLauncher', fireRate: 1.1, projectileSpeed: 480, damage: 4, splashRadius: 90, ammo: 6, reloadTime: 3.5, price: 450 },
];

export const getWeaponDef = (id: string | null | undefined): WeaponDef | undefined => WEAPON_DEFS.find((w) => w.id === id);
export const DEFAULT_WEAPON_ID = 'machine_gun';

/** Чи досить сильна зброя, щоб знищити астероїд цього розміру (ast без розколу на уламки — одне влучання). */
export function canDestroy(kind: WeaponKind, size: 'small' | 'medium' | 'large'): boolean {
  if (size === 'large') return false;
  if (kind === 'rocket') return true;
  return size === 'small';
}
