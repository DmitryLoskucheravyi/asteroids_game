import { Router } from 'express';
import type { HydratedDocument } from 'mongoose';
import { User, type UserDoc } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { isCrateType, openCrate, type CrateReward } from '../content/crates.js';
import { addXp, ensureQuestSlots, incrementQuestProgress } from '../progress.js';

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

type Doc = HydratedDocument<UserDoc>;

/** Відкриває один ящик і одразу застосовує нагороди до профілю. */
function openOne(user: Doc, crate: Doc['crates'][number]): CrateReward[] {
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
        addXp(user, r.amount);
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
  user.stats!.cratesOpened += 1;
  return rewards;
}

const crateId = (c: unknown): string => (c as { _id: { toString(): string } })._id.toString();

/** Відкрити всі невідкриті ящики одним запитом. */
cratesRouter.post('/open-all', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const results = user.crates.filter((c) => !c.openedAt).map((c) => ({ crateId: crateId(c), crateType: c.crateType, rewards: openOne(user, c) }));
  await user.save();
  res.json({ profile: serializeProfile(user), results });
});

cratesRouter.post('/:crateId/open', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const crate = user.crates.find((c) => crateId(c) === req.params.crateId);
  if (!crate) {
    res.status(404).json({ error: 'crate_not_found' });
    return;
  }
  if (crate.openedAt) {
    res.status(409).json({ error: 'already_opened' });
    return;
  }
  const rewards = openOne(user, crate);
  await user.save();
  res.json({ profile: serializeProfile(user), rewards });
});
