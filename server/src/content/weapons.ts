// Тримати синхронізовано з src/game/weapons.ts (id/price скрізь; бойові числа — для PvP, де сервер рахує урон і стрільбу ботів).
export interface WeaponMeta {
  id: string;
  kind: 'bullet' | 'rocket';
  price: number;
  damage: number;
  fireRate: number;
  projectileSpeed: number;
  splashRadius?: number;
  burst?: { shots: number; cooldown: number };
  ammo?: number;
  reloadTime?: number;
  spread?: number;
}

export const WEAPON_DEFS: readonly WeaponMeta[] = [
  { id: 'machine_gun', kind: 'bullet', price: 0, damage: 3.5, fireRate: 16, projectileSpeed: 1150, burst: { shots: 36, cooldown: 1.8 }, spread: 0.035 },
  { id: 'rocket_launcher', kind: 'rocket', price: 450, damage: 26, fireRate: 1.2, projectileSpeed: 620, splashRadius: 90, ammo: 6, reloadTime: 3.5 },
];

export const getWeaponDef = (id: string): WeaponMeta | undefined => WEAPON_DEFS.find((w) => w.id === id);
export const DEFAULT_WEAPON_ID = 'machine_gun';

/** Дальність польоту снаряда (дзеркалить RANGE у src/game/entities/Projectile.ts). */
export const PROJECTILE_RANGE: Record<WeaponMeta['kind'], number> = { bullet: 900, rocket: 1000 };
