import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { openCrate } from '../content/crates.js';
import { applyXp } from '../content/economy.js';

export const cratesRouter = Router();
cratesRouter.use(requireAuth);

cratesRouter.get('/', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ profile: serializeProfile(user) });
});

cratesRouter.post('/:crateId/open', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const crate = user.crates.find((c) => (c as unknown as { _id: { toString(): string } })._id.toString() === req.params.crateId);
  if (!crate) {
    res.status(404).json({ error: 'crate_not_found' });
    return;
  }
  if (crate.openedAt) {
    res.status(409).json({ error: 'already_opened' });
    return;
  }

  const reward = openCrate(crate.crateType as 'common' | 'rare' | 'legendary', user.ownedPlanes);
  crate.openedAt = new Date();

  if (reward.kind === 'coins') user.coins += reward.amount;
  if (reward.kind === 'plane') user.ownedPlanes.push(reward.planeId);
  if (reward.kind === 'xp') {
    const { level, xp } = applyXp({ xp: user.xp, level: user.level }, reward.amount);
    user.level = level;
    user.xp = xp;
  }

  await user.save();
  res.json({ profile: serializeProfile(user), reward });
});
