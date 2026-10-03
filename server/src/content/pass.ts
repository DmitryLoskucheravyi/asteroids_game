/** Сезони по 90 днів; перший триває з 2026-10-01 (ідентифікатор лишився "season-1", щоб не скинути поточний прогрес). */
export const SEASON_DAYS = 90;
const SEASON_EPOCH = Date.UTC(2026, 9, 1);
const DAY_MS = 86_400_000;

export function currentSeason(now = Date.now()): { id: string; startsAt: Date; endsAt: Date } {
  const index = Math.max(0, Math.floor((now - SEASON_EPOCH) / (SEASON_DAYS * DAY_MS)));
  const start = SEASON_EPOCH + index * SEASON_DAYS * DAY_MS;
  return { id: `season-${index + 1}`, startsAt: new Date(start), endsAt: new Date(start + SEASON_DAYS * DAY_MS - 1000) };
}

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

const TIER_COUNT = 100;

/** BP на один тьєр росте поступово: перші йдуть швидко, останні — справжній марафон. */
// ×2.5 до початкової кривої: регулярний гравець закриває пропуск приблизно за 75 днів 90-денного сезону
const bpStep = (tier: number): number => Math.round((100 + tier * 4) * 2.5);
const BP_REQUIRED: number[] = [];
for (let t = 1, sum = 0; t <= TIER_COUNT; t++) BP_REQUIRED.push((sum += bpStep(t)));

/** Ціна преміум-пропуску на сезон, у монетах (без реальних платежів). */

/** Особливі тьєри — рідкісні речі (предмети, зброя, літаки) як віхи сезону. */
// У пропуску — не більше половини каталогу (6 із 12 предметів, 1 зброя, 2 літаки), без дублікатів між треками;
// решта лишається в магазині, ящиках і нагородах за ранг.
const FREE_SPECIAL: Record<number, Partial<PassReward>> = {
  8: { item: 'magnet_booster' },
  16: { crate: 'rare' },
  24: { item: 'targeting_cpu' },
  32: { crate: 'rare' },
  50: { plane: 'swift' },
  62: { crate: 'rare' },
  74: { crystals: 20 },
  86: { item: 'overclock_core' },
};
const PREMIUM_SPECIAL: Record<number, Partial<PassReward>> = {
  6: { crate: 'rare' },
  14: { crystals: 15 },
  20: { item: 'nano_coating' },
  28: { weapon: 'homing_salvo' },
  40: { crate: 'epic' },
  64: { item: 'decoy_flare' },
  75: { crystals: 40 },
  95: { item: 'phoenix_heart' },
  100: { plane: 'thunder' },
};

function crateFor(tier: number, premium: boolean): CrateType {
  // легендарний — лише на віхах 50 і 100
  if (tier % 50 === 0) return 'legendary';
  if (tier % (premium ? 15 : 25) === 0) return 'mythic';
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
  const prem: PassReward = { coins: 90 + 10 * (tier - 1), xp: 45 + tier * 2 };
  if (tier % 2 === 0) prem.crate = crateFor(tier, true);
  else prem.crystals = 6 + Math.floor(tier / 2);
  Object.assign(prem, PREMIUM_SPECIAL[tier] ?? {});
  return { tier, bpRequired: BP_REQUIRED[i], reward: free, premiumReward: prem };
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
