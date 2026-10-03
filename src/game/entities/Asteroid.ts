import { Vec2, angleDiff, rand } from '../../core/math';
import { drawGlow } from '../fx';
import { iceShell, starFlare } from '../vfx';
import { ASTEROID_VARIANTS, drawAsteroid } from '../AsteroidArt';
import { Entity, type WorldView } from './Entity';

export type AsteroidSize = 'small' | 'medium' | 'large';

interface SizeSpec {
  /** Видимий радіус спрайта */
  visual: number;
  /** Базова швидкість, px/s */
  speed: number;
}

export const ASTEROID_SIZES: Record<AsteroidSize, SizeSpec> = {
  small: { visual: 17, speed: 230 },
  medium: { visual: 27, speed: 165 },
  large: { visual: 42, speed: 115 },
};

/** Хітбокс трохи менший за картинку — щоб зіткнення відчувались чесними. */
const HITBOX_FACTOR = 0.8;

/** Звичайний астероїд: летить по прямій і обертається. */
export class Asteroid extends Entity {
  protected rotation = rand(0, Math.PI * 2);
  protected readonly spin = rand(-1.2, 1.2);
  /** Варіант форми каменю */
  protected readonly variant = Math.floor(rand(0, ASTEROID_VARIANTS));
  visual: number;
  /** Чи заморожений (для відмальовки) */
  frozen = false;

  constructor(
    readonly size: AsteroidSize,
    pos: Vec2,
    vel: Vec2,
  ) {
    const spec = ASTEROID_SIZES[size];
    super(pos, vel, spec.visual * HITBOX_FACTOR);
    this.visual = spec.visual;
  }

  update(dt: number, _world: WorldView): void {
    this.pos.add(this.vel, dt);
    this.rotation += this.spin * dt;
  }

  protected renderAura(_ctx: CanvasRenderingContext2D, _time: number): void {}

  render(ctx: CanvasRenderingContext2D, time: number): void {
    this.renderAura(ctx, time);
    const d = this.visual * 2;
    // жар лави навколо каменя
    drawGlow(ctx, this.pos.x, this.pos.y, 'rgba(255,110,30,1)', this.visual * 1.25, 0.22);
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rotation);
    drawAsteroid(ctx, this.size, this.variant, d);
    ctx.restore();
    if (this.frozen) iceShell(ctx, this.pos.x, this.pos.y, this.visual, time);
  }
}

/** Мисливець: кілька секунд повертає слідом за гравцем. */
export class HomingAsteroid extends Asteroid {
  private homeTime = 3.2;
  private readonly turnRate = 1.5;

  update(dt: number, world: WorldView): void {
    if (this.homeTime > 0) {
      this.homeTime -= dt;
      const speed = this.vel.length();
      const want = Math.atan2(world.playerPos.y - this.pos.y, world.playerPos.x - this.pos.x);
      const cur = this.vel.angle();
      const d = angleDiff(cur, want);
      const step = Math.sign(d) * Math.min(Math.abs(d), this.turnRate * dt);
      this.vel.copy(Vec2.fromAngle(cur + step, speed));
    }
    super.update(dt, world);
  }

  protected renderAura(ctx: CanvasRenderingContext2D, time: number): void {
    const pulse = this.homeTime > 0 ? 0.75 + 0.25 * Math.sin(time * 10) : 0.35;
    drawGlow(ctx, this.pos.x, this.pos.y, 'rgba(255,50,40,1)', this.visual * 1.9, pulse);
  }
}

/** Рикошетний: відбивається від країв екрана, поки не скінчиться заряд. */
export class BouncingAsteroid extends Asteroid {
  private bounceTime = 9;
  private entered = false;

  update(dt: number, world: WorldView): void {
    super.update(dt, world);
    const r = this.visual;
    const inside = this.pos.x > r && this.pos.x < world.width - r && this.pos.y > r && this.pos.y < world.height - r;
    if (!this.entered) {
      this.entered = inside;
      return;
    }
    this.bounceTime -= dt;
    if (this.bounceTime <= 0) return;
    if ((this.pos.x < r && this.vel.x < 0) || (this.pos.x > world.width - r && this.vel.x > 0)) this.vel.x *= -1;
    if ((this.pos.y < r && this.vel.y < 0) || (this.pos.y > world.height - r && this.vel.y > 0)) this.vel.y *= -1;
  }

