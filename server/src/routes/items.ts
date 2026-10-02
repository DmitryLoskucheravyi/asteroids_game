import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { getItemDef, isRarity, itemPrice } from '../content/items.js';
import { isPlaneId } from '../content/planes.js';

export const itemsRouter = Router();
itemsRouter.use(requireAuth);

itemsRouter.post('/buy', async (req: AuthedRequest, res) => {
  const { defId, rarity } = req.body ?? {};
  const def = typeof defId === 'string' ? getItemDef(defId) : undefined;
  if (!def || typeof rarity !== 'string' || !isRarity(rarity)) {
    res.status(400).json({ error: 'bad_item' });
    return;
  }
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const price = itemPrice(def, rarity);
  if (user.coins < price) {
    res.status(402).json({ error: 'not_enough_coins' });
    return;
  }
  user.coins -= price;
  user.items.push({ defId: def.id, rarity });
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

/** Екіпірування: planeId + active/passive — id власного предмета (owned item's _id) або null, щоб зняти. */
itemsRouter.post('/loadout', async (req: AuthedRequest, res) => {
  const { planeId, active, passive } = req.body ?? {};
  if (typeof planeId !== 'string' || !isPlaneId(planeId)) {
    res.status(400).json({ error: 'bad_plane' });
    return;
  }
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (!user.ownedPlanes.includes(planeId)) {
    res.status(400).json({ error: 'not_owned' });
    return;
  }

  const resolve = (slot: 'active' | 'passive', id: unknown): string | null => {
    if (id === null || id === undefined) return null;
    if (typeof id !== 'string') return null;
    const owned = user.items.find((it) => (it as unknown as { _id: { toString(): string } })._id.toString() === id);
    if (!owned) return null;
    const def = getItemDef(owned.defId);
    if (!def || def.slot !== slot) return null;
    return id;
  };

  const activeId = resolve('active', active);
  const passiveId = resolve('passive', passive);

  let loadout = user.loadouts.find((l) => l.planeId === planeId);
  if (!loadout) {
    user.loadouts.push({ planeId, active: activeId, passive: passiveId });
  } else {
    loadout.active = activeId;
    loadout.passive = passiveId;
  }
  await user.save();
  res.json({ profile: serializeProfile(user) });
});
