import type { Server as IOServer, Socket } from 'socket.io';
import { Room, type Entrant } from './room.js';
import { ROOM_SIZE, QUEUE_WAIT_MS } from './constants.js';
import type { MatchMode } from './types.js';

type QueueEntry = Entrant;

const queues: Record<MatchMode, QueueEntry[]> = { casual: [], ranked: [] };
const waitTimers: Record<MatchMode, ReturnType<typeof setTimeout> | null> = { casual: null, ranked: null };
const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();
let roomSeq = 0;

function startRoom(io: IOServer, mode: MatchMode): void {
  const timer = waitTimers[mode];
  if (timer) {
    clearTimeout(timer);
    waitTimers[mode] = null;
  }
  const queue = queues[mode];
  // у рейтинговому — групуємо гравців близького рейтингу
  if (mode === 'ranked') queue.sort((x, y) => x.rankPoints - y.rankPoints);
  const entrants = queue.splice(0, ROOM_SIZE);
  if (!entrants.length) return;
  const id = `room-${++roomSeq}`;
  const room = new Room(id, io, entrants, mode);
  room.onClose = () => cleanupRoom(id);
  rooms.set(id, room);
  for (const e of entrants) socketRoom.set(e.socket.id, id);
  if (queue.length && !waitTimers[mode]) waitTimers[mode] = setTimeout(() => startRoom(io, mode), QUEUE_WAIT_MS);
}

export function enqueue(io: IOServer, entry: QueueEntry, mode: MatchMode): void {
  if (queues.casual.some((e) => e.socket.id === entry.socket.id) || queues.ranked.some((e) => e.socket.id === entry.socket.id) || socketRoom.has(entry.socket.id)) return;
  const queue = queues[mode];
  queue.push(entry);
  entry.socket.emit('queue:joined', { position: queue.length, mode });
  if (queue.length >= ROOM_SIZE) {
    startRoom(io, mode);
    return;
  }
  if (!waitTimers[mode]) waitTimers[mode] = setTimeout(() => startRoom(io, mode), QUEUE_WAIT_MS);
}

export function dequeue(socketId: string): void {
  for (const q of Object.values(queues)) {
    const i = q.findIndex((e) => e.socket.id === socketId);
    if (i >= 0) q.splice(i, 1);
  }
}

export function roomFor(socketId: string): Room | undefined {
  const id = socketRoom.get(socketId);
  return id ? rooms.get(id) : undefined;
}

export function onDisconnect(socketId: string): void {
  dequeue(socketId);
  const id = socketRoom.get(socketId);
  if (!id) return;
  const room = rooms.get(id);
  room?.removeSocket(socketId);
  socketRoom.delete(socketId);
  if (room && !room.hasRealPlayers()) {
    room.destroy();
    rooms.delete(id);
  }
}

export function cleanupRoom(roomId: string): void {
  rooms.delete(roomId);
  for (const [sid, rid] of socketRoom) if (rid === roomId) socketRoom.delete(sid);
}

/** Гравець пішов із матчу (або матч скінчився) — звільняємо його для нового пошуку. */
export function leaveRoom(socketId: string): void {
  const id = socketRoom.get(socketId);
  if (!id) return;
  const room = rooms.get(id);
  room?.removeSocket(socketId);
  socketRoom.delete(socketId);
  if (room && !room.hasRealPlayers()) {
    room.destroy();
    rooms.delete(id);
  }
}
