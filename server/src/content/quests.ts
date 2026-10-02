export type QuestKind = 'levelsCompleted' | 'crystalsCollected' | 'survivalSeconds' | 'cratesOpened';
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
  { id: 'd_crystals_20', kind: 'crystalsCollected', period: 'daily', target: 20, reward: { coins: 60, xp: 35 } },
  { id: 'd_crystals_50', kind: 'crystalsCollected', period: 'daily', target: 50, reward: { coins: 120, xp: 70 } },
  { id: 'd_survival_60', kind: 'survivalSeconds', period: 'daily', target: 60, reward: { coins: 50, xp: 30 } },
  { id: 'd_survival_180', kind: 'survivalSeconds', period: 'daily', target: 180, reward: { coins: 130, xp: 75 } },
  { id: 'd_crate_1', kind: 'cratesOpened', period: 'daily', target: 1, reward: { coins: 30, xp: 20 } },
] as const;

export const WEEKLY_QUEST_POOL: readonly QuestDef[] = [
  { id: 'w_levels_10', kind: 'levelsCompleted', period: 'weekly', target: 10, reward: { coins: 350, xp: 220, crate: 'common' } },
  { id: 'w_crystals_250', kind: 'crystalsCollected', period: 'weekly', target: 250, reward: { coins: 400, xp: 250, crate: 'common' } },
  { id: 'w_survival_900', kind: 'survivalSeconds', period: 'weekly', target: 900, reward: { coins: 450, xp: 260, crate: 'rare' } },
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

/** Активні слоти завдань на зараз: 3 денних + 1 тижневе, стабільні для даного юзера+періоду. */
export function currentQuestSlots(userId: string, now = new Date()): QuestSlot[] {
  const dayKey = localDateKey(now);
  const weekKey = isoWeekKey(now);
  const daily = seededPick(QUEST_POOL, `${userId}:${dayKey}`, 3).map((q) => ({ questId: q.id, periodKey: dayKey }));
  const weekly = seededPick(WEEKLY_QUEST_POOL, `${userId}:${weekKey}`, 1).map((q) => ({ questId: q.id, periodKey: weekKey }));
  return [...daily, ...weekly];
}

export function findQuestDef(id: string): QuestDef | undefined {
  return QUEST_POOL.find((q) => q.id === id) ?? WEEKLY_QUEST_POOL.find((q) => q.id === id);
}
