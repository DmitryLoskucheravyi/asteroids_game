import { Vec2 } from '../../core/math';
import { Entity, type WorldView } from './Entity';

export type ProjectileKind = 'bullet' | 'rocket';

/** Дальність польоту (дзеркалить PROJECTILE_RANGE у server/src/content/weapons.ts). */
export const RANGE: Record<ProjectileKind, number> = { bullet: 900, rocket: 1000 };

/** Снаряд гравця: летить по прямій від точки спавну, гине на межі дальності або світу. */
export class Projectile extends Entity {
  private traveled = 0;
  readonly angle: number;

  constructor(
    readonly kind: ProjectileKind,
    pos: Vec2,
    angle: number,
    speed: number,
    readonly damage: number,
    readonly splashRadius: number,
    /** Ворожий снаряд (PvP) — інший колір трасера */
    readonly hostile = false,
    readonly ownerId: string | null = null,
  ) {
    super(pos, Vec2.fromAngle(angle, speed), kind === 'rocket' ? 6 : 2.5);
    this.angle = angle;
  }

  update(dt: number, world: WorldView): void {
    const step = this.vel.length() * dt;
    this.traveled += step;
    this.pos.add(this.vel, dt);
    if (this.traveled > RANGE[this.kind] || this.isOutside(world.width, world.height, 40)) this.kill();
  }

  render(ctx: CanvasRenderingContext2D, _time: number): void {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle + Math.PI / 2);
    if (this.kind === 'bullet') {
      // дрібна куля з трасером; ворожі — червоні й трохи довші, щоб їх було видно здалеку
      const len = this.hostile ? 22 : 16;
      const g = ctx.createLinearGradient(0, -3, 0, len);
      g.addColorStop(0, this.hostile ? 'rgba(255,120,100,0.95)' : 'rgba(220,250,255,0.95)');
      g.addColorStop(1, this.hostile ? 'rgba(255,60,60,0)' : 'rgba(120,220,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(this.hostile ? -1.3 : -1, -3, this.hostile ? 2.6 : 2, len + 3);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.hostile ? 'rgba(255,90,70,0.35)' : 'rgba(140,220,255,0.3)';
      ctx.beginPath();
      ctx.arc(0, -2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = this.hostile ? '#ffe0d8' : '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -2, 1.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#e6e9f0';
      ctx.fillRect(-2.2, -7, 4.4, 14);
      ctx.fillStyle = this.hostile ? '#ff2a6a' : '#ff4a3a';
      ctx.beginPath();
      ctx.ellipse(0, -8, 2.6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,170,60,0.9)';
      ctx.beginPath();
      ctx.ellipse(0, 10, 2.6, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
