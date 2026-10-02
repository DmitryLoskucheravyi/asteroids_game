import type { HydratedDocument } from 'mongoose';
import type { UserDoc } from './models/User.js';
import { findQuestDef } from './content/quests.js';

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
    },
    crates: user.crates.map((c) => ({
      id: (c as unknown as { _id: { toString(): string } })._id.toString(),
      crateType: c.crateType,
      source: c.source,
      acquiredAt: c.acquiredAt,
      openedAt: c.openedAt,
    })),
    keybinds: (user.keybinds ?? {}) as Record<string, string>,
    items: user.items.map((it) => ({ id: (it as unknown as { _id: { toString(): string } })._id.toString(), defId: it.defId, rarity: it.rarity })),
    loadouts: user.loadouts,
  };
}
