import { ASTEROID_VARIANTS, drawAsteroid } from '../game/AsteroidArt';
import { drawGlow } from '../game/fx';
import { rand, pick } from '../core/math';
import { ASTEROID_SIZES, type AsteroidSize } from '../game/entities/Asteroid';
import { Starfield } from '../game/systems/Starfield';

interface Drifter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: AsteroidSize;
  variant: number;
  scale: number;
  alpha: number;
}

/** Живий фон для меню: зоряне небо + астероїди, що повільно пропливають. */
export class MenuBackdrop {
  private readonly stars = new Starfield(null);
  private drifters: Drifter[] = [];
  private w = 1;
  private h = 1;

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.stars.resize(w, h);
    if (!this.drifters.length) {
      for (let i = 0; i < 9; i++) this.drifters.push(this.make(true));
    }
  }

  private make(anywhere: boolean): Drifter {
    const size = pick(['small', 'medium', 'large'] as const);
    const depth = rand(0.5, 1.3);
    return {
      x: anywhere ? rand(0, this.w) : rand(-0.2, 1) * this.w,
      y: anywhere ? rand(0, this.h) : -120,
      vx: rand(-15, 25) * depth,
      vy: rand(15, 45) * depth,
      rot: rand(0, Math.PI * 2),
      spin: rand(-0.6, 0.6),
      size,
      variant: Math.floor(rand(0, ASTEROID_VARIANTS)),
      scale: depth * 1.8,
      alpha: Math.min(1, 0.45 + depth * 0.45),
    };
  }

  update(dt: number): void {
    this.stars.update(dt, 1.5);
    this.drifters = this.drifters.map((d) => {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      return d.y > this.h + 140 || d.x < -200 || d.x > this.w + 200 ? this.make(false) : d;
    });
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.stars.render(ctx);
    for (const d of this.drifters) {
      const s = ASTEROID_SIZES[d.size].visual * 2 * d.scale;
      drawGlow(ctx, d.x, d.y, 'rgba(255,110,30,1)', s * 0.6, 0.18 * d.alpha);
      ctx.globalAlpha = d.alpha;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      drawAsteroid(ctx, d.size, d.variant, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
