/**
 * Перевірка еволюції фірмових гармат на сервері без мережі: стрілець на заданому тірі,
 * мішені-боти в лінію перед ним, постріли X → рахуємо урон і події ефектів (match:fx).
 *
 *   npx tsx scripts/sig-check.ts            — усі літаки на T1..T4
 *   npx tsx scripts/sig-check.ts thunder 4  — один літак/тір
 */
import { Room, type Entrant } from '../src/pvp/room.js';
import { signatureAt, SIGNATURE_GUNS } from '../src/shared/signature.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(planeId: string, tier: number): Promise<{ dmg: number; hits: number; fx: Record<string, number>; errors: number }> {
  const fx: Record<string, number> = {};
  let dmg = 0;
  let hits = 0;
  const net = {
    broadcast(event: string, data: unknown) {
      if (event === 'match:fx') {
        const k = (data as { k: string }).k;
        fx[k] = (fx[k] ?? 0) + 1;
      }
      if (event === 'match:hit') {
        const h = data as { attackerId: string; damage: number };
        if (h.attackerId === 'p1') {
          dmg += h.damage;
          hits++;
        }
      }
    },
    send() {},
  };
  const hooks = { setInMatch() {}, results() {}, leaver() {} };
  const me: Entrant = { pid: 'p1', userId: 'u1', nickname: 'tester', planeId, weaponId: 'machine_gun', tier, level: 1, activeDefId: null, passiveDefId: null, rankPoints: 0 };
  const room = new Room('t', net, [me], 'casual', hooks);
  const r = room as any;
  r.obstacles = [];
  r.hz.hazards = [];
  r.state = 'active';
  r.startedAt = Date.now();
  const shooter = r.participants.get('p1');
  shooter.pos = { x: 2000, y: 2000 };
  shooter.angle = 0;
  // мішені: щільна група перед стрільцем (ланцюги, пробиття, сплеш мають у кого влучати)
  let i = 0;
  for (const p of r.participants.values()) {
    if (p.id === 'p1') continue;
    p.isBot = true;
    p.hp = p.maxHp = 9999;
    p.pos = { x: 2160 + (i % 3) * 70, y: 2000 + (Math.floor(i / 3) - 1) * 40 };
    p.botState = 'patrol';
    i++;
  }
  // боти стоять і не стріляють
  const bots = [...r.participants.values()].filter((p: any) => p.id !== 'p1');
  const freeze = () => bots.forEach((b: any, k: number) => (b.pos = { x: 2160 + (k % 3) * 70, y: 2000 + (Math.floor(k / 3) - 1) * 40 }));
  r.spawnBotShot = () => {};
  r.useSkill = () => {};
  let errors = 0;
  const g = signatureAt(planeId, tier);
  const homingEvery = g.fx.homingEvery ?? 0;
  try {
    for (let s = 0; s < g.shots; s++) {
      const missile = homingEvery && s % homingEvery === homingEvery - 1;
      const kind = missile ? 'missile' : g.kind;
      const n = g.kind === 'missile' ? g.salvo ?? 1 : g.kind === 'laser' ? 1 : g.pellets ?? 1;
      for (let k = 0; k < (missile ? 1 : n); k++) {
        const a = g.ring ? (k / n) * Math.PI * 2 : (k - (n - 1) / 2) * 0.05;
        room.onShot('p1', { x: 2024, y: 2000, angle: a, kind, viewT: Date.now() - r.startedAt, sig: true });
      }
      for (let t = 0; t < Math.max(1, Math.round(g.interval / 33)); t++) {
        freeze();
        r.tick();
        await sleep(33);
      }
    }
    for (const _ of Array(3)) for (let t = 0; t < 60; t++) {
      freeze();
      r.tick();
      await sleep(33);
    }
  } catch (e) {
    errors++;
    console.error(planeId, tier, e);
  }
  room.destroy();
  return { dmg: Math.round(dmg), hits, fx, errors };
}

const [only, onlyTier] = process.argv.slice(2);
const planes = only ? [only] : Object.keys(SIGNATURE_GUNS);
const tiers = onlyTier ? [Number(onlyTier)] : [1, 2, 3, 4];
let failed = 0;
for (const id of planes) {
  const row: string[] = [];
  for (const t of tiers) {
    const res = await run(id, t);
    failed += res.errors;
    row.push(`T${t}: ${res.dmg} dmg/${res.hits} hits ${Object.entries(res.fx).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  }
  console.log(id.padEnd(10), row.join(' | '));
}
process.exit(failed ? 1 : 0);
