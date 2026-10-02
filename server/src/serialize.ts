import type { HydratedDocument } from 'mongoose';
import type { UserDoc } from './models/User.js';
import { findQuestDef } from './content/quests.js';
import { getItemDef } from './content/items.js';
import { getRank } from './progress.js';
import { RANK_MODES } from './pvp/constants.js';
import { currentSeason, claimableCount } from './content/pass.js';

export function serializeProfile(user: HydratedDocument<UserDoc>) {
  return {
    id: user._id.toString(),
    nickname: user.nickname,
    email: user.email,
    coins: user.coins,
    crystals: user.crystals,
    xp: user.xp,
    level: user.level,
    selectedPlane: user.selectedPlane,
    ownedPlanes: user.ownedPlanes,
    planeProgress: user.planeProgress,
    stars: user.stars,
    unlocked: user.unlocked,
    survivalTop: user.survivalTop,
    daily: { last: user.dailyLast, streak: user.dailyStreak },
    quests: user.quests.map((q) => {
      const def = findQuestDef(q.questId);
      return {
        questId: q.questId,
        periodKey: q.periodKey,
        kind: def?.kind ?? 'unknown',
        period: def?.period ?? 'daily',
        progress: q.progress,
        target: def?.target ?? 0,
        reward: def?.reward ?? { coins: 0, xp: 0 },
        claimed: q.claimed,
      };
    }),
    pass: {
      seasonId: user.passSeasonId,
      bpPoints: user.passBpPoints,
      premium: user.passPremium,
      claimedFree: user.passClaimedFree,
      claimedPremium: user.passClaimedPremium,
      claimable: user.passSeasonId === currentSeason().id ? claimableCount(user.passBpPoints, user.passPremium, user.passClaimedFree, user.passClaimedPremium) : 0,
    },
    crates: user.crates.map((c) => ({
      id: (c as unknown as { _id: { toString(): string } })._id.toString(),
      crateType: c.crateType,
      source: c.source,
      acquiredAt: c.acquiredAt,
      openedAt: c.openedAt,
    })),
    keybinds: (user.keybinds ?? {}) as Record<string, string>,
    // рідкість завжди береться з визначення предмета (старі записи могли мати довільну)
    items: user.items
      .filter((it) => getItemDef(it.defId))
      .map((it) => ({ id: (it as unknown as { _id: { toString(): string } })._id.toString(), defId: it.defId, rarity: getItemDef(it.defId)!.rarity })),
    loadouts: user.loadouts,
    ownedWeapons: user.ownedWeapons,
    rankedModes: Object.fromEntries(RANK_MODES.map((m) => {
      const r = getRank(user, m);
      return [m, { points: r.points, best: r.best, matches: r.matches, wins: r.wins, lastSeason: r.lastSeason ?? null }];
    })),
    stats: { pvpMatches: user.stats?.pvpMatches ?? 0, pvpWins: user.stats?.pvpWins ?? 0, pvpTop3: user.stats?.pvpTop3 ?? 0, pvpKills: user.stats?.pvpKills ?? 0, pvpDeaths: user.stats?.pvpDeaths ?? 0, pvpDamage: user.stats?.pvpDamage ?? 0, bestKills: user.stats?.bestKills ?? 0, cratesOpened: user.stats?.cratesOpened ?? 0, coinsEarned: user.stats?.coinsEarned ?? 0, levelsCompleted: user.stats?.levelsCompleted ?? 0, stars: user.stats?.stars ?? 0, survivalBest: user.stats?.survivalBest ?? 0 },
    ranked: {
      points: user.rankPoints ?? 0,
      best: user.rankBest ?? 0,
      matches: user.rankedMatches ?? 0,
      wins: user.rankedWins ?? 0,
      seasonEndsAt: currentSeason().endsAt,
      lastSeason: (user.rankLastSeason as { seasonId: string; points: number; division: number; crate: string; crystals: number } | null) ?? null,
    },
  };
}
