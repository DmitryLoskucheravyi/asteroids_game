import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { PASS_TIERS, SEASON_ID, SEASON_STARTS, SEASON_ENDS, PREMIUM_PASS_PRICE } from '../content/pass.js';
import { grantReward, ensureSeason } from '../progress.js';

export const passRouter = Router();
passRouter.use(requireAuth);

passRouter.get('/', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({
    season: { id: SEASON_ID, startsAt: SEASON_STARTS, endsAt: SEASON_ENDS, tiers: PASS_TIERS, premiumPrice: PREMIUM_PASS_PRICE },
    bpPoints: user.passSeasonId === SEASON_ID ? user.passBpPoints : 0,
    premium: user.passSeasonId === SEASON_ID ? user.passPremium : false,
    claimedFree: user.passSeasonId === SEASON_ID ? user.passClaimedFree : [],
    claimedPremium: user.passSeasonId === SEASON_ID ? user.passClaimedPremium : [],
  });
});

passRouter.post('/buy-premium', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  ensureSeason(user);
  if (user.passPremium) {
    res.status(409).json({ error: 'already_premium' });
    return;
  }
  if (user.coins < PREMIUM_PASS_PRICE) {
    res.status(402).json({ error: 'not_enough_coins' });
    return;
  }
  user.coins -= PREMIUM_PASS_PRICE;
  user.passPremium = true;
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

passRouter.post('/claim/:tier', async (req: AuthedRequest, res) => {
  const tier = Math.floor(Number(req.params.tier));
  const track = req.body?.track === 'premium' ? 'premium' : 'free';
  const def = PASS_TIERS.find((t) => t.tier === tier);
  const user = await User.findById(req.userId);
  if (!user || !def) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  ensureSeason(user);

  if (track === 'premium' && !user.passPremium) {
    res.status(403).json({ error: 'premium_required' });
    return;
  }
  const claimedList = track === 'premium' ? user.passClaimedPremium : user.passClaimedFree;
  if (claimedList.includes(tier)) {
    res.status(409).json({ error: 'already_claimed' });
    return;
  }
  if (user.passBpPoints < def.bpRequired) {
    res.status(409).json({ error: 'locked' });
    return;
  }
  claimedList.push(tier);
  const result = grantReward(user, track === 'premium' ? def.premiumReward : def.reward, 'pass');
  await user.save();
  res.json({ profile: serializeProfile(user), reward: result });
});