  protected renderAura(ctx: CanvasRenderingContext2D, time: number): void {
    const active = this.bounceTime > 0;
    drawGlow(ctx, this.pos.x, this.pos.y, 'rgba(40,200,255,1)', this.visual * 1.8, active ? 0.7 : 0.25);
    if (!active) return;
    ctx.strokeStyle = `rgba(120,230,255,${0.55 + 0.25 * Math.sin(time * 6)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -time * 30;
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, this.visual * 1.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

export const COMET_WARN_TIME = 1.1;

/** Комета: спершу попередження з траєкторією, потім дуже швидкий проліт по прямій. */
export class Comet extends Asteroid {
  private warn = COMET_WARN_TIME;
  private readonly dir: Vec2;
  private readonly speed: number;

  constructor(pos: Vec2, dir: Vec2, speed: number) {
    super('small', pos, new Vec2());
    this.dir = dir.clone().normalize();
    this.speed = speed;
    this.radius = 11;
  }

  get collidable(): boolean {
    return this.alive && this.warn <= 0;
  }

  get warning(): boolean {
    return this.warn > 0;
  }

  update(dt: number, world: WorldView): void {
    if (this.warn > 0) {
      this.warn -= dt;
      if (this.warn <= 0) this.vel.copy(this.dir).scale(this.speed);
      return;
    }
    super.update(dt, world);
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.warn > 0) {
      // траєкторія: пунктир і шеврони, що біжать уздовж, і світна смуга, що звужується перед стартом
      const k = 1 - this.warn / COMET_WARN_TIME;
      const a = 0.35 + 0.35 * Math.abs(Math.sin(time * 14));
      const x2 = this.pos.x + this.dir.x * 4000;
      const y2 = this.pos.y + this.dir.y * 4000;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,60,40,${0.12 + k * 0.15})`;
      ctx.lineWidth = 30 * (1 - k) + 4;
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = `rgba(255,70,60,${a})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -time * 160;
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      const px = -this.dir.y;
      const py = this.dir.x;
      ctx.strokeStyle = `rgba(255,190,120,${a})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const d = ((time * 420 + i * 140) % 1680) + 40;
        const cx = this.pos.x + this.dir.x * d;
        const cy = this.pos.y + this.dir.y * d;
        ctx.beginPath();
        ctx.moveTo(cx - this.dir.x * 10 + px * 9, cy - this.dir.y * 10 + py * 9);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx - this.dir.x * 10 - px * 9, cy - this.dir.y * 10 - py * 9);
        ctx.stroke();
      }
      drawGlow(ctx, this.pos.x, this.pos.y, 'rgba(255,80,50,1)', 30 + k * 30, 0.6 + k * 0.4);
      return;
    }
    // хвіст: три шари полум'я різної довжини, що тремтять, + іскри вздовж
    const { x, y } = this.pos;
    const px = -this.dir.y;
    const py = this.dir.x;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const layers: [number, number, string, string][] = [
      [260, 30, 'rgba(255,90,30,0.35)', 'rgba(255,40,10,0)'],
      [190, 18, 'rgba(255,170,60,0.7)', 'rgba(255,90,30,0)'],
      [110, 8, 'rgba(255,250,220,0.95)', 'rgba(255,200,120,0)'],
    ];
    for (const [len, w, c0, c1] of layers) {
      const wob = Math.sin(time * 30 + len) * w * 0.15;
      const tx = x - this.dir.x * len;
      const ty = y - this.dir.y * len;
      const g = ctx.createLinearGradient(x, y, tx, ty);
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + px * w, y + py * w);
      ctx.quadraticCurveTo(x - this.dir.x * len * 0.5 + px * (w * 0.6 + wob), y - this.dir.y * len * 0.5 + py * (w * 0.6 + wob), tx, ty);
      ctx.quadraticCurveTo(x - this.dir.x * len * 0.5 - px * (w * 0.6 - wob), y - this.dir.y * len * 0.5 - py * (w * 0.6 - wob), x - px * w, y - py * w);
      ctx.closePath();
      ctx.fill();
    }
    // іскри, що відстають
    for (let i = 0; i < 8; i++) {
      const k = (time * 3 + i / 8) % 1;
      const off = Math.sin(i * 12.9 + time * 9) * 14 * k;
      ctx.fillStyle = `rgba(255,${200 - k * 120},${120 - k * 100},${1 - k})`;
      ctx.fillRect(x - this.dir.x * k * 220 + px * off - 1.5, y - this.dir.y * k * 220 + py * off - 1.5, 3, 3);
    }
    ctx.restore();
    drawGlow(ctx, x, y, 'rgba(255,170,60,1)', 46, 0.95);
    super.render(ctx, time);
    starFlare(ctx, x, y, 34, '#ffd27a', 0.8, time * 3);
  }
}

export const BLACK_HOLE_PULL_RADIUS = 420;

/**
 * Чорна діра: повільно перетинає екран і притягує літак та астероїди.
 * Зіткнення з ядром — смерть (щит рятує). Заморозка зупиняє й притягання.
 */
export class BlackHole extends Asteroid {
  /** Сила притягання в центрі, px/s² */
  readonly strength: number;
  private readonly ringSpin = rand(1.5, 2.5) * (Math.random() < 0.5 ? -1 : 1);

  constructor(pos: Vec2, vel: Vec2, strength: number) {
    super('large', pos, vel);
    this.visual = 34;
    this.radius = 24;
    this.strength = strength;
  }

