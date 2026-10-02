import { io, type Socket } from 'socket.io-client';
import { getToken } from '../core/api';

let socket: Socket | null = null;

/** Один спільний сокет на сесію — створюється лінькво при першому зверненні до PvP. */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({ auth: { token: getToken() }, autoConnect: true, transports: ['websocket', 'polling'] });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
