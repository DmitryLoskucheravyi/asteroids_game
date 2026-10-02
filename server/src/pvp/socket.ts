import { Server as IOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { verifyToken } from '../utils/jwt.js';
import { User } from '../models/User.js';
import { enqueue, dequeue, roomFor, onDisconnect } from './matchmaking.js';
import { DEFAULT_WEAPON_ID } from '../content/weapons.js';

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
    socket.on('queue:join', async () => {
      const user = await User.findById(socket.data.userId as string);
      if (!user) return;
      const progress = user.planeProgress.find((p) => p.planeId === user.selectedPlane);
      const loadout = user.loadouts.find((l) => l.planeId === user.selectedPlane);
      enqueue(io, {
        socket,
        userId: user._id.toString(),
        nickname: user.nickname,
        planeId: user.selectedPlane,
        weaponId: loadout?.weapon ?? DEFAULT_WEAPON_ID,
        tier: progress?.tier ?? 1,
        level: progress?.level ?? 1,
      });
    });

    socket.on('queue:leave', () => dequeue(socket.id));

    socket.on('match:move', (data: { pos: { x: number; y: number }; angle: number; firing: boolean }) => {
      roomFor(socket.id)?.onMove(socket.id, data.pos, data.angle, data.firing);
    });

    socket.on('match:fire-hit', (data: { targetId: string }) => {
      roomFor(socket.id)?.onHit(socket.id, data.targetId);
    });

    socket.on('disconnect', () => onDisconnect(socket.id));
  });
}
