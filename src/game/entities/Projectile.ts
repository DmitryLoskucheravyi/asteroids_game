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
    /** Своя дальність (дробовик б'є недалеко) */
    private readonly range?: number,
    /** Особливий вигляд: дріб або згусток плазми */
    readonly style?: 'pellet' | 'plasma',
  ) {
    super(pos, Vec2.fromAngle(angle, speed), kind === 'rocket' ? 6 : 2.5);
    this.angle = angle;
  }

  update(dt: number, world: WorldView): void {
    const step = this.vel.length() * dt;
    this.traveled += step;
    this.pos.add(this.vel, dt);
    if (this.traveled > (this.range ?? RANGE[this.kind]) || this.isOutside(world.width, world.height, 40)) this.kill();
  }

  render(ctx: CanvasRenderingContext2D, time: number): void {
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.angle + Math.PI / 2);
    if (this.style === 'plasma') this.renderPlasma(ctx, time);
    else if (this.style === 'pellet') this.renderPellet(ctx);
    else if (this.kind === 'bullet') this.renderBullet(ctx, time);
    else this.renderRocket(ctx, time);
    ctx.restore();
  }

  /**
   * Куля-трасер: звужений шлейф (довший у ворожих — їх видно здалеку), розпечене ядро,
   * яскравий наконечник з ореолом і пара іскор позаду. Свої — блакитно-білі, ворожі — червоні.
   */
  private renderBullet(ctx: CanvasRenderingContext2D, time: number): void {
    const hostile = this.hostile;
    const len = hostile ? 30 : 24;
    const w = hostile ? 2.4 : 2;
    const [core, mid, tail] = hostile ? ['255,236,220', '255,110,80', '255,40,60'] : ['240,252,255', '130,220,255', '60,140,255'];
    const flick = 0.85 + Math.sin(time * 60 + this.pos.x * 0.05) * 0.15;

    // шлейф: трикутник, що звужується назад
    const trail = ctx.createLinearGradient(0, 0, 0, len);
    trail.addColorStop(0, `rgba(${mid},0.9)`);
    trail.addColorStop(0.45, `rgba(${tail},0.45)`);
    trail.addColorStop(1, `rgba(${tail},0)`);
    ctx.fillStyle = trail;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(0.35, len);
    ctx.lineTo(-0.35, len);
    ctx.closePath();
    ctx.fill();

    ctx.globalCompositeOperation = 'lighter';
    // ореол навколо наконечника
    const halo = ctx.createRadialGradient(0, -1, 0, 0, -1, 7);
    halo.addColorStop(0, `rgba(${mid},${0.55 * flick})`);
    halo.addColorStop(1, `rgba(${mid},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, -1, 7, 0, Math.PI * 2);
    ctx.fill();
    // розпечене ядро вздовж першої третини шлейфу
    ctx.fillStyle = `rgba(${core},0.9)`;
    ctx.fillRect(-0.6, 0, 1.2, len * 0.35);
    // іскри позаду
    for (let i = 0; i < 2; i++) {
      const off = ((time * 90 + i * 7 + this.pos.y * 0.1) % 1) * len * 0.8 + 4;
      ctx.fillStyle = `rgba(${mid},${0.6 - off / (len * 1.6)})`;
      ctx.fillRect((i ? 1 : -1) * (0.8 + (off % 3) * 0.3), off, 1, 1.6);
    }
    ctx.globalCompositeOperation = 'source-over';

    // наконечник: витягнута крапля
    ctx.fillStyle = `rgb(${core})`;
    ctx.beginPath();
    ctx.ellipse(0, -1, w * 0.85, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Дріб: дрібна гаряча кулька з коротким слідом. */
  private renderPellet(ctx: CanvasRenderingContext2D): void {
    const c = this.hostile ? '255,120,90' : '255,210,120';
    const g = ctx.createLinearGradient(0, 0, 0, 12);
    g.addColorStop(0, `rgba(${c},0.8)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-1, 0, 2, 12);
    ctx.fillStyle = '#fff6e0';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Плазма: пульсуючий блакитний згусток із ореолом і шлейфом. */
  private renderPlasma(ctx: CanvasRenderingContext2D, time: number): void {
    const c = this.hostile ? '255,90,160' : '90,220,255';
    const pulse = 1 + Math.sin(time * 30 + this.pos.x * 0.02) * 0.15;
    ctx.globalCompositeOperation = 'lighter';
    const tail = ctx.createLinearGradient(0, 0, 0, 26);
    tail.addColorStop(0, `rgba(${c},0.6)`);
    tail.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.lineTo(0, 26);
    ctx.closePath();
    ctx.fill();
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 13 * pulse);
    halo.addColorStop(0, `rgba(${c},0.75)`);
    halo.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 13 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#f0fcff';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Ракета: корпус зі стабілізаторами, червоний обтічник і полум'я, що пульсує. */
  private renderRocket(ctx: CanvasRenderingContext2D, time: number): void {
    const flick = 0.75 + Math.sin(time * 50 + this.pos.x * 0.03) * 0.25;
    // полум'я
    ctx.globalCompositeOperation = 'lighter';
    const flame = ctx.createLinearGradient(0, 7, 0, 7 + 16 * flick);
    flame.addColorStop(0, 'rgba(255,245,200,0.95)');
    flame.addColorStop(0.35, 'rgba(255,170,60,0.85)');
    flame.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-2.6, 7);
    ctx.quadraticCurveTo(0, 7 + 20 * flick, 2.6, 7);
    ctx.closePath();
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 9, 0, 0, 9, 10);
    glow.addColorStop(0, 'rgba(255,170,70,0.45)');
    glow.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 9, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // стабілізатори
    ctx.fillStyle = '#7d8496';
    ctx.beginPath();
    ctx.moveTo(-2.4, 3);
    ctx.lineTo(-5, 8);
    ctx.lineTo(-2.4, 7);
    ctx.moveTo(2.4, 3);
    ctx.lineTo(5, 8);
    ctx.lineTo(2.4, 7);
    ctx.fill();
    // корпус з відблиском
    const body = ctx.createLinearGradient(-2.4, 0, 2.4, 0);
    body.addColorStop(0, '#9aa1b2');
    body.addColorStop(0.45, '#f2f4f8');
    body.addColorStop(1, '#8a91a2');
    ctx.fillStyle = body;
    ctx.fillRect(-2.4, -5, 4.8, 12);
    // смуга й обтічник
    ctx.fillStyle = this.hostile ? '#ff2a6a' : '#ff4a3a';
    ctx.fillRect(-2.4, 1, 4.8, 1.6);
    ctx.beginPath();
    ctx.moveTo(-2.4, -5);
    ctx.quadraticCurveTo(0, -13, 2.4, -5);
    ctx.closePath();
    ctx.fill();
  }
}
