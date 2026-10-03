import type { SigEffects, SignatureAt } from '../shared/signature.js';
import { WORLD_H, WORLD_W } from './constants.js';
import type { Participant, ServerProjectile } from './types.js';

/**
 * Ефекти фірмових гармат на сервері: усе, що відбувається після влучання
 * (DoT, ланцюги, осколки, зони, кільця, шторм, пульсація, відлуння променя).
 * Кімната дає доступ до учасників, урону, мережі й пострілів через SigHost.
 */
export interface SigHost {
  list(): Iterable<Participant>;
  get(id: string): Participant | undefined;
  posAt(p: Participant, t: number): { x: number; y: number };
  sameTeam(a: Participant, b: Participant): boolean;
  /** Урон з авторством (фраг, статистика); повертає, чи ціль загинула */
  damage(attacker: Participant, target: Participant, dmg: number, now: number): void;
  /** Подія ефекту всім клієнтам (лише візуал) */
  fx(data: Record<string, unknown>): void;
  spawn(owner: Participant, kind: 'bullet' | 'rocket' | 'missile', from: { x: number; y: number }, angle: number, damage: number, splash: number, lagMs: number, over?: Partial<ServerProjectile> & { speed?: number }): void;
  /** Промінь фірмової гармати: усі цілі вздовж (до першої перешкоди) */
  ray(owner: Participant, from: { x: number; y: number }, angle: number, range: number, lagMs: number, opts: { wide?: number; skip?: string[] }): { hits: Participant[]; dist: number };
}

interface Dot {
  ownerId: string;
  targetId: string;
  kind: 'burn' | 'poison';
  dps: number;
  until: number;
  stacks: number;
  /** Отруєний вибухає при загибелі (гадюка T4) */
  blast?: { r: number; dmg: number };
}

interface Zone {
  ownerId: string;
  x: number;
  y: number;
  r: number;
  dps: number;
  until: number;
  pull?: number;
}

/** Обмеження, щоб ефекти не засипали сервер і мережу */
const MAX_ZONES = 24;
const MAX_ZONES_PER_OWNER = 6;
const TICK_EFFECT_MS = 250;

export class SigFx {
  private dots: Dot[] = [];
  private zones: Zone[] = [];
  private delayed: { at: number; fn: () => void }[] = [];
  private nextEffectTick = 0;

  constructor(private readonly host: SigHost) {}

  later(at: number, fn: () => void): void {
    this.delayed.push({ at, fn });
  }

  private enemies(owner: Participant): Participant[] {
    const out: Participant[] = [];
    for (const p of this.host.list()) if (p.alive && p !== owner && !this.host.sameTeam(p, owner)) out.push(p);
    return out;
  }

  /** Влучання снаряда чи променя фірмової гармати в гравця (урон уже нанесено). */
  onHit(owner: Participant, target: Participant, x: number, y: number, dmg: number, fx: SigEffects, now: number, color: string, angle = 0): void {
    if (fx.lifesteal && owner.alive) owner.hp = Math.min(owner.maxHp, owner.hp + dmg * fx.lifesteal);
    if (fx.slow || fx.stun) {
      const dur = Math.max(fx.slow ?? 0, fx.stun ?? 0);
      target.slowUntil = Math.max(target.slowUntil, now + dur * 1000);
      this.status(target, fx.stun ? 'stun' : 'slow', dur, now);
    }
    if (fx.dot) this.applyDot(owner, target, fx, now, true);
    if (fx.tow) this.tow(owner, target, fx.tow);
    if (fx.chain) this.chain(owner, target, dmg, fx, now, color);
    if (fx.storm) this.storm(owner, target, fx.storm, now, color);
    if (fx.forks) this.forks(owner, target, x, y, angle, dmg, fx, now, color);
  }

