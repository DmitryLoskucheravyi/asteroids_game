import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { PASS_TIERS, SEASON_ID, SEASON_STARTS, SEASON_ENDS } from '../content/pass.js';
import { grantReward } from '../progress.js';

export const passRouter = Router();
passRouter.use(requireAuth);

passRouter.get('/', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({
    season: { id: SEASON_ID, startsAt: SEASON_STARTS, endsAt: SEASON_ENDS, tiers: PASS_TIERS },
    bpPoints: user.passSeasonId === SEASON_ID ? user.passBpPoints : 0,
    claimedTiers: user.passSeasonId === SEASON_ID ? user.passClaimedTiers : [],
  });
});

passRouter.post('/claim/:tier', async (req: AuthedRequest, res) => {
  const tier = Math.floor(Number(req.params.tier));
  const def = PASS_TIERS.find((t) => t.tier === tier);
  const user = await User.findById(req.userId);
  if (!user || !def) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (user.passSeasonId !== SEASON_ID) {
    user.passSeasonId = SEASON_ID;
    user.passBpPoints = 0;
    user.passClaimedTiers = [];
  }
  if (user.passClaimedTiers.includes(tier)) {
    res.status(409).json({ error: 'already_claimed' });
    return;
  }
  if (user.passBpPoints < def.bpRequired) {
    res.status(409).json({ error: 'locked' });
    return;
  }
  user.passClaimedTiers.push(tier);
  const result = grantReward(user, def.reward, 'pass');
  await user.save();
  res.json({ profile: serializeProfile(user), reward: result });
});
