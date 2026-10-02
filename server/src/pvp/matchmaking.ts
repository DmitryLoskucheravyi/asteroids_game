import type { Server as IOServer, Socket } from 'socket.io';
import { Room } from './room.js';
import { ROOM_SIZE, QUEUE_WAIT_MS } from './constants.js';

interface QueueEntry {
  socket: Socket;
  userId: string;
  nickname: string;
  planeId: string;
  weaponId: string;
  tier: number;
  level: number;
}

const queue: QueueEntry[] = [];
const rooms = new Map<string, Room>();
const socketRoom = new Map<string, string>();
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let roomSeq = 0;

function startRoom(io: IOServer): void {
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
  const entrants = queue.splice(0, ROOM_SIZE);
  if (!entrants.length) return;
  const id = `room-${++roomSeq}`;
  const room = new Room(id, io, entrants);
  rooms.set(id, room);
  for (const e of entrants) socketRoom.set(e.socket.id, id);
}

export function enqueue(io: IOServer, entry: QueueEntry): void {
  queue.push(entry);
  entry.socket.emit('queue:joined', { position: queue.length });
  if (queue.length >= ROOM_SIZE) {
    startRoom(io);
    return;
  }
  if (!waitTimer) waitTimer = setTimeout(() => startRoom(io), QUEUE_WAIT_MS);
}

export function dequeue(socketId: string): void {
  const i = queue.findIndex((e) => e.socket.id === socketId);
  if (i >= 0) queue.splice(i, 1);
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
}