  /** Снаряд вибухнув або влучив (у гравця, скелю чи перешкоду): зони, притягання, осколки, кільця. */
  onImpact(owner: Participant, x: number, y: number, dmg: number, fx: SigEffects, now: number, color: string, hitId?: string): void {
    if (fx.zone) this.addZone(owner, x, y, fx.zone, now, color);
    if (fx.pull) this.pullTo(owner, x, y, fx.pull.r, fx.pull.force);
    if (fx.split) {
      const s = fx.split;
      const angles: number[] = [];
      const start = Math.random() * Math.PI * 2;
      for (let i = 0; i < s.n; i++) angles.push(s.arc >= Math.PI * 2 ? start + (i / s.n) * Math.PI * 2 : start + (i - (s.n - 1) / 2) * (s.arc / Math.max(1, s.n - 1)));
      for (const a of angles) this.host.spawn(owner, s.kind, { x, y }, a, dmg * s.mul, s.splash ?? 0, 0, { speed: s.speed, range: s.range, hitIds: hitId ? [hitId] : [] });
      this.host.fx({ k: 'split', x: Math.round(x), y: Math.round(y), a: angles.map((v) => Math.round(v * 1000) / 1000), sp: s.speed, rg: s.range, kind: s.kind, c: color });
    }
    if (fx.shockRing) {
      const ring = fx.shockRing;
      this.later(now + ring.delay, () => {
        if (!owner.alive && !this.host.get(owner.id)) return;
        for (const e of this.enemies(owner)) if (Math.hypot(e.pos.x - x, e.pos.y - y) < ring.r) this.host.damage(owner, e, dmg * ring.mul, Date.now());
        this.host.fx({ k: 'boom', x: Math.round(x), y: Math.round(y), r: ring.r, c: color });
      });
    }
  }

  /** Пульсація навколо стрільця на початку залпу (корона затемнення). */
  pulse(owner: Participant, g: SignatureAt, now: number): void {
    const pl = g.fx.pulse;
    if (!pl) return;
    for (let i = 0; i < pl.n; i++) {
      this.later(now + i * pl.every, () => {
        if (!owner.alive) return;
        for (const e of this.enemies(owner)) if (Math.hypot(e.pos.x - owner.pos.x, e.pos.y - owner.pos.y) < pl.r) this.host.damage(owner, e, pl.dmg * owner.damageMul, Date.now());
        this.host.fx({ k: 'boom', x: Math.round(owner.pos.x), y: Math.round(owner.pos.y), r: pl.r, c: g.color });
      });
    }
  }

  /** Відлуння променя: той самий курс ще раз через delay. */
  echo(owner: Participant, from: { x: number; y: number }, angle: number, g: SignatureAt, dmg: number, lagMs: number, now: number): void {
    const e = g.fx.echo;
    if (!e) return;
    this.later(now + e.delay, () => {
      if (!owner.alive) return;
      const range = g.range ?? 700;
      const r = this.host.ray(owner, from, angle, range, lagMs, { wide: g.fx.wide });
      this.host.fx({ k: 'ray', x1: Math.round(from.x), y1: Math.round(from.y), x2: Math.round(from.x + Math.cos(angle) * r.dist), y2: Math.round(from.y + Math.sin(angle) * r.dist), c: g.color });
      const t = Date.now();
      for (const h of r.hits.slice(0, 1 + (g.fx.pierce ?? 0))) this.host.damage(owner, h, dmg * e.mul, t);
    });
  }

  /** Загибель гравця: отруєний вибухає (гадюка T4), його DoT більше не тікають. */
  onDeath(target: Participant, now: number): void {
    const mine = this.dots.filter((d) => d.targetId === target.id);
    this.dots = this.dots.filter((d) => d.targetId !== target.id);
    const blast = mine.find((d) => d.blast && d.until > now);
    if (!blast?.blast) return;
    const owner = this.host.get(blast.ownerId);
    if (!owner) return;
    const { r, dmg } = blast.blast;
    for (const e of this.enemies(owner)) if (e !== target && Math.hypot(e.pos.x - target.pos.x, e.pos.y - target.pos.y) < r) this.host.damage(owner, e, dmg * owner.damageMul, now);
    this.host.fx({ k: 'boom', x: Math.round(target.pos.x), y: Math.round(target.pos.y), r, c: '#7adc3a' });
  }

