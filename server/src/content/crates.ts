import { PLANE_IDS, PLANE_PRICES, type PlaneId } from './planes.js';

export type CrateType = 'common' | 'rare' | 'legendary';

export type CrateReward = { kind: 'coins'; amount: number } | { kind: 'plane'; planeId: PlaneId } | { kind: 'xp'; amount: number };

interface DropRow {
  weight: number;
  roll: (ownedPlanes: string[]) => CrateReward;
}

const coinsRow = (weight: number, min: number, max: number): DropRow => ({
  weight,
  roll: () => ({ kind: 'coins', amount: min + Math.floor(Math.random() * (max - min + 1)) }),
});

const xpRow = (weight: number, min: number, max: number): DropRow => ({
  weight,
  roll: () => ({ kind: 'xp', amount: min + Math.floor(Math.random() * (max - min + 1)) }),
});

/** Якщо всі літаки вже є — рероллимо у великий бонус монет, щоб нагорода ніколи не "пропадала". */
const planeRow = (weight: number, fallbackCoins: number): DropRow => ({
  weight,
  roll: (owned) => {
    const missing = PLANE_IDS.filter((id) => !owned.includes(id));
    if (!missing.length) return { kind: 'coins', amount: fallbackCoins };
    const id = missing[Math.floor(Math.random() * missing.length)];
    return { kind: 'plane', planeId: id };
  },
});

const DROP_TABLES: Record<CrateType, DropRow[]> = {
  common: [coinsRow(70, 40, 120), xpRow(25, 20, 60), planeRow(5, 300)],
  rare: [coinsRow(55, 150, 350), xpRow(30, 80, 160), planeRow(15, 700)],
  legendary: [coinsRow(35, 400, 900), xpRow(25, 200, 400), planeRow(40, 2000)],
};

export function openCrate(type: CrateType, ownedPlanes: string[]): CrateReward {
  const rows = DROP_TABLES[type];
  const total = rows.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const row of rows) {
    if (roll < row.weight) return row.roll(ownedPlanes);
    roll -= row.weight;
  }
  return rows[0].roll(ownedPlanes);
}

export const CRATE_TYPES: readonly CrateType[] = ['common', 'rare', 'legendary'];
export const planePriceFallback = (id: PlaneId): number => PLANE_PRICES[id];
