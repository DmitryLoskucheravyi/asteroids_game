import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import type { Server } from 'node:http';
import { env } from '../env.js';
import { connectDb } from '../db.js';

/**
 * Каркас мікросервісів: реєстр адрес, однаковий старт (health, JSON, захист /internal),
 * виклики між сервісами з токеном, таймаутом і повторами.
 */

export type ServiceName = 'gateway' | 'auth' | 'profile' | 'shop' | 'crates' | 'stats' | 'social' | 'matchmaker';

/** Порти за замовчуванням; у проді адреси задаються змінними SERVICE_<NAME>_URL (напр. у docker-compose). */
export const SERVICE_PORTS: Record<ServiceName, number> = {
  gateway: 8787,
  auth: 8801,
  profile: 8802,
  shop: 8803,
  crates: 8804,
  stats: 8805,
  social: 8806,
  matchmaker: 8807,
};

export const BACKEND_SERVICES = (Object.keys(SERVICE_PORTS) as ServiceName[]).filter((s) => s !== 'gateway');

export function serviceUrl(name: ServiceName): string {
  return process.env[`SERVICE_${name.toUpperCase()}_URL`] ?? `http://127.0.0.1:${SERVICE_PORTS[name]}`;
}

export function servicePort(name: ServiceName): number {
  return Number(process.env.PORT) || SERVICE_PORTS[name];
}

/** Лише інші сервіси (з внутрішнім токеном) можуть кликати /internal/*. */
export function requireInternal(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-token'] !== env.internalToken) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

const startedAt = Date.now();

/** Express-застосунок сервісу з /health і захищеним /internal. */
export function createApp(name: string): Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({ service: name, ok: true, uptimeS: Math.round((Date.now() - startedAt) / 1000), pid: process.pid }));
  app.use('/internal', requireInternal);
  return app;
}

export function listen(app: Express, name: string, port: number): Server {
  return app.listen(port, () => console.log(`[${name}] слухає на :${port}`));
}

/** Стандартний старт сервісу з базою. */
export async function startDbService(name: ServiceName, mount: (app: Express) => void): Promise<void> {
  await connectDb();
  const app = createApp(name);
  mount(app);
  listen(app, name, servicePort(name));
}

export class InternalError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`internal call failed: ${status}`);
  }
}

/** Виклик іншого сервісу. Таймаут 3 с; повтори лише для мережевих помилок і 5xx. */
export async function callService<T>(target: ServiceName | string, path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; retries?: number } = {}): Promise<T> {
  const base = target.startsWith('http') ? target : serviceUrl(target as ServiceName);
  const retries = opts.retries ?? 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(base + path, {
        method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
        headers: { 'Content-Type': 'application/json', 'x-internal-token': env.internalToken },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(3000),
      });
      const data = (await res.json().catch(() => null)) as T;
      if (res.ok) return data;
      if (res.status < 500) throw new InternalError(res.status, data);
      lastErr = new InternalError(res.status, data);
    } catch (e) {
      if (e instanceof InternalError && e.status < 500) throw e;
      lastErr = e;
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
  }
  throw lastErr;
}

/** Виклик "відправив і забув" (з повторами) — для подій, що не мають блокувати гру. */
export function notifyService(target: ServiceName, path: string, body: unknown, retries = 3): void {
  callService(target, path, { body, retries }).catch((e) => console.warn(`[internal] ${target}${path} не вдалося:`, e instanceof Error ? e.message : e));
}
