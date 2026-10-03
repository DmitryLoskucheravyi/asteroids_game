// Тримати синхронізовано з src/game/weapons.ts (id/price скрізь; бойові числа — для PvP, де сервер рахує урон і стрільбу ботів).
export interface WeaponMeta {
  id: string;
  kind: 'bullet' | 'rocket' | 'laser' | 'missile';
  price: number;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  splashRadius?: number;
  burst?: { shots: number; cooldown: number };
  ammo?: number;
  reloadTime?: number;
  spread?: number;
  range?: number;
  salvo?: number;
  /** Дробовик: стільки куль за один постріл (кожна летить окремо з розкидом) */
  pellets?: number;
  /** Як виглядає постріл у інших гравців (лише візуал, фізика — за kind) */
  visual?: 'pellet' | 'plasma' | 'rail';
}

export const WEAPON_DEFS: readonly WeaponMeta[] = [
  { id: 'machine_gun', kind: 'bullet', price: 0, damage: 3.5, fireRate: 16, projectileSpeed: 1150, burst: { shots: 36, cooldown: 1.8 }, spread: 0.035 },
  { id: 'rocket_launcher', kind: 'rocket', price: 450, damage: 34, fireRate: 1.4, projectileSpeed: 780, splashRadius: 125, ammo: 8, reloadTime: 2.6 },
  { id: 'laser', kind: 'laser', price: 1200, damage: 4, fireRate: 12, projectileSpeed: 0, range: 380, burst: { shots: 48, cooldown: 2.4 } },
  { id: 'scatter_gun', kind: 'bullet', price: 1500, damage: 3.2, fireRate: 1.6, projectileSpeed: 1000, ammo: 6, reloadTime: 2.2, spread: 0.17, pellets: 6, range: 560, visual: 'pellet' },
  { id: 'plasma_cannon', kind: 'rocket', price: 2100, damage: 15, fireRate: 3, projectileSpeed: 640, splashRadius: 70, ammo: 12, reloadTime: 2.4, visual: 'plasma' },
  { id: 'railgun', kind: 'laser', price: 2600, damage: 27, fireRate: 0.75, projectileSpeed: 0, range: 1100, ammo: 3, reloadTime: 2.8, visual: 'rail' },
  { id: 'homing_salvo', kind: 'missile', price: 1800, damage: 11, fireRate: 1.5, projectileSpeed: 520, salvo: 3, ammo: 4, reloadTime: 3.2 },
];

export const getWeaponDef = (id: string): WeaponMeta | undefined => WEAPON_DEFS.find((w) => w.id === id);
export const DEFAULT_WEAPON_ID = 'machine_gun';

/** Дальність польоту снаряда (дзеркалить RANGE у src/game/entities/Projectile.ts). */
export const PROJECTILE_RANGE: Record<WeaponMeta['kind'], number> = { bullet: 900, rocket: 1000, laser: 380, missile: 1300 };
