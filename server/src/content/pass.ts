export const SEASON_ID = 'season-1';
export const SEASON_STARTS = new Date('2026-01-01T00:00:00Z');
export const SEASON_ENDS = new Date('2026-12-31T23:59:59Z');

export interface PassTier {
  tier: number;
  bpRequired: number;
  reward: { coins: number; xp: number; crate?: 'common' | 'rare' | 'legendary' };
}

const TIER_COUNT = 40;

export const PASS_TIERS: readonly PassTier[] = Array.from({ length: TIER_COUNT }, (_, i) => {
  const tier = i + 1;
  const big = tier % 5 === 0;
  return {
    tier,
    bpRequired: tier * 120,
    reward: big ? { coins: 150 + tier * 10, xp: 60, crate: tier % 20 === 0 ? 'legendary' : tier % 10 === 0 ? 'rare' : 'common' } : { coins: 50 + tier * 5, xp: 25 },
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
