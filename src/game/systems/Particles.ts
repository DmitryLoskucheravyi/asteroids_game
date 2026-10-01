import { rand } from '../../core/math';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  endSize: number;
  color: string;
  drag: number;
  additive: boolean;
  square: boolean;
}

export interface EmitOptions {
  count: number;
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  endSize?: number;
  colors: readonly string[];
  /** Напрям (рад) і розкид; якщо не вказано — у всі боки */
  angle?: number;
  spread?: number;
  drag?: number;
  additive?: boolean;
  square?: boolean;
  /** Додаткова швидкість джерела */
  inherit?: { x: number; y: number };
  jitter?: number;
}

/** Пул частинок: вихлоп двигуна, вибухи, іскри, сліди. */
export class ParticleSystem {
  private readonly items: Particle[] = [];
  private readonly max = 1500;

  emit(x: number, y: number, o: EmitOptions): void {
    for (let i = 0; i < o.count; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const a = o.angle !== undefined ? o.angle + rand(-(o.spread ?? 0), o.spread ?? 0) : rand(0, Math.PI * 2);
      const sp = rand(o.speed[0], o.speed[1]);
      const life = rand(o.life[0], o.life[1]);
      const size = rand(o.size[0], o.size[1]);
      const j = o.jitter ?? 0;
      this.items.push({
        x: x + rand(-j, j),
        y: y + rand(-j, j),
        vx: Math.cos(a) * sp + (o.inherit?.x ?? 0),
        vy: Math.sin(a) * sp + (o.inherit?.y ?? 0),
        life,
        maxLife: life,
        size,
        endSize: o.endSize ?? 0,
        color: o.colors[Math.floor(Math.random() * o.colors.length)],
        drag: o.drag ?? 2,
        additive: o.additive ?? true,
        square: o.square ?? false,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      const size = p.endSize + (p.size - p.endSize) * t;
      if (size <= 0.1) continue;
      ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.fillStyle = p.color;
      if (p.square) {
        ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear(): void {
    this.items.length = 0;
  }
}
