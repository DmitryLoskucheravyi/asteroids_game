export type QuestKind = 'levelsCompleted' | 'crystalsCollected' | 'survivalSeconds' | 'cratesOpened' | 'pvpMatches' | 'pvpKills' | 'pvpTop3' | 'pvpWins' | 'threeStarLevels' | 'planeUpgrades';
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

/** Активні слоти завдань на зараз: 5 денних + 3 тижневих, стабільні для даного юзера+періоду. */
export function currentQuestSlots(userId: string, now = new Date()): QuestSlot[] {
  const dayKey = localDateKey(now);
  const weekKey = isoWeekKey(now);
  const daily = seededPick(QUEST_POOL, `${userId}:${dayKey}`, 5).map((q) => ({ questId: q.id, periodKey: dayKey }));
  const weekly = seededPick(WEEKLY_QUEST_POOL, `${userId}:${weekKey}`, 3).map((q) => ({ questId: q.id, periodKey: weekKey }));
  return [...daily, ...weekly];
}

export function findQuestDef(id: string): QuestDef | undefined {
  return QUEST_POOL.find((q) => q.id === id) ?? WEEKLY_QUEST_POOL.find((q) => q.id === id);
}
