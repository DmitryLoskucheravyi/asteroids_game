import { drawPlane } from '../PlaneArt';
import { Vec2, angleDiff, clamp } from '../../core/math';
import type { PlaneSpec } from '../planes';
import { drawGlow } from '../fx';

const SPRITE_SIZE = 64;
const JUMP_DISTANCE = 190;
const JUMP_INVULN = 0.4;

/** Літак гравця. */
export class Player {
  readonly pos = new Vec2();
  readonly vel = new Vec2();
  /** Кут, куди дивиться ніс літака (рад) */
  angle = -Math.PI / 2;
  speedMultiplier = 1;
  shield = false;
  invulnerable = 0;
  private time = 0;

  constructor(readonly spec: PlaneSpec, readonly tier = 1, readonly level = 1) {}

  get radius(): number {
    return this.spec.radius;
  }

  reset(x: number, y: number): void {
    this.pos.set(x, y);
    this.vel.set(0, 0);
    this.angle = -Math.PI / 2;
    this.shield = false;
    this.invulnerable = 0;
    this.speedMultiplier = 1;
  }

  /**
   * У WinForms-версії тертя множилось на кожному кадрі без урахування dt,
   * тому швидкість залежала від FPS (і реально була ~100 px/s замість 320).
   * Тут — експоненційне згасання, однакове за будь-якої частоти кадрів.
   */
  /** Таймери анімації/невразливості — коли рух рахує зовнішня фізика (PvP). */
  tick(dt: number): void {
    this.time += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
  }

  update(dt: number, axis: { x: number; y: number }, w: number, h: number): void {
    this.tick(dt);

    const accel = this.spec.accel * this.speedMultiplier;
    this.vel.x += axis.x * accel * dt;
    this.vel.y += axis.y * accel * dt;
    const k = Math.exp(-this.spec.drag * dt);
    this.vel.scale(k);
    this.vel.clampLength(this.spec.maxSpeed * this.speedMultiplier);

    this.pos.add(this.vel, dt);
    this.clampTo(w, h);

    // плавний поворот носа за напрямом руху (тарілка просто повільно обертається)
    if (this.spec.feature.noRotate) {
      this.angle += dt * 1.5;
    } else if (this.vel.length() > 40) {
      const want = this.vel.angle();
      this.angle += angleDiff(this.angle, want) * Math.min(1, dt * 12);
    }
  }

  private clampTo(w: number, h: number): void {
    const r = this.radius;
    const x = clamp(this.pos.x, r, w - r);
    const y = clamp(this.pos.y, r, h - r);
    if (x !== this.pos.x) this.vel.x = 0;
    if (y !== this.pos.y) this.vel.y = 0;
    this.pos.set(x, y);
  }

  /** Ривок вперед. Повертає точку старту (для ефекту сліду). */
  jump(w: number, h: number): Vec2 {
    const from = this.pos.clone();
    const dir = this.vel.length() > 40 ? this.vel.clone().normalize() : Vec2.fromAngle(this.angle);
    this.pos.add(dir, JUMP_DISTANCE * (this.spec.feature.jumpDistanceMul ?? 1));
    this.clampTo(w, h);
    this.vel.copy(dir).scale(this.spec.maxSpeed * 0.8);
    this.invulnerable = Math.max(this.invulnerable, JUMP_INVULN);
    return from;
  }

  /** Напрям "назад" для вихлопу: у тарілки — протилежно руху. */
  get exhaustAngle(): number {
    if (this.spec.feature.noRotate) return this.vel.length() > 20 ? this.vel.angle() + Math.PI : Math.PI / 2;
    return this.angle + Math.PI;
  }

  /** Точка за хвостом — звідти летить вихлоп. */
  exhaust(): Vec2 {
    const a = this.exhaustAngle;
    const r = this.spec.feature.noRotate ? 18 : 26;
    return new Vec2(this.pos.x + Math.cos(a) * r, this.pos.y + Math.sin(a) * r);
  }

  /** Точка перед носом — звідти стартують снаряди. */
  nose(): Vec2 {
    const a = this.spec.feature.noRotate ? -Math.PI / 2 : this.angle;
    const r = this.spec.feature.noRotate ? 18 : 24;
    return new Vec2(this.pos.x + Math.cos(a) * r, this.pos.y + Math.sin(a) * r);
  }

  render(ctx: CanvasRenderingContext2D, boosted: boolean): void {
    // мерехтіння під час невразливості
    if (this.invulnerable > 0 && Math.floor(this.time * 20) % 2 === 0) return;

    const [inner, outer] = this.spec.flame;
    const ex = this.exhaust();
    drawGlow(ctx, ex.x, ex.y, boosted ? 'rgba(255,200,80,1)' : hexToRgba(outer), boosted ? 34 : 22, 0.8);
    drawGlow(ctx, ex.x, ex.y, hexToRgba(inner), 10, 0.9);

    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle + Math.PI / 2);
    drawPlane(ctx, this.spec.id, SPRITE_SIZE, this.time, this.tier, this.level);
    ctx.restore();

    if (this.shield) {
      const r = this.radius + 22 + Math.sin(this.time * 5) * 2;
      drawGlow(ctx, this.pos.x, this.pos.y, 'rgba(80,190,255,1)', r * 1.3, 0.35);
      ctx.strokeStyle = 'rgba(150,225,255,0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function hexToRgba(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`;
}
