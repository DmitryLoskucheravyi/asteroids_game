import type { HydratedDocument } from 'mongoose';
import type { UserDoc } from './models/User.js';
import { applyXp } from './content/economy.js';
import { currentQuestSlots, findQuestDef, type QuestKind } from './content/quests.js';
import { SEASON_ID } from './content/pass.js';
import type { CrateType } from './content/crates.js';

type Doc = HydratedDocument<UserDoc>;

/** Додає відсутні слоти денних/тижневих завдань на поточний період (не чіпає вже існуючі). */
export function ensureQuestSlots(user: Doc, now = new Date()): void {
  const slots = currentQuestSlots(user._id.toString(), now);
  for (const slot of slots) {
    const exists = user.quests.some((q) => q.questId === slot.questId && q.periodKey === slot.periodKey);
    if (!exists) user.quests.push({ questId: slot.questId, periodKey: slot.periodKey, progress: 0, claimed: false });
  }
}

/** Рухає прогрес усіх активних (непроклеймлених) завдань заданого типу. */
export function incrementQuestProgress(user: Doc, kind: QuestKind, amount: number): void {
  if (amount <= 0) return;
  for (const q of user.quests) {
    if (q.claimed) continue;
    const def = findQuestDef(q.questId);
    if (!def || def.kind !== kind) continue;
    q.progress = Math.min(def.target, q.progress + amount);
  }
}

export interface Reward {
  coins?: number;
  xp?: number;
  crate?: CrateType;
}

export interface RewardResult {
  coins: number;
  xp: number;
  leveledUp: boolean;
  newLevel: number;
  crateAwarded: CrateType | null;
}

export function grantReward(user: Doc, reward: Reward, source: string): RewardResult {
  const coins = Math.max(0, Math.floor(reward.coins ?? 0));
  const xpAmount = Math.max(0, Math.floor(reward.xp ?? 0));
  user.coins += coins;
  const before = user.level;
  const { level, xp } = applyXp({ xp: user.xp, level: user.level }, xpAmount);
  user.level = level;
  user.xp = xp;
  let crateAwarded: CrateType | null = null;
  if (reward.crate) {
    user.crates.push({ crateType: reward.crate, source, acquiredAt: new Date(), openedAt: null });
    crateAwarded = reward.crate;
  }
  return { coins, xp: xpAmount, leveledUp: level > before, newLevel: level, crateAwarded };
}

export function addBp(user: Doc, amount: number): void {
  if (user.passSeasonId !== SEASON_ID) {
    user.passSeasonId = SEASON_ID;
    user.passBpPoints = 0;
    user.passClaimedTiers = [];
  }
  user.passBpPoints += Math.max(0, Math.floor(amount));
}
