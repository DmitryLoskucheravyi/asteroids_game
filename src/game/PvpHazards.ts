import { drawAsteroid } from './AsteroidArt';
import { drawGlow } from './fx';
import { cometTail } from './vfx';
import type { ParticleSystem } from './systems/Particles';
import { FOG_RADIUS, MINE_BLAST, hazardPos, type ArenaEvent, type Hazard } from '../../server/src/shared/hazards';

interface ClientHazard extends Hazard {
  /** Міна спрацювала — вибухне в цей момент (мс матчу) */
  fuseAt?: number;
  /** Момент останнього влучання (секунди клієнта) — для спалаху */
  hitAt?: number;
}

/** Кольори попереджень: комети червоні, злива й стіни помаранчеві, бос — золотий. */
const WARN_COLOR: Record<string, string> = { comet: '255,70,90', rock: '255,154,58', boss: '255,210,74' };

/**
 * Перешкоди PvP на клієнті: стан приходить із сервера (поява, зникнення, синхронізація мисливців),
 * позиції рахуються спільною формулою на момент "зараз" за годинником сервера.
 * Шкоду рахує сервер — тут лише картинка й візуальне "згоряння" куль об перешкоди.
 */
export class PvpHazards {
  readonly list = new Map<number, ClientHazard>();

  constructor(
    readonly event: ArenaEvent | null,
    private readonly particles: ParticleSystem,
    private readonly boom: (x: number, y: number, big: boolean) => void,
  ) {}

  add(hs: Hazard[]): void {
    for (const h of hs) this.list.set(h.id, { ...h });
  }

  gone(e: { id: number; x: number; y: number; boom: boolean }): void {
    const h = this.list.get(e.id);
    this.list.delete(e.id);
    if (!h || !e.boom) return;
    if (h.kind === 'mine') {
      this.boom(e.x, e.y, true);
      this.particles.emit(e.x, e.y, { count: 40, speed: [120, 420], life: [0.3, 0.7], size: [3, 6], colors: ['#ffffff', '#ffd27a', '#ff6a3a', '#7a6a6a'] });
      return;
    }
    this.boom(e.x, e.y, h.kind === 'boss');
    this.particles.emit(e.x, e.y, { count: Math.round(10 + h.r * 0.4), speed: [60, 260], life: [0.3, 0.8], size: [3, 6], colors: ['#8a7060', '#5a4a40', '#c9a080', '#ff9a3a'] });
  }

  /** Мисливці змінюють курс — сервер перебазовує їхній рух. */
  sync(s: [number, number, number, number, number, number][]): void {
    for (const [id, x, y, vx, vy, t0] of s) {
      const h = this.list.get(id);
      if (!h) continue;
      Object.assign(h, { x, y, vx, vy, t0 });
    }
  }

  /** Влучання в перешкоду — короткий спалах. */
  flash(id: number, clock: number): void {
    const h = this.list.get(id);
    if (h) h.hitAt = clock;
  }

  fuse(e: { id: number; at: number }): void {
    const h = this.list.get(e.id);
    if (h) h.fuseAt = e.at;
  }

