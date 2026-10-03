import { Vec2, rand } from '../core/math';
import { drawGlow } from './fx';
import { drawPlane } from './PlaneArt';
import { BlackHole, type Asteroid } from './entities/Asteroid';
import { BossAsteroid } from './entities/Hazards';
import type { Pickup } from './entities/Pickup';
import type { Player } from './entities/Player';
import { Projectile } from './entities/Projectile';
import type { ParticleSystem } from './systems/Particles';
import type { SkillSystem } from './systems/SkillSystem';
import type { PlaneId } from './planes';

/**
 * Тірові механіки бортових скілів (кампанія й виживання — там, де живуть бортові скіли).
 * Кожен тір T2..T4 додає нову поведінку до попередніх, у кожного літака — свій набір.
 * У PvP бортові скіли не працюють (там прокачуються фірмові гармати, див. shared/signature.ts).
 */
export interface SkillHost {
  readonly player: Player;
  readonly skills: SkillSystem;
  readonly particles: ParticleSystem;
  asteroids(): Asteroid[];
  pickups(): Pickup[];
  /** Знищити астероїд з ефектом (без перевірок) */
  smash(a: Asteroid, loud?: boolean): void;
  destructible(a: Asteroid): boolean;
  shockwave(at: Vec2, radius: number, color: string): void;
  ring(x: number, y: number, r1: number, color: string, dur: number): void;
  addProjectile(p: Projectile): void;
  collect(pk: Pickup): void;
  float(x: number, y: number, text: string, color: string): void;
  shake(v: number): void;
  size(): { w: number; h: number };
}

/** Зона на полі: руйнує, заморожує чи сповільнює астероїди всередині. */
interface FieldZone {
  x: number;
  y: number;
  r: number;
  until: number;
  mode: 'smash-small' | 'smash-medium' | 'freeze' | 'slow';
  color: string;
  /** Тонкий слід (не малюємо колом) */
  trail?: boolean;
}

interface Drone {
  until: number;
  phase: number;
  shootAt: number;
  pos: Vec2;
}

interface Turret {
  x: number;
  y: number;
  until: number;
  shootAt: number;
}

/** Відстань між двома точками */
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

const has = (id: PlaneId, tier: number) => (plane: PlaneId, t: number) => id === plane && tier >= t;

export class TierSkills {
  private time = 0;
  private zones: FieldZone[] = [];
  private drones: Drone[] = [];
  private turrets: Turret[] = [];
  private readonly frozenUntil = new WeakMap<Asteroid, number>();
  private readonly doomAt = new WeakMap<Asteroid, number>();
  /** Глобальне сповільнення астероїдів (хронос T4, оса T2) */
  private slowUntil = 0;
  private slowMul = 1;
  private echo: { x: number; y: number; angle: number; until: number } | null = null;
  private trailAt = 0;
  private wasBoosted = false;
  private wasFrozen = false;
  private lastJumpAt = -10;
  private jumpStreak = 0;
  private jumpCount = 0;
  private pulseAt = 0;
  private coronaUntil = 0;
  private coronaAt = 0;
  private fireRamUntil = 0;
  private rewindUsed = false;
  private viperRefundAt = -10;
  private novaKills = 0;
  private readonly history: { t: number; x: number; y: number }[] = [];
  private readonly is: (plane: PlaneId, t: number) => boolean;

  constructor(
    private readonly host: SkillHost,
    readonly planeId: PlaneId,
    readonly tier: number,
  ) {
    this.is = has(planeId, tier);
  }

  // ---------- модифікатори для гри ----------

  /** Як оновлювати астероїд: заморожений зоною/слідом чи сповільнений аурою/бульбашкою. */
  asteroidMod(a: Asteroid): { frozen: boolean; mul: number } {
    if ((this.frozenUntil.get(a) ?? 0) > this.time) return { frozen: true, mul: 0 };
    let mul = this.slowUntil > this.time ? this.slowMul : 1;
    for (const z of this.zones) {
      if (dist(a.pos, z) > z.r + a.radius) continue;
      if (z.mode === 'freeze') {
        // слід/бульбашка заморожують астероїд, що в них залетів
        this.frozenUntil.set(a, this.time + (z.trail ? 1.5 : 0.1));
        return { frozen: true, mul: 0 };
      }
      if (z.mode === 'slow') mul = Math.min(mul, 0.4);
    }
    // НЛО T4: гравітаційна бульбашка навколо тарілки
    if (this.is('ufo', 4) && dist(a.pos, this.host.player.pos) < 150) mul = Math.min(mul, 0.5);
    return { frozen: false, mul };
  }

