// Тримати синхронізовано з src/game/weapons.ts (id/price скрізь; damage/fireRate тут — для PvP, де сервер рахує урон сам).
interface WeaponMeta {
  id: string;
  price: number;
  damage: number;
  fireRate: number;
}

export const WEAPON_DEFS: readonly WeaponMeta[] = [
  { id: 'machine_gun', price: 0, damage: 1, fireRate: 6 },
  { id: 'rocket_launcher', price: 450, damage: 4, fireRate: 1.1 },
];

export const getWeaponDef = (id: string): WeaponMeta | undefined => WEAPON_DEFS.find((w) => w.id === id);
export const DEFAULT_WEAPON_ID = 'machine_gun';
