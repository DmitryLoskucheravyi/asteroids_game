import { Vec2 } from '../../core/math';
import { Entity, type WorldView } from './Entity';

export type ProjectileKind = 'bullet' | 'rocket';

const RANGE: Record<ProjectileKind, number> = { bullet: 620, rocket: 820 };

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
  ) {
    super(pos, Vec2.fromAngle(angle, speed), kind === 'rocket' ? 5 : 3);
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
      const g = ctx.createLinearGradient(0, -9, 0, 9);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#8fe3ff');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.2, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#e6e9f0';
      ctx.fillRect(-2.2, -7, 4.4, 14);
      ctx.fillStyle = '#ff4a3a';
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
