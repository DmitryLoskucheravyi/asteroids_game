import type { HydratedDocument } from 'mongoose';
import type { UserDoc } from './models/User.js';
import { applyXp, pilotLevelReward } from './content/economy.js';
import { currentQuestSlots, findQuestDef, type QuestKind } from './content/quests.js';
import { currentSeason } from './content/pass.js';
import { divisionIndex, seasonReward } from './content/ranks.js';
import { duplicateCrystals } from './content/compensation.js';
import { RANK_MODES, type RankMode } from './pvp/constants.js';
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
  if (user.stats) user.stats.coinsEarned += coins;
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

/** Єдиний доступ до рейтингу режиму: соло — старі поля, командні — teamRanks. */
export interface RankState {
  points: number;
  best: number;
  matches: number;
  wins: number;
  lastSeason: unknown;
}

export function getRank(user: Doc, mode: RankMode): RankState {
  if (mode === 'solo') return { points: user.rankPoints ?? 0, best: user.rankBest ?? 0, matches: user.rankedMatches ?? 0, wins: user.rankedWins ?? 0, lastSeason: user.rankLastSeason ?? null };
  const r = user.teamRanks?.[mode];
  return { points: r?.points ?? 0, best: r?.best ?? 0, matches: r?.matches ?? 0, wins: r?.wins ?? 0, lastSeason: r?.lastSeason ?? null };
}

export function setRank(user: Doc, mode: RankMode, r: RankState): void {
  if (mode === 'solo') {
    user.rankPoints = r.points;
    user.rankBest = r.best;
    user.rankedMatches = r.matches;
    user.rankedWins = r.wins;
    user.rankLastSeason = r.lastSeason as never;
    return;
  }
  const t = user.teamRanks![mode]!;
  t.points = r.points;
  t.best = r.best;
  t.matches = r.matches;
  t.wins = r.wins;
  t.lastSeason = r.lastSeason as never;
  user.markModified(`teamRanks.${mode}`);
}

/**
 * Новий сезон рейтингу — окремо для кожного режиму: нагорода за досягнутий підрівень
 * (ящик за рангом + 💎 = 5 × номер підрівня) і мʼякий скид ×0.8.
 */
export function ensureRankSeason(user: Doc): void {
  const { id } = currentSeason();
  if (user.rankSeasonId === id) return;
  if (user.rankSeasonId) {
    for (const mode of RANK_MODES) {
      const r = getRank(user, mode);
      if (r.matches <= 0) continue;
      const reward = seasonReward(r.points);
      grantReward(user, { crate: reward.crate, crystals: reward.crystals }, 'rankSeason');
      setRank(user, mode, {
        ...r,
        lastSeason: { seasonId: user.rankSeasonId, points: r.points, division: divisionIndex(r.points), crate: reward.crate, crystals: reward.crystals },
        points: Math.round(r.points * 0.8),
      });
    }
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

/** Старі акаунти: дозаповнюємо статистику з того, що вже збережено (зірки, рекорд, рейтингові перемоги). */
export function backfillStats(user: Doc): void {
  const st = user.stats!;
  st.stars = Math.max(st.stars, user.stars.reduce((s, v) => s + (v || 0), 0));
  st.survivalBest = Math.max(st.survivalBest, user.survivalTop[0]?.time ?? 0);
  st.pvpWins = Math.max(st.pvpWins, user.rankedWins ?? 0);
  st.pvpMatches = Math.max(st.pvpMatches, user.rankedMatches ?? 0);
}
