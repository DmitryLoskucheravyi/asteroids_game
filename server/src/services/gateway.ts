import http from 'node:http';
import httpProxy from 'http-proxy';
import { BACKEND_SERVICES, callService, servicePort, serviceUrl, type ServiceName } from './common.js';

/**
 * API-шлюз — єдина точка входу для клієнта (:8787).
 * HTTP /api/* → потрібний сервіс за префіксом шляху; WebSocket /socket.io → матчмейкер,
 * /game/<id> → ігровий сервер з реєстру матчмейкера. Внутрішні /internal/* назовні не видно.
 */

/** Таблиця маршрутів: перший збіг виграє, тож точні шляхи — вище за загальні префікси. */
const ROUTES: [prefix: string, service: ServiceName][] = [
  ['/api/items/loadout', 'profile'],
  ['/api/items', 'shop'],
  ['/api/profile/buy-plane', 'shop'],
  ['/api/pass/buy-premium', 'shop'],
  ['/api/auth', 'auth'],
  ['/api/profile', 'profile'],
  ['/api/events', 'profile'],
  ['/api/daily', 'profile'],
  ['/api/quests', 'profile'],
  ['/api/pass', 'profile'],
  ['/api/crates', 'crates'],
  ['/api/leaderboard', 'stats'],
  ['/api/friends', 'social'],
  ['/api/party', 'social'],
  ['/socket.io', 'matchmaker'],
];

const routeFor = (path: string): ServiceName | null => ROUTES.find(([p]) => path === p || path.startsWith(p + '/') || path.startsWith(p + '?'))?.[1] ?? null;

const proxy = httpProxy.createProxyServer({ xfwd: true, proxyTimeout: 15000 });
proxy.on('error', (err, _req, res) => {
  // сервіс лежить — клієнт отримує зрозумілу 502, а не обрив
  if (res instanceof http.ServerResponse && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'service_unavailable' }));
  } else if (res && 'destroy' in res) res.destroy();
  console.warn('[gateway] proxy:', err.message);
});

// ---------- реєстр ігрових серверів (кеш з матчмейкера) ----------

interface GameServer {
  id: string;
  url: string;
  rooms: number;
  players: number;
  metrics?: Record<string, number>;
}
let gameServers: GameServer[] = [];
let queues: Record<string, number> = {};

async function refreshGameServers(): Promise<void> {
  try {
    const r = await callService<{ servers: GameServer[]; queues: Record<string, number> }>('matchmaker', '/internal/game-servers');
    gameServers = r.servers;
    queues = r.queues;
  } catch {
    // матчмейкер недоступний — лишаємо останній відомий список
  }
}
setInterval(() => void refreshGameServers(), 2000);
void refreshGameServers();

// ---------- службові ендпойнти шлюзу ----------

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Стан усіх сервісів одним запитом (для моніторингу). */
async function health(res: http.ServerResponse): Promise<void> {
  const checks = await Promise.all(
    BACKEND_SERVICES.map(async (s) => {
      const t0 = Date.now();
      try {
        const r = await fetch(serviceUrl(s) + '/health', { signal: AbortSignal.timeout(1500) });
        return { service: s, ok: r.ok, ms: Date.now() - t0 };
      } catch {
        return { service: s, ok: false, ms: Date.now() - t0 };
      }
    }),
  );
  const ok = checks.every((c) => c.ok) && gameServers.length > 0;
  json(res, ok ? 200 : 503, { ok, services: checks, gameServers: gameServers.map((g) => ({ id: g.id, rooms: g.rooms, players: g.players })) });
}

const server = http.createServer((req, res) => {
  const path = req.url ?? '/';
  if (path === '/api/health') {
    void health(res);
    return;
  }
  if (path === '/api/metrics') {
    json(res, 200, { queues, gameServers: gameServers.map((g) => ({ id: g.id, ...g.metrics })) });
    return;
  }
  const target = routeFor(path);
  if (!target) {
    json(res, 404, { error: 'not_found' });
    return;
  }
  proxy.web(req, res, { target: serviceUrl(target) });
});

server.on('upgrade', (req, socket, head) => {
  const path = req.url ?? '/';
  if (path.startsWith('/socket.io')) {
    proxy.ws(req, socket, head, { target: serviceUrl('matchmaker') });
    return;
  }
  // /game/<serverId>?ticket=… — квиток перевіряє сам ігровий сервер
  const m = /^\/game\/([\w-]+)/.exec(path);
  const gs = m ? gameServers.find((g) => g.id === m[1]) : undefined;
  if (!gs) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  proxy.ws(req, socket, head, { target: gs.url });
});

server.listen(servicePort('gateway'), () => console.log(`[gateway] слухає на :${servicePort('gateway')}`));
