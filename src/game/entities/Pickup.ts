import { Vec2 } from '../../core/math';
import { drawGlow } from '../fx';
import { Entity, type WorldView } from './Entity';

export type PickupKind = 'crystal' | 'shield' | 'freeze' | 'boost';

const LIFETIME = 9;
const COLORS: Record<PickupKind, string> = {
  crystal: 'rgba(255,90,220,1)',
  shield: 'rgba(80,190,255,1)',
  freeze: 'rgba(140,230,255,1)',
  boost: 'rgba(255,200,60,1)',
};

/** Бонус, який можна підібрати. Наприкінці життя блимає. */
export class Pickup extends Entity {
  private life = LIFETIME;
  private readonly phase = Math.random() * Math.PI * 2;

  constructor(
    readonly kind: PickupKind,
    pos: Vec2,
  ) {
    super(pos, new Vec2(), 20);
  }

  update(dt: number, _world: WorldView): void {
    this.life -= dt;
    if (this.life <= 0) this.kill();
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    if (this.life < 2.5 && Math.floor(time * 8) % 2 === 0) return;
    const appear = Math.min(1, (LIFETIME - this.life) * 4);
    const bob = Math.sin(time * 3 + this.phase) * 4;
    const x = this.pos.x;
    const y = this.pos.y + bob;
    drawGlow(ctx, x, y, COLORS[this.kind], 38 * appear, 0.7);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(appear, appear);
    switch (this.kind) {
      case 'crystal':
        drawCrystal(ctx, time + this.phase);
        break;
      case 'shield':
        drawShield(ctx);
        break;
      case 'freeze':
        drawSnowflake(ctx, time);
        break;
      case 'boost':
        drawBolt(ctx);
        break;
    }
    ctx.restore();
  }
}

function drawCrystal(ctx: CanvasRenderingContext2D, t: number): void {
  const w = 11 * (0.75 + 0.25 * Math.abs(Math.cos(t * 2)));
  const g = ctx.createLinearGradient(-w, -16, w, 16);
  g.addColorStop(0, '#ffd1f6');
  g.addColorStop(0.5, '#ff4fd8');
  g.addColorStop(1, '#8a2be2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(w, -3);
  ctx.lineTo(0, 17);
  ctx.lineTo(-w, -3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(0, -17);
  ctx.lineTo(w * 0.4, -3);
  ctx.lineTo(0, 4);
  ctx.closePath();
  ctx.fill();
}

function badge(ctx: CanvasRenderingContext2D, fill: string, stroke: string): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawShield(ctx: CanvasRenderingContext2D): void {
  badge(ctx, 'rgba(10,40,80,0.9)', '#7fd0ff');
  ctx.fillStyle = '#7fd0ff';
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(9, -6);
  ctx.quadraticCurveTo(8, 6, 0, 11);
  ctx.quadraticCurveTo(-8, 6, -9, -6);
  ctx.closePath();
  ctx.fill();
}

function drawSnowflake(ctx: CanvasRenderingContext2D, t: number): void {
  badge(ctx, 'rgba(10,50,80,0.9)', '#bff0ff');
  ctx.rotate(t * 0.8);
  ctx.strokeStyle = '#e6fbff';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(10, 0);
    ctx.moveTo(6, -3);
    ctx.lineTo(9, 0);
    ctx.lineTo(6, 3);
    ctx.moveTo(-6, -3);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-6, 3);
    ctx.stroke();
  }
}

function drawBolt(ctx: CanvasRenderingContext2D): void {
  badge(ctx, 'rgba(70,40,0,0.9)', '#ffd24a');
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.moveTo(3, -12);
  ctx.lineTo(-7, 2);
  ctx.lineTo(-1, 2);
  ctx.lineTo(-3, 12);
  ctx.lineTo(7, -2);
  ctx.lineTo(1, -2);
  ctx.closePath();
  ctx.fill();
}
