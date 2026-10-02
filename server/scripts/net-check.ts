/**
 * Перевірка серверних влучань і компенсації лагу на живому сервері (npm run net:check).
 *
 * Два мережеві клієнти потрапляють в один матч. B летить по прямій, A стріляє туди, де БАЧИТЬ B —
 * у позицію на 100 мс у минулому (саме так клієнт малює чужі літаки). З компенсацією лагу кулі
 * мають влучати; без неї пролітали б позаду цілі.
 */
import { decodeState, encodeFire, encodeMove } from '../src/shared/netcodec.js';
import { joinMatch, register, type NodeLink } from './netClient.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const tag = Math.floor(Math.random() * 9000 + 1000);
  const [ta, tb] = await Promise.all([register(`pwtest${tag}a`), register(`pwtest${tag}b`)]);
  console.log('у черзі, чекаємо матч (до ~20 с)…');
  const [A, B] = await Promise.all([joinMatch(ta), joinMatch(tb)]);
  const sameServer = A.init.participants.some((p) => p.id === B.init.selfId);
  if (!sameServer) throw new Error('гравці потрапили в різні матчі');
  const idx = A.init.participants.map((p) => p.id);
  const aId = A.init.selfId;
  const bId = B.init.selfId;
  const iB = idx.indexOf(bId);
  let serverT = 0;
  let bPos = { ...A.init.participants[iB].pos };
  const bHist: { t: number; x: number; y: number }[] = [];
  const alive = { a: true, b: true };
  A.link.on('match:state', (d: Uint8Array) => {
    const st = decodeState(d);
    serverT = st.t;
    const e = st.entries.find((x) => x.index === iB);
    if (e?.patch.x !== undefined) bPos = { x: e.patch.x, y: e.patch.y! };
    for (const x of st.entries) {
      if (x.patch.alive === undefined) continue;
      if (x.index === iB) alive.b = x.patch.alive;
      if (x.index === idx.indexOf(aId)) alive.a = x.patch.alive;
    }
    bHist.push({ t: st.t, ...bPos });
  });
  const hits: number[] = [];
  A.link.on('match:hit', (h: { attackerId: string; targetId: string; damage: number }) => {
    if (h.attackerId === aId && h.targetId === bId) hits.push(h.damage);
  });
  let relayed = 0;
  B.link.on('match:shot', (d: Uint8Array) => {
    if (d[1] === idx.indexOf(aId)) relayed++;
  });
  await new Promise((r) => A.link.once('match:start', r));

  // коридор без астероїдів: A стоїть зліва, B летить уздовж вертикалі x = meet.x від y = 500 униз
  const SPEED = 900;
  const obstacles = (A.init as unknown as { obstacles: { x: number; y: number; r: number }[] }).obstacles;
  const clear = (x: number) => obstacles.every((o) => o.x + o.r < x - 280 || o.x - o.r > x + 40 || o.y - o.r > 2700);
  let cx = 400;
  while (cx < 7600 && !clear(cx)) cx += 20;
  const meet = { x: cx, y: 500 };
  const start = A.init.participants[idx.indexOf(aId)].pos;
  const bStart = A.init.participants[iB].pos;
  const fly = async (s: NodeLink, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const d = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(d / (1200 / 30)));
    for (let i = 1; i <= steps; i++) {
      s.send(encodeMove({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, angle: 0, firing: false }));
      await sleep(1000 / 30);
    }
  };
  const aSpot = { x: meet.x - 220, y: 1100 };
  await Promise.all([fly(A.link, start, aSpot), fly(B.link, bStart, meet)]);
  await sleep(300);

  // B летить униз 900 px/с; A стріляє туди, де БАЧИТЬ B (100 мс тому), з упередженням на політ кулі
  let by = meet.y;
  const moveB = setInterval(() => {
    by += SPEED / 30;
    B.link.send(encodeMove({ x: meet.x, y: by, angle: Math.PI / 2, firing: false }));
  }, 1000 / 30);
  await sleep(300);
  // серія 1 — з компенсацією (viewT = що бачив гравець), серія 2 — контроль без неї (viewT = "зараз")
  const series = async (compensate: boolean): Promise<number> => {
    hits.length = 0;
    for (let i = 0; i < 8; i++) {
      const viewT = serverT - 100;
      // як клієнт: інтерполяція між двома знімками навколо viewT
      const j = bHist.findIndex((h) => h.t > viewT);
      const h0 = bHist[Math.max(0, j - 1)];
      const h1 = j > 0 ? bHist[j] : h0;
      const k = h1.t > h0.t ? (viewT - h0.t) / (h1.t - h0.t) : 0;
      const seen = { x: h0.x + (h1.x - h0.x) * k, y: h0.y + (h1.y - h0.y) * k };
      // точне упередження: час зустрічі t з |d + v·t| = s·t (d — до цілі, v — її швидкість, s — швидкість кулі)
      const dx = seen.x - (aSpot.x + 24);
      const dy = seen.y - aSpot.y;
      // фактична швидкість B за знімками (таймери Windows неточні — 900 px/с у коді ≠ 900 на ділі)
      const tail = bHist.filter((h) => h.t <= viewT && h.t > viewT - 400);
      const vy = tail.length > 1 ? ((tail[tail.length - 1].y - tail[0].y) / (tail[tail.length - 1].t - tail[0].t)) * 1000 : SPEED;
      const qa = vy * vy - 1150 * 1150;
      const qb = 2 * dy * vy;
      const qc = dx * dx + dy * dy;
      const t = (-qb - Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
      const angle = Math.atan2(dy + vy * t, dx);
      A.link.send(encodeMove({ x: aSpot.x, y: aSpot.y, angle, firing: true }));
      A.link.send(encodeFire({ x: aSpot.x + 24, y: aSpot.y, angle, kind: 'bullet', viewT: compensate ? viewT : serverT + 5 }));
      await sleep(60);
    }
    await sleep(350);
    return hits.length;
  };
  const withComp = await series(true);
  const without = await series(false);
  const fired = 8;
  clearInterval(moveB);
  console.log(`ретрансльовано пострілів A: ${relayed}; живі на кінець: A=${alive.a} B=${alive.b}`);
  console.log(`з компенсацією лагу: ${withComp}/${fired} влучань; без компенсації: ${without}/${fired}`);

  // анти-чит: телепорт на 3000 px за один пакет має бути обрізаний сервером
  await sleep(500);
  const before = { ...bPos };
  B.link.send(encodeMove({ x: before.x + 3000, y: before.y, angle: 0, firing: false }));
  await sleep(200);
  console.log(`телепорт на 3000 px → сервер зарахував зсув ${Math.round(bPos.x - before.x)} px`);
  for (const c of [A, B]) {
    c.link.close();
    c.mm.close();
  }
  // компенсація має давати явну перевагу над "без неї" (решту промахів дає нерівний таймер скрипта)
  process.exit(withComp >= 5 && withComp >= without + 3 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
