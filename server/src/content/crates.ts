import { PLANE_IDS, PLANE_PRICES, type PlaneId } from './planes.js';
import { ITEM_DEFS, type ItemRarity } from './items.js';
import { WEAPON_DEFS } from './weapons.js';

export type CrateType = 'common' | 'rare' | 'epic' | 'mythic' | 'legendary';
export const CRATE_TYPES: readonly CrateType[] = ['common', 'rare', 'epic', 'mythic', 'legendary'];
export const isCrateType = (v: string): v is CrateType => (CRATE_TYPES as readonly string[]).includes(v);

export type CrateReward =
  | { kind: 'coins'; amount: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'crystals'; amount: number }
  | { kind: 'plane'; planeId: PlaneId }
  | { kind: 'item'; defId: string; rarity: ItemRarity }
  | { kind: 'weapon'; weaponId: string };

/** Що вже є в гравця — щоб не видавати дублікати; оновлюється по ходу відкриття. */
export interface Owned {
  planes: string[];
  items: string[];
  weapons: string[];
}

type Kind = 'coins' | 'xp' | 'crystals' | 'item' | 'weapon' | 'plane';

interface CrateDef {
  /** Скільки нагород випадає за одне відкриття */
  rolls: number;
  /** Перша нагорода — гарантовано "цінна" (предмет/зброя/літак) */
  guaranteed: boolean;
  weights: Record<Kind, number>;
  coins: [number, number];
  xp: [number, number];
  crystals: [number, number];
  /** Які рідкості предметів можуть випасти */
  itemRarities: ItemRarity[];
}

const CRATES: Record<CrateType, CrateDef> = {
  common: { rolls: 2, guaranteed: false, weights: { coins: 50, xp: 25, crystals: 15, item: 8, weapon: 0, plane: 2 }, coins: [40, 150], xp: [20, 60], crystals: [1, 3], itemRarities: ['common'] },
  rare: { rolls: 3, guaranteed: false, weights: { coins: 40, xp: 20, crystals: 20, item: 13, weapon: 2, plane: 5 }, coins: [150, 400], xp: [60, 140], crystals: [3, 8], itemRarities: ['common', 'rare'] },
  epic: { rolls: 3, guaranteed: true, weights: { coins: 32, xp: 15, crystals: 25, item: 18, weapon: 3, plane: 7 }, coins: [300, 700], xp: [120, 260], crystals: [8, 20], itemRarities: ['rare', 'epic'] },
  mythic: { rolls: 4, guaranteed: true, weights: { coins: 26, xp: 12, crystals: 25, item: 24, weapon: 4, plane: 9 }, coins: [600, 1200], xp: [220, 420], crystals: [15, 35], itemRarities: ['epic', 'mythic'] },
  legendary: { rolls: 5, guaranteed: true, weights: { coins: 22, xp: 10, crystals: 25, item: 25, weapon: 4, plane: 14 }, coins: [1000, 2500], xp: [350, 700], crystals: [25, 60], itemRarities: ['mythic', 'legendary'] },
};

const between = ([a, b]: [number, number]): number => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

function pickKind(weights: Record<Kind, number>, only?: Kind[]): Kind {
  const entries = (Object.entries(weights) as [Kind, number][]).filter(([k, w]) => w > 0 && (!only || only.includes(k)));
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [k, w] of entries) {
    if (roll < w) return k;
    roll -= w;
  }
  return entries[0][0];
}

/** Одна нагорода; якщо все цінне вже є — замінюється на щедру порцію монет/кристалів. */
function rollOne(def: CrateDef, kind: Kind, owned: Owned): CrateReward {
  switch (kind) {
    case 'coins':
      return { kind: 'coins', amount: between(def.coins) };
    case 'xp':
      return { kind: 'xp', amount: between(def.xp) };
    case 'crystals':
      return { kind: 'crystals', amount: between(def.crystals) };
    case 'item': {
      const pool = ITEM_DEFS.filter((i) => def.itemRarities.includes(i.rarity) && !owned.items.includes(i.id));
      if (!pool.length) return { kind: 'crystals', amount: between(def.crystals) * 2 };
      const it = pick(pool);
      owned.items.push(it.id);
      return { kind: 'item', defId: it.id, rarity: it.rarity };
    }
    case 'weapon': {
      const pool = WEAPON_DEFS.filter((w) => w.price > 0 && !owned.weapons.includes(w.id));
      if (!pool.length) return { kind: 'coins', amount: between(def.coins) * 2 };
      const w = pick(pool);
      owned.weapons.push(w.id);
      return { kind: 'weapon', weaponId: w.id };
    }
    case 'plane': {
      const pool = PLANE_IDS.filter((id) => !owned.planes.includes(id));
      if (!pool.length) return { kind: 'coins', amount: between(def.coins) * 3 };
      const id = pick(pool);
      owned.planes.push(id);
      return { kind: 'plane', planeId: id };
    }
  }
}

export function openCrate(type: CrateType, owned: Owned): CrateReward[] {
  const def = CRATES[type];
  const out: CrateReward[] = [];
  for (let i = 0; i < def.rolls; i++) {
    const kind = i === 0 && def.guaranteed ? pickKind(def.weights, ['item', 'weapon', 'plane']) : pickKind(def.weights);
    out.push(rollOne(def, kind, owned));
  }
  return out;
}

export const planePriceFallback = (id: PlaneId): number => PLANE_PRICES[id];
