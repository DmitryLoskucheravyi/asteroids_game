export type QuestKind =
  | 'levelsCompleted'
  | 'crystalsCollected'
  | 'survivalSeconds'
  | 'cratesOpened'
  | 'pvpMatches'
  | 'pvpKills'
  | 'pvpTop3'
  | 'pvpWins'
  | 'threeStarLevels'
  | 'planeUpgrades'
  | 'coinsEarned'
  | 'itemsBought'
  | 'dailyClaimed'
  | 'passClaims'
  | 'questsCompleted'
  | 'survivalRuns';
export type QuestPeriod = 'daily' | 'weekly';

export interface QuestDef {
  id: string;
  kind: QuestKind;
  period: QuestPeriod;
  target: number;
  reward: { coins: number; xp: number; crate?: 'common' | 'rare' | 'legendary' };
}

export const QUEST_POOL: readonly QuestDef[] = [
  { id: 'd_levels_1', kind: 'levelsCompleted', period: 'daily', target: 1, reward: { coins: 40, xp: 25 } },
  { id: 'd_levels_3', kind: 'levelsCompleted', period: 'daily', target: 3, reward: { coins: 90, xp: 60 } },
  { id: 'd_levels_5', kind: 'levelsCompleted', period: 'daily', target: 5, reward: { coins: 160, xp: 100 } },
  { id: 'd_stars3_1', kind: 'threeStarLevels', period: 'daily', target: 1, reward: { coins: 80, xp: 50 } },
  { id: 'd_stars3_3', kind: 'threeStarLevels', period: 'daily', target: 3, reward: { coins: 180, xp: 110 } },
  { id: 'd_crystals_20', kind: 'crystalsCollected', period: 'daily', target: 20, reward: { coins: 60, xp: 35 } },
  { id: 'd_crystals_50', kind: 'crystalsCollected', period: 'daily', target: 50, reward: { coins: 120, xp: 70 } },
  { id: 'd_crystals_100', kind: 'crystalsCollected', period: 'daily', target: 100, reward: { coins: 220, xp: 130 } },
  { id: 'd_survival_60', kind: 'survivalSeconds', period: 'daily', target: 60, reward: { coins: 50, xp: 30 } },
  { id: 'd_survival_180', kind: 'survivalSeconds', period: 'daily', target: 180, reward: { coins: 130, xp: 75 } },
  { id: 'd_survival_300', kind: 'survivalSeconds', period: 'daily', target: 300, reward: { coins: 200, xp: 120 } },
  { id: 'd_crate_1', kind: 'cratesOpened', period: 'daily', target: 1, reward: { coins: 30, xp: 20 } },
  { id: 'd_crate_3', kind: 'cratesOpened', period: 'daily', target: 3, reward: { coins: 90, xp: 50 } },
  { id: 'd_pvp_1', kind: 'pvpMatches', period: 'daily', target: 1, reward: { coins: 100, xp: 50 } },
  { id: 'd_pvp_3', kind: 'pvpMatches', period: 'daily', target: 3, reward: { coins: 250, xp: 120 } },
  { id: 'd_kills_3', kind: 'pvpKills', period: 'daily', target: 3, reward: { coins: 150, xp: 80 } },
  { id: 'd_kills_8', kind: 'pvpKills', period: 'daily', target: 8, reward: { coins: 320, xp: 160, crate: 'common' } },
  { id: 'd_top3_1', kind: 'pvpTop3', period: 'daily', target: 1, reward: { coins: 180, xp: 90 } },
  { id: 'd_win_1', kind: 'pvpWins', period: 'daily', target: 1, reward: { coins: 300, xp: 150, crate: 'common' } },
  { id: 'd_upgrade_1', kind: 'planeUpgrades', period: 'daily', target: 1, reward: { coins: 80, xp: 60 } },
  { id: 'd_upgrade_3', kind: 'planeUpgrades', period: 'daily', target: 3, reward: { coins: 220, xp: 140 } },
  { id: 'd_pvp_5', kind: 'pvpMatches', period: 'daily', target: 5, reward: { coins: 450, xp: 220, crate: 'common' } },
  { id: 'd_kills_15', kind: 'pvpKills', period: 'daily', target: 15, reward: { coins: 600, xp: 300, crate: 'rare' } },
  { id: 'd_top3_3', kind: 'pvpTop3', period: 'daily', target: 3, reward: { coins: 450, xp: 220 } },
  { id: 'd_coins_500', kind: 'coinsEarned', period: 'daily', target: 500, reward: { coins: 100, xp: 60 } },
  { id: 'd_coins_1500', kind: 'coinsEarned', period: 'daily', target: 1500, reward: { coins: 250, xp: 140 } },
  { id: 'd_item_1', kind: 'itemsBought', period: 'daily', target: 1, reward: { coins: 150, xp: 80 } },
  { id: 'd_daily_1', kind: 'dailyClaimed', period: 'daily', target: 1, reward: { coins: 50, xp: 30 } },
  { id: 'd_pass_1', kind: 'passClaims', period: 'daily', target: 1, reward: { coins: 70, xp: 40 } },
  { id: 'd_quests_3', kind: 'questsCompleted', period: 'daily', target: 3, reward: { coins: 200, xp: 120, crate: 'common' } },
  { id: 'd_runs_3', kind: 'survivalRuns', period: 'daily', target: 3, reward: { coins: 90, xp: 50 } },
  { id: 'd_runs_6', kind: 'survivalRuns', period: 'daily', target: 6, reward: { coins: 180, xp: 100 } },
] as const;

