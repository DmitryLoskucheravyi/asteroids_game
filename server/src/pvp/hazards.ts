import {
  ARENA_H,
  ARENA_W,
  MINE_BLAST,
  MINE_FUSE_MS,
  MINE_TRIGGER,
  EVENT_KINDS,
  arenaEventFor,
  hazardDamage,
  hazardHp,
  hazardPos,
  type ArenaEvent,
  type Hazard,
  type HazardKind,
} from '../shared/hazards.js';
import type { Obstacle, Participant } from './types.js';

/** Що потрібно системі перешкод від кімнати. */
export interface HazardHost {
  /** Живі літаки (люди й боти) */
  planes(): Participant[];
  obstacles(): readonly Obstacle[];
  broadcast(event: string, data: unknown): void;
  /** Шкода від середовища (без автора) */
  envDamage(target: Participant, damage: number, kind: HazardKind): void;
  /** Нагорода за збитого боса — купа луту на полі */
  dropPile(x: number, y: number, coins: number, crystals: number): void;
}

interface Live extends Hazard {
  hp: number;
  /** Коли зникає сам (мс матчу); для мін і боса — нескінченно */
  until: number;
  /** Мисливець: до якого моменту наводиться на ціль */
  homeUntil?: number;
  /** Міна: коли вибухне (після спрацювання) */
  fuseAt?: number;
  /** Бос: коли можна знову вдарити літак (щоб не "молотив" щотіку) */
  hitCd?: Map<string, number>;
  nextVolley?: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const HIT_R = 20;

/**
 * Перешкоди арени: рідкі метеорити в кожному матчі + івент режиму. Сервер вирішує все:
 * хто де, хто в кого влучив, хто вибухнув. Клієнтам іде лише поява, зникнення й синхронізація
 * мисливців (вони єдині, хто змінює курс).
 */
export class HazardSystem {
  readonly event: ArenaEvent;
  private readonly live = new Map<number, Live>();
  private seq = 0;
  private nextRock = 6000;
  private nextEvent = 4000;
  private nextSync = 0;

  constructor(
    mode: string,
    private readonly host: HazardHost,
  ) {
    // ARENA_EVENT — примусово задати івент (для тестів і спецподій), інакше — за розкладом
    const forced = process.env.ARENA_EVENT as ArenaEvent | undefined;
    this.event = forced && (EVENT_KINDS as readonly string[]).includes(forced) ? forced : arenaEventFor(mode).kind;
  }

  /** Поточні перешкоди — для гравця, що підʼєднався посеред матчу. */
  snapshot(): Hazard[] {
    return [...this.live.values()].map((h) => this.pub(h));
  }

  private pub(h: Live): Hazard {
    return { id: h.id, kind: h.kind, x: h.x, y: h.y, vx: h.vx, vy: h.vy, r: h.r, t0: h.t0, warn: h.warn, bounce: h.bounce, v: h.v };
  }

  private add(list: Omit<Live, 'id' | 'hp' | 'v'>[]): void {
    const out: Hazard[] = [];
    for (const base of list) {
      const h: Live = { ...base, id: ++this.seq, hp: hazardHp(base.kind, base.r), v: Math.floor(Math.random() * 6) };
      this.live.set(h.id, h);
      out.push(this.pub(h));
    }
    if (out.length) this.host.broadcast('match:hz', { add: out });
  }

  private remove(h: Live, t: number, boom = false): void {
    if (!this.live.delete(h.id)) return;
    const p = hazardPos(h, t);
    this.host.broadcast('match:hz-gone', { id: h.id, x: Math.round(p.x), y: Math.round(p.y), boom });
  }

