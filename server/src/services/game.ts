import { monitorEventLoopDelay } from 'node:perf_hooks';
import jwt from 'jsonwebtoken';
import { WebSocketServer, type WebSocket } from 'ws';
import { env } from '../env.js';
import { Room, type Entrant, type RoomHooks, type RoomNet } from '../pvp/room.js';
import { isQueueMode } from '../pvp/constants.js';
import { MSG, decodeFire, decodeMove } from '../shared/netcodec.js';
import type { SkillKind } from '../pvp/types.js';
import { createApp, listen, notifyService, callService } from './common.js';

/**
 * Ігровий сервер: лише симуляція матчів, без бази даних. Кімнати створює матчмейкер,
 * гравці підʼєднуються по чистому WebSocket з підписаним квитком. Таких процесів може бути
 * скільки завгодно (GAME_ID / PORT) — кожен сам реєструється в матчмейкері.
 *
 * Протокол: бінарні кадри — netcodec (перший байт = тип), текстові — JSON {e, d}.
 */
const GAME_ID = process.env.GAME_ID ?? 'g1';
const PORT = Number(process.env.PORT) || 8901;
const PUBLIC_URL = process.env.GAME_INTERNAL_URL ?? `http://127.0.0.1:${PORT}`;

interface Live {
  room: Room;
  conns: Map<string, WebSocket>;
}
const rooms = new Map<string, Live>();
let roomSeq = 0;

const hooks: RoomHooks = {
  setInMatch: (userId, inMatch) => notifyService('social', '/internal/presence', { userId, inMatch }, 1),
  results: (payload) => notifyService('profile', '/internal/match-results', payload, 5),
  leaver: (payload) => notifyService('profile', '/internal/leaver', payload, 5),
};

const frame = (event: string, data: unknown): string | Uint8Array => (data instanceof Uint8Array ? data : JSON.stringify({ e: event, d: data }));

function makeNet(conns: Map<string, WebSocket>): RoomNet {
  return {
    broadcast(event, data, except) {
      const f = frame(event, data);
      for (const [pid, ws] of conns) if (pid !== except && ws.readyState === ws.OPEN) ws.send(f);
    },
    send(pid, event, data) {
      const ws = conns.get(pid);
      if (ws && ws.readyState === ws.OPEN) ws.send(frame(event, data));
    },
  };
}

// ---------- внутрішній API (лише для матчмейкера) ----------

const app = createApp(`game:${GAME_ID}`);

app.post('/internal/rooms', (req, res) => {
  const { mode, entrants } = req.body ?? {};
  if (!isQueueMode(mode) || !Array.isArray(entrants) || !entrants.length) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  const id = `${GAME_ID}-${++roomSeq}`;
  const conns = new Map<string, WebSocket>();
  const room = new Room(id, makeNet(conns), entrants as Entrant[], mode, hooks);
  rooms.set(id, { room, conns });
  room.onClose = () => {
    rooms.delete(id);
    // даємо клієнтам дочитати match:end, потім закриваємо зʼєднання
    setTimeout(() => {
      for (const ws of conns.values()) ws.close(1000, 'match_over');
    }, 1500);
  };
  res.json({ roomId: id });
});

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
let lastBytes = 0;
let lastAt = Date.now();

/** Метрики процесу: кімнати, гравці, час тіку, затримка event loop, трафік. */
function metrics(): Record<string, number> {
  let players = 0;
  let bytes = 0;
  let ticks = 0;
  let tickMs = 0;
  let tickMax = 0;
  for (const { room, conns } of rooms.values()) {
    players += conns.size;
    bytes += room.metrics.bytesOut;
    ticks += room.metrics.ticks;
    tickMs += room.metrics.tickMsTotal;
    tickMax = Math.max(tickMax, room.metrics.tickMsMax);
  }
  const now = Date.now();
  const bps = Math.max(0, ((bytes - lastBytes) * 1000) / Math.max(1, now - lastAt));
  lastBytes = bytes;
  lastAt = now;
  const mem = process.memoryUsage();
  return {
    rooms: rooms.size,
    players,
    tickAvgMs: ticks ? +(tickMs / ticks).toFixed(3) : 0,
    tickMaxMs: +tickMax.toFixed(3),
    loopDelayP99Ms: +(loopDelay.percentile(99) / 1e6).toFixed(2),
    bytesOutPerSec: Math.round(bps),
    rssMb: Math.round(mem.rss / 1048576),
    cpuUserMs: Math.round(process.cpuUsage().user / 1000),
  };
}

app.get('/internal/metrics', (_req, res) => res.json({ id: GAME_ID, ...metrics() }));

const server = listen(app, `game:${GAME_ID}`, PORT);

// ---------- гравці: WebSocket /game/<id>?ticket=... ----------

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith('/game')) {
    socket.destroy();
    return;
  }
  let claims: { uid: string; pid: string; room: string; gs: string };
  try {
    claims = jwt.verify(url.searchParams.get('ticket') ?? '', env.gameTicketSecret) as typeof claims;
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  const live = rooms.get(claims.room);
  if (!live || claims.gs !== GAME_ID) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => onPlayer(ws, live, claims.pid));
});

function onPlayer(ws: WebSocket, live: Live, pid: string): void {
  const { room, conns } = live;
  // повторне підключення того ж гравця замінює старе зʼєднання
  const old = conns.get(pid);
  conns.set(pid, ws);
  if (old && old !== ws) old.close(4000, 'replaced');
  if (!room.attach(pid)) {
    conns.delete(pid);
    ws.close(4004, 'not_in_room');
    return;
  }
  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      const buf = data as Buffer;
      if (!buf.length) return;
      if (buf[0] === MSG.MOVE) {
        const m = decodeMove(buf);
        if (m) room.onMove(pid, { x: m.x, y: m.y }, m.angle, m.firing);
      } else if (buf[0] === MSG.FIRE) {
        const f = decodeFire(buf);
        if (f) room.onShot(pid, f);
      }
      return;
    }
    try {
      const msg = JSON.parse(String(data)) as { e: string; d?: { kind: SkillKind; x: number; y: number; angle: number } };
      if (msg.e === 'match:skill' && msg.d) room.onSkill(pid, msg.d);
      else if (msg.e === 'match:leave') ws.close(1000, 'left');
    } catch {
      // сміття від клієнта ігноруємо
    }
  });
  ws.on('close', () => {
    if (conns.get(pid) !== ws) return;
    conns.delete(pid);
    room.detach(pid);
  });
}

// ---------- реєстрація в матчмейкері ----------

setInterval(() => {
  const m = metrics();
  callService('matchmaker', '/internal/game-servers/heartbeat', { body: { id: GAME_ID, url: PUBLIC_URL, rooms: m.rooms, players: m.players, metrics: m } }).catch(() => {
    // матчмейкер ще не піднявся — спробуємо за 2 с
  });
}, 2000);
