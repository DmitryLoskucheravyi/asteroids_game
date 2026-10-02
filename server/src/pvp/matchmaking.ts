import type { Server as IOServer, Socket } from 'socket.io';
import { Room, type Entrant } from './room.js';
import { MODE_SPEC, QUEUE_WAIT_MS, type QueueMode } from './constants.js';

type QueueEntry = Entrant;

const queues: Record<QueueMode, QueueEntry[]> = { casual: [], solo: [], duo: [], trio: [], squad: [] };
const waitTimers: Record<QueueMode, ReturnType<typeof setTimeout> | null> = { casual: null, solo: null, duo: null, trio: null, squad: null };
const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();
let roomSeq = 0;

function startRoom(io: IOServer, mode: QueueMode): void {
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
  const entrants: QueueEntry[] = [];
  const taken = new Set<QueueEntry>();
  for (const e of queue) {
    if (taken.has(e)) continue;
    const unit = e.groupId ? queue.filter((x) => x.groupId === e.groupId) : [e];
    if (entrants.length + unit.length > size) continue;
    for (const u of unit) {
      taken.add(u);
      entrants.push(u);
    }
  }
  queues[mode] = queue.filter((e) => !taken.has(e));
  if (!entrants.length) return;
  const id = `room-${++roomSeq}`;
  const room = new Room(id, io, entrants, mode);
  room.onClose = () => cleanupRoom(id);
  rooms.set(id, room);
  for (const e of entrants) socketRoom.set(e.socket.id, id);
  if (queues[mode].length && !waitTimers[mode]) waitTimers[mode] = setTimeout(() => startRoom(io, mode), QUEUE_WAIT_MS);
}

/** Учасники групи, що вже стали в чергу, — поки не зберуться всі. */
const gathering = new Map<string, QueueEntry[]>();

/** Учасник групи стає в чергу; коли зібрались усі — група йде в чергу цілою. */
export function enqueueGroup(io: IOServer, entry: QueueEntry, mode: QueueMode, groupSize: number): void {
  const id = entry.groupId!;
  const list = (gathering.get(id) ?? []).filter((e) => e.userId !== entry.userId);
  list.push(entry);
  gathering.set(id, list);
  entry.socket.emit('queue:joined', { position: 0, mode, waitingParty: groupSize - list.length });
  if (list.length < groupSize) return;
  gathering.delete(id);
  for (const e of list) enqueue(io, e, mode);
}

export function enqueue(io: IOServer, entry: QueueEntry, mode: QueueMode): void {
  if (Object.values(queues).some((q) => q.some((e) => e.socket.id === entry.socket.id)) || socketRoom.has(entry.socket.id)) return;
  const queue = queues[mode];
  queue.push(entry);
  entry.socket.emit('queue:joined', { position: queue.length, mode });
  if (queue.length >= MODE_SPEC[mode].roomSize) {
    startRoom(io, mode);
    return;
  }
  if (!waitTimers[mode]) waitTimers[mode] = setTimeout(() => startRoom(io, mode), QUEUE_WAIT_MS);
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
