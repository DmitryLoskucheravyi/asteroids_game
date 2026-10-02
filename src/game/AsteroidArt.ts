/**
 * Піксельні астероїди, намальовані кодом: нерівна кам'яна брила з об'ємом (світло зверху-зліва),
 * кратерами, темним контуром і світними лавовими тріщинами, що розходяться від центру.
 * Кожен розмір має кілька варіантів форми; спрайти кешуються в офскрін-канвасах.
 */

export type AsteroidArtSize = 'small' | 'medium' | 'large' | 'boss';

/** Розмір сітки в пікселях для кожного розміру (чим більше — тим більше деталей). */
const GRID: Record<AsteroidArtSize, number> = { small: 18, medium: 26, large: 36, boss: 44 };
export const ASTEROID_VARIANTS = 6;

const ROCK = ['#140d0b', '#231814', '#36261f', '#4a372d', '#5f483b', '#7a5f4d'];
const OUTLINE = '#0c0706';
const LAVA_EDGE = '#a8300c';
const LAVA = '#ff7a1a';
const LAVA_HOT = '#ffd84a';
const LAVA_CORE = '#fff6c8';

const cache = new Map<string, HTMLCanvasElement>();

/** Детермінований генератор випадкових чисел — той самий seed дає той самий камінь. */
function rng(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function build(size: AsteroidArtSize, variant: number): HTMLCanvasElement {
  const n = GRID[size];
  const rand = rng(variant * 31 + n * 7 + 3);
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const cx = n / 2 - 0.5;
  const cy = n / 2 - 0.5;
  const R = n / 2 - 1.5;

  // нерівний контур: радіус як сума кількох синусоїд
  const waves = Array.from({ length: 4 }, (_, i) => ({ k: 2 + i + Math.floor(rand() * 2), a: (0.025 + rand() * 0.035) / (1 + i * 0.3), p: rand() * Math.PI * 2 }));
  const radiusAt = (ang: number) => R * (0.92 + waves.reduce((s, w) => s + w.a * Math.sin(ang * w.k + w.p), 0));
  const inside = (x: number, y: number) => {
    const dx = x - cx;
    const dy = y - cy;
    return Math.hypot(dx, dy) <= radiusAt(Math.atan2(dy, dx));
  };

  // кратери
  const craters = Array.from({ length: size === 'small' ? 2 : size === 'medium' ? 3 : 5 }, () => {
    const a = rand() * Math.PI * 2;
    const d = rand() * R * 0.55;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: 1.2 + rand() * (n / 9) };
  });

  // лавові тріщини: випадкові блукання від центру назовні з розгалуженнями
  const lava = new Map<string, number>();
  const mark = (x: number, y: number, heat: number) => {
    const k = `${Math.round(x)},${Math.round(y)}`;
    lava.set(k, Math.max(lava.get(k) ?? 0, heat));
  };
  const branches = size === 'small' ? 2 : size === 'medium' ? 3 : 5;
  for (let b = 0; b < branches; b++) {
    let x = cx + (rand() - 0.5) * 2;
    let y = cy + (rand() - 0.5) * 2;
    let ang = (b / branches) * Math.PI * 2 + rand() * 0.8;
    const len = R * (0.7 + rand() * 0.4);
    for (let s = 0; s < len; s += 0.7) {
      ang += (rand() - 0.5) * 0.9;
      x += Math.cos(ang) * 0.7;
      y += Math.sin(ang) * 0.7;
      if (!inside(x, y)) break;
      mark(x, y, 0.85 - (s / len) * 0.5);
      // бічна гілка
      if (rand() < 0.06 && size !== 'small') {
        let bx = x;
        let by = y;
        let ba = ang + (rand() < 0.5 ? 1 : -1) * (0.8 + rand() * 0.6);
        for (let t = 0; t < R * 0.35; t += 0.7) {
          ba += (rand() - 0.5) * 0.6;
          bx += Math.cos(ba) * 0.7;
          by += Math.sin(ba) * 0.7;
          if (!inside(bx, by)) break;
          mark(bx, by, 0.5);
        }
      }
    }
  }
  // розжарене ядро в центрі
  if (size === 'large' || size === 'boss') for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (Math.hypot(x - cx, y - cy) < R * 0.09) mark(x, y, 1);

  const px = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!inside(x, y)) continue;
      // контур
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) {
        // вогняна облямівка по краю, як у розжареного каменя
        const r = rand();
        px(x, y, r < 0.12 ? LAVA : r < 0.4 ? LAVA_EDGE : OUTLINE);
        continue;
      }
      const heat = lava.get(`${x},${y}`);
      if (heat !== undefined) {
        px(x, y, heat > 0.95 ? LAVA_CORE : heat > 0.6 ? LAVA_HOT : LAVA);
        continue;
      }
      // об'єм: світло зверху-зліва + шум каменю
      const dx = (x - cx) / R;
      const dy = (y - cy) / R;
      let light = 0.55 - (dx * 0.45 + dy * 0.55) + (rand() - 0.5) * 0.35;
      for (const cr of craters) {
        const d = Math.hypot(x - cr.x, y - cr.y);
        if (d < cr.r) light -= 0.45 * (1 - (x - cr.x + y - cr.y) / (cr.r * 2));
        else if (d < cr.r + 1) light += (x - cr.x + y - cr.y) > 0 ? 0.3 : -0.1;
      }
      const idx = Math.max(0, Math.min(ROCK.length - 1, Math.floor(light * ROCK.length)));
      // камінь поруч із лавою підсвічений червоним
      // плити між тріщинами: край над тріщиною знизу-справа світліший, під тріщиною зверху-зліва — у тіні
      const lavaBelow = lava.has(`${x + 1},${y}`) || lava.has(`${x},${y + 1}`);
      const lavaAbove = lava.has(`${x - 1},${y}`) || lava.has(`${x},${y - 1}`);
      let tone = idx;
      if (lavaBelow) tone = Math.min(ROCK.length - 1, tone + 2);
      if (lavaAbove) tone = Math.max(0, tone - 2);
      px(x, y, (lavaBelow || lavaAbove) && rand() < 0.35 ? LAVA_EDGE : ROCK[tone]);
    }
  }
  return c;
}

export function asteroidSprite(size: AsteroidArtSize, variant: number): HTMLCanvasElement {
  const v = ((variant % ASTEROID_VARIANTS) + ASTEROID_VARIANTS) % ASTEROID_VARIANTS;
  const key = `${size}:${v}`;
  let c = cache.get(key);
  if (!c) {
    c = build(size, v);
    cache.set(key, c);
  }
  return c;
}

/** Малює астероїд з центром у (0,0) поточної трансформації, діаметр d. */
export function drawAsteroid(ctx: CanvasRenderingContext2D, size: AsteroidArtSize, variant: number, d: number): void {
  const img = asteroidSprite(size, variant);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -d / 2, -d / 2, d, d);
  ctx.imageSmoothingEnabled = prev;
}
