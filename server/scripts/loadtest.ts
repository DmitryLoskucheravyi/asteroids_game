/**
 * Навантажувальний тест ігрових серверів (npm run loadtest -- --clients 200 --seconds 30).
 *
 * N мережевих ботів проходять справжній шлях гравця: реєстрація → черга в матчмейкері →
 * WebSocket ігрового сервера; кожен 30 разів на секунду шле рух і стріляє чергами.
 * Наприкінці — метрики ігрових серверів (час тіку, затримка event loop, CPU, трафік) і висновок,
 * чи впирається сервер у процесор (тобто чи має сенс переписувати симуляцію на Rust).
 *
 * Тестові акаунти мають нік pwload… — після тесту їх можна прибрати: db.users.deleteMany({nickname:/^pwload/}).
 */
import { encodeFire, encodeMove } from '../src/shared/netcodec.js';
import { BASE, joinMatch, register, type NodeLink } from './netClient.js';

const arg = (name: string, def: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const CLIENTS = arg('clients', 100);
const SECONDS = arg('seconds', 30);
const TICK_BUDGET_MS = 1000 / 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GsMetrics {
  id: string;
  rooms: number;
  players: number;
  tickAvgMs: number;
  tickMaxMs: number;
  loopDelayP99Ms: number;
  bytesOutPerSec: number;
  rssMb: number;
  cpuUserMs: number;
}
const metrics = async (): Promise<GsMetrics[]> => ((await (await fetch(`${BASE}/api/metrics`)).json()) as { gameServers: GsMetrics[] }).gameServers;

/** Поведінка бота: летить по колу навколо своєї точки, кожні ~2 с стріляє чергою. */
function drive(link: NodeLink, start: { x: number; y: number }): () => void {
  let a = Math.random() * Math.PI * 2;
  let t = 0;
  const center = { x: start.x, y: start.y };
  const iv = setInterval(() => {
    t += 1 / 30;
    a += 0.05;
    const x = center.x + Math.cos(a) * 250;
    const y = center.y + Math.sin(a) * 250;
    const firing = t % 2.2 < 1.4;
    link.send(encodeMove({ x, y, angle: a + Math.PI / 2, firing }));
    // кулемет ~16 пострілів/с — як справжній гравець під час черги
    if (firing && Math.random() < 0.5) link.send(encodeFire({ x, y, angle: a + Math.PI / 2, kind: 'bullet', viewT: 0 }));
  }, 1000 / 30);
  return () => clearInterval(iv);
}

async function main(): Promise<void> {
  const run = Date.now().toString(36).slice(-4);
  console.log(`реєстрація ${CLIENTS} тестових гравців…`);
  const tokens: string[] = [];
  for (let i = 0; i < CLIENTS; i += 20) {
    const batch = await Promise.all(Array.from({ length: Math.min(20, CLIENTS - i) }, (_, k) => register(`pwload${run}${i + k}`)));
    tokens.push(...batch);
  }

  console.log('стаємо в чергу й чекаємо матчі…');
  let bytesIn = 0;
  const stops: (() => void)[] = [];
  const links: NodeLink[] = [];
  const joined = await Promise.allSettled(
    tokens.map(async (tk) => {
      const { link, init, mm } = await joinMatch(tk);
      links.push(link);
      await new Promise((r) => link.once('match:start', r));
      const me = init.participants.find((p) => p.id === init.selfId)!;
      stops.push(drive(link, me.pos));
      stops.push(() => {
        bytesIn += link.bytesIn;
        link.close();
        mm.close();
      });
    }),
  );
  const ok = joined.filter((j) => j.status === 'fulfilled').length;
  console.log(`у бою: ${ok}/${CLIENTS}`);

  // базова точка після розгону
  await sleep(3000);
  const m0 = await metrics();
  const t0 = Date.now();
  const linkBytes0 = links.reduce((s, l) => s + l.bytesIn, 0);
  await sleep(SECONDS * 1000);
  const m1 = await metrics();
  const dt = (Date.now() - t0) / 1000;
  const linkBytes1 = links.reduce((s, l) => s + l.bytesIn, 0);
  for (const s of stops) s();

  console.log(`\n=== ${ok} гравців, ${dt.toFixed(0)} с ===`);
  console.log('сервер  кімнат гравців  тік сер/макс, мс  event loop p99, мс  CPU, % ядра  вихід, КБ/с  RSS, МБ');
  let worstLoad = 0;
  let totalRooms = 0;
  for (const g of m1) {
    const prev = m0.find((x) => x.id === g.id);
    const cpu = prev ? ((g.cpuUserMs - prev.cpuUserMs) / (dt * 1000)) * 100 : 0;
    // частка бюджету тіку, яку зʼїдає симуляція всіх кімнат процесу
    const load = (g.rooms * g.tickAvgMs) / TICK_BUDGET_MS;
    worstLoad = Math.max(worstLoad, load);
    totalRooms += g.rooms;
    console.log(
      `${g.id.padEnd(7)} ${String(g.rooms).padStart(6)} ${String(g.players).padStart(7)}  ${g.tickAvgMs.toFixed(3).padStart(7)} / ${g.tickMaxMs.toFixed(1).padEnd(6)} ${g.loopDelayP99Ms.toFixed(1).padStart(12)} ${cpu.toFixed(1).padStart(14)} ${(g.bytesOutPerSec / 1024).toFixed(0).padStart(12)} ${String(g.rssMb).padStart(8)}`,
    );
  }
  const perClient = (linkBytes1 - linkBytes0) / dt / Math.max(1, ok) / 1024;
  console.log(`\nвхідний трафік на гравця: ${perClient.toFixed(1)} КБ/с`);
  const tickAvg = m1.reduce((s, g) => s + g.tickAvgMs * g.rooms, 0) / Math.max(1, totalRooms);
  const roomsPerCore = tickAvg > 0 ? Math.floor((TICK_BUDGET_MS * 0.6) / tickAvg) : Infinity;
  console.log(`симуляція однієї кімнати: ${tickAvg.toFixed(3)} мс на тік → ~${roomsPerCore} кімнат (×10 гравців) на ядро із запасом 40%`);
  console.log(`найзавантаженіший процес використовує ${(worstLoad * 100).toFixed(1)}% бюджету тіку`);
  console.log(
    worstLoad > 0.6
      ? 'ВИСНОВОК: симуляція впирається в процесор — є сенс виносити її в компільовану мову (Rust).'
      : 'ВИСНОВОК: процесор не вузьке місце — переписування симуляції на Rust зараз не дасть відчутного виграшу; масштабуємось кількістю ігрових процесів.',
  );
  setTimeout(() => process.exit(0), 300);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
