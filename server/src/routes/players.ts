import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { User } from '../models/User.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { presence } from '../presence.js';
import { normalizePublicId } from '../publicId.js';
import { serializeRankedModes, serializeStats } from '../serialize.js';

/**
 * Публічний профіль іншого гравця: рівень, літак, статистика, рейтинг у кожному режимі,
 * статус (онлайн / у бою) і стосунок до мене (друг, заявка) — для кнопки «Додати в друзі».
 * Ключ — публічний ID (#ABC…) або внутрішній id (з таблиць лідерів і результатів матчу).
 */
export const playersRouter = Router();
playersRouter.use(requireAuth);

playersRouter.get('/:key', async (req: AuthedRequest, res) => {
  const key = req.params.key;
  const pid = normalizePublicId(key);
  const [me, other] = await Promise.all([User.findById(req.userId), isValidObjectId(key) ? User.findById(key) : pid ? User.findOne({ publicId: pid }) : null]);
  if (!me || !other) {
    res.status(404).json({ error: 'player_not_found' });
    return;
  }
  const has = (list: typeof me.friends | undefined) => !!list?.some((x) => x.equals(other._id));
  const relation = other._id.equals(me._id) ? 'self' : has(me.friends) ? 'friend' : has(me.friendRequestsOut) ? 'outgoing' : has(me.friendRequestsIn) ? 'incoming' : 'none';
  const progress = other.planeProgress.find((p) => p.planeId === other.selectedPlane);
  res.json({
    relation,
    player: {
      publicId: other.publicId,
      nickname: other.nickname,
      level: other.level,
      status: presence(other._id.toString()),
      lastLoginAt: other.lastLoginAt,
      createdAt: other.createdAt,
      plane: { id: other.selectedPlane, tier: progress?.tier ?? 1, level: progress?.level ?? 1 },
      planesOwned: other.ownedPlanes.length,
      stats: serializeStats(other),
      ranked: serializeRankedModes(other),
    },
  });
});