  /** Радіус, з якого притягуються підбирачки: base — магніт літака; бонуси (не кристали) колектор T2 тягне з 1.5×. */
  magnetFor(pk: Pickup, base: number): number {
    let r = base;
    if (this.is('collector', 2) && pk.kind !== 'crystal') r = Math.max(r, base * 1.5);
    if (this.is('ufo', 2)) r = Math.max(r, 220);
    // затемнення T3: після ривка 0.6 с — магнітний сплеск на 260 px
    if (this.is('eclipse', 3) && this.time - this.lastJumpAt < 0.6) r = Math.max(r, 260);
    return r;
  }

  /** Колектор T4: кристал рахується подвійним з шансом 20%. */
  crystalBonus(): number {
    return this.is('collector', 4) && Math.random() < 0.2 ? 1 : 0;
  }

  /** Таран блискавки: T4 ламає й великі. */
  ramBreaksLarge(): boolean {
    return this.is('blaze', 4);
  }

  /** Вогняний таран фенікса після воскресіння (T3): усе, крім боса й чорних дір. */
  get fireRam(): boolean {
    return this.fireRamUntil > this.time;
  }

  // ---------- події ----------

  onRam(a: Asteroid): void {
    const h = this.host;
    if (this.is('blaze', 2)) h.skills.boostLeft = Math.min(h.skills.boostDuration + 2, h.skills.boostLeft + 0.4);
    if (this.is('blaze', 3)) {
      // таран вибухає: усе дрібне й середнє поруч розлітається
      h.ring(a.pos.x, a.pos.y, 110, '255,140,60', 0.35);
      for (const o of h.asteroids()) if (o !== a && o.alive && o.size !== 'large' && h.destructible(o) && dist(o.pos, a.pos) < 110 + o.radius) h.smash(o);
    }
  }

  /** Титан T2: малий астероїд розбивається об щит, щит лишається. */
  shieldAbsorbs(a: Asteroid | null): boolean {
    return !!a && this.is('titan', 2) && a.size === 'small' && this.host.destructible(a);
  }

  onShieldBreak(): void {
    if (this.is('titan', 3)) this.host.shockwave(this.host.player.pos, 170, '255,200,90');
  }

  onShieldRegen(): void {
    if (this.is('bastion', 2)) this.host.shockwave(this.host.player.pos, 150, '255,150,70');
  }

  /** Перед смертю: хронос T3 раз за забіг відмотує час на 2 с назад. */
  saveFromDeath(): boolean {
    if (!this.is('chronos', 3) || this.rewindUsed) return false;
    const past = this.history.find((h) => h.t >= this.time - 2) ?? this.history[0];
    if (!past) return false;
    this.rewindUsed = true;
    const p = this.host.player;
    this.host.ring(p.pos.x, p.pos.y, 120, '160,120,255', 0.5);
    p.pos.set(past.x, past.y);
    p.vel.set(0, 0);
    p.invulnerable = Math.max(p.invulnerable, 1.5);
    this.host.ring(p.pos.x, p.pos.y, 160, '120,240,255', 0.6);
    this.host.float(p.pos.x, p.pos.y - 46, '⟲ −2s', '#9affff');
    this.host.shake(10);
    return true;
  }

