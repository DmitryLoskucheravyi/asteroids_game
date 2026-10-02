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

export interface CrateDef {
  /** Скільки нагород випадає за одне відкриття */
  rolls: number;
  /** Шанс, що перша нагорода буде "цінною" (предмет/зброя/літак) — лише для найрідкісніших ящиків */
  jackpotChance: number;
  weights: Record<Kind, number>;
  coins: [number, number];
  xp: [number, number];
  crystals: [number, number];
  /** Які рідкості предметів можуть випасти */
  itemRarities: ItemRarity[];
}

// Предмети, зброя й особливо літаки — рідкісна удача: основу нагород складають монети, досвід і кристали.
export const CRATES: Record<CrateType, CrateDef> = {
  common: { rolls: 2, jackpotChance: 0, weights: { coins: 60, xp: 28, crystals: 11, item: 0.8, weapon: 0, plane: 0.15 }, coins: [40, 150], xp: [20, 60], crystals: [1, 3], itemRarities: ['common'] },
  rare: { rolls: 3, jackpotChance: 0, weights: { coins: 50, xp: 25, crystals: 22, item: 2.2, weapon: 0.3, plane: 0.4 }, coins: [150, 400], xp: [60, 140], crystals: [3, 8], itemRarities: ['common', 'rare'] },
  epic: { rolls: 3, jackpotChance: 0, weights: { coins: 45, xp: 22, crystals: 28, item: 3.5, weapon: 0.6, plane: 0.8 }, coins: [300, 700], xp: [120, 260], crystals: [8, 20], itemRarities: ['rare', 'epic'] },
  mythic: { rolls: 4, jackpotChance: 0.08, weights: { coins: 40, xp: 20, crystals: 32, item: 5, weapon: 0.9, plane: 1.2 }, coins: [600, 1200], xp: [220, 420], crystals: [15, 35], itemRarities: ['epic', 'mythic'] },
  legendary: { rolls: 5, jackpotChance: 0.2, weights: { coins: 36, xp: 18, crystals: 34, item: 7, weapon: 1.2, plane: 1.8 }, coins: [1000, 2500], xp: [350, 700], crystals: [25, 60], itemRarities: ['mythic', 'legendary'] },
};

/** Серед доступних предметів дешевші рідкості трапляються значно частіше. */
export const ITEM_RARITY_WEIGHT: Record<ItemRarity, number> = { common: 10, rare: 5, epic: 2.5, mythic: 1.2, legendary: 0.5 };

function weightedPick<T>(list: readonly T[], weight: (v: T) => number): T {
  const total = list.reduce((s, v) => s + weight(v), 0);
  let roll = Math.random() * total;
  for (const v of list) {
    if (roll < weight(v)) return v;
    roll -= weight(v);
  }
  return list[0];
}

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
      const it = weightedPick(pool, (i) => ITEM_RARITY_WEIGHT[i.rarity]);
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
      // дорогі літаки випадають рідше за дешеві
      const id = weightedPick(pool, (p) => 1 / Math.max(150, PLANE_PRICES[p]));
      owned.planes.push(id);
      return { kind: 'plane', planeId: id };
    }
  }
}

export function openCrate(type: CrateType, owned: Owned): CrateReward[] {
  const def = CRATES[type];
  const out: CrateReward[] = [];
  for (let i = 0; i < def.rolls; i++) {
    const jackpot = i === 0 && Math.random() < def.jackpotChance;
    const kind = jackpot ? pickKind(def.weights, ['item', 'weapon', 'plane']) : pickKind(def.weights);
    out.push(rollOne(def, kind, owned));
  }
  return out;
}

export const planePriceFallback = (id: PlaneId): number => PLANE_PRICES[id];
