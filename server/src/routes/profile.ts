import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { ensureQuestSlots } from '../progress.js';
import { isPlaneId, PLANE_PRICES } from '../content/planes.js';

export const profileRouter = Router();
profileRouter.use(requireAuth);

profileRouter.get('/', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  ensureQuestSlots(user);
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

profileRouter.post('/select-plane', async (req: AuthedRequest, res) => {
  const { planeId } = req.body ?? {};
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (typeof planeId !== 'string' || !isPlaneId(planeId) || !user.ownedPlanes.includes(planeId)) {
    res.status(400).json({ error: 'not_owned' });
    return;
  }
  user.selectedPlane = planeId;
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

profileRouter.post('/buy-plane', async (req: AuthedRequest, res) => {
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

const BINDABLE_ACTIONS = ['up', 'down', 'left', 'right', 'freeze', 'boost', 'jump', 'pause'];

profileRouter.post('/keybinds', async (req: AuthedRequest, res) => {
  const { keybinds } = req.body ?? {};
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (typeof keybinds !== 'object' || keybinds === null) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  const clean: Record<string, string> = {};
  for (const action of BINDABLE_ACTIONS) {
    const v = (keybinds as Record<string, unknown>)[action];
    if (typeof v === 'string' && v.length > 0 && v.length < 40) clean[action] = v;
  }
  user.keybinds = clean;
  await user.save();
  res.json({ profile: serializeProfile(user) });
});

/** Одноразове перенесення прогресу, накопиченого до реєстрації (localStorage), в акаунт. */
profileRouter.post('/import-local', async (req: AuthedRequest, res) => {
  const { coins, owned, stars, unlocked, survivalTop } = req.body ?? {};
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  user.coins += Math.max(0, Math.floor(Number(coins) || 0));

  if (Array.isArray(owned)) {
    const valid = owned.filter((id): id is string => typeof id === 'string' && isPlaneId(id));
    user.ownedPlanes = [...new Set([...user.ownedPlanes, ...valid])];
  }

  if (Array.isArray(stars)) {
    const merged = [...user.stars];
    stars.forEach((s: unknown, i: number) => {
      const n = Math.max(0, Math.min(3, Math.floor(Number(s) || 0)));
      merged[i] = Math.max(merged[i] ?? 0, n);
    });
    user.stars = merged;
  }

  if (typeof unlocked === 'number') user.unlocked = Math.max(user.unlocked, Math.floor(unlocked));

  if (Array.isArray(survivalTop)) {
    const incoming = survivalTop.filter((e): e is { time: number; date: string } => typeof e?.time === 'number' && typeof e?.date === 'string');
    const merged = [...user.survivalTop, ...incoming].sort((a, b) => b.time - a.time).slice(0, 5);
    user.survivalTop.splice(0, user.survivalTop.length, ...merged);
  }

  await user.save();
  res.json({ profile: serializeProfile(user) });
});

profileRouter.post('/reset', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  user.coins = 0;
  user.xp = 0;
  user.level = 1;
  user.selectedPlane = 'falcon';
  user.ownedPlanes = ['falcon'];
  user.stars = [];
  user.unlocked = 1;
  user.survivalTop.splice(0, user.survivalTop.length);
  user.dailyLast = '';
  user.dailyStreak = 0;
  user.quests.splice(0, user.quests.length);
  user.passSeasonId = '';
  user.passBpPoints = 0;
  user.passPremium = false;
  user.passClaimedFree.splice(0, user.passClaimedFree.length);
  user.passClaimedPremium.splice(0, user.passClaimedPremium.length);
  user.crates.splice(0, user.crates.length);
  await user.save();
  res.json({ profile: serializeProfile(user) });
});
