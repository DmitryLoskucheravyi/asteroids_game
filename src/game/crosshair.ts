import type { CrosshairSettings } from '../core/storage';

/** Готові кольори прицілу в налаштуваннях (можна обрати й свій). */
export const CROSSHAIR_COLORS = ['#ff3b4e', '#ffd24a', '#4fe08a', '#58d2ff', '#ffffff', '#ff5ad0'];

/**
 * Приціл перед носом літака. angle — курс (куди летять кулі), щоб шеврон дивився вперед.
 * Тонкий темний контур під лінією — приціл читається і на зорях, і на астероїдах.
 */
export function drawCrosshair(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, cfg: CrosshairSettings): void {
  const s = 9 * cfg.size;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = cfg.opacity;
  ctx.lineCap = 'round';
  const stroke = (draw: () => void, width: number): void => {
    ctx.strokeStyle = 'rgba(6,5,16,0.7)';
    ctx.lineWidth = width + 2.5;
    ctx.beginPath();
    draw();
    ctx.stroke();
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = width;
    ctx.beginPath();
    draw();
    ctx.stroke();
  };
  switch (cfg.style) {
    case 'cross': {
      const gap = s * 0.45;
      stroke(() => {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          ctx.moveTo(dx * gap, dy * gap);
          ctx.lineTo(dx * (gap + s), dy * (gap + s));
        }
      }, 2);
      ctx.fillStyle = cfg.color;
      ctx.fillRect(-1, -1, 2, 2);
      break;
    }
    case 'dot':
      ctx.fillStyle = 'rgba(6,5,16,0.7)';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.42 + 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = cfg.color;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'circle':
      stroke(() => ctx.arc(0, 0, s * 1.15, 0, Math.PI * 2), 1.8);
      ctx.fillStyle = cfg.color;
      ctx.beginPath();
      ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'chevron':
      ctx.rotate(angle);
      stroke(() => {
        ctx.moveTo(-s * 0.7, -s);
        ctx.lineTo(s * 0.5, 0);
        ctx.lineTo(-s * 0.7, s);
      }, 2.2);
      break;
  }
  ctx.restore();
}
