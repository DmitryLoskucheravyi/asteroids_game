import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { getItemDef } from '../content/items.js';
import { isPlaneId } from '../content/planes.js';
import { getWeaponDef } from '../content/weapons.js';

export const itemsRouter = Router();
itemsRouter.use(requireAuth);

/** Екіпірування: planeId + active/passive — id власного предмета (owned item's _id) або null, щоб зняти; weapon — id зброї. */
itemsRouter.post('/loadout', async (req: AuthedRequest, res) => {
  const { planeId, active, passive, weapon } = req.body ?? {};
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

  const resolveItem = (slot: 'active' | 'passive', id: unknown): string | null => {
    if (id === null || id === undefined) return null;
    if (typeof id !== 'string') return null;
    const owned = user.items.find((it) => (it as unknown as { _id: { toString(): string } })._id.toString() === id);
    if (!owned) return null;
    const def = getItemDef(owned.defId);
    if (!def || def.slot !== slot) return null;
    return id;
  };
  const resolveWeapon = (id: unknown): string | null => {
    if (typeof id !== 'string') return null;
    return getWeaponDef(id) && user.ownedWeapons.includes(id) ? id : null;
  };

  const activeId = resolveItem('active', active);
  const passiveId = resolveItem('passive', passive);
  const weaponId = resolveWeapon(weapon);

  let loadout = user.loadouts.find((l) => l.planeId === planeId);
  if (!loadout) {
    user.loadouts.push({ planeId, active: activeId, passive: passiveId, weapon: weaponId });
  } else {
    loadout.active = activeId;
    loadout.passive = passiveId;
    loadout.weapon = weaponId;
  }
  await user.save();
  res.json({ profile: serializeProfile(user) });
});