  /** Тік ефектів: відкладені дії, DoT і зони (раз на 250 мс). */
  update(now: number): void {
    if (this.delayed.length) {
      const due = this.delayed.filter((d) => d.at <= now);
      this.delayed = this.delayed.filter((d) => d.at > now);
      for (const d of due) d.fn();
    }
    if (now < this.nextEffectTick) return;
    this.nextEffectTick = now + TICK_EFFECT_MS;
    const k = TICK_EFFECT_MS / 1000;
    this.dots = this.dots.filter((d) => d.until > now);
    for (const d of this.dots) {
      const owner = this.host.get(d.ownerId);
      const target = this.host.get(d.targetId);
      if (!owner || !target?.alive) continue;
      this.host.damage(owner, target, d.dps * d.stacks * k, now);
    }
    this.zones = this.zones.filter((z) => z.until > now);
    for (const z of this.zones) {
      const owner = this.host.get(z.ownerId);
      if (!owner) continue;
      for (const e of this.enemies(owner)) {
        const d = Math.hypot(e.pos.x - z.x, e.pos.y - z.y);
        if (d >= z.r) continue;
        if (z.dps) this.host.damage(owner, e, z.dps * k, now);
        // ботів притягує сервер; гравців — їхні клієнти (подія zone має pull)
        if (z.pull && e.isBot && d > 4) this.nudge(e, z.x, z.y, Math.min(d, z.pull * k));
      }
    }
  }

  private applyDot(owner: Participant, target: Participant, fx: SigEffects, now: number, canSpread: boolean): void {
    const dot = fx.dot!;
    const ex = this.dots.find((d) => d.ownerId === owner.id && d.targetId === target.id && d.kind === dot.kind);
    if (ex) {
      ex.stacks = Math.min(dot.stacks, ex.stacks + 1);
      ex.until = now + dot.dur * 1000;
    } else {
      this.dots.push({ ownerId: owner.id, targetId: target.id, kind: dot.kind, dps: dot.dps * owner.damageMul, until: now + dot.dur * 1000, stacks: 1, blast: fx.deathBlast });
    }
    this.status(target, dot.kind, dot.dur, now);
    // вогонь перекидається на ворогів поруч — лише коли ціль щойно зайнялась
    if (canSpread && dot.spread && !ex) {
      for (const e of this.enemies(owner)) {
        if (e === target || Math.hypot(e.pos.x - target.pos.x, e.pos.y - target.pos.y) > dot.spread) continue;
        this.applyDot(owner, e, fx, now, false);
        this.host.fx({ k: 'chain', pts: [Math.round(target.pos.x), Math.round(target.pos.y), Math.round(e.pos.x), Math.round(e.pos.y)], c: '#ff8a1f' });
      }
    }
  }

  /** Подія статусу (для візуалу) — не частіше ніж раз на 400 мс на ціль і вид. */
  private readonly statusSent = new Map<string, number>();

  private status(target: Participant, s: string, dur: number, now: number): void {
    const key = `${target.id}:${s}`;
    if (now - (this.statusSent.get(key) ?? -1e9) < 400) return;
    this.statusSent.set(key, now);
    this.host.fx({ k: 'status', id: target.id, s, dur });
  }

