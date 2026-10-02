import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { dailyState, localDate } from '../content/economy.js';
import { ensureQuestSlots, grantReward } from '../progress.js';

export const dailyRouter = Router();
dailyRouter.use(requireAuth);

dailyRouter.get('/', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ state: dailyState({ last: user.dailyLast, streak: user.dailyStreak }) });
});

dailyRouter.post('/claim', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const now = new Date();
  const state = dailyState({ last: user.dailyLast, streak: user.dailyStreak }, now);
  if (!state.available) {
    res.status(409).json({ error: 'already_claimed' });
    return;
  }
  const yesterday = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const continuing = user.dailyLast === yesterday;
  user.dailyLast = localDate(now);
  user.dailyStreak = (continuing ? user.dailyStreak : 0) + 1;

  const result = grantReward(user, { coins: state.reward, xp: Math.round(state.reward / 3) }, 'daily');
  ensureQuestSlots(user, now);
  await user.save();
  res.json({ profile: serializeProfile(user), reward: { ...result, day: state.day } });
});
