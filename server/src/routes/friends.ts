import { Router } from 'express';
import type { HydratedDocument, Types } from 'mongoose';
import { User, type UserDoc } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { presence } from '../presence.js';
import { getRank } from '../progress.js';
import { ensurePublicId, normalizePublicId } from '../publicId.js';

export const friendsRouter = Router();
friendsRouter.use(requireAuth);

const MAX_FRIENDS = 100;

type Doc = HydratedDocument<UserDoc>;

/** Публічна картка гравця — без пошти й внутрішніх даних. */
function card(u: Doc) {
  const id = u._id.toString();
  return {
    publicId: u.publicId,
    nickname: u.nickname,
    level: u.level,
    plane: u.selectedPlane,
    rankPoints: getRank(u, 'solo').points,
    stats: { matches: u.stats?.pvpMatches ?? 0, wins: u.stats?.pvpWins ?? 0, kills: u.stats?.pvpKills ?? 0 },
    status: presence(id),
    lastLoginAt: u.lastLoginAt,
  };
}

const has = (list: Types.ObjectId[] | undefined, id: Types.ObjectId): boolean => !!list?.some((x) => x.equals(id));
const without = (list: Types.ObjectId[], id: Types.ObjectId): Types.ObjectId[] => list.filter((x) => !x.equals(id));

async function loadMe(req: AuthedRequest, res: Parameters<Parameters<typeof friendsRouter.get>[1]>[1]): Promise<Doc | null> {
  const me = await User.findById(req.userId);
  if (!me) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  await ensurePublicId(me);
  return me;
}

async function findByPublicId(raw: unknown): Promise<Doc | null> {
  const id = normalizePublicId(raw);
  return id ? User.findOne({ publicId: id }) : null;
}

/** Список друзів і заявок. */
async function listFor(me: Doc) {
  const ids = [...(me.friends ?? []), ...(me.friendRequestsIn ?? []), ...(me.friendRequestsOut ?? [])];
  const users = await User.find({ _id: { $in: ids } });
  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const pick = (list: Types.ObjectId[] | undefined) => (list ?? []).map((id) => byId.get(id.toString())).filter((u): u is Doc => !!u).map(card);
  const order = { match: 0, online: 1, offline: 2 } as const;
  return {
    me: { publicId: me.publicId },
    friends: pick(me.friends).sort((a, b) => order[a.status] - order[b.status] || a.nickname.localeCompare(b.nickname)),
    incoming: pick(me.friendRequestsIn),
    outgoing: pick(me.friendRequestsOut),
  };
}

/** Пінг присутності (сам факт запиту оновлює "онлайн" у requireAuth). */
friendsRouter.get('/ping', (_req, res) => {
  res.json({ ok: true });
});

friendsRouter.get('/', async (req: AuthedRequest, res) => {
  const me = await loadMe(req, res);
  if (!me) return;
  if (me.isModified()) await me.save();
  res.json(await listFor(me));
});

/** Пошук гравця за ID (#ABC…). */
friendsRouter.get('/search/:publicId', async (req: AuthedRequest, res) => {
  const me = await loadMe(req, res);
  if (!me) return;
  const other = await findByPublicId(req.params.publicId);
  if (!other) {
    res.status(404).json({ error: 'player_not_found' });
    return;
  }
  const relation = other._id.equals(me._id)
    ? 'self'
    : has(me.friends, other._id)
      ? 'friend'
      : has(me.friendRequestsOut, other._id)
        ? 'outgoing'
        : has(me.friendRequestsIn, other._id)
          ? 'incoming'
          : 'none';
  res.json({ player: card(other), relation });
});

/** Надіслати заявку; якщо інший гравець уже надіслав мені — одразу дружимо. */
friendsRouter.post('/request', async (req: AuthedRequest, res) => {
  const me = await loadMe(req, res);
  if (!me) return;
  const other = await findByPublicId(req.body?.publicId);
  if (!other) {
    res.status(404).json({ error: 'player_not_found' });
    return;
  }
  if (other._id.equals(me._id)) {
    res.status(400).json({ error: 'self' });
    return;
  }
  if (has(me.friends, other._id)) {
    res.status(409).json({ error: 'already_friends' });
    return;
  }
  if ((me.friends?.length ?? 0) >= MAX_FRIENDS || (other.friends?.length ?? 0) >= MAX_FRIENDS) {
    res.status(409).json({ error: 'friends_limit' });
    return;
  }
  if (has(me.friendRequestsIn, other._id)) {
    me.friendRequestsIn = without(me.friendRequestsIn ?? [], other._id);
    other.friendRequestsOut = without(other.friendRequestsOut ?? [], me._id);
    me.friends.push(other._id);
    other.friends.push(me._id);
  } else if (!has(me.friendRequestsOut, other._id)) {
    me.friendRequestsOut.push(other._id);
    other.friendRequestsIn.push(me._id);
  }
  await Promise.all([me.save(), other.save()]);
  res.json(await listFor(me));
});

/** Прийняти / відхилити вхідну заявку, скасувати свою, видалити друга. */
for (const action of ['accept', 'decline', 'cancel', 'remove'] as const) {
  friendsRouter.post(`/${action}`, async (req: AuthedRequest, res) => {
    const me = await loadMe(req, res);
    if (!me) return;
    const other = await findByPublicId(req.body?.publicId);
    if (!other) {
      res.status(404).json({ error: 'player_not_found' });
      return;
    }
    if (action === 'accept') {
      if (!has(me.friendRequestsIn, other._id)) {
        res.status(409).json({ error: 'no_request' });
        return;
      }
      me.friendRequestsIn = without(me.friendRequestsIn ?? [], other._id);
      other.friendRequestsOut = without(other.friendRequestsOut ?? [], me._id);
      if (!has(me.friends, other._id)) me.friends.push(other._id);
      if (!has(other.friends, me._id)) other.friends.push(me._id);
    } else if (action === 'decline') {
      me.friendRequestsIn = without(me.friendRequestsIn ?? [], other._id);
      other.friendRequestsOut = without(other.friendRequestsOut ?? [], me._id);
    } else if (action === 'cancel') {
      me.friendRequestsOut = without(me.friendRequestsOut ?? [], other._id);
      other.friendRequestsIn = without(other.friendRequestsIn ?? [], me._id);
    } else {
      me.friends = without(me.friends ?? [], other._id);
      other.friends = without(other.friends ?? [], me._id);
    }
    await Promise.all([me.save(), other.save()]);
    res.json(await listFor(me));
  });
}
