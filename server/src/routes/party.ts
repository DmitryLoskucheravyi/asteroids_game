import { Router } from 'express';
import type { HydratedDocument } from 'mongoose';
import { User, type UserDoc } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { presence } from '../presence.js';
import { getRank } from '../progress.js';
import { normalizePublicId } from '../publicId.js';
import { RANK_MODES, type RankMode } from '../pvp/constants.js';
import * as Party from '../social/party.js';

export const partyRouter = Router();
partyRouter.use(requireAuth);

type Doc = HydratedDocument<UserDoc>;

const member = (u: Doc, mode: RankMode) => ({
  publicId: u.publicId,
  nickname: u.nickname,
  level: u.level,
  plane: u.selectedPlane,
  rankPoints: getRank(u, mode).points,
  status: presence(u._id.toString()),
});

/** Повний стан для клієнта: моя група, вхідні запрошення, друзі, яких можна запросити. */
async function view(userId: string) {
  const me = await User.findById(userId);
  if (!me) return null;
  const p = Party.getParty(userId);
  const ids = new Set<string>([...(p?.members ?? []), ...(p ? [...p.invites.keys()] : [])]);
  const invites = Party.invitesFor(userId);
  for (const inv of invites) ids.add(inv.leaderId);
  for (const f of me.friends ?? []) ids.add(f.toString());
  const users = await User.find({ _id: { $in: [...ids] } });
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const mode = p?.mode ?? 'duo';
  return {
    party: p
      ? {
          id: p.id,
          mode: p.mode,
          state: p.state,
          version: p.version,
          isLeader: p.leaderId === userId,
          maxSize: Party.maxSize(p.mode),
          members: p.members.map((m) => byId.get(m)).filter((u): u is Doc => !!u).map((u) => ({ ...member(u, mode), leader: u._id.toString() === p.leaderId, self: u._id.toString() === userId })),
          invited: [...p.invites.keys()].map((m) => byId.get(m)).filter((u): u is Doc => !!u).map((u) => member(u, mode)),
        }
      : null,
    invites: invites.map((inv) => ({ partyId: inv.id, mode: inv.mode, from: byId.get(inv.leaderId) ? member(byId.get(inv.leaderId)!, inv.mode) : null, size: inv.members.length })),
    friends: (me.friends ?? [])
      .map((f) => byId.get(f.toString()))
      .filter((u): u is Doc => !!u)
      .map((u) => ({ ...member(u, mode), inParty: !!p && (p.members.includes(u._id.toString()) || p.invites.has(u._id.toString())) })),
  };
}

partyRouter.get('/', async (req: AuthedRequest, res) => {
  res.json(await view(req.userId!));
});

/** Відповідь з помилкою групи або свіжим станом. */
async function reply(req: AuthedRequest, res: Parameters<Parameters<typeof partyRouter.get>[1]>[1], result: unknown): Promise<void> {
  if (typeof result === 'string') {
    res.status(409).json({ error: result });
    return;
  }
  res.json(await view(req.userId!));
}

partyRouter.post('/invite', async (req: AuthedRequest, res) => {
  const pid = normalizePublicId(req.body?.publicId);
  const [me, other] = await Promise.all([User.findById(req.userId), pid ? User.findOne({ publicId: pid }) : null]);
  if (!me || !other) {
    res.status(404).json({ error: 'player_not_found' });
    return;
  }
  // запрошувати можна лише друзів
  if (!(me.friends ?? []).some((f) => f.equals(other._id))) {
    res.status(403).json({ error: 'not_friend' });
    return;
  }
  const mode = RANK_MODES.includes(req.body?.mode) ? (req.body.mode as RankMode) : 'duo';
  await reply(req, res, Party.invite(req.userId!, other._id.toString(), mode));
});

partyRouter.post('/accept', async (req: AuthedRequest, res) => reply(req, res, Party.accept(req.userId!, String(req.body?.partyId))));

partyRouter.post('/decline', async (req: AuthedRequest, res) => {
  Party.decline(req.userId!, String(req.body?.partyId));
  await reply(req, res, null);
});

partyRouter.post('/leave', async (req: AuthedRequest, res) => {
  Party.leave(req.userId!);
  await reply(req, res, null);
});

partyRouter.post('/kick', async (req: AuthedRequest, res) => {
  const pid = normalizePublicId(req.body?.publicId);
  const other = pid ? await User.findOne({ publicId: pid }) : null;
  if (!other) {
    res.status(404).json({ error: 'player_not_found' });
    return;
  }
  await reply(req, res, Party.kick(req.userId!, other._id.toString()));
});

partyRouter.post('/mode', async (req: AuthedRequest, res) => {
  const mode = RANK_MODES.includes(req.body?.mode) ? (req.body.mode as RankMode) : null;
  await reply(req, res, mode ? Party.setMode(req.userId!, mode) : 'bad_mode');
});

partyRouter.post('/search', async (req: AuthedRequest, res) => reply(req, res, Party.setSearching(req.userId!, !!req.body?.searching)));
