import { Assets } from '../../core/assets';
import { rand } from '../../core/math';

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

const LAYERS = [
  { count: 110, speed: 8, size: [0.6, 1.2], alpha: 0.45 },
  { count: 60, speed: 22, size: [1, 1.8], alpha: 0.7 },
  { count: 22, speed: 55, size: [1.6, 2.6], alpha: 0.95 },
] as const;

/**
 * Фон: картинка космосу + три шари зірок з паралаксом.
 * Зірки рухаються вниз, створюючи відчуття польоту вперед.
 */
export class Starfield {
  private layers: Star[][] = [];
  private w = 1;
  private h = 1;
  private time = 0;
  private bgOffset = 0;

  constructor(private readonly bg: 'bgGame' | 'bgMenu') {}

  resize(w: number, h: number): void {
    const first = this.layers.length === 0;
    if (!first && Math.abs(w - this.w) < 1 && Math.abs(h - this.h) < 1) return;
    this.w = w;
    this.h = h;
    this.layers = LAYERS.map((l) =>
      Array.from({ length: Math.round(l.count * Math.max(1, (w * h) / (1600 * 900))) }, () => ({
        x: rand(0, w),
        y: rand(0, h),
        size: rand(l.size[0], l.size[1]),
        phase: rand(0, Math.PI * 2),
      })),
    );
  }

  update(dt: number, speedMul = 1): void {
    this.time += dt;
    this.bgOffset += dt * 6 * speedMul;
    this.layers.forEach((stars, i) => {
      const v = LAYERS[i].speed * speedMul;
      for (const s of stars) {
        s.y += v * dt;
        if (s.y > this.h + 4) {
          s.y = -4;
          s.x = rand(0, this.w);
        }
      }
    });
  }

  render(ctx: CanvasRenderingContext2D, speedMul = 1): void {
    const img = Assets.get(this.bg);
    ctx.fillStyle = '#04030a';
    ctx.fillRect(0, 0, this.w, this.h);
    if (img.naturalWidth) {
      // "cover" + повільний вертикальний дрейф із безшовним повтором
      const scale = Math.max(this.w / img.naturalWidth, this.h / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = (this.w - dw) / 2;
      const off = this.bgOffset % dh;
      ctx.globalAlpha = this.bg === 'bgGame' ? 0.9 : 0.75;
      ctx.drawImage(img, dx, off, dw, dh);
      ctx.save();
      ctx.translate(dx, off);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = '#fff';
    this.layers.forEach((stars, i) => {
      const base = LAYERS[i].alpha;
      const stretch = speedMul > 1.2 ? (speedMul - 1) * LAYERS[i].speed * 0.12 : 0;
      for (const s of stars) {
        ctx.globalAlpha = base * (0.65 + 0.35 * Math.sin(this.time * 2 + s.phase));
        ctx.fillRect(s.x, s.y - stretch, s.size, s.size + stretch);
      }
    });
    ctx.globalAlpha = 1;

    // віньєтка
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
