import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { isCrateType, openCrate } from '../content/crates.js';
import { applyXp } from '../content/economy.js';
import { ensureQuestSlots, incrementQuestProgress } from '../progress.js';

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

  const type = isCrateType(crate.crateType) ? crate.crateType : 'common';
  const rewards = openCrate(type, {
    planes: [...user.ownedPlanes],
    items: user.items.map((i) => i.defId),
    weapons: [...user.ownedWeapons],
  });
  crate.openedAt = new Date();

  for (const r of rewards) {
    switch (r.kind) {
      case 'coins':
        user.coins += r.amount;
        break;
      case 'crystals':
        user.crystals += r.amount;
        break;
      case 'xp': {
        const { level, xp } = applyXp({ xp: user.xp, level: user.level }, r.amount);
        user.level = level;
        user.xp = xp;
        break;
      }
      case 'plane':
        if (!user.ownedPlanes.includes(r.planeId)) user.ownedPlanes.push(r.planeId);
        break;
      case 'item':
        user.items.push({ defId: r.defId, rarity: r.rarity });
        break;
      case 'weapon':
        if (!user.ownedWeapons.includes(r.weaponId)) user.ownedWeapons.push(r.weaponId);
        break;
    }
  }

  ensureQuestSlots(user);
  incrementQuestProgress(user, 'cratesOpened', 1);
  await user.save();
  res.json({ profile: serializeProfile(user), rewards });
});
