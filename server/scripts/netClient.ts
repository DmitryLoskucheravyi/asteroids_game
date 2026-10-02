/**
 * Мережевий клієнт гри для скриптів (перевірки, навантажувальний тест): реєстрація,
 * черга через матчмейкер (socket.io) і бій через WebSocket ігрового сервера — як справжній браузер.
 */
import { io, type Socket } from 'socket.io-client';
import WebSocket from 'ws';
import { MSG } from '../src/shared/netcodec.js';

export const BASE = process.env.API ?? 'http://localhost:8787';

export async function register(nick: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: nick, email: `${nick}@example.test`, password: 'test12345' }) });
  const j = (await r.json()) as { token?: string; error?: string };
  if (!j.token) throw new Error(`register ${nick}: ${j.error}`);
  return j.token;
}

export interface MatchInit {
  selfId: string;
  participants: { id: string; pos: { x: number; y: number } }[];
  countdownMs: number;
}

type Handler = (d: any) => void;

/** Зʼєднання з ігровим сервером: події як у браузерного GameLink. */
export class NodeLink {
  readonly ws: WebSocket;
  private readonly handlers = new Map<string, Set<Handler>>();
  bytesIn = 0;

  constructor(server: string, ticket: string) {
    this.ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/game/${server}?ticket=${encodeURIComponent(ticket)}`);
    this.ws.on('message', (data: Buffer, isBinary: boolean) => {
      this.bytesIn += data.length;
      if (isBinary) {
        const ev = data[0] === MSG.STATE ? 'match:state' : data[0] === MSG.SHOT ? 'match:shot' : null;
        if (ev) this.fire(ev, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        return;
      }
      const m = JSON.parse(String(data)) as { e: string; d: unknown };
      this.fire(m.e, m.d);
    });
    this.ws.on('close', () => this.fire('link:closed', null));
  }

  private fire(e: string, d: unknown): void {
    for (const fn of [...(this.handlers.get(e) ?? [])]) fn(d);
  }

  on(e: string, fn: Handler): void {
    let s = this.handlers.get(e);
    if (!s) this.handlers.set(e, (s = new Set()));
    s.add(fn);
  }

  once(e: string, fn: Handler): void {
    const w: Handler = (d) => {
      this.handlers.get(e)?.delete(w);
      fn(d);
    };
    this.on(e, w);
  }

  send(data: Uint8Array | { e: string; d?: unknown }): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(data instanceof Uint8Array ? data : JSON.stringify(data));
  }

  close(): void {
    this.ws.close();
  }
}

/** Стати в чергу й дочекатися матчу: повертає зʼєднання з ігровим сервером і match:init. */
export async function joinMatch(token: string, mode = 'casual', opts: { partyId?: string } = {}): Promise<{ mm: Socket; link: NodeLink; init: MatchInit }> {
  const mm = io(BASE, { auth: { token }, transports: ['websocket'] });
  await new Promise<void>((res, rej) => {
    mm.once('connect', () => res());
    mm.once('connect_error', rej);
  });
  const assigned = new Promise<{ server: string; ticket: string }>((res, rej) => {
    mm.once('match:assigned', res);
    mm.once('queue:error', (e: { error: string }) => rej(new Error(e.error)));
  });
  mm.emit('queue:join', { mode, ...opts });
  const { server, ticket } = await assigned;
  const link = new NodeLink(server, ticket);
  const init = await new Promise<MatchInit>((res) => link.once('match:init', res));
  return { mm, link, init };
}
