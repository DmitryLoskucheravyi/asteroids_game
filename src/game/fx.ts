/** Кеш попередньо намальованих світінь — shadowBlur на кожному кадрі занадто дорогий. */
const cache = new Map<string, HTMLCanvasElement>();

export function glowSprite(color: string, radius: number, strength = 1): HTMLCanvasElement {
  const key = `${color}|${radius}|${strength}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const size = Math.ceil(radius * 2);
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.35 / strength, color.replace(/[\d.]+\)$/, '0.35)'));
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}

export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius: number, alpha = 1): void {
  const s = glowSprite(color, Math.round(radius));
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(s, x - s.width / 2, y - s.height / 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
