import { Assets, type ImageKey } from '../../core/assets';
import { Vec2, angleDiff, rand } from '../../core/math';
import { drawGlow } from '../fx';
import { Entity, type WorldView } from './Entity';

export type AsteroidSize = 'small' | 'medium' | 'large';

interface SizeSpec {
  /** Видимий радіус спрайта */
  visual: number;
  /** Базова швидкість, px/s */
  speed: number;
  sprite: ImageKey;
}

export const ASTEROID_SIZES: Record<AsteroidSize, SizeSpec> = {
  small: { visual: 17, speed: 230, sprite: 'astSmall' },
  medium: { visual: 27, speed: 165, sprite: 'astMedium' },
  large: { visual: 42, speed: 115, sprite: 'astLarge' },
};

/** Хітбокс трохи менший за картинку — щоб зіткнення відчувались чесними. */
const HITBOX_FACTOR = 0.8;

/** Звичайний астероїд: летить по прямій і обертається. */
export class Asteroid extends Entity {
  protected rotation = rand(0, Math.PI * 2);
  protected readonly spin = rand(-1.2, 1.2);
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
    const img = Assets.get(ASTEROID_SIZES[this.size].sprite);
    const d = this.visual * 2;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.rotation);
    ctx.drawImage(img, -d / 2, -d / 2, d, d);
    ctx.restore();
    if (this.frozen) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(90,170,255,0.28)';
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.visual * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(200,235,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
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
      const a = 0.35 + 0.35 * Math.abs(Math.sin(time * 14));
      ctx.strokeStyle = `rgba(255,70,60,${a})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 12]);
      ctx.lineDashOffset = -time * 120;
      ctx.beginPath();
      ctx.moveTo(this.pos.x, this.pos.y);
      ctx.lineTo(this.pos.x + this.dir.x * 4000, this.pos.y + this.dir.y * 4000);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    // хвіст
    const tail = 160;
    const tx = this.pos.x - this.dir.x * tail;
    const ty = this.pos.y - this.dir.y * tail;
    const g = ctx.createLinearGradient(this.pos.x, this.pos.y, tx, ty);
    g.addColorStop(0, 'rgba(255,230,150,0.95)');
    g.addColorStop(0.3, 'rgba(255,120,40,0.6)');
    g.addColorStop(1, 'rgba(255,60,20,0)');
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(this.pos.x, this.pos.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.lineCap = 'butt';
    drawGlow(ctx, this.pos.x, this.pos.y, 'rgba(255,170,60,1)', 40, 0.9);
    super.render(ctx, time);
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
    const { x, y } = this.pos;
    // зона притягання
    const zone = ctx.createRadialGradient(x, y, this.visual, x, y, BLACK_HOLE_PULL_RADIUS);
    zone.addColorStop(0, 'rgba(150,80,255,0.22)');
    zone.addColorStop(1, 'rgba(150,80,255,0)');
    ctx.fillStyle = zone;
    ctx.beginPath();
    ctx.arc(x, y, BLACK_HOLE_PULL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    drawGlow(ctx, x, y, 'rgba(255,140,60,1)', this.visual * 2.6, 0.55);

    // акреційний диск: дуги, що закручуються
    const spin = this.frozen ? 0 : time * this.ringSpin;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const r = this.visual * (1.25 + i * 0.32);
      ctx.strokeStyle = i === 0 ? 'rgba(255,200,120,0.9)' : i === 1 ? 'rgba(255,120,60,0.7)' : 'rgba(180,90,255,0.55)';
      ctx.lineWidth = 4 - i;
      for (let j = 0; j < 2; j++) {
        const a = spin * (1 + i * 0.3) + j * Math.PI + i;
        ctx.beginPath();
        ctx.arc(x, y, r, a, a + Math.PI * 0.7);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';

    // горизонт подій
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x, y, this.visual, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = this.frozen ? 'rgba(200,235,255,0.9)' : 'rgba(255,190,110,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
