export const SEASON_ID = 'season-1';
export const SEASON_STARTS = new Date('2026-01-01T00:00:00Z');
export const SEASON_ENDS = new Date('2026-12-31T23:59:59Z');

import type { CrateType } from './crates.js';

/** Нагорода тьєру: валюта/досвід + (іноді) ящик, предмет, зброя або літак. */
export type PassReward = {
  coins: number;
  xp: number;
  crate?: CrateType;
  crystals?: number;
  item?: string;
  weapon?: string;
  plane?: string;
};

export interface PassTier {
  tier: number;
  bpRequired: number;
  /** Безкоштовний трек — доступний усім після набору BP. */
  reward: PassReward;
  /** Платний трек — потребує купленого преміум-пропуску цього сезону. */
  premiumReward: PassReward;
}

const TIER_COUNT = 40;

/** Ціна преміум-пропуску на сезон, у монетах (без реальних платежів). */
export const PREMIUM_PASS_PRICE = 500;

/** Особливі тьєри — рідкісні речі (предмети, зброя, літаки) як віхи сезону. */
const FREE_SPECIAL: Record<number, Partial<PassReward>> = {
  8: { item: 'magnet_booster' },
  16: { item: 'armor_plating' },
  24: { item: 'targeting_cpu' },
  32: { weapon: 'laser' },
  40: { plane: 'swift', crate: 'legendary' },
};
const PREMIUM_SPECIAL: Record<number, Partial<PassReward>> = {
  6: { item: 'nano_repair' },
  14: { item: 'afterburner' },
  20: { item: 'nano_coating' },
  28: { weapon: 'homing_salvo' },
  36: { item: 'overclock_core' },
  40: { plane: 'thunder', crate: 'legendary' },
};

function crateFor(tier: number, premium: boolean): CrateType {
  if (tier % 20 === 0) return 'legendary';
  if (tier % (premium ? 12 : 15) === 0) return 'mythic';
  if (tier % (premium ? 8 : 10) === 0) return 'epic';
  if (tier % (premium ? 4 : 5) === 0) return 'rare';
  return 'common';
}

export const PASS_TIERS: readonly PassTier[] = Array.from({ length: TIER_COUNT }, (_, i) => {
  const tier = i + 1;
  // безкоштовний: монети щотьєру, кристали кожен 3-й, ящик кожен 5-й, віхи з предметами
  const free: PassReward = { coins: 50 + tier * 6, xp: 25 + tier };
  if (tier % 3 === 0) free.crystals = 3 + Math.floor(tier / 3);
  if (tier % 5 === 0) free.crate = crateFor(tier, false);
  Object.assign(free, FREE_SPECIAL[tier] ?? {});
  // преміум: щедріше — ящик кожен 2-й, кристали кожен 2-й (через один), свої віхи
  const prem: PassReward = { coins: 120 + tier * 18, xp: 45 + tier * 2 };
  if (tier % 2 === 0) prem.crate = crateFor(tier, true);
  else prem.crystals = 6 + Math.floor(tier / 2);
  Object.assign(prem, PREMIUM_SPECIAL[tier] ?? {});
  return { tier, bpRequired: tier * 120, reward: free, premiumReward: prem };
});

/** Скільки тьєрів можна забрати прямо зараз (обидва треки). */
export function claimableCount(bp: number, premium: boolean, claimedFree: number[], claimedPremium: number[]): number {
  let n = 0;
  for (const t of PASS_TIERS) {
    if (bp < t.bpRequired) break;
    if (!claimedFree.includes(t.tier)) n++;
    if (premium && !claimedPremium.includes(t.tier)) n++;
  }
  return n;
}

export function bpForLevelComplete(level: number, stars: number): number {
  return 8 + level + stars * 3;
}

export function bpForSurvival(seconds: number): number {
  return Math.floor(seconds / 10);
}

export function bpForQuestClaim(): number {
  return 15;
}
