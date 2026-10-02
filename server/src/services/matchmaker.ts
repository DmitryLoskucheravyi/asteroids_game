import { Server as IOServer } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { isQueueMode } from '../pvp/constants.js';
import { dequeue, enqueue, enqueueGroup, heartbeat, liveGameServers, queueSizes, type QueueEntry } from '../pvp/matchmaking.js';
import { callService, createApp, listen, notifyService, servicePort } from './common.js';

/**
 * Матчмейкер: socket.io лише для черги (пошук / скасування / "матч знайдено").
 * Знайшовши кімнату, видає гравцям підписаний квиток на ігровий сервер; бій іде вже там.
 * Також тримає реєстр ігрових серверів (вони шлють heartbeat кожні 2 с).
 */
const app = createApp('matchmaker');

app.post('/internal/game-servers/heartbeat', (req, res) => {
  const { id, url, rooms, players, metrics } = req.body ?? {};
  if (typeof id === 'string' && typeof url === 'string') heartbeat({ id, url, rooms: Number(rooms) || 0, players: Number(players) || 0, metrics });
  res.json({ ok: true });
});

app.get('/internal/game-servers', (_req, res) => {
  res.json({ servers: liveGameServers(), queues: queueSizes() });
});

const server = listen(app, 'matchmaker', servicePort('matchmaker'));
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

type PlayerSnapshot = Omit<QueueEntry, 'socket' | 'groupId'>;

io.on('connection', (socket) => {
  const userId = socket.data.userId as string;

  socket.on('queue:join', async (data?: { mode?: string; partyId?: string }) => {
    // 'ranked' — старі клієнти, тепер це соло
    const raw = data?.mode === 'ranked' ? 'solo' : data?.mode;
    const mode = isQueueMode(raw) ? raw : 'casual';
    try {
      const snap = await callService<PlayerSnapshot>('profile', `/internal/player/${userId}?mode=${mode}`, { retries: 1 });
      const entry: QueueEntry = { ...snap, socket };
      // група: усі учасники мають стати в чергу — тоді вона йде в матч цілою
      if (data?.partyId && mode !== 'casual') {
        const { party } = await callService<{ party: { id: string; mode: string; state: string; members: string[] } | null }>('social', `/internal/party/${encodeURIComponent(data.partyId)}`);
        if (party && party.members.includes(userId) && party.state === 'searching' && party.mode === mode) {
          entry.groupId = party.id;
          enqueueGroup(entry, mode, party.members.length);
          return;
        }
      }
      enqueue(entry, mode);
    } catch (e) {
      console.warn('[matchmaker] queue:join не вдалося:', e instanceof Error ? e.message : e);
      socket.emit('queue:error', { error: 'unavailable' });
    }
  });

  socket.on('queue:leave', () => {
    // вихід з пошуку зупиняє пошук і для всієї групи
    notifyService('social', '/internal/party/stop', { userId }, 1);
    dequeue(socket.id);
  });

  socket.on('disconnect', () => dequeue(socket.id));
});
