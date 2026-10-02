import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import type { Entrant } from './room.js';
import { MODE_SPEC, QUEUE_WAIT_MS, type QueueMode } from './constants.js';
import { env } from '../env.js';
import { callService, notifyService } from '../services/common.js';

/**
 * Матчмейкер: черги за режимами, групи, вибір ігрового сервера й квитки.
 * Сам матч іде на ігровому сервері — сюди гравець повертається лише за новим пошуком.
 */

/** У черзі — гравець без id учасника (його видає матчмейкер при старті кімнати). */
export type QueueEntry = Omit<Entrant, 'pid'> & { socket: Socket };

const queues: Record<QueueMode, QueueEntry[]> = { casual: [], solo: [], duo: [], trio: [], squad: [] };
const waitTimers: Record<QueueMode, ReturnType<typeof setTimeout> | null> = { casual: null, solo: null, duo: null, trio: null, squad: null };

// ---------- реєстр ігрових серверів (вони самі шлють heartbeat) ----------

export interface GameServerInfo {
  id: string;
  /** Внутрішня адреса (HTTP + WS) */
  url: string;
  rooms: number;
  players: number;
  metrics?: Record<string, number>;
  seenAt: number;
}

const gameServers = new Map<string, GameServerInfo>();
const HEARTBEAT_TTL_MS = 6000;

export function heartbeat(info: Omit<GameServerInfo, 'seenAt'>): void {
  gameServers.set(info.id, { ...info, seenAt: Date.now() });
}

export function liveGameServers(): GameServerInfo[] {
  const now = Date.now();
  return [...gameServers.values()].filter((g) => now - g.seenAt < HEARTBEAT_TTL_MS);
}

/** Найменш завантажений живий сервер (за гравцями, потім за кімнатами). */
function pickGameServer(): GameServerInfo | null {
  const live = liveGameServers().sort((a, b) => a.players - b.players || a.rooms - b.rooms);
  return live[0] ?? null;
}

const signTicket = (claims: { uid: string; pid: string; room: string; gs: string }): string => jwt.sign(claims, env.gameTicketSecret, { expiresIn: '2m' });

// ---------- черги ----------

async function startRoom(mode: QueueMode): Promise<void> {
  const timer = waitTimers[mode];
  if (timer) {
    clearTimeout(timer);
    waitTimers[mode] = null;
  }
  const queue = queues[mode];
  // у рейтинговому — групуємо гравців близького рейтингу
  if (mode !== 'casual') queue.sort((x, y) => x.rankPoints - y.rankPoints);
  // беремо цілі групи (учасники групи не розділяються між кімнатами)
  const size = MODE_SPEC[mode].roomSize;
  const picked: QueueEntry[] = [];
  const taken = new Set<QueueEntry>();
  for (const e of queue) {
    if (taken.has(e)) continue;
    const unit = e.groupId ? queue.filter((x) => x.groupId === e.groupId) : [e];
    if (picked.length + unit.length > size) continue;
    for (const u of unit) {
      taken.add(u);
      picked.push(u);
    }
  }
  queues[mode] = queue.filter((e) => !taken.has(e));
  if (queues[mode].length && !waitTimers[mode]) waitTimers[mode] = setTimeout(() => void startRoom(mode), QUEUE_WAIT_MS);
  if (!picked.length) return;

  const gs = pickGameServer();
  if (!gs) {
    for (const e of picked) e.socket.emit('queue:error', { error: 'no_game_server' });
    return;
  }
  const entrants: (Entrant & { socketId: string })[] = picked.map((e) => {
    const { socket, ...rest } = e;
    return { ...rest, pid: `p-${randomBytes(6).toString('hex')}`, socketId: socket.id };
  });
  try {
    const { roomId } = await callService<{ roomId: string }>(gs.url, '/internal/rooms', { body: { mode, entrants: entrants.map(({ socketId: _s, ...en }) => en) } });
    // групи, що знайшли матч, повертаються в "очікування" — після бою вони не стануть у чергу самі
    for (const g of new Set(entrants.map((e) => e.groupId).filter(Boolean))) notifyService('social', `/internal/party/${g}/idle`, {});
    gs.players += entrants.length;
    gs.rooms += 1;
    for (const e of entrants) {
      const sock = picked.find((p) => p.socket.id === e.socketId)!.socket;
      sock.emit('match:assigned', { server: gs.id, ticket: signTicket({ uid: e.userId, pid: e.pid, room: roomId, gs: gs.id }) });
    }
  } catch (e) {
    console.warn('[matchmaker] ігровий сервер не створив кімнату:', e instanceof Error ? e.message : e);
    for (const p of picked) p.socket.emit('queue:error', { error: 'game_server_failed' });
  }
}

/** Учасники групи, що вже стали в чергу, — поки не зберуться всі. */
const gathering = new Map<string, QueueEntry[]>();

/** Учасник групи стає в чергу; коли зібрались усі — група йде в чергу цілою. */
export function enqueueGroup(entry: QueueEntry, mode: QueueMode, groupSize: number): void {
  const id = entry.groupId!;
  const list = (gathering.get(id) ?? []).filter((e) => e.userId !== entry.userId);
  list.push(entry);
  gathering.set(id, list);
  entry.socket.emit('queue:joined', { position: 0, mode, waitingParty: groupSize - list.length });
  if (list.length < groupSize) return;
  gathering.delete(id);
  for (const e of list) enqueue(e, mode);
}

export function enqueue(entry: QueueEntry, mode: QueueMode): void {
  if (Object.values(queues).some((q) => q.some((e) => e.socket.id === entry.socket.id || e.userId === entry.userId))) return;
  const queue = queues[mode];
  queue.push(entry);
  entry.socket.emit('queue:joined', { position: queue.length, mode });
  if (queue.length >= MODE_SPEC[mode].roomSize) {
    void startRoom(mode);
    return;
  }
  if (!waitTimers[mode]) waitTimers[mode] = setTimeout(() => void startRoom(mode), QUEUE_WAIT_MS);
}

/** Вийти з черги; якщо гравець у групі — з черги виходить уся група (її учасники побачать це в стані групи). */
export function dequeue(socketId: string): void {
  let groupId: string | null | undefined = null;
  for (const q of Object.values(queues)) {
    const e = q.find((x) => x.socket.id === socketId);
    if (e) groupId = e.groupId;
  }
  for (const [id, list] of gathering) {
    if (list.some((e) => e.socket.id === socketId)) {
      groupId = id;
      gathering.delete(id);
    }
  }
  for (const mode of Object.keys(queues) as QueueMode[]) {
    queues[mode] = queues[mode].filter((e) => e.socket.id !== socketId && (!groupId || e.groupId !== groupId));
  }
}

export function queueSizes(): Record<QueueMode, number> {
  return Object.fromEntries(Object.entries(queues).map(([m, q]) => [m, q.length])) as Record<QueueMode, number>;
}
