import { MSG } from '../../server/src/shared/netcodec';

type Handler = (data: any) => void;

/** Бінарні кадри від сервера → назва події (перший байт кадру — тип повідомлення). */
const BINARY_EVENTS: Record<number, string> = { [MSG.STATE]: 'match:state', [MSG.SHOT]: 'match:shot' };

/**
 * Зʼєднання з ігровим сервером по чистому WebSocket (без socket.io — менше накладних байтів і
 * затримок). API схожий на socket.io (on/off/once/emit), тож гра не знає, що під капотом.
 * Бінарні кадри — netcodec, текстові — JSON {e, d}.
 */
export class GameLink {
  /** Id учасника в матчі (приходить у match:init) */
  id: string | undefined;
  private readonly ws: WebSocket;
  private readonly handlers = new Map<string, Set<Handler>>();
  private closedByUs = false;

  constructor(server: string, ticket: string) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/game/${encodeURIComponent(server)}?ticket=${encodeURIComponent(ticket)}`);
    this.ws.binaryType = 'arraybuffer';
    // для автотестів і діагностики мережі в dev-режимі
    if (import.meta.env.DEV) (window as unknown as { __link?: GameLink }).__link = this;
    this.ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        const type = new Uint8Array(ev.data, 0, 1)[0];
        const name = BINARY_EVENTS[type];
        if (name) this.dispatch(name, ev.data);
        return;
      }
      try {
        const msg = JSON.parse(ev.data as string) as { e: string; d: unknown };
        if (msg.e === 'match:init') this.id = (msg.d as { selfId?: string }).selfId;
        this.dispatch(msg.e, msg.d);
      } catch {
        // некоректний кадр — пропускаємо
      }
    };
    this.ws.onclose = (ev) => {
      if (!this.closedByUs) this.dispatch('link:closed', { code: ev.code, reason: ev.reason });
    };
  }

  private dispatch(event: string, data: unknown): void {
    for (const fn of [...(this.handlers.get(event) ?? [])]) fn(data);
  }

  on(event: string, fn: Handler): this {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(fn);
    return this;
  }

  off(event: string, fn?: Handler): this {
    if (fn) this.handlers.get(event)?.delete(fn);
    else this.handlers.delete(event);
    return this;
  }

  once(event: string, fn: Handler): this {
    const wrap: Handler = (d) => {
      this.off(event, wrap);
      fn(d);
    };
    return this.on(event, wrap);
  }

  emit(event: string, data?: unknown): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (data instanceof Uint8Array) this.ws.send(data);
    else this.ws.send(JSON.stringify({ e: event, d: data }));
  }

  /** Вийти з матчу й закрити зʼєднання. */
  close(): void {
    this.closedByUs = true;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ e: 'match:leave' }));
    this.ws.close(1000);
  }
}
