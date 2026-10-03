import { drawAsteroid } from '../AsteroidArt';
import { Vec2, rand } from '../../core/math';
import { drawGlow } from '../fx';
import { beam, starFlare } from '../vfx';
import { Asteroid } from './Asteroid';
import { Entity, type WorldView } from './Entity';

export const MINE_TRIGGER_RADIUS = 115;
export const MINE_BLAST_RADIUS = 135;
const MINE_ARM_TIME = 1.2;
const MINE_FUSE = 0.75;
const MINE_LIFETIME = 16;

/**
 * Міна: з'являється, озброюється, а коли літак підлітає близько — запускає таймер і вибухає.
 * Сама нікого не вбиває при зіткненні — шкоду рахує Game за радіусом вибуху.
 */
export class Mine extends Entity {
  private age = 0;
  private fuse = -1;
  /** Пора вибухати (Game обробить і прибере міну) */
  detonate = false;

  constructor(pos: Vec2) {
    super(pos, new Vec2(), 14);
  }

  get collidable(): boolean {
    return false;
  }

  get armed(): boolean {
    return this.age >= MINE_ARM_TIME;
  }

  get fusing(): boolean {
    return this.fuse >= 0;
  }

  /** Запустити таймер (від наближення гравця чи сусіднього вибуху). */
  trigger(): void {
    if (this.fuse < 0) this.fuse = MINE_FUSE;
  }

  update(dt: number, world: WorldView): void {
    this.age += dt;
    if (this.fuse >= 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) this.detonate = true;
      return;
    }
    if (this.armed && Vec2.dist(this.pos, world.playerPos) < MINE_TRIGGER_RADIUS) this.trigger();
    if (this.age > MINE_LIFETIME) this.kill();
  }

  /** Тільки вогник і радіус — малюються поверх туману, щоб гравець бачив загрозу. */
  renderSignal(ctx: CanvasRenderingContext2D, time: number): void {
    const { x, y } = this.pos;
    const rate = this.fusing ? 18 : this.armed ? 3 : 8;
    const on = Math.sin(time * rate) > 0;
    if (this.fusing) {
      // радіус вибуху наповнюється, дуга-таймер добігає кінця
      const k = 1 - this.fuse / MINE_FUSE;
      const g = ctx.createRadialGradient(x, y, 0, x, y, MINE_BLAST_RADIUS);
      g.addColorStop(0, `rgba(255,80,40,${0.05 + k * 0.25})`);
      g.addColorStop(k * 0.95 + 0.01, `rgba(255,60,40,${0.12 + k * 0.2})`);
      g.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, MINE_BLAST_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,80,60,${0.6 + k * 0.4})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = time * 80;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,230,180,0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      ctx.stroke();
    }
    if (on) {
      drawGlow(ctx, x, y - 2, 'rgba(255,40,30,1)', this.fusing ? 30 : 16, 0.9);
      if (this.fusing) starFlare(ctx, x, y - 2, 22, '#ff4a3a', 0.8, time * 4);
    }
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    const { x, y } = this.pos;
    const appear = Math.min(1, this.age / 0.4);
    ctx.globalAlpha = this.armed ? 1 : 0.5;
    if (this.armed && !this.fusing) {
      // радар міни: сектор, що обертається, і пунктир радіуса спрацювання
      ctx.strokeStyle = 'rgba(255,90,70,0.2)';
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -time * 20;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, MINE_TRIGGER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const sweep = time * 2.2;
      const g = ctx.createRadialGradient(x, y, 10, x, y, MINE_TRIGGER_RADIUS);
      g.addColorStop(0, 'rgba(255,70,50,0.18)');
      g.addColorStop(1, 'rgba(255,70,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, MINE_TRIGGER_RADIUS, sweep, sweep + 0.6);
      ctx.closePath();
      ctx.fill();
    }
    // шипи
    ctx.strokeStyle = '#6b6f80';
    ctx.lineWidth = 3;
    const r = 15 * appear;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + time * 0.3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
      ctx.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, r);
    g.addColorStop(0, '#9aa0b4');
    g.addColorStop(1, '#2a2c38');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    this.renderSignal(ctx, time);
  }
}

const LASER_WARN = 1.3;
const LASER_ACTIVE = 1.4;

/** Лазерний бар'єр: промінь через увесь екран. Спершу мерехтить, потім вмикається на ~1.4 с. */
export class LaserGate extends Entity {
  private t = 0;
  private readonly a: Vec2;
  private readonly b: Vec2;
  private warned = false;

  constructor(center: Vec2, angle: number) {
    super(center, new Vec2(), 10);
    const d = Vec2.fromAngle(angle, 3000);
    this.a = new Vec2(center.x - d.x, center.y - d.y);
    this.b = new Vec2(center.x + d.x, center.y + d.y);
  }

  get collidable(): boolean {
    return false;
  }

  get active(): boolean {
    return this.t >= LASER_WARN && this.t < LASER_WARN + LASER_ACTIVE;
  }

  /** true рівно один раз — коли промінь вмикається (для звуку/тряски). */
  justFired(): boolean {
    if (this.active && !this.warned) {
      this.warned = true;
      return true;
    }
    return false;
  }