  /** Втрачено життя (воскресіння): бастіон T3 — турель; фенікс — свої бонуси. */
  onLifeLost(livesLeft: number): void {
    const h = this.host;
    const p = h.player;
    if (this.is('bastion', 3)) this.turrets.push({ x: p.pos.x, y: p.pos.y, until: this.time + 8, shootAt: this.time + 0.4 });
    if (this.is('bastion', 4) && livesLeft === 0) h.float(p.pos.x, p.pos.y - 70, '🛡', '#ffb070');
    if (this.is('phoenix', 2)) {
      h.shockwave(p.pos, 320, '255,140,40');
      this.zones.push({ x: p.pos.x, y: p.pos.y, r: 200, until: this.time + 3, mode: 'smash-medium', color: '255,120,40' });
    }
    if (this.is('phoenix', 3)) this.fireRamUntil = this.time + 3;
    if (this.is('phoenix', 4)) {
      p.invulnerable += 2;
      h.skills.addBoost(2);
      h.skills.boostLeft = Math.max(h.skills.boostLeft, h.skills.boostDuration);
    }
  }

  /** Бастіон T4: на останньому житті щит відновлюється вдвічі швидше. */
  shieldRegenMul(livesLeft: number): number {
    return this.is('bastion', 4) && livesLeft === 0 ? 0.5 : 1;
  }

  onFreeze(): void {
    const p = this.host.player;
    if (this.is('chronos', 2)) this.zones.push({ x: p.pos.x, y: p.pos.y, r: 190, until: this.time + 4, mode: 'freeze', color: '160,120,255' });
    if (this.is('wasp', 3)) {
      const until = this.time + 6;
      for (let i = 0; i < 2; i++) this.drones.push({ until, phase: i * Math.PI, shootAt: this.time + 0.5, pos: p.pos.clone() });
    }
  }

  onJump(from: Vec2, to: Vec2): void {
    const h = this.host;
    const p = h.player;
    const streak = this.time - this.lastJumpAt < 1.2 ? this.jumpStreak + 1 : 1;
    const quick = this.time - this.lastJumpAt < 1;
    this.lastJumpAt = this.time;
    this.jumpStreak = streak;
    this.jumpCount++;
    const along = (fn: (x: number, y: number) => void, step = 30) => {
      const d = dist(from, to);
      for (let s = 0; s <= d; s += step) fn(from.x + ((to.x - from.x) * s) / d, from.y + ((to.y - from.y) * s) / d);
    };
    if (this.is('phantom', 2)) this.echo = { x: from.x, y: from.y, angle: p.angle, until: this.time + 2.5 };
    if (this.is('phantom', 3)) along((x, y) => this.smashNear(x, y, 34, 'small'));
    if (this.is('phantom', 4)) p.invulnerable = Math.max(p.invulnerable, 0.8);
    if (this.is('swift', 2)) along((x, y) => this.zones.push({ x, y, r: 26, until: this.time + 2, mode: 'freeze', color: '170,230,255', trail: true }), 24);
    if (this.is('swift', 3) && quick) h.shockwave(to, 130, '140,230,255');
    if (this.is('swift', 4) && streak >= 3) {
      h.skills.boostLeft = Math.max(h.skills.boostLeft, 1);
      this.jumpStreak = 0;
    }
    if (this.is('viper', 2)) this.zones.push({ x: from.x, y: from.y, r: 70, until: this.time + 3, mode: 'smash-small', color: '140,230,60' });
    if (this.is('viper', 3)) {
      p.invulnerable = Math.max(p.invulnerable, 0.35);
      along((x, y) => {
        for (const a of h.asteroids()) if (a.alive && a.size !== 'large' && h.destructible(a) && dist(a.pos, { x, y }) < 30 + a.radius && !this.doomAt.has(a)) this.doomAt.set(a, this.time + 1);
      });
    }
    if (this.is('nova', 2)) {
      const at = from.clone();
      this.later(0.4, () => h.shockwave(at, 90, '255,200,255'));
    }
    if (this.is('nova', 4) && this.jumpCount % 3 === 0) {
      const at = to.clone();
      this.later(0.25, () => h.shockwave(at, 150, '200,160,255'));
      this.later(0.5, () => h.shockwave(at, 200, '255,220,255'));
    }
    if (this.is('eclipse', 2)) this.zones.push({ x: to.x, y: to.y, r: 110, until: this.time + 3, mode: 'slow', color: '60,40,90' });
    if (this.is('eclipse', 4)) this.coronaUntil = this.time + 3;
  }