  private chain(owner: Participant, first: Participant, dmg: number, fx: SigEffects, now: number, color: string): void {
    const c = fx.chain!;
    const hit = new Set([first.id]);
    const pts = [Math.round(first.pos.x), Math.round(first.pos.y)];
    let from = first;
    for (let i = 0; i < c.n; i++) {
      let best: Participant | null = null;
      let bestD = c.range;
      for (const e of this.enemies(owner)) {
        if (hit.has(e.id)) continue;
        const d = Math.hypot(e.pos.x - from.pos.x, e.pos.y - from.pos.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (!best) break;
      hit.add(best.id);
      pts.push(Math.round(best.pos.x), Math.round(best.pos.y));
      this.host.damage(owner, best, dmg * c.mul, now);
      if (fx.stun) {
        best.slowUntil = Math.max(best.slowUntil, now + fx.stun * 1000);
        this.status(best, 'stun', fx.stun, now);
      }
      from = best;
    }
    if (pts.length > 2) this.host.fx({ k: 'chain', pts, c: color });
  }

  private storm(owner: Participant, target: Participant, s: NonNullable<SigEffects['storm']>, now: number, color: string): void {
    for (let i = 0; i < s.n; i++) {
      this.later(now + (i + 1) * s.every, () => {
        if (!owner.alive) return;
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * s.r;
        const x = target.pos.x + Math.cos(a) * d;
        const y = target.pos.y + Math.sin(a) * d;
        for (const e of this.enemies(owner)) if (Math.hypot(e.pos.x - x, e.pos.y - y) < s.area) this.host.damage(owner, e, s.dmg * owner.damageMul, Date.now());
        this.host.fx({ k: 'strike', x: Math.round(x), y: Math.round(y), r: s.area, c: color });
      });
    }
  }

  private forks(owner: Participant, target: Participant, x: number, y: number, angle: number, dmg: number, fx: SigEffects, now: number, color: string): void {
    const f = fx.forks!;
    for (let i = 0; i < f.n; i++) {
      const a = angle + (i - (f.n - 1) / 2) * (f.arc * 2) / Math.max(1, f.n - 1);
      const r = this.host.ray(owner, { x, y }, a, f.range, 0, { skip: [target.id] });
      this.host.fx({ k: 'ray', x1: Math.round(x), y1: Math.round(y), x2: Math.round(x + Math.cos(a) * r.dist), y2: Math.round(y + Math.sin(a) * r.dist), c: color });
      if (r.hits[0]) this.host.damage(owner, r.hits[0], dmg * f.mul, now);
    }
  }

  private addZone(owner: Participant, x: number, y: number, z: NonNullable<SigEffects['zone']>, now: number, color: string): void {
    // зони одного стрільця поруч не стакаються: існуюча лише подовжується
    const near = this.zones.find((q) => q.ownerId === owner.id && Math.hypot(q.x - x, q.y - y) < z.r);
    if (near) {
      near.until = Math.max(near.until, now + z.dur * 1000);
      return;
    }
    const own = this.zones.filter((q) => q.ownerId === owner.id);
    if (own.length >= MAX_ZONES_PER_OWNER) this.zones = this.zones.filter((q) => q !== own[0]);
    if (this.zones.length >= MAX_ZONES) this.zones.shift();
    this.zones.push({ ownerId: owner.id, x, y, r: z.r, dps: z.dps * owner.damageMul, until: now + z.dur * 1000, pull: z.pull });
    this.host.fx({ k: 'zone', x: Math.round(x), y: Math.round(y), r: z.r, dur: z.dur, z: z.kind, pull: z.pull ?? 0, o: owner.id, c: color });
  }

  /** Миттєве притягання ворогів до точки: ботів зсуває сервер, гравців — їхні клієнти за подією. */
  private pullTo(owner: Participant, x: number, y: number, r: number, force: number): void {
    for (const e of this.enemies(owner)) {
      const d = Math.hypot(e.pos.x - x, e.pos.y - y);
      if (d < r && e.isBot) this.nudge(e, x, y, Math.min(d * 0.8, force * 0.35));
    }
    this.host.fx({ k: 'pull', x: Math.round(x), y: Math.round(y), r, f: force, o: owner.id });
  }

  /** Буксир: влученого тягне до стрільця. */
  private tow(owner: Participant, target: Participant, force: number): void {
    if (target.isBot) this.nudge(target, owner.pos.x, owner.pos.y, force * 0.35);
    this.host.fx({ k: 'pull', id: target.id, x: Math.round(owner.pos.x), y: Math.round(owner.pos.y), f: force, o: owner.id });
  }

  private nudge(p: Participant, x: number, y: number, dist: number): void {
    const d = Math.hypot(x - p.pos.x, y - p.pos.y) || 1;
    p.pos.x = Math.max(0, Math.min(WORLD_W, p.pos.x + ((x - p.pos.x) / d) * dist));
    p.pos.y = Math.max(0, Math.min(WORLD_H, p.pos.y + ((y - p.pos.y) / d) * dist));
  }
}