  update(dt: number, _world: WorldView): void {
    this.t += dt;
    if (this.t >= LASER_WARN + LASER_ACTIVE) this.kill();
  }

  distanceTo(p: Vec2): number {
    const abx = this.b.x - this.a.x;
    const aby = this.b.y - this.a.y;
    const k = Math.max(0, Math.min(1, ((p.x - this.a.x) * abx + (p.y - this.a.y) * aby) / (abx * abx + aby * aby)));
    return Math.hypot(p.x - (this.a.x + abx * k), p.y - (this.a.y + aby * k));
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.lineCap = 'round';
    if (!this.active) {
      // заряд: пунктир мерехтить частіше, а в центрі збирається енергія
      const k = this.t / LASER_WARN;
      ctx.strokeStyle = `rgba(255,60,90,${(0.25 + 0.5 * k) * (Math.sin(time * (20 + k * 30)) > -0.3 ? 1 : 0.2)})`;
      ctx.lineWidth = 1 + k * 2;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -time * 200;
      ctx.beginPath();
      ctx.moveTo(this.a.x, this.a.y);
      ctx.lineTo(this.b.x, this.b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const { x, y } = this.pos;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63 + time * 3;
        const d = (1 - ((time * 2 + i / 10) % 1)) * 90 * (1 - k * 0.5);
        ctx.fillStyle = `rgba(255,120,160,${0.8 * k})`;
        ctx.fillRect(x + Math.cos(a) * d - 1.5, y + Math.sin(a) * d - 1.5, 3, 3);
      }
      ctx.restore();
      drawGlow(ctx, x, y, 'rgba(255,60,110,1)', 20 + k * 40, k);
      ctx.lineCap = 'butt';
      return;
    }
    const fade = Math.min(1, (LASER_WARN + LASER_ACTIVE - this.t) * 6, (this.t - LASER_WARN) * 10 + 0.3);
    beam(ctx, this.a.x, this.a.y, this.b.x, this.b.y, fade, time, { color: '#ff3c78', width: 11 });
    ctx.lineCap = 'butt';
  }
}

/**
 * Бос: велетенський астероїд, що весь рівень відбивається від країв
 * і періодично вистрілює кільцем уламків. Знищити його не можна — лише вижити.
 */
export class BossAsteroid extends Asteroid {
  private burstTimer: number;
  private entered = false;
  /** Пора випустити кільце уламків (Game обробить) */
  pendingBurst = false;

  constructor(
    pos: Vec2,
    vel: Vec2,
    private readonly burstEvery: number,
  ) {
    super('large', pos, vel);
    this.visual = 105;
    this.radius = 82;
    this.burstTimer = burstEvery * 0.6;
  }

  update(dt: number, world: WorldView): void {
    this.pos.add(this.vel, dt);
    this.rotation += 0.25 * dt;
    const r = this.visual;
    const inside = this.pos.x > r && this.pos.x < world.width - r && this.pos.y > r && this.pos.y < world.height - r;
    if (!this.entered) {
      this.entered = inside;
    } else {
      if ((this.pos.x < r && this.vel.x < 0) || (this.pos.x > world.width - r && this.vel.x > 0)) this.vel.x *= -1;
      if ((this.pos.y < r && this.vel.y < 0) || (this.pos.y > world.height - r && this.vel.y > 0)) this.vel.y *= -1;
    }
    this.burstTimer -= dt;
    if (this.burstTimer <= 0 && this.entered) {
      this.burstTimer = this.burstEvery * rand(0.85, 1.15);
      this.pendingBurst = true;
    }
  }

  /** Наскільки скоро постріл (0..1) — для пульсації ауры. */
  private get charge(): number {
    return Math.max(0, 1 - this.burstTimer / 1.2);
  }

  protected renderAura(ctx: CanvasRenderingContext2D, time: number): void {
    const c = this.charge;
    drawGlow(ctx, this.pos.x, this.pos.y, 'rgba(255,60,30,1)', this.visual * (1.7 + c * 0.4), 0.55 + 0.25 * Math.sin(time * (4 + c * 20)));
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    this.renderAura(ctx, time);
    const d = this.visual * 2;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rotation);
    drawAsteroid(ctx, 'boss', this.variant, d);
    ctx.restore();
    if (this.charge > 0) {
      // заряд залпу: кільце стискається, лава стікається до каменя
      const c = this.charge;
      ctx.strokeStyle = `rgba(255,200,120,${c})`;
      ctx.lineWidth = 3 + c * 3;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.visual * (1.35 - c * 0.25), 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        const a = i * 0.39 + time;
        const d = this.visual * (1.1 + (1 - ((time * 1.5 + i / 16) % 1)) * 0.9);
        ctx.fillStyle = `rgba(255,${150 + i * 5},80,${c})`;
        ctx.fillRect(this.pos.x + Math.cos(a) * d - 2, this.pos.y + Math.sin(a) * d - 2, 4, 4);
      }
      ctx.restore();
    }
    if (this.frozen) {
      ctx.strokeStyle = 'rgba(200,235,255,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.visual * 0.95, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