  /** Після ударної хвилі ривка: ланцюг блискавок (грім T2), електрозона (T3), оглушення неруйнівних (T4). */
  onShockwave(at: Vec2, radius: number, destroyed: number): void {
    const h = this.host;
    if (this.is('thunder', 2)) {
      const far = h.asteroids().filter((a) => a.alive && h.destructible(a) && dist(a.pos, at) < radius + 200).sort((a, b) => dist(a.pos, at) - dist(b.pos, at)).slice(0, 2);
      for (const a of far) {
        this.lightning(at, a.pos);
        h.smash(a);
      }
    }
    if (this.is('thunder', 3)) this.zones.push({ x: at.x, y: at.y, r: 120, until: this.time + 3, mode: 'smash-medium', color: '140,200,255' });
    if (this.is('thunder', 4)) {
      for (const a of h.asteroids()) if (a.alive && (a instanceof BossAsteroid || a instanceof BlackHole) && dist(a.pos, at) < radius * 1.5) this.frozenUntil.set(a, this.time + 2);
    }
    if (this.is('nova', 3)) {
      this.novaKills += destroyed;
      while (this.novaKills >= 4) {
        this.novaKills -= 4;
        h.skills.addBoost(1);
        h.float(at.x, at.y - 40, '+1 ⚡', '#ffd8ff');
      }
    }
  }

  // ---------- оновлення ----------

  private pending: { at: number; fn: () => void }[] = [];

  private later(delay: number, fn: () => void): void {
    this.pending.push({ at: this.time + delay, fn });
  }