  /** Випадковий живий літак (щоб перешкоди летіли туди, де є гравці, — арена величезна). */
  private target(): Participant | null {
    const planes = this.host.planes();
    const humans = planes.filter((p) => !p.isBot);
    const pool = humans.length && Math.random() < 0.7 ? humans : planes;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /** Перешкода, що летить повз точку (tx,ty) з відстані dist, із розкидом. */
  private aimed(kind: HazardKind, tx: number, ty: number, dist: number, speed: number, r: number, t0: number, warn: number, spread = 220): Omit<Live, 'id' | 'hp' | 'v'> {
    const a = Math.random() * Math.PI * 2;
    const x = tx + Math.cos(a) * dist;
    const y = ty + Math.sin(a) * dist;
    const ax = tx + rnd(-spread, spread);
    const ay = ty + rnd(-spread, spread);
    const d = Math.hypot(ax - x, ay - y) || 1;
    const travel = dist * 2.2;
    return { kind, x, y, vx: ((ax - x) / d) * speed, vy: ((ay - y) / d) * speed, r, t0, warn, until: t0 + (travel / speed) * 1000 };
  }

  update(t: number, dt: number): void {
    // ---- метеорити: у кожному матчі, рідко ----
    if (t >= this.nextRock) {
      this.nextRock = t + rnd(7000, 10000);
      const p = this.target();
      if (p) this.add([this.aimed('rock', p.pos.x, p.pos.y, 1300, rnd(170, 290), rnd(24, 46), t, 0, 300)]);
    }
    // ---- івент режиму ----
    if (t >= this.nextEvent) this.spawnEvent(t);

    // ---- мисливці наводяться; бос стріляє кільцями ----
    for (const h of this.live.values()) {
      if (t < h.t0) continue;
      if (h.kind === 'hunter' && h.homeUntil && t < h.homeUntil) {
        const pos = hazardPos(h, t);
        let best: Participant | null = null;
        let bd = 1600;
        for (const p of this.host.planes()) {
          const d = Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y);
          if (d < bd) [bd, best] = [d, p];
        }
        if (best) {
          const cur = Math.atan2(h.vy, h.vx);
          let diff = Math.atan2(best.pos.y - pos.y, best.pos.x - pos.x) - cur;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          const a = cur + Math.max(-1.7 * dt, Math.min(1.7 * dt, diff));
          const sp = Math.hypot(h.vx, h.vy);
          // перебазування: нова точка відліку — тут і зараз
          h.x = pos.x;
          h.y = pos.y;
          h.t0 = t;
          h.vx = Math.cos(a) * sp;
          h.vy = Math.sin(a) * sp;
        }
      }
      if (h.kind === 'boss' && h.nextVolley !== undefined && t >= h.nextVolley) {
        h.nextVolley = t + 5500;
        this.bossVolley(h, t);
      }
    }
    if (t >= this.nextSync) {
      this.nextSync = t + 200;
      const s = [...this.live.values()].filter((h) => h.kind === 'hunter' && t >= h.t0).map((h) => [h.id, Math.round(h.x), Math.round(h.y), Math.round(h.vx), Math.round(h.vy), h.t0]);
      if (s.length) this.host.broadcast('match:hz-sync', { s });
    }

    // ---- зіткнення з літаками, міни, зникнення ----
    for (const h of [...this.live.values()]) {
      if (t < h.t0) continue;
      if (t > h.until) {
        this.remove(h, t);
        continue;
      }
      const pos = hazardPos(h, t);
      if (!h.bounce && (pos.x < -400 || pos.y < -400 || pos.x > ARENA_W + 400 || pos.y > ARENA_H + 400)) {
        this.remove(h, t);
        continue;
      }
      if (h.kind === 'mine') {
        this.updateMine(h, pos, t);
        continue;
      }
      for (const p of this.host.planes()) {
        if (Date.now() < p.phaseUntil) continue;
        if (Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) > h.r * 0.85 + HIT_R) continue;
        if (h.kind === 'boss') {
          const cd = h.hitCd ?? (h.hitCd = new Map());
          if ((cd.get(p.id) ?? 0) > t) continue;
          cd.set(p.id, t + 900);
          this.host.envDamage(p, hazardDamage(h.kind, h.r), h.kind);
          continue;
        }
        this.host.envDamage(p, hazardDamage(h.kind, h.r), h.kind);
        this.remove(h, t, true);
        break;
      }
    }
  }

  private updateMine(h: Live, pos: { x: number; y: number }, t: number): void {
    if (h.fuseAt === undefined) {
      // озброюється за секунду після появи
      if (t < h.t0 + 1000) return;
      if (this.host.planes().some((p) => Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < MINE_TRIGGER)) {
        h.fuseAt = t + MINE_FUSE_MS;
        this.host.broadcast('match:hz-fuse', { id: h.id, at: h.fuseAt });
      }
      return;
    }
    if (t >= h.fuseAt) this.explode(h, t);
  }

