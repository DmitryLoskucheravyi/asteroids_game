import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { levelReward, survivalReward } from '../content/economy.js';
import { MAX_LEVEL, CRYSTAL_COINS } from '../content/levels.js';
import { bpForLevelComplete, bpForSurvival } from '../content/pass.js';
import { ensureQuestSlots, incrementQuestProgress, grantReward, addBp } from '../progress.js';

import type { CrateType } from '../content/crates.js';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

/** Невеликий шанс отримати ящик за ігрову подію — щоб ящики капали й поза завданнями/пропуском. */
function maybeDropCrate(chance: number): CrateType | undefined {
  if (Math.random() >= chance) return undefined;
  const r = Math.random();
  return r < 0.03 ? 'mythic' : r < 0.12 ? 'epic' : r < 0.35 ? 'rare' : 'common';
}

eventsRouter.post('/level-complete', async (req: AuthedRequest, res) => {
  const { level, stars, crystals, prisms } = req.body ?? {};
  const lvl = Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number(level) || 0)));
  const st = Math.min(3, Math.max(0, Math.floor(Number(stars) || 0)));
  const cry = Math.max(0, Math.floor(Number(crystals) || 0));
  const prism = Math.max(0, Math.floor(Number(prisms) || 0));
  if (!lvl) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }

  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const firstClear = (user.stars[lvl - 1] ?? 0) === 0;
  user.stars[lvl - 1] = Math.max(user.stars[lvl - 1] ?? 0, st);
  if (lvl < MAX_LEVEL) user.unlocked = Math.max(user.unlocked, lvl + 1);

  const coins = levelReward(lvl, st, firstClear) + cry * CRYSTAL_COINS;
  const xp = 15 + lvl * 2 + st * 5;
  const crate = maybeDropCrate(firstClear ? 0.35 : 0.18);
  const result = grantReward(user, { coins, xp, crate, crystals: prism }, 'level');

  ensureQuestSlots(user);
  incrementQuestProgress(user, 'levelsCompleted', 1);
  if (st >= 3) incrementQuestProgress(user, 'threeStarLevels', 1);
  incrementQuestProgress(user, 'crystalsCollected', cry);
  addBp(user, bpForLevelComplete(lvl, st));

  await user.save();
  res.json({ profile: serializeProfile(user), reward: { ...result, firstClear } });
});

/** Кристали, зібрані до загибелі на рівні кампанії (рівень не пройдено — unlocked/stars не змінюються). */
eventsRouter.post('/crystals', async (req: AuthedRequest, res) => {
  const { crystals, prisms } = req.body ?? {};
  const cry = Math.max(0, Math.floor(Number(crystals) || 0));
  const prism = Math.max(0, Math.floor(Number(prisms) || 0));

  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const coins = cry * CRYSTAL_COINS;
  const result = grantReward(user, { coins, crystals: prism }, 'crystals');
  ensureQuestSlots(user);
  incrementQuestProgress(user, 'crystalsCollected', cry);

  await user.save();
  res.json({ profile: serializeProfile(user), reward: result });
});

eventsRouter.post('/survival', async (req: AuthedRequest, res) => {
  const { seconds, crystals, prisms } = req.body ?? {};
  const secs = Math.max(0, Math.floor(Number(seconds) || 0));
  const cry = Math.max(0, Math.floor(Number(crystals) || 0));
  const prism = Math.max(0, Math.floor(Number(prisms) || 0));

  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const entry = { time: secs, date: new Date().toISOString().slice(0, 10) };
  const top = [...user.survivalTop, entry].sort((a, b) => b.time - a.time).slice(0, 5);
  const place = top.findIndex((e) => e === entry || (e.time === entry.time && e.date === entry.date));
  user.survivalTop.splice(0, user.survivalTop.length, ...top);

  const coins = survivalReward(secs) + cry * CRYSTAL_COINS;
  const xp = Math.floor(secs / 4);
  const crate = maybeDropCrate(Math.min(0.5, 0.1 + secs / 600));
  const result = grantReward(user, { coins, xp, crate, crystals: prism }, 'survival');

  ensureQuestSlots(user);
  incrementQuestProgress(user, 'survivalSeconds', secs);
  incrementQuestProgress(user, 'survivalRuns', 1);
  incrementQuestProgress(user, 'crystalsCollected', cry);
  addBp(user, bpForSurvival(secs));

  await user.save();
  res.json({ profile: serializeProfile(user), reward: { ...result, place } });
});
