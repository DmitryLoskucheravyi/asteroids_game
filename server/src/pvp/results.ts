import { User } from '../models/User.js';
import { grantReward, addBp, ensureQuestSlots, incrementQuestProgress, getRank, setRank } from '../progress.js';
import { rankDelta } from '../content/ranks.js';
import type { CrateType } from '../content/crates.js';
import { ROOM_SIZE, type QueueMode, type RankMode } from './constants.js';

/**
 * Підсумок матчу для одного гравця. Ігровий сервер лише рахує (місця, нагороди, RP) і шле це
 * сервісу профілю — саме він володіє прогресом гравця й записує його в базу.
 */
export interface PlayerResult {
  userId: string;
  place: number;
  teamPlace: number;
  kills: number;
  damageDealt: number;
  alive: boolean;
  reward: { coins: number; crystals: number; xp: number; bpXp: number; crate: CrateType | null };
  /** Рейтинг після матчу (лише рейтингові режими) */
  rankAfter: number | null;
}

export interface MatchResultsPayload {
  matchId: string;
  mode: QueueMode;
  players: PlayerResult[];
}

export interface LeaverPayload {
  matchId: string;
  mode: RankMode;
  userId: string;
  kills: number;
  rankPoints: number;
}

/** Ідемпотентність: той самий матч не зараховується двічі (повтор запиту після таймауту мережі). */
const applied = new Set<string>();

export async function applyMatchResults(payload: MatchResultsPayload): Promise<number> {
  if (applied.has(payload.matchId)) return 0;
  applied.add(payload.matchId);
  if (applied.size > 5000) applied.delete(applied.values().next().value as string);
  let n = 0;
  for (const p of payload.players) {
    try {
      const user = await User.findById(p.userId);
      if (!user) continue;
      grantReward(user, { coins: p.reward.coins, xp: p.reward.xp, crystals: p.reward.crystals, crate: p.reward.crate ?? undefined }, 'pvp');
      addBp(user, p.reward.bpXp);
      ensureQuestSlots(user);
      incrementQuestProgress(user, 'pvpMatches', 1);
      incrementQuestProgress(user, 'pvpKills', p.kills);
      if (p.place <= 3) incrementQuestProgress(user, 'pvpTop3', 1);
      if (p.teamPlace === 1) incrementQuestProgress(user, 'pvpWins', 1);
      const st = user.stats!;
      st.pvpMatches += 1;
      st.pvpKills += p.kills;
      st.pvpDamage += Math.round(p.damageDealt);
      st.bestKills = Math.max(st.bestKills, p.kills);
      if (p.teamPlace === 1) st.pvpWins += 1;
      if (p.place <= 3) st.pvpTop3 += 1;
      if (!p.alive) st.pvpDeaths += 1;
      if (p.rankAfter !== null && payload.mode !== 'casual') {
        const mode = payload.mode as RankMode;
        const cur = getRank(user, mode);
        setRank(user, mode, { ...cur, points: p.rankAfter, best: Math.max(cur.best, p.rankAfter), matches: cur.matches + 1, wins: cur.wins + (p.teamPlace === 1 ? 1 : 0) });
      }
      await user.save();
      n++;
    } catch {
      // гравець лишиться без нагороди цього разу — решта зараховується
    }
  }
  return n;
}

/** Вихід із рейтингового матчу посеред бою — зараховується як останнє місце. */
export async function applyLeaver(p: LeaverPayload): Promise<void> {
  const key = `${p.matchId}:${p.userId}:leave`;
  if (applied.has(key)) return;
  applied.add(key);
  const user = await User.findById(p.userId);
  if (!user) return;
  const cur = getRank(user, p.mode);
  setRank(user, p.mode, { ...cur, points: Math.max(0, cur.points + rankDelta(ROOM_SIZE, p.kills, p.rankPoints)), matches: cur.matches + 1 });
  user.stats!.pvpMatches += 1;
  user.stats!.pvpDeaths += 1;
  user.stats!.pvpKills += p.kills;
  await user.save();
}
