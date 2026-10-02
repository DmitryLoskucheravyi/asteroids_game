/**
 * Перевірка серверних влучань і компенсації лагу на живому сервері (npm run net:check).
 *
 * Два мережеві клієнти потрапляють в один матч. B летить по прямій, A стріляє туди, де БАЧИТЬ B —
 * у позицію на 100 мс у минулому (саме так клієнт малює чужі літаки). З компенсацією лагу кулі
 * мають влучати; без неї пролітали б позаду цілі.
 */
import { io, type Socket } from 'socket.io-client';
import { decodeState, encodeFire, encodeMove } from '../src/shared/netcodec.js';

const BASE = process.env.API ?? 'http://localhost:8787';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function register(nick: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: nick, email: `${nick}@example.test`, password: 'test12345' }) });
  const j = (await r.json()) as { token: string };
  return j.token;
}

interface Init {
  participants: { id: string; pos: { x: number; y: number } }[];
  countdownMs: number;
}

async function joinMatch(token: string): Promise<{ s: Socket; init: Init }> {
  const s = io(BASE, { auth: { token }, transports: ['websocket'] });
  await new Promise<void>((r) => s.on('connect', () => r()));
  const init = new Promise<Init>((r) => s.once('match:init', r));
  s.emit('queue:join', { mode: 'casual' });
  return { s, init: await init };
}

async function main(): Promise<void> {
  const tag = Math.floor(Math.random() * 9000 + 1000);
  const [ta, tb] = await Promise.all([register(`pwtest${tag}a`), register(`pwtest${tag}b`)]);
  console.log('у черзі, чекаємо матч (до ~20 с)…');
  const [A, B] = await Promise.all([joinMatch(ta), joinMatch(tb)]);
  const idx = A.init.participants.map((p) => p.id);
  const iB = idx.indexOf(B.s.id!);
  let serverT = 0;
  let bPos = { ...A.init.participants[iB].pos };
  const bHist: { t: number; x: number; y: number }[] = [];
  A.s.on('match:state', (d: ArrayBuffer) => {
    const st = decodeState(d);
    serverT = st.t;
    const e = st.entries.find((x) => x.index === iB);
    if (e?.patch.x !== undefined) bPos = { x: e.patch.x, y: e.patch.y! };
    bHist.push({ t: st.t, ...bPos });
  });
  const hits: number[] = [];
  A.s.on('match:hit', (h: { attackerId: string; targetId: string; damage: number }) => {
    if (h.attackerId === A.s.id && h.targetId === B.s.id) hits.push(h.damage);
  });
  let relayed = 0;
  const allHits: string[] = [];
  B.s.on('match:shot', (d: ArrayBuffer) => {
    if (new Uint8Array(d)[1] === idx.indexOf(A.s.id!)) relayed++;
  });
  A.s.on('match:hit', (h: { attackerId: string; targetId: string }) => allHits.push(`${h.attackerId === A.s.id ? 'A' : h.attackerId === B.s.id ? 'B' : 'bot'}→${h.targetId === A.s.id ? 'A' : h.targetId === B.s.id ? 'B' : 'bot'}`));
  await new Promise((r) => A.s.once('match:start', r));

  // A стає зліва від B на 220 px; обидва підлітають чесно (з дозволеною швидкістю)
  const start = A.init.participants[idx.indexOf(A.s.id!)].pos;
  const bStart = A.init.participants[iB].pos;
  const meet = { x: Math.min(Math.max(bStart.x, 600), 7000), y: Math.min(Math.max(bStart.y, 600), 3200) };
  const fly = async (s: Socket, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(d / (1200 / 30)));
    for (let i = 1; i <= steps; i++) {
      s.emit('match:move', encodeMove({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, angle: 0, firing: false }));
      await sleep(1000 / 30);
    }
  };
  const aSpot = { x: meet.x - 220, y: meet.y };
  await Promise.all([fly(A.s, start, aSpot), fly(B.s, bStart, meet)]);
  await sleep(300);

  // B летить вниз 400 px/с; A стріляє в "бачену" позицію B (100 мс тому) з viewT = t − 100
  let by = meet.y;
  const moveB = setInterval(() => {
    by += 400 / 30;
    B.s.emit('match:move', encodeMove({ x: meet.x, y: by, angle: Math.PI / 2, firing: false }));
  }, 1000 / 30);
  await sleep(400);
  // серія 1 — з компенсацією (viewT = що бачив гравець), серія 2 — контроль без неї (viewT = "зараз")
  const series = async (compensate: boolean): Promise<number> => {
    hits.length = 0;
    for (let i = 0; i < 8; i++) {
      const viewT = serverT - 100;
      const seen = [...bHist].reverse().find((h) => h.t <= viewT) ?? bHist[0];
      // упередження, як у живого гравця: куди ціль долетить, поки летить куля
      const flight = Math.hypot(seen.x - aSpot.x, seen.y - aSpot.y) / 1150;
      const angle = Math.atan2(seen.y + 400 * flight - aSpot.y, seen.x - (aSpot.x + 24));
      A.s.emit('match:move', encodeMove({ x: aSpot.x, y: aSpot.y, angle, firing: true }));
      A.s.emit('match:shot', encodeFire({ x: aSpot.x + 24, y: aSpot.y, angle, kind: 'bullet', viewT: compensate ? viewT : serverT + 5 }));
      await sleep(110);
    }
    await sleep(500);
    return hits.length;
  };
  const withComp = await series(true);
  const without = await series(false);
  const fired = 8;
  clearInterval(moveB);
  console.log(`ретрансльовано пострілів A: ${relayed}`);
  console.log(`з компенсацією лагу: ${withComp}/${fired} влучань; без компенсації: ${without}/${fired}`);

  // анти-чит: телепорт на 3000 px за один пакет має бути обрізаний сервером
  B.s.emit('match:move', encodeMove({ x: meet.x + 3000, y: by, angle: 0, firing: false }));
  await sleep(200);
  console.log(`телепорт на 3000 px → сервер зарахував зсув ${Math.round(bPos.x - meet.x)} px`);
  A.s.close();
  B.s.close();
  process.exit(withComp >= 6 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
