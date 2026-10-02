import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { ensureQuestSlots, incrementQuestProgress, ensureSeason } from '../progress.js';
import { getItemDef } from '../content/items.js';
import { getWeaponDef } from '../content/weapons.js';
import { isPlaneId, PLANE_PRICES } from '../content/planes.js';
import { PREMIUM_PASS_PRICE } from '../content/pass.js';

/**
 * Сервіс магазину: усі покупки за валюту (предмети, зброя, літаки, преміум-пропуск).
 * Шляхи ті самі, що й раніше, — шлюз спрямовує їх сюди.
 */
export const shopRouter = Router();
shopRouter.use(requireAuth);

/** Купівля предмета: рідкість задана самим предметом, кожен предмет купується один раз. */
shopRouter.post('/items/buy', async (req: AuthedRequest, res) => {
  const { defId } = req.body ?? {};
  const def = typeof defId === 'string' ? getItemDef(defId) : undefined;
  if (!def) {
    res.status(400).json({ error: 'bad_item' });
    return;
  }
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (user.items.some((it) => it.defId === def.id)) {
    res.status(409).json({ error: 'already_owned' });
    return;
  }
  if (user.coins < def.price) {
    res.status(402).json({ error: 'not_enough_coins' });
    return;
  }
  user.coins -= def.price;
  user.items.push({ defId: def.id, rarity: def.rarity });
  ensureQuestSlots(user);
  incrementQuestProgress(user, 'itemsBought', 1);
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

/** Купівля зброї (без рідкостей — фіксована ціна, як у літаків). */
shopRouter.post('/items/buy-weapon', async (req: AuthedRequest, res) => {
  const { weaponId } = req.body ?? {};
  const def = typeof weaponId === 'string' ? getWeaponDef(weaponId) : undefined;
  if (!def) {
    res.status(400).json({ error: 'bad_weapon' });
    return;
  }
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (user.ownedWeapons.includes(def.id)) {
    res.status(409).json({ error: 'already_owned' });
    return;
  }
  if (user.coins < def.price) {
    res.status(402).json({ error: 'not_enough_coins' });
    return;
  }
  user.coins -= def.price;
  user.ownedWeapons.push(def.id);
  ensureQuestSlots(user);
  incrementQuestProgress(user, 'itemsBought', 1);
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

shopRouter.post('/profile/buy-plane', async (req: AuthedRequest, res) => {
  const { planeId } = req.body ?? {};
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (typeof planeId !== 'string' || !isPlaneId(planeId)) {
    res.status(400).json({ error: 'bad_plane' });
    return;
  }
  if (user.ownedPlanes.includes(planeId)) {
    res.status(409).json({ error: 'already_owned' });
    return;
  }
  const price = PLANE_PRICES[planeId];
  if (user.coins < price) {
    res.status(402).json({ error: 'not_enough_coins' });
    return;
  }
  user.coins -= price;
  user.ownedPlanes.push(planeId);
  user.selectedPlane = planeId;
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

shopRouter.post('/pass/buy-premium', async (req: AuthedRequest, res) => {
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
