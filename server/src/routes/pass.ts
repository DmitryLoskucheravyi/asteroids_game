import { Router } from 'express';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { serializeProfile } from '../serialize.js';
import { PASS_TIERS, currentSeason, PREMIUM_PASS_PRICE, type PassReward } from '../content/pass.js';
import { getItemDef } from '../content/items.js';
import { duplicateCrystals } from '../content/compensation.js';
import { getWeaponDef } from '../content/weapons.js';
import { isPlaneId } from '../content/planes.js';
import type { HydratedDocument } from 'mongoose';
import type { UserDoc } from '../models/User.js';
import { grantReward, ensureSeason } from '../progress.js';

export const passRouter = Router();
passRouter.use(requireAuth);

passRouter.get('/', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  const season = currentSeason();
  res.json({
    season: { id: season.id, startsAt: season.startsAt, endsAt: season.endsAt, tiers: PASS_TIERS, premiumPrice: PREMIUM_PASS_PRICE },
    bpPoints: user.passSeasonId === season.id ? user.passBpPoints : 0,
    premium: user.passSeasonId === season.id ? user.passPremium : false,
    claimedFree: user.passSeasonId === season.id ? user.passClaimedFree : [],
    claimedPremium: user.passSeasonId === season.id ? user.passClaimedPremium : [],
  });
});

/** Предмет/зброя/літак з тьєру; якщо вже є — компенсація кристалами, щоб нагорода не "пропадала". */
function grantExtras(user: HydratedDocument<UserDoc>, r: PassReward): number {
  let refund = 0;
  if (r.item && getItemDef(r.item)) {
    if (user.items.some((i) => i.defId === r.item)) refund += duplicateCrystals('item', r.item);
    else user.items.push({ defId: r.item, rarity: getItemDef(r.item)!.rarity });
  }
  if (r.weapon && getWeaponDef(r.weapon)) {
    if (user.ownedWeapons.includes(r.weapon)) refund += duplicateCrystals('weapon', r.weapon);
    else user.ownedWeapons.push(r.weapon);
  }
  if (r.plane && isPlaneId(r.plane)) {
    if (user.ownedPlanes.includes(r.plane)) refund += duplicateCrystals('plane', r.plane);
    else user.ownedPlanes.push(r.plane);
  }
  return refund;
}

function claimOne(user: HydratedDocument<UserDoc>, reward: PassReward) {
  const refund = grantExtras(user, reward);
  return grantReward(user, { ...reward, crystals: (reward.crystals ?? 0) + refund }, 'pass');
}

/** Забрати все доступне з обох треків одним запитом. */
passRouter.post('/claim-all', async (req: AuthedRequest, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  ensureSeason(user);
  const total = { coins: 0, xp: 0, crystals: 0, crates: 0, tiers: 0 };
  for (const def of PASS_TIERS) {
    if (user.passBpPoints < def.bpRequired) break;
    const tracks: [number[], PassReward][] = [[user.passClaimedFree, def.reward]];
    if (user.passPremium) tracks.push([user.passClaimedPremium, def.premiumReward]);
    for (const [list, reward] of tracks) {
      if (list.includes(def.tier)) continue;
      list.push(def.tier);
      const r = claimOne(user, reward);
      total.coins += r.coins;
      total.xp += r.xp;
      total.crystals += r.crystals;
      if (r.crateAwarded) total.crates++;
      total.tiers++;
    }
  }
  await user.save();
  res.json({ profile: serializeProfile(user), total });
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
  const result = claimOne(user, track === 'premium' ? def.premiumReward : def.reward);
  await user.save();
  res.json({ profile: serializeProfile(user), reward: result });
});
