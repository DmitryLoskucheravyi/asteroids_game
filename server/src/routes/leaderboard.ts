import { Router } from 'express';
import type { PipelineStage } from 'mongoose';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

/**
 * Категорії таблиць: як рахується значення і скільки треба зіграти, щоб потрапити в таблицю
 * (для відношень — щоб 1 матч з 1 перемогою не давав 100%).
 */
const BOARDS: Record<string, { value: unknown; minMatches?: number }> = {
  wins: { value: '$stats.pvpWins' },
  rank: { value: '$rankPoints' },
  rankDuo: { value: '$teamRanks.duo.points' },
  rankTrio: { value: '$teamRanks.trio.points' },
  rankSquad: { value: '$teamRanks.squad.points' },
  kills: { value: '$stats.pvpKills' },
  kd: { value: { $round: [{ $divide: ['$stats.pvpKills', { $max: [1, '$stats.pvpDeaths'] }] }, 2] }, minMatches: 5 },
  winrate: { value: { $round: [{ $multiply: [100, { $divide: ['$stats.pvpWins', { $max: [1, '$stats.pvpMatches'] }] }] }, 1] }, minMatches: 10 },
  top3: { value: '$stats.pvpTop3' },
  matches: { value: '$stats.pvpMatches' },
  bestKills: { value: '$stats.bestKills' },
  damage: { value: '$stats.pvpDamage' },
  level: { value: { $add: [{ $multiply: ['$level', 100000] }, '$xp'] } },
  survival: { value: '$stats.survivalBest' },
  stars: { value: '$stats.stars' },
  coins: { value: '$stats.coinsEarned' },
  crates: { value: '$stats.cratesOpened' },
};

const LIMIT = 50;

leaderboardRouter.get('/:by', async (req: AuthedRequest, res) => {
  const board = BOARDS[req.params.by];
  if (!board) {
    res.status(400).json({ error: 'bad_board' });
    return;
  }
  const base: PipelineStage[] = [
    { $match: board.minMatches ? { 'stats.pvpMatches': { $gte: board.minMatches } } : {} },
    { $addFields: { value: { $ifNull: [board.value, 0] } } },
    { $match: { value: { $gt: 0 } } },
  ];
  const rows = await User.aggregate([
    ...base,
    { $sort: { value: -1, _id: 1 } },
    { $limit: LIMIT },
    { $project: { nickname: 1, level: 1, rankPoints: 1, teamRanks: 1, value: 1, selectedPlane: 1 } },
  ]);
  const top = rows.map((r, i) => ({ place: i + 1, id: String(r._id), nickname: r.nickname, level: r.level, rankPoints: (req.params.by === 'rankDuo' ? r.teamRanks?.duo?.points : req.params.by === 'rankTrio' ? r.teamRanks?.trio?.points : req.params.by === 'rankSquad' ? r.teamRanks?.squad?.points : r.rankPoints) ?? 0, plane: r.selectedPlane, value: r.value }));

  // моє місце — навіть якщо я не в топі
  let me: { place: number | null; value: number } = { place: null, value: 0 };
  const mine = await User.aggregate([{ $match: { _id: (await User.findById(req.userId).select('_id'))?._id } }, ...base]);
  if (mine.length) {
    const value = mine[0].value as number;
    const above = await User.aggregate([...base, { $match: { value: { $gt: value } } }, { $count: 'n' }]);
    me = { place: (above[0]?.n ?? 0) + 1, value };
  }
  const total = (await User.aggregate([...base, { $count: 'n' }]))[0]?.n ?? 0;
  res.json({ by: req.params.by, top, me, total, minMatches: board.minMatches ?? 0 });
});