  /** Прискорення, яке діра дає об'єкту в точці p. */
  pullAt(p: Vec2, out: Vec2): Vec2 {
    const dx = this.pos.x - p.x;
    const dy = this.pos.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= BLACK_HOLE_PULL_RADIUS || d < 1) return out.set(0, 0);
    const k = this.strength * (1 - d / BLACK_HOLE_PULL_RADIUS);
    return out.set((dx / d) * k, (dy / d) * k);
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    renderBlackHole(ctx, this.pos.x, this.pos.y, this.visual, this.frozen ? 0 : time * this.ringSpin, time, this.frozen);
  }
}

/**
 * Чорна діра: темне "лінзування" навколо, нахилений диск акреції (задня половина за горизонтом,
 * передня — перед ним), фотонне кільце, пил, що закручується по спіралі всередину, і хвилі притягання.
 */
export function renderBlackHole(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, time: number, frozen: boolean): void {
  const R = BLACK_HOLE_PULL_RADIUS;
  // зона притягання: фіолетовий серпанок і кільця, що стягуються до центру
  const zone = ctx.createRadialGradient(x, y, r, x, y, R);
  zone.addColorStop(0, 'rgba(120,60,255,0.28)');
  zone.addColorStop(0.5, 'rgba(90,40,200,0.1)');
  zone.addColorStop(1, 'rgba(90,40,200,0)');
  ctx.fillStyle = zone;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  if (!frozen) {
    for (let i = 0; i < 3; i++) {
      const k = 1 - ((time * 0.45 + i / 3) % 1);
      ctx.strokeStyle = `rgba(170,120,255,${0.22 * (1 - k) * k * 4})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.6 + (R - r * 1.6) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // пил, що спірально падає всередину
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 46; i++) {
    const seed = i * 7.31;
    const life = (time * (0.25 + (i % 5) * 0.04) + (seed % 1)) % 1;
    const dist = r * 1.3 + (R * 0.7 - r * 1.3) * (1 - life);
    const ang = seed + spin * 0.6 + life * 5.5;
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist * 0.85;
    const a = Math.min(1, life * 1.5) * 0.8;
    ctx.fillStyle = i % 3 === 0 ? `rgba(255,210,150,${a})` : `rgba(190,150,255,${a})`;
    const sz = 1 + life * 2;
    ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  ctx.restore();

  const tilt = 0.32;
  const disk = (front: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, tilt);
    // передня половина диска (нижня) малюється поверх горизонту, задня (верхня) — під ним
    const big = r * 4;
    ctx.beginPath();
    ctx.rect(-big, front ? 0 : -big, big * 2, big);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const rr = r * (1.35 + i * 0.38);
      const colors = ['255,240,210', '255,180,90', '255,110,60', '200,90,255'];
      for (let j = 0; j < 3; j++) {
        const a0 = spin * (1.4 - i * 0.2) + j * ((Math.PI * 2) / 3) + i;
        ctx.strokeStyle = `rgba(${colors[i]},${0.75 - i * 0.14})`;
        ctx.lineWidth = (5 - i) / tilt * 0.5;
        ctx.beginPath();
        ctx.arc(0, 0, rr, a0, a0 + 1.4);
        ctx.stroke();
      }
    }
    // суцільне сяйво диска — кільцем (центр лишається чорним)
    const g = ctx.createRadialGradient(0, 0, r * 1.2, 0, 0, r * 3);
    g.addColorStop(0, 'rgba(255,200,120,0)');
    g.addColorStop(0.12, 'rgba(255,200,120,0.55)');
    g.addColorStop(0.5, 'rgba(255,120,60,0.25)');
    g.addColorStop(1, 'rgba(160,80,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
    ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.restore();
  };
  // задня частина диска, яку видно "над" діркою через викривлення світла
  disk(false);
  // гало від вигнутого світла і кільце лінзованого диска над горизонтом
  drawGlow(ctx, x, y, 'rgba(255,170,90,1)', r * 2.4, 0.45);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lens = ctx.createRadialGradient(x, y, r * 1.05, x, y, r * 1.6);
  lens.addColorStop(0, 'rgba(255,220,160,0.9)');
  lens.addColorStop(0.4, 'rgba(255,140,70,0.45)');
  lens.addColorStop(1, 'rgba(255,100,60,0)');
  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
  ctx.arc(x, y, r * 1.05, 0, Math.PI * 2, true);
  ctx.fill();
  ctx.restore();
  // горизонт подій
  const hz = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.08);
  hz.addColorStop(0, '#000');
  hz.addColorStop(0.92, '#000');
  hz.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hz;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.08, 0, Math.PI * 2);
  ctx.fill();
  // фотонне кільце
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = frozen ? 'rgba(200,235,255,0.95)' : `rgba(255,220,170,${0.75 + Math.sin(time * 6) * 0.15})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.02, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // передня частина диска — поверх горизонту
  disk(true);
  if (frozen) iceShell(ctx, x, y, r * 1.5, time);
}