  /** Вибух міни: шкода всім поруч, знищує інші перешкоди, підпалює сусідні міни (ланцюг). */
  private explode(h: Live, t: number): void {
    const pos = hazardPos(h, t);
    this.remove(h, t, true);
    for (const p of this.host.planes()) {
      if (Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) < MINE_BLAST) this.host.envDamage(p, hazardDamage('mine', h.r), 'mine');
    }
    for (const o of [...this.live.values()]) {
      if (o.kind === 'boss' || t < o.t0) continue;
      const op = hazardPos(o, t);
      if (Math.hypot(op.x - pos.x, op.y - pos.y) > MINE_BLAST + o.r) continue;
      if (o.kind === 'mine') {
        if (o.fuseAt === undefined || o.fuseAt > t + 220) {
          o.fuseAt = t + 220;
          this.host.broadcast('match:hz-fuse', { id: o.id, at: o.fuseAt });
        }
      } else this.remove(o, t, true);
    }
  }

  private bossVolley(h: Live, t: number): void {
    const pos = hazardPos(h, t);
    let gapA = Math.random() * Math.PI * 2;
    let bd = Infinity;
    for (const p of this.host.planes()) {
      const d = Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y);
      if (d < bd) [bd, gapA] = [d, Math.atan2(p.pos.y - pos.y, p.pos.x - pos.x)];
    }
    // кільце уламків, але в бік найближчого гравця завжди є прохід
    const n = 18;
    const list: Omit<Live, 'id' | 'hp' | 'v'>[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      let diff = a - gapA;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) < 0.42) continue;
      list.push({ kind: 'shard', x: pos.x + Math.cos(a) * h.r, y: pos.y + Math.sin(a) * h.r, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, r: 14, t0: t, warn: 0, until: t + 4500 });
    }
    this.add(list);
  }

  private spawnEvent(t: number): void {
    const p = this.target();
    switch (this.event) {
      case 'comets': {
        this.nextEvent = t + rnd(3200, 4800);
        if (p) this.add([this.aimed('comet', p.pos.x, p.pos.y, 1500, 1150, 20, t + 1300, 1300, 160)]);
        break;
      }
      case 'hunters': {
        this.nextEvent = t + 5500;
        const n = [...this.live.values()].filter((h) => h.kind === 'hunter').length;
        if (p && n < 3) {
          const h = this.aimed('hunter', p.pos.x, p.pos.y, 1000, 270, 26, t, 0, 0);
          this.add([{ ...h, homeUntil: t + 6000, until: t + 10_000 }]);
        }
        break;
      }
      case 'walls': {
        this.nextEvent = t + 13_000;
        if (!p) break;
        // ряд астероїдів з одним проходом летить через гравця; попередження за 2 с
        const a = Math.floor(Math.random() * 4) * (Math.PI / 2);
        const dir = { x: Math.cos(a), y: Math.sin(a) };
        const side = { x: -dir.y, y: dir.x };
        const start = { x: p.pos.x - dir.x * 1200, y: p.pos.y - dir.y * 1200 };
        const count = 17;
        const gap = 3 + Math.floor(Math.random() * (count - 8));
        const list: Omit<Live, 'id' | 'hp' | 'v'>[] = [];
        for (let i = 0; i < count; i++) {
          if (i >= gap && i < gap + 3) continue;
          const off = (i - (count - 1) / 2) * 120;
          list.push({ kind: 'rock', x: start.x + side.x * off, y: start.y + side.y * off, vx: dir.x * 260, vy: dir.y * 260, r: 44, t0: t + 2000, warn: 2000, until: t + 2000 + (2600 / 260) * 1000 });
        }
        this.add(list);
        break;
      }
      case 'bouncers': {
        this.nextEvent = t + 3000;
        const n = [...this.live.values()].filter((h) => h.kind === 'bouncer').length;
        if (p && n < 7) {
          const a = Math.random() * Math.PI * 2;
          const d = rnd(650, 1000);
          const x = Math.max(60, Math.min(ARENA_W - 60, p.pos.x + Math.cos(a) * d));
          const y = Math.max(60, Math.min(ARENA_H - 60, p.pos.y + Math.sin(a) * d));
          const va = Math.random() * Math.PI * 2;
          this.add([{ kind: 'bouncer', x, y, vx: Math.cos(va) * 240, vy: Math.sin(va) * 240, r: 30, t0: t, warn: 0, bounce: true, until: t + 40_000 }]);
        }
        break;
      }
      case 'shower': {
        this.nextEvent = t + 11_000;
        if (!p) break;
        // злива з одного боку; кожен уламок показує свою лінію за 1.6 с
        const a = Math.random() * Math.PI * 2;
        const dir = { x: Math.cos(a), y: Math.sin(a) };
        const side = { x: -dir.y, y: dir.x };
        const list: Omit<Live, 'id' | 'hp' | 'v'>[] = [];
        for (let i = 0; i < 18; i++) {
          const off = rnd(-700, 700);
          const sp = rnd(640, 800);
          const t0 = t + 1600 + rnd(0, 1800);
          list.push({ kind: 'rock', x: p.pos.x - dir.x * 1150 + side.x * off, y: p.pos.y - dir.y * 1150 + side.y * off, vx: dir.x * sp, vy: dir.y * sp, r: rnd(11, 15), t0, warn: 1600, until: t0 + (2600 / sp) * 1000 });
        }
        this.add(list);
        break;
      }
      case 'mines': {
        this.nextEvent = t + 2500;
        const n = [...this.live.values()].filter((h) => h.kind === 'mine').length;
        if (n >= 34) break;
        const list: Omit<Live, 'id' | 'hp' | 'v'>[] = [];
        for (let i = 0; i < (n < 20 ? 6 : 2); i++) {
          // частина — біля гравців, решта — по всій арені
          const near = p && Math.random() < 0.5;
          const pos = near ? { x: p.pos.x + rnd(-900, 900), y: p.pos.y + rnd(-900, 900) } : { x: rnd(200, ARENA_W - 200), y: rnd(200, ARENA_H - 200) };
          if (this.host.obstacles().some((o) => Math.hypot(o.x - pos.x, o.y - pos.y) < o.r + 60)) continue;
          if (this.host.planes().some((pl) => Math.hypot(pl.pos.x - pos.x, pl.pos.y - pos.y) < 300)) continue;
          list.push({ kind: 'mine', x: Math.max(80, Math.min(ARENA_W - 80, pos.x)), y: Math.max(80, Math.min(ARENA_H - 80, pos.y)), vx: 0, vy: 0, r: 16, t0: t, warn: 0, until: Infinity });
        }
        this.add(list);
        break;
      }
      case 'boss': {
        this.nextEvent = t + 4000;
        if ([...this.live.values()].some((h) => h.kind === 'boss')) break;
        const a = Math.random() * Math.PI * 2;
        const x = p ? Math.max(200, Math.min(ARENA_W - 200, p.pos.x + Math.cos(a) * 900)) : ARENA_W / 2;
        const y = p ? Math.max(200, Math.min(ARENA_H - 200, p.pos.y + Math.sin(a) * 900)) : ARENA_H / 2;
        const va = Math.random() * Math.PI * 2;
        this.add([{ kind: 'boss', x, y, vx: Math.cos(va) * 130, vy: Math.sin(va) * 130, r: 120, t0: t + 1500, warn: 1500, bounce: true, until: Infinity, nextVolley: t + 4000 }]);
        break;
      }
      default:
        // туман і вітер — без об'єктів (візуал і знесення рахуються на клієнті й для ботів)
        this.nextEvent = Infinity;
    }
  }

  /** Снаряд (відрізок руху) влучив у перешкоду? Перешкода отримує шкоду; снаряд згорає. */
  hitByProjectile(ax: number, ay: number, bx: number, by: number, damage: number, t: number): boolean {
    for (const h of this.live.values()) {
      if (t < h.t0) continue;
      const p = hazardPos(h, t);
      if (segDist(ax, ay, bx, by, p.x, p.y) > h.r * 0.9) continue;
      this.damageHazard(h, damage, t);
      return true;
    }
    return false;
  }

  /** Лазер: відстань до першої перешкоди на промені (і шкода їй), або null. */
  rayHit(x: number, y: number, dx: number, dy: number, range: number, t: number, damage: number): { dist: number } | null {
    let best: { dist: number; h: Live } | null = null;
    for (const h of this.live.values()) {
      if (t < h.t0) continue;
      const p = hazardPos(h, t);
      const fx = p.x - x;
      const fy = p.y - y;
      const along = fx * dx + fy * dy;
      if (along < 0 || along > range) continue;
      const perp2 = fx * fx + fy * fy - along * along;
      const r = h.r * 0.9;
      if (perp2 > r * r) continue;
      const d = along - Math.sqrt(r * r - perp2);
      if (!best || d < best.dist) best = { dist: d, h };
    }
    if (!best) return null;
    this.damageHazard(best.h, damage, t);
    return { dist: best.dist };
  }

  private damageHazard(h: Live, damage: number, t: number): void {
    if (h.kind === 'mine') {
      this.explode(h, t);
      return;
    }
    h.hp -= damage;
    if (h.hp > 0) return;
    const pos = hazardPos(h, t);
    this.remove(h, t, true);
    // збитий бос лишає купу луту; новий з'явиться згодом
    if (h.kind === 'boss') {
      this.host.dropPile(pos.x, pos.y, 80, 5);
      this.nextEvent = t + 20_000;
    }
  }
}

function segDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2)) : 0;
  return Math.hypot(ax + dx * k - cx, ay + dy * k - cy);
}
