// Тримати синхронізовано з src/game/weapons.ts (id/price — геймплейні числа лишаються на клієнті).
interface WeaponMeta {
  id: string;
  price: number;
}

export const WEAPON_DEFS: readonly WeaponMeta[] = [
  { id: 'machine_gun', price: 0 },
  { id: 'rocket_launcher', price: 450 },
];

export const getWeaponDef = (id: string): WeaponMeta | undefined => WEAPON_DEFS.find((w) => w.id === id);
export const DEFAULT_WEAPON_ID = 'machine_gun';