export const WEEKLY_QUEST_POOL: readonly QuestDef[] = [
  { id: 'w_levels_10', kind: 'levelsCompleted', period: 'weekly', target: 10, reward: { coins: 350, xp: 220, crate: 'common' } },
  { id: 'w_levels_25', kind: 'levelsCompleted', period: 'weekly', target: 25, reward: { coins: 800, xp: 450, crate: 'rare' } },
  { id: 'w_stars3_10', kind: 'threeStarLevels', period: 'weekly', target: 10, reward: { coins: 700, xp: 400, crate: 'rare' } },
  { id: 'w_crystals_250', kind: 'crystalsCollected', period: 'weekly', target: 250, reward: { coins: 400, xp: 250, crate: 'common' } },
  { id: 'w_crystals_600', kind: 'crystalsCollected', period: 'weekly', target: 600, reward: { coins: 900, xp: 500, crate: 'rare' } },
  { id: 'w_survival_900', kind: 'survivalSeconds', period: 'weekly', target: 900, reward: { coins: 450, xp: 260, crate: 'rare' } },
  { id: 'w_crates_10', kind: 'cratesOpened', period: 'weekly', target: 10, reward: { coins: 500, xp: 280, crate: 'rare' } },
  { id: 'w_pvp_10', kind: 'pvpMatches', period: 'weekly', target: 10, reward: { coins: 1000, xp: 500, crate: 'rare' } },
  { id: 'w_kills_30', kind: 'pvpKills', period: 'weekly', target: 30, reward: { coins: 1400, xp: 650, crate: 'rare' } },
  { id: 'w_top3_5', kind: 'pvpTop3', period: 'weekly', target: 5, reward: { coins: 1200, xp: 600, crate: 'rare' } },
  { id: 'w_win_3', kind: 'pvpWins', period: 'weekly', target: 3, reward: { coins: 1800, xp: 800, crate: 'legendary' } },
  { id: 'w_upgrade_5', kind: 'planeUpgrades', period: 'weekly', target: 5, reward: { coins: 600, xp: 400, crate: 'rare' } },
  { id: 'w_upgrade_12', kind: 'planeUpgrades', period: 'weekly', target: 12, reward: { coins: 1300, xp: 700, crate: 'legendary' } },
  { id: 'w_pvp_25', kind: 'pvpMatches', period: 'weekly', target: 25, reward: { coins: 2500, xp: 1100, crate: 'legendary' } },
  { id: 'w_kills_75', kind: 'pvpKills', period: 'weekly', target: 75, reward: { coins: 3000, xp: 1300, crate: 'legendary' } },
  { id: 'w_win_8', kind: 'pvpWins', period: 'weekly', target: 8, reward: { coins: 3500, xp: 1500, crate: 'legendary' } },
  { id: 'w_survival_2400', kind: 'survivalSeconds', period: 'weekly', target: 2400, reward: { coins: 1000, xp: 550, crate: 'rare' } },
  { id: 'w_coins_8000', kind: 'coinsEarned', period: 'weekly', target: 8000, reward: { coins: 1200, xp: 600, crate: 'rare' } },
  { id: 'w_items_3', kind: 'itemsBought', period: 'weekly', target: 3, reward: { coins: 900, xp: 450, crate: 'rare' } },
  { id: 'w_daily_5', kind: 'dailyClaimed', period: 'weekly', target: 5, reward: { coins: 600, xp: 350, crate: 'rare' } },
  { id: 'w_pass_5', kind: 'passClaims', period: 'weekly', target: 5, reward: { coins: 700, xp: 380, crate: 'rare' } },
  { id: 'w_quests_20', kind: 'questsCompleted', period: 'weekly', target: 20, reward: { coins: 1500, xp: 800, crate: 'legendary' } },
  { id: 'w_runs_20', kind: 'survivalRuns', period: 'weekly', target: 20, reward: { coins: 800, xp: 420, crate: 'rare' } },
] as const;

/** Детермінований відбір без мутуючого стану: та сама дата+юзер завжди дає той самий набір. */
function seededPick<T>(pool: readonly T[], seed: string, count: number): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = (): number => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0xffffffff;
  };
  const items = [...pool];
  const picked: T[] = [];
  for (let i = 0; i < count && items.length; i++) {
    const idx = Math.floor(rand() * items.length);
    picked.push(items.splice(idx, 1)[0]);
  }
  return picked;
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface QuestSlot {
  questId: string;
  periodKey: string;
}

/** Активні слоти завдань на зараз: 8 денних + 5 тижневих, стабільні для даного юзера+періоду. */
export function currentQuestSlots(userId: string, now = new Date()): QuestSlot[] {
  const dayKey = localDateKey(now);
  const weekKey = isoWeekKey(now);
  const daily = seededPick(QUEST_POOL, `${userId}:${dayKey}`, 8).map((q) => ({ questId: q.id, periodKey: dayKey }));
  const weekly = seededPick(WEEKLY_QUEST_POOL, `${userId}:${weekKey}`, 5).map((q) => ({ questId: q.id, periodKey: weekKey }));
  return [...daily, ...weekly];
}

export function findQuestDef(id: string): QuestDef | undefined {
  return QUEST_POOL.find((q) => q.id === id) ?? WEEKLY_QUEST_POOL.find((q) => q.id === id);
}
