import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { findQuestDef } from '../content/quests.js';
import { ensureQuestSlots, grantReward, addBp } from '../progress.js';
import { bpForQuestClaim } from '../content/pass.js';

export const questsRouter = Router();
questsRouter.use(requireAuth);

questsRouter.get('/', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  ensureQuestSlots(user);
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

questsRouter.post('/:questId/claim', async (req: AuthedRequest, res) => {
  const { questId } = req.params;
  const { periodKey } = req.body ?? {};
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const slot = user.quests.find((q) => q.questId === questId && q.periodKey === periodKey);
  const def = findQuestDef(questId);
  if (!slot || !def) {
    res.status(404).json({ error: 'quest_not_found' });
    return;
  }
  if (slot.claimed) {
    res.status(409).json({ error: 'already_claimed' });
    return;
  }
  if (slot.progress < def.target) {
    res.status(409).json({ error: 'not_complete' });
    return;
  }
  slot.claimed = true;
  const result = grantReward(user, def.reward, 'quest');
  addBp(user, bpForQuestClaim());
  await user.save();
  res.json({ profile: serializeProfile(user), reward: result });
});
