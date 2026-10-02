import type { HydratedDocument } from 'mongoose';
import type { UserDoc } from './models/User.js';
import { applyXp, pilotLevelReward } from './content/economy.js';
import { currentQuestSlots, findQuestDef, type QuestKind } from './content/quests.js';
import { currentSeason } from './content/pass.js';
import { divisionIndex, seasonReward } from './content/ranks.js';
import { duplicateCrystals } from './content/compensation.js';
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
  crystals?: number;
}

export interface RewardResult {
  coins: number;
  xp: number;
  leveledUp: boolean;
  newLevel: number;
  crateAwarded: CrateType | null;
  crystals: number;
}

/** Які квести рухає нагорода певного джерела. */
const SOURCE_QUEST: Partial<Record<string, QuestKind>> = { daily: 'dailyClaimed', pass: 'passClaims', quest: 'questsCompleted' };

export function grantReward(user: Doc, reward: Reward, source: string): RewardResult {
  const coins = Math.max(0, Math.floor(reward.coins ?? 0));
  ensureQuestSlots(user);
  // нагороди за самі квести не рахуються в "заробити монети" — інакше квести закривали б одне одного
  if (source !== 'quest') incrementQuestProgress(user, 'coinsEarned', coins);
  const sourceQuest = SOURCE_QUEST[source];
  if (sourceQuest) incrementQuestProgress(user, sourceQuest, 1);
  const xpAmount = Math.max(0, Math.floor(reward.xp ?? 0));
  const crystals = Math.max(0, Math.floor(reward.crystals ?? 0));
  user.coins += coins;
  user.crystals += crystals;
  const before = user.level;
  addXp(user, xpAmount);
  const level = user.level;
  let crateAwarded: CrateType | null = null;
  if (reward.crate) {
    user.crates.push({ crateType: reward.crate, source, acquiredAt: new Date(), openedAt: null });
    crateAwarded = reward.crate;
  }
  return { coins, xp: xpAmount, leveledUp: level > before, newLevel: level, crateAwarded, crystals };
}

/** Якщо сезон у профілі застарів — скидає очки/клейми/преміум на новий сезон. */
export function ensureSeason(user: Doc): void {
  const { id } = currentSeason();
  if (user.passSeasonId === id) return;
  user.passSeasonId = id;
  user.passBpPoints = 0;
  user.passPremium = false;
  user.passClaimedFree.splice(0, user.passClaimedFree.length);
  user.passClaimedPremium.splice(0, user.passClaimedPremium.length);
}

export function addBp(user: Doc, amount: number): void {
  ensureSeason(user);
  user.passBpPoints += Math.max(0, Math.floor(amount));
}

/**
 * Новий сезон рейтингу: нагорода за підрівень, досягнутий у минулому сезоні (ящик за рангом + 💎 = 5 × номер підрівня),
 * і мʼякий скид рейтингу ×0.8, щоб усі не обвалились на дно.
 */
export function ensureRankSeason(user: Doc): void {
  const { id } = currentSeason();
  if (user.rankSeasonId === id) return;
  const played = !!user.rankSeasonId && (user.rankedMatches ?? 0) > 0;
  if (played) {
    const reward = seasonReward(user.rankPoints ?? 0);
    grantReward(user, { crate: reward.crate, crystals: reward.crystals }, 'rankSeason');
    user.rankLastSeason = { seasonId: user.rankSeasonId!, points: user.rankPoints ?? 0, division: divisionIndex(user.rankPoints ?? 0), crate: reward.crate, crystals: reward.crystals };
    user.rankPoints = Math.round((user.rankPoints ?? 0) * 0.8);
  }
  user.rankSeasonId = id;
}

/** Перебалансування v2 урізало бонуси предметів — власникам одноразово повертаємо 💎 за кожен предмет. */
export function applyBalanceCompensation(user: Doc): void {
  if (user.balanceV2Comp) return;
  user.balanceV2Comp = true;
  const unique = [...new Set(user.items.map((i) => i.defId))];
  const crystals = unique.reduce((sum, id) => sum + duplicateCrystals('item', id), 0);
  if (crystals > 0) user.crystals += crystals;
}

/** Додає досвід пілота і видає нагороди за кожен здобутий рівень (монети, кристали, ящики). */
export function addXp(user: Doc, amount: number): number {
  const before = user.level;
  const { level, xp } = applyXp({ xp: user.xp, level: user.level }, amount);
  user.level = level;
  user.xp = xp;
  for (let l = before + 1; l <= level; l++) {
    const r = pilotLevelReward(l);
    user.coins += r.coins;
    user.crystals += r.crystals;
    if (r.crate) user.crates.push({ crateType: r.crate, source: 'pilotLevel', acquiredAt: new Date(), openedAt: null });
  }
  return level - before;
}
