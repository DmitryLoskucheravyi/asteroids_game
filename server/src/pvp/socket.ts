import { Server as IOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { enqueue, dequeue, roomFor, onDisconnect, leaveRoom } from './matchmaking.js';
import { DEFAULT_WEAPON_ID } from '../content/weapons.js';
import { ensureRankSeason } from '../progress.js';
import type { SkillKind } from './types.js';

export function attachPvp(server: HttpServer): void {
  const io = new IOServer(server, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const uid = token ? verifyToken(token) : null;
    if (!uid) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.userId = uid;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('queue:join', async (data?: { mode?: string }) => {
      const mode = data?.mode === 'ranked' ? 'ranked' : 'casual';
      const user = await User.findById(socket.data.userId as string);
      if (!user) return;
      ensureRankSeason(user);
      if (user.isModified()) await user.save();
      const progress = user.planeProgress.find((p) => p.planeId === user.selectedPlane);
      const loadout = user.loadouts.find((l) => l.planeId === user.selectedPlane);
      const defIdOf = (itemId: string | null | undefined): string | null => {
        if (!itemId) return null;
        const it = user.items.find((i) => (i as unknown as { _id: { toString(): string } })._id.toString() === itemId);
        return it?.defId ?? null;
      };
      enqueue(io, {
        socket,
        userId: user._id.toString(),
        nickname: user.nickname,
        planeId: user.selectedPlane,
        weaponId: loadout?.weapon ?? DEFAULT_WEAPON_ID,
        tier: progress?.tier ?? 1,
        level: progress?.level ?? 1,
        activeDefId: defIdOf(loadout?.active),
        passiveDefId: defIdOf(loadout?.passive),
        rankPoints: user.rankPoints ?? 0,
      }, mode);
    });

    socket.on('queue:leave', () => {
      dequeue(socket.id);
      leaveRoom(socket.id);
    });

    socket.on('match:move', (data: { pos: { x: number; y: number }; angle: number; firing: boolean }) => {
      roomFor(socket.id)?.onMove(socket.id, data?.pos, data?.angle, data?.firing);
    });

    socket.on('match:shot', (data: { x: number; y: number; angle: number; kind: string }) => {
      roomFor(socket.id)?.onShot(socket.id, data);
    });

    socket.on('match:fire-hit', (data: { targetId: string; source?: string }) => {
      roomFor(socket.id)?.onHit(socket.id, String(data?.targetId), String(data?.source ?? 'weapon'));
    });

    socket.on('match:skill', (data: { kind: SkillKind; x: number; y: number; angle: number }) => {
      roomFor(socket.id)?.onSkill(socket.id, data);
    });

    socket.on('disconnect', () => onDisconnect(socket.id));
  });
}