  /** Куля (крок від a до b) влучила в перешкоду — згорає з іскрами (шкоду рахує сервер). */
  blocks(ax: number, ay: number, bx: number, by: number, t: number): boolean {
    for (const h of this.list.values()) {
      if (t < h.t0) continue;
      const p = hazardPos(h, t);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const k = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len2)) : 0;
      if (Math.hypot(ax + dx * k - p.x, ay + dy * k - p.y) > h.r * 0.9) continue;
      this.particles.emit(bx, by, { count: 5, speed: [40, 160], life: [0.15, 0.35], size: [2, 3], colors: ['#ffe0b0', '#c9a080', '#ffffff'] });
      return true;
    }
    return false;
  }

  /** Тіла перешкод (у світових координатах, лише видимі). */
  renderBodies(ctx: CanvasRenderingContext2D, t: number, clock: number, view: { l: number; r: number; t: number; b: number }): void {
    for (const h of this.list.values()) {
      if (t < h.t0) continue;
      const p = hazardPos(h, t);
      if (p.x + h.r < view.l || p.x - h.r > view.r || p.y + h.r < view.t || p.y - h.r > view.b) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      // влучання — короткий спалах (HP гравцям не показуємо)
      if (h.hitAt !== undefined && clock - h.hitAt < 0.12) drawGlow(ctx, 0, 0, 'rgba(255,230,190,1)', h.r * 1.3, 0.55);
      switch (h.kind) {
        case 'comet': {
          // хвіст проти руху + розпечена голова
          const sp = Math.hypot(h.vx, h.vy) || 1;
          const ux = -h.vx / sp;
          const uy = -h.vy / sp;
          cometTail(ctx, ux, uy, h.r, clock, h.id);
          drawGlow(ctx, 0, 0, 'rgba(255,160,90,1)', h.r * 2.6, 0.9);
          ctx.rotate(clock * 4 + h.id);
          drawAsteroid(ctx, 'small', h.v, h.r * 2.2);
          break;
        }
        case 'hunter':
          drawGlow(ctx, 0, 0, 'rgba(255,60,70,1)', h.r * 2.4, 0.55 + Math.sin(clock * 8) * 0.15);
          ctx.rotate(clock * 1.5 + h.id);
          drawAsteroid(ctx, 'medium', h.v, h.r * 2.3);
          break;
        case 'bouncer':
          ctx.strokeStyle = `rgba(88,210,255,${0.55 + Math.sin(clock * 5 + h.id) * 0.2})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, h.r * 1.25, 0, Math.PI * 2);
          ctx.stroke();
          ctx.rotate(clock * 2 + h.id);
          drawAsteroid(ctx, 'medium', h.v, h.r * 2.3);
          break;
        case 'boss':
          drawGlow(ctx, 0, 0, 'rgba(255,120,50,1)', h.r * 1.8, 0.5);
          ctx.rotate(clock * 0.35);
          drawAsteroid(ctx, 'boss', h.v, h.r * 2.3);
          break;
        case 'mine':
          this.renderMine(ctx, h, t, clock);
          break;
        default:
          ctx.rotate(clock * (h.r < 18 ? 3 : 1) + h.id);
          drawAsteroid(ctx, h.r < 18 ? 'small' : h.r < 34 ? 'medium' : 'large', h.v, h.r * 2.3);
      }
      ctx.restore();
    }
  }

  private renderMine(ctx: CanvasRenderingContext2D, h: ClientHazard, t: number, clock: number): void {
    const armed = t >= h.t0 + 1000;
    const fused = h.fuseAt !== undefined;
    // шипи
    ctx.strokeStyle = '#5a5470';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * h.r * 0.7, Math.sin(a) * h.r * 0.7);
      ctx.lineTo(Math.cos(a) * h.r * 1.25, Math.sin(a) * h.r * 1.25);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(-h.r * 0.3, -h.r * 0.3, 1, 0, 0, h.r);
    g.addColorStop(0, '#6a6480');
    g.addColorStop(1, '#24213a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, h.r, 0, Math.PI * 2);
    ctx.fill();
    // вогник: зелений — чекає, жовтий — озброюється, червоний блимає — ось-ось вибухне
    const blink = fused ? Math.sin(clock * 40) > 0 : Math.sin(clock * 4 + h.id) > -0.3;
    const color = fused ? '255,60,60' : armed ? '120,255,140' : '255,210,74';
    if (blink) drawGlow(ctx, 0, 0, `rgba(${color},1)`, fused ? 26 : 14, 0.9);
    ctx.fillStyle = `rgb(${color})`;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (fused) {
      // зона вибуху
      ctx.strokeStyle = 'rgba(255,60,60,0.35)';
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, MINE_BLAST, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Попередження перед появою: пунктир траєкторії (видно навіть крізь туман). */
  renderWarnings(ctx: CanvasRenderingContext2D, t: number, clock: number): void {
    for (const h of this.list.values()) {
      if (!h.warn || t >= h.t0 || t < h.t0 - h.warn) continue;
      const color = WARN_COLOR[h.kind] ?? '255,154,58';
      const pulse = 0.45 + Math.sin(clock * 14) * 0.25;
      if (h.kind === 'boss') {
        ctx.strokeStyle = `rgba(${color},${pulse})`;
        ctx.lineWidth = 4;
        ctx.setLineDash([16, 12]);
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * (1 + (h.t0 - t) / h.warn), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      const sp = Math.hypot(h.vx, h.vy) || 1;
      const len = h.kind === 'comet' ? 2600 : 900;
      ctx.strokeStyle = `rgba(${color},${pulse})`;
      ctx.lineWidth = h.kind === 'comet' ? 3 : 2;
      ctx.setLineDash(h.kind === 'comet' ? [18, 12] : [10, 10]);
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(h.x + (h.vx / sp) * len, h.y + (h.vy / sp) * len);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Туман: темрява з видимим колом навколо свого літака (координати екрана). */
  static renderFog(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number): void {
    const g = ctx.createRadialGradient(x, y, FOG_RADIUS * 0.55, x, y, FOG_RADIUS);
    g.addColorStop(0, 'rgba(8,7,20,0)');
    g.addColorStop(1, 'rgba(8,7,20,0.94)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
