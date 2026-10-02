export const SEASON_ID = 'season-1';
export const SEASON_STARTS = new Date('2026-01-01T00:00:00Z');
export const SEASON_ENDS = new Date('2026-12-31T23:59:59Z');

export type PassReward = { coins: number; xp: number; crate?: 'common' | 'rare' | 'legendary'; crystals?: number };

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

export const PASS_TIERS: readonly PassTier[] = Array.from({ length: TIER_COUNT }, (_, i) => {
  const tier = i + 1;
  const big = tier % 5 === 0;
  // кожен 10-й тьєр безкоштовного треку — кристали (рідкісна валюта тір-апів), росте з номером тьєру
  const crystalMilestone = tier % 10 === 0 ? 25 + tier : undefined;
  return {
    tier,
    bpRequired: tier * 120,
    reward: {
      ...(big ? { coins: 150 + tier * 10, xp: 60, crate: (tier % 20 === 0 ? 'legendary' : tier % 10 === 0 ? 'rare' : 'common') as PassReward['crate'] } : { coins: 50 + tier * 5, xp: 25 }),
      ...(crystalMilestone ? { crystals: crystalMilestone } : {}),
    },
    // преміум відчутно щедріший: ящик на кожному тьєрі, рідкість росте з номером
    premiumReward: {
      coins: 120 + tier * 18,
      xp: 45 + tier * 2,
      crate: tier % 20 === 0 ? 'legendary' : tier % 8 === 0 ? 'rare' : 'common',
    },
  };
});

export function bpForLevelComplete(level: number, stars: number): number {
  return 8 + level + stars * 3;
}

export function bpForSurvival(seconds: number): number {
  return Math.floor(seconds / 10);
}

export function bpForQuestClaim(): number {
  return 15;
}