  update(dt: number, running: boolean): void {
    this.time += dt;
    const h = this.host;
    const p = h.player;
    this.history.push({ t: this.time, x: p.pos.x, y: p.pos.y });
    while (this.history.length && this.history[0].t < this.time - 2.5) this.history.shift();
    if (this.pending.length) {
      const due = this.pending.filter((d) => d.at <= this.time);
      this.pending = this.pending.filter((d) => d.at > this.time);
      for (const d of due) d.fn();
    }
    this.zones = this.zones.filter((z) => z.until > this.time);
    if (!running) return;

    // форсаж: старт і кінець
    const boosted = h.skills.isBoosted;
    if (boosted && !this.wasBoosted && this.is('falcon', 3)) {
      for (const s of [-1, 1]) {
        const nose = p.pos.clone().add(Vec2.fromAngle(p.angle + s * 0.5, 18));
        h.addProjectile(new Projectile('rocket', nose, p.angle + s * 0.08, 620, 10, 70));
      }
    }
    if (!boosted && this.wasBoosted && this.is('falcon', 4)) {
      p.invulnerable = Math.max(p.invulnerable, 2);
      h.ring(p.pos.x, p.pos.y, 90, '120,200,255', 0.5);
    }
    this.wasBoosted = boosted;
    if (boosted && this.is('falcon', 2) && this.time >= this.trailAt) {
      this.trailAt = this.time + 0.06;
      const ex = p.exhaust();
      this.zones.push({ x: ex.x, y: ex.y, r: 22, until: this.time + 1, mode: 'smash-small', color: '255,200,90', trail: true });
      h.particles.emit(ex.x, ex.y, { count: 2, speed: [10, 40], life: [0.5, 1], size: [2, 4], colors: ['#fff1a8', '#6fc6ff'], drag: 2 });
    }

    // заморозка: кінець → оса T2 (отрута-сповільнення), хронос T4 (стоп-кадр)
    const frozen = h.skills.isFrozen;
    if (!frozen && this.wasFrozen) {
      if (this.is('wasp', 2)) this.setSlow(2.5, 0.5);
      if (this.is('chronos', 4)) this.setSlow(2, 0.5);
    }
    this.wasFrozen = frozen;

    // зони: руйнують дрібні/середні астероїди
    for (const z of this.zones) {
      if (z.mode !== 'smash-small' && z.mode !== 'smash-medium') continue;
      for (const a of h.asteroids()) {
        if (!a.alive || !h.destructible(a) || a.size === 'large' || (z.mode === 'smash-small' && a.size !== 'small')) continue;
        if (dist(a.pos, z) < z.r + a.radius) {
          h.smash(a, false);
          this.viperRefund();
        }
      }
    }
    // отруєні гадюкою розсипаються
    for (const a of h.asteroids()) {
      const at = this.doomAt.get(a);
      if (at !== undefined && at <= this.time && a.alive) {
        h.smash(a, false);
        this.viperRefund();
      }
    }

    // ехо фантома
    if (this.echo) {
      if (this.echo.until < this.time) this.echo = null;
      else this.smashNear(this.echo.x, this.echo.y, 26, 'medium');
    }

    // дрони оси
    this.drones = this.drones.filter((d) => d.until > this.time);
    for (const d of this.drones) {
      d.phase += dt * 3.2;
      d.pos.set(p.pos.x + Math.cos(d.phase) * 60, p.pos.y + Math.sin(d.phase) * 60);
      this.smashNear(d.pos.x, d.pos.y, 14, 'small');
      if (this.is('wasp', 4) && this.time >= d.shootAt) {
        const target = this.nearest(d.pos, 320, (a) => a.size !== 'large');
        if (target) {
          d.shootAt = this.time + 0.7;
          const ang = Math.atan2(target.pos.y - d.pos.y, target.pos.x - d.pos.x);
          h.addProjectile(new Projectile('bullet', d.pos.clone(), ang, 900, 1, 0));
        }
      }
    }

    // турелі бастіона
    this.turrets = this.turrets.filter((t) => t.until > this.time);
    for (const t of this.turrets) {
      if (this.time < t.shootAt) continue;
      const at = new Vec2(t.x, t.y);
      const target = this.nearest(at, 380, (a) => a.size !== 'large');
      if (!target) continue;
      t.shootAt = this.time + 0.6;
      const ang = Math.atan2(target.pos.y - t.y, target.pos.x - t.x);
      h.addProjectile(new Projectile(target.size === 'medium' ? 'rocket' : 'bullet', at, ang, 760, 1, 40));
    }

    // колектор T3: магнітний імпульс
    if (this.is('collector', 3) && this.time >= this.pulseAt) {
      this.pulseAt = this.time + 6;
      let pushed = 0;
      for (const a of h.asteroids()) {
        if (!a.alive || a.size === 'large' || !h.destructible(a)) continue;
        const d = dist(a.pos, p.pos);
        if (d > 160 || d < 1) continue;
        a.vel.add(new Vec2(a.pos.x - p.pos.x, a.pos.y - p.pos.y).normalize().scale(260));
        pushed++;
      }
      if (pushed) h.ring(p.pos.x, p.pos.y, 160, '120,220,255', 0.4);
    }

    // титан T4: аура щита
    if (this.is('titan', 4) && p.shield) this.smashNear(p.pos.x, p.pos.y, 85, 'small');

    // НЛО T3: антиграв-поле відводить астероїди
    if (this.is('ufo', 3)) {
      for (const a of h.asteroids()) {
        if (!a.alive || !h.destructible(a)) continue;
        const d = dist(a.pos, p.pos);
        if (d < 110 + a.radius && d > 1) a.pos.add(new Vec2(a.pos.x - p.pos.x, a.pos.y - p.pos.y).normalize(), 140 * dt);
      }
    }

    // затемнення T4: корона після ривка
    if (this.coronaUntil > this.time && this.time >= this.coronaAt) {
      this.coronaAt = this.time + 0.5;
      h.ring(p.pos.x, p.pos.y, 120, '255,200,80', 0.35);
      this.smashNear(p.pos.x, p.pos.y, 120, 'medium');
    }

    // фенікс T3: вогняний таран
    if (this.fireRam) {
      for (const a of h.asteroids()) if (a.alive && h.destructible(a) && dist(a.pos, p.pos) < p.radius + a.radius + 6) h.smash(a);
      h.particles.emit(p.pos.x, p.pos.y, { count: 2, speed: [30, 90], life: [0.3, 0.6], size: [3, 6], colors: ['#fff1a8', '#ff8a1f', '#ff3a1a'], drag: 2 });
    }
  }

  private setSlow(dur: number, mul: number): void {
    this.slowUntil = Math.max(this.slowUntil, this.time + dur);
    this.slowMul = Math.min(this.slowUntil > this.time ? this.slowMul : 1, mul);
  }

  /** Гадюка T4: знищення ривком/отрутою/хмарою повертає заряд ривка (не частіше раз на секунду). */
  private viperRefund(): void {
    if (!this.is('viper', 4) || this.time - this.viperRefundAt < 1) return;
    const s = this.host.skills;
    if (s.jumpCharges >= s.jumpChargesMax) return;
    this.viperRefundAt = this.time;
    s.jumpCharges++;
    if (s.jumpCharges >= s.jumpChargesMax) s.jumpCooldown = 0;
  }

  private smashNear(x: number, y: number, r: number, max: 'small' | 'medium'): void {
    const h = this.host;
    for (const a of h.asteroids()) {
      if (!a.alive || !h.destructible(a) || a.size === 'large' || (max === 'small' && a.size !== 'small')) continue;
      if (Math.hypot(a.pos.x - x, a.pos.y - y) < r + a.radius) h.smash(a, false);
    }
  }

  private nearest(at: Vec2, range: number, ok: (a: Asteroid) => boolean): Asteroid | null {
    let best: Asteroid | null = null;
    let bestD = range;
    for (const a of this.host.asteroids()) {
      if (!a.alive || !this.host.destructible(a) || !ok(a)) continue;
      const d = dist(a.pos, at);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  private lightning(from: Vec2, to: Vec2): void {
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      this.host.particles.emit(from.x + (to.x - from.x) * k + rand(-8, 8), from.y + (to.y - from.y) * k + rand(-8, 8), { count: 2, speed: [10, 50], life: [0.1, 0.25], size: [2, 3], colors: ['#ffffff', '#9ad8ff'] });
    }
  }

  // ---------- рендер ----------

  render(ctx: CanvasRenderingContext2D, clock: number): void {
    for (const z of this.zones) {
      const left = z.until - this.time;
      const k = Math.min(1, left * 2);
      if (z.trail) {
        drawGlow(ctx, z.x, z.y, `rgba(${z.color},1)`, z.r * 1.2, 0.35 * k);
        continue;
      }
      drawGlow(ctx, z.x, z.y, `rgba(${z.color},1)`, z.r * 1.1, (z.mode === 'slow' ? 0.5 : 0.3) * k);
      ctx.strokeStyle = `rgba(${z.color},${0.55 * k})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, clock, clock + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.slowUntil > this.time) {
      const p = this.host.player.pos;
      drawGlow(ctx, p.x, p.y, 'rgba(160,120,255,1)', 140, 0.2);
    }
    if (this.echo) {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(clock * 12) * 0.1;
      ctx.translate(this.echo.x, this.echo.y);
      ctx.rotate(this.echo.angle + Math.PI / 2);
      drawPlane(ctx, this.planeId, 56, clock, this.tier, 1);
      ctx.restore();
    }
    for (const d of this.drones) {
      drawGlow(ctx, d.pos.x, d.pos.y, 'rgba(245,197,24,1)', 16, 0.6);
      ctx.fillStyle = '#f5c518';
      ctx.fillRect(d.pos.x - 3, d.pos.y - 4, 6, 8);
      ctx.fillStyle = '#1a1a22';
      ctx.fillRect(d.pos.x - 3, d.pos.y - 1, 6, 2);
      ctx.fillStyle = 'rgba(207,238,255,0.8)';
      ctx.fillRect(d.pos.x - 7, d.pos.y - 4, 4, 2);
      ctx.fillRect(d.pos.x + 3, d.pos.y - 4, 4, 2);
    }
    for (const t of this.turrets) {
      const k = Math.min(1, (t.until - this.time) * 2);
      ctx.globalAlpha = k;
      drawGlow(ctx, t.x, t.y, 'rgba(255,150,70,1)', 22, 0.5);
      ctx.fillStyle = '#5a6070';
      ctx.fillRect(t.x - 7, t.y - 7, 14, 14);
      ctx.fillStyle = '#e8742a';
      ctx.fillRect(t.x - 2, t.y - 11, 4, 8);
      ctx.globalAlpha = 1;
    }
    if (this.coronaUntil > this.time) {
      const p = this.host.player.pos;
      drawGlow(ctx, p.x, p.y, 'rgba(255,200,80,1)', 120, 0.2 + Math.sin(clock * 12) * 0.08);
    }
  }
}
