import type { PlaneId } from './planes';

/**
 * Векторна графіка літаків — усе малюється кодом, без картинок.
 *
 * Система координат одного літака: квадрат 64×64 одиниці з центром у (0,0),
 * ніс дивиться вгору (−y). Статична частина ("корпус") один раз рендериться в offscreen-canvas
 * і далі просто копіюється; анімовані деталі (вогні, кільця, крила) малюються щокадру.
 */

type Ctx = CanvasRenderingContext2D;

interface PlaneArtDef {
  /** Статичний корпус (кешується) */
  body(ctx: Ctx): void;
  /** Анімовані деталі поверх корпусу; t — час у секундах */
  anim?(ctx: Ctx, t: number): void;
}

// ---------- кольори ----------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** k > 0 — світліше (до білого), k < 0 — темніше (до чорного). */
function shade(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

const OUTLINE = 'rgba(8,6,18,0.9)';
const PANEL = 'rgba(0,0,0,0.28)';

// ---------- геометрія ----------

/** Path2D з плоского масиву точок [x0,y0,x1,y1,...]. */
function poly(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}

/** Симетричний контур із точок лівої половини (від носа до хвоста). */
function sym(half: number[]): Path2D {
  const pts = [...half];
  for (let i = half.length - 2; i >= 0; i -= 2) pts.push(-half[i], half[i + 1]);
  return poly(pts);
}

/** Дзеркальна копія лівої деталі праворуч. */
function mirror(pts: number[]): number[] {
  return pts.map((v, i) => (i % 2 === 0 ? -v : v));
}

function ellipsePath(x: number, y: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  return p;
}

function roundRect(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.roundRect(x, y, w, h, r);
  return p;
}

// ---------- матеріали ----------

/** Металева заливка: світло зліва-згори, тінь справа-знизу, темний контур і відблиск по краю. */
function metal(ctx: Ctx, path: Path2D, base: string, opts: { shadow?: boolean; outline?: boolean } = {}): void {
  const g = ctx.createLinearGradient(-26, -26, 26, 26);
  g.addColorStop(0, shade(base, 0.5));
  g.addColorStop(0.42, base);
  g.addColorStop(1, shade(base, -0.55));
  ctx.save();
  if (opts.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1.6;
    ctx.shadowOffsetY = 2.4;
  }
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.restore();
  // внутрішній відблиск (кліпнутий контур, зсунутий униз-праворуч)
  ctx.save();
  ctx.clip(path);
  ctx.translate(0.9, 0.9);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.2;
  ctx.stroke(path);
  ctx.restore();
  if (opts.outline !== false) {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.1;
    ctx.stroke(path);
  }
}

/** Скляний ліхтар кабіни з відблиском. */
function canopy(ctx: Ctx, x: number, y: number, rx: number, ry: number, glass: string): void {
  const p = ellipsePath(x, y, rx, ry);
  const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, 0.2, x, y, Math.max(rx, ry) * 1.1);
  g.addColorStop(0, shade(glass, 0.75));
  g.addColorStop(0.35, glass);
  g.addColorStop(1, shade(glass, -0.7));
  ctx.fillStyle = g;
  ctx.fill(p);
  ctx.strokeStyle = 'rgba(20,24,40,0.95)';
  ctx.lineWidth = 1;
  ctx.stroke(p);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(x - rx * 0.35, y - ry * 0.35, rx * 0.22, ry * 0.3, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

/** Сопло двигуна: темний отвір з жаром усередині. */
function nozzle(ctx: Ctx, x: number, y: number, w: number, h: number, heat = '#ff9a3c'): void {
  const p = roundRect(x - w / 2, y - h / 2, w, h, Math.min(w, h) / 2);
  ctx.fillStyle = '#2a2d38';
  ctx.fill(p);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke(p);
  const g = ctx.createRadialGradient(x, y + h * 0.2, 0, x, y, w * 0.6);
  g.addColorStop(0, heat);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fill(roundRect(x - w * 0.35, y - h * 0.3, w * 0.7, h * 0.6, h * 0.3));
}

function lines(ctx: Ctx, segs: number[][], color = PANEL, width = 0.7): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (const s of segs) {
    ctx.beginPath();
    ctx.moveTo(s[0], s[1]);
    for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function rivets(ctx: Ctx, pts: number[], color = 'rgba(255,255,255,0.35)'): void {
  ctx.fillStyle = color;
  for (let i = 0; i < pts.length; i += 2) {
    ctx.beginPath();
    ctx.arc(pts[i], pts[i + 1], 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha = 1): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Навігаційні вогні на кінцях крил: червоний ліворуч, зелений праворуч, блимають. */
function navLights(ctx: Ctx, x: number, y: number, t: number): void {
  const on = 0.55 + 0.45 * Math.sin(t * 5);
  glow(ctx, -x, y, 4, '#ff3030', on);
  glow(ctx, x, y, 4, '#30ff70', on);
  ctx.fillStyle = '#ffb0b0';
  ctx.fillRect(-x - 0.6, y - 0.6, 1.2, 1.2);
  ctx.fillStyle = '#b0ffc8';
  ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
}

/** Ракета під крилом. */
function missile(ctx: Ctx, x: number, y: number, len: number, tip = '#ff4a3a'): void {
  const p = roundRect(x - 1.1, y, 2.2, len, 1.1);
  metal(ctx, p, '#e6e9f0');
  ctx.fillStyle = tip;
  ctx.beginPath();
  ctx.ellipse(x, y + 0.8, 1.1, 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Опізнавальний знак: коло зі зіркою. */
function roundel(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.fillStyle = '#1d3f9c';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r * 0.78 : r * 0.32;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------- літаки ----------

const ART: Record<PlaneId, PlaneArtDef> = {
  // Сокіл: класичний синій винищувач з білими смугами і ракетами
  falcon: {
    body(ctx) {
      const blue = '#2f7bff';
      const wing = [-4, -7, -28, 9, -28, 14, -5, 12];
      const tail = [-4, 18, -14, 26, -14, 29, -4, 26];
      for (const w of [wing, mirror(wing)]) metal(ctx, poly(w), shade(blue, -0.1), { shadow: true });
      for (const w of [tail, mirror(tail)]) metal(ctx, poly(w), shade(blue, -0.15), { shadow: true });
      missile(ctx, -18, 1, 11);
      missile(ctx, 18, 1, 11);
      const hull = sym([0, -31, -2.2, -26, -4, -16, -5.2, 0, -5.2, 20, -4, 28, -2, 30]);
      metal(ctx, hull, blue, { shadow: true });
      // білі смуги вздовж передньої кромки
      lines(ctx, [[-6, -4, -26, 9.5], [6, -4, 26, 9.5]], 'rgba(255,255,255,0.85)', 1.6);
      lines(ctx, [[-4.6, 4, 4.6, 4], [-5, 14, 5, 14], [0, -8, 0, 26], [-12, 6, -12, 12.5], [12, 6, 12, 12.5]]);
      rivets(ctx, [-3, 8, 3, 8, -3, 18, 3, 18, -20, 11, 20, 11]);
      // повітрозабірники
      ctx.fillStyle = '#12182a';
      ctx.fillRect(-5.6, -3, 1.4, 6);
      ctx.fillRect(4.2, -3, 1.4, 6);
      nozzle(ctx, 0, 29, 5.5, 3);
      canopy(ctx, 0, -15, 3, 7.5, '#6fc6ff');
    },
    anim(ctx, t) {
      navLights(ctx, 28, 11.5, t);
    },
  },

  // Фантом: малиновий стелс-літак "летюче крило" з пилкоподібною задньою кромкою
  phantom: {
    body(ctx) {
      const pink = '#e0308e';
      const wing = sym([0, -28, -6, -16, -30, 8, -26, 12, -19, 8, -15, 14, -9, 10, -5, 16, 0, 13]);
      metal(ctx, wing, pink, { shadow: true });
      const spine = sym([0, -28, -3.6, -16, -4, 6, -2, 12, 0, 13]);
      metal(ctx, spine, shade(pink, 0.15), { outline: false });
      lines(ctx, [[-6, -12, -26, 7], [6, -12, 26, 7], [-10, 2, -10, 8], [10, 2, 10, 8]], 'rgba(255,255,255,0.18)');
      lines(ctx, [[-4, -14, -4, 8], [4, -14, 4, 8]]);
      for (const x of [-7, 7]) {
        metal(ctx, roundRect(x - 2.6, 2, 5.2, 13, 2.4), shade(pink, -0.35));
        nozzle(ctx, x, 15, 4.4, 2.6, '#ff6ad0');
      }
      canopy(ctx, 0, -12, 2.8, 6.5, '#c070ff');
    },
    anim(ctx, t) {
      // неонові смуги по кромках крила
      const a = 0.45 + 0.35 * Math.sin(t * 3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      lines(ctx, [[-6.5, -15, -28, 8], [6.5, -15, 28, 8]], `rgba(255,120,220,${a})`, 1.1);
      ctx.restore();
      navLights(ctx, 29, 9, t);
    },
  },

  // Блискавка: червоний F-16 з опізнавальними зірками
  blaze: {
    body(ctx) {
      const red = '#e8361a';
      const wing = [-3.5, -6, -25, 8, -25, 12, -4, 11];
      const tail = [-3.5, 20, -12.5, 27, -12.5, 29.5, -3.5, 27.5];
      for (const w of [wing, mirror(wing)]) metal(ctx, poly(w), red, { shadow: true });
      for (const w of [tail, mirror(tail)]) metal(ctx, poly(w), shade(red, -0.1), { shadow: true });
      missile(ctx, -24.5, 0, 11, '#ffd23a');
      missile(ctx, 24.5, 0, 11, '#ffd23a');
      const hull = sym([0, -31, -2, -24, -3.6, -12, -4.2, 6, -4.2, 24, -3, 29, -1.5, 30.5]);
      metal(ctx, hull, red, { shadow: true });
      roundel(ctx, -15, 6.5, 3.4);
      roundel(ctx, 15, 6.5, 3.4);
      lines(ctx, [[-4, 0, 4, 0], [-4, 12, 4, 12], [-4, 20, 4, 20], [0, -6, 0, 28]]);
      lines(ctx, [[-22, 10.5, -6, 9.5], [22, 10.5, 6, 9.5]], 'rgba(255,255,255,0.3)', 0.8);
      rivets(ctx, [-2.6, 4, 2.6, 4, -2.6, 16, 2.6, 16]);
      nozzle(ctx, 0, 29.5, 4.8, 2.6);
      canopy(ctx, 0, -17, 2.7, 7, '#ffcf6a');
    },
    anim(ctx, t) {
      navLights(ctx, 25, 10, t);
    },
  },

  // Оса: жовто-чорне тіло і прозорі крила з прожилками
  wasp: {
    body(ctx) {
      const yellow = '#f5c518';
      const fw = [-3, -8, -24, -21, -29, -16, -5, -1];
      const bw = [-3, 5, -21, 21, -17, 25, -3, 13];
      for (const w of [fw, mirror(fw), bw, mirror(bw)]) {
        const p = poly(w);
        ctx.fillStyle = 'rgba(190,230,255,0.38)';
        ctx.fill(p);
        ctx.strokeStyle = 'rgba(30,40,60,0.9)';
        ctx.lineWidth = 0.9;
        ctx.stroke(p);
      }
      // прожилки крил
      lines(ctx, [[-6, -4, -26, -18], [-10, -6, -22, -13], [-6, 9, -19, 22], [6, -4, 26, -18], [10, -6, 22, -13], [6, 9, 19, 22]], 'rgba(40,60,90,0.6)', 0.6);
      // жало
      ctx.fillStyle = '#1a1a22';
      ctx.fill(poly([0, 31, -1.8, 25, 1.8, 25]));
      const abdomen = ellipsePath(0, 14, 5.8, 12);
      metal(ctx, abdomen, yellow, { shadow: true });
      ctx.save();
      ctx.clip(abdomen);
      ctx.fillStyle = 'rgba(20,18,24,0.92)';
      for (const y of [7, 13, 19, 24]) ctx.fillRect(-7, y, 14, 2.6);
      ctx.restore();
      metal(ctx, ellipsePath(0, -6, 6.2, 8.5), yellow, { shadow: true });
      metal(ctx, ellipsePath(0, -17, 4.4, 4.2), shade(yellow, -0.15));
      lines(ctx, [[-4.6, -6, 4.6, -6]]);
      canopy(ctx, -2, -18.5, 1.9, 2.4, '#ff3030');
      canopy(ctx, 2, -18.5, 1.9, 2.4, '#ff3030');
      lines(ctx, [[-1.5, -21, -4, -27], [1.5, -21, 4, -27]], '#1a1a22', 0.9);
    },
    anim(ctx, t) {
      // мерехтіння крил
      const a = 0.12 + 0.12 * Math.abs(Math.sin(t * 30));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(200,240,255,${a})`;
      for (const w of [[-3, -8, -24, -21, -29, -16, -5, -1], [-3, 5, -21, 21, -17, 25, -3, 13]]) {
        ctx.fill(poly(w));
        ctx.fill(poly(mirror(w)));
      }
      ctx.restore();
    },
  },

  // Колектор: бірюзовий вантажник з магнітними капсулами
  collector: {
    body(ctx) {
      const teal = '#18b8a2';
      const pod = '#3a8cd8';
      for (const x of [-23.5, 23.5]) {
        metal(ctx, roundRect(x - 5, -13, 10, 36, 4.5), pod, { shadow: true });
        lines(ctx, [[x - 4, -2, x + 4, -2], [x - 4, 8, x + 4, 8]]);
        nozzle(ctx, x, 23, 5.5, 2.6);
      }
      for (const y of [-4, 10]) {
        metal(ctx, roundRect(-19, y, 38, 4, 1), '#8a92a6');
      }
      const hull = new Path2D();
      hull.moveTo(0, -29);
      hull.bezierCurveTo(8, -29, 10, -20, 10, -12);
      hull.lineTo(10, 22);
      hull.quadraticCurveTo(10, 28, 4, 28);
      hull.lineTo(-4, 28);
      hull.quadraticCurveTo(-10, 28, -10, 22);
      hull.lineTo(-10, -12);
      hull.bezierCurveTo(-10, -20, -8, -29, 0, -29);
      metal(ctx, hull, teal, { shadow: true });
      // вантажний відсік
      const bay = roundRect(-6.5, -1, 13, 21, 1.5);
      ctx.fillStyle = 'rgba(0,40,40,0.45)';
      ctx.fill(bay);
      lines(ctx, [[-6.5, 6, 6.5, 6], [-6.5, 13, 6.5, 13], [0, -1, 0, 20]], 'rgba(0,0,0,0.35)');
      rivets(ctx, [-8, -6, 8, -6, -8, 24, 8, 24]);
      nozzle(ctx, 0, 28, 6, 2.6);
      canopy(ctx, 0, -17, 5, 4.5, '#7fd0ff');
      // магніти-підкови на носах капсул
      for (const x of [-23.5, 23.5]) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#e03a3a';
        ctx.beginPath();
        ctx.arc(x, -13, 4, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#d8dce6';
        ctx.fillRect(x - 5.5, -13.5, 3, 2.4);
        ctx.fillRect(x + 2.5, -13.5, 3, 2.4);
      }
    },
    anim(ctx, t) {
      // магнітне поле
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const x of [-23.5, 23.5]) {
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.8 + i / 3) % 1;
          ctx.strokeStyle = `rgba(120,220,255,${0.5 * (1 - k)})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(x, -13, 5 + k * 7, Math.PI * 1.1, Math.PI * 1.9);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },

  // Стриж: білий перехоплювач зі зворотною стрілоподібністю крила
  swift: {
    body(ctx) {
      const white = '#dfe6f2';
      const wing = [-3.5, 9, -27, -9, -28.5, -4.5, -3.5, 18];
      const canard = [-3, -14, -11.5, -17.5, -11.5, -14, -3, -10];
      const fin = [-3, 22, -10, 30, -3, 28];
      for (const w of [wing, mirror(wing)]) metal(ctx, poly(w), white, { shadow: true });
      for (const w of [canard, mirror(canard), fin, mirror(fin)]) metal(ctx, poly(w), shade(white, -0.1), { shadow: true });
      const hull = sym([0, -31.5, -2.4, -22, -3.6, -8, -3.6, 20, -2.6, 28, -1.2, 29.5]);
      metal(ctx, hull, white, { shadow: true });
      lines(ctx, [[-4.5, 9.5, -26.5, -7.5], [4.5, 9.5, 26.5, -7.5]], '#1ec0ec', 1.8);
      lines(ctx, [[0, -10, 0, 26]], '#1ec0ec', 1);
      lines(ctx, [[-3.4, 2, 3.4, 2], [-3.4, 12, 3.4, 12], [-14, 3, -12, 12], [14, 3, 12, 12]]);
      rivets(ctx, [-2.2, 6, 2.2, 6, -2.2, 16, 2.2, 16]);
      nozzle(ctx, 0, 28.5, 4.4, 2.6, '#7fe8ff');
      canopy(ctx, 0, -20, 2.5, 6.5, '#2ad0ff');
    },
    anim(ctx, t) {
      navLights(ctx, 28, -6.5, t);
    },
  },

  // Титан: золотий важкий ганшип з бронею, гарматами і двома двигунами
  titan: {
    body(ctx) {
      const gold = '#d2a034';
      const wing = [-11, -6, -29, 2, -29, 16, -12, 19];
      for (const w of [wing, mirror(wing)]) metal(ctx, poly(w), shade(gold, -0.08), { shadow: true });
      // гармати
      for (const x of [-24, 24]) {
        metal(ctx, roundRect(x - 1.8, -17, 3.6, 16, 1), '#8f96a8', { shadow: true });
        ctx.fillStyle = '#15161c';
        ctx.fillRect(x - 1, -17.5, 2, 2);
      }
      const hull = sym([0, -30, -7, -26, -11.5, -14, -12.5, 14, -10.5, 25, -4, 28]);
      metal(ctx, hull, gold, { shadow: true });
      // бронеплити
      for (const x of [-20.5, 20.5]) {
        const plate = roundRect(x - 6, 4, 12, 9, 1.5);
        ctx.fillStyle = 'rgba(80,50,10,0.35)';
        ctx.fill(plate);
        ctx.strokeStyle = 'rgba(255,230,160,0.35)';
        ctx.lineWidth = 0.6;
        ctx.stroke(plate);
      }
      const center = roundRect(-6, -2, 12, 20, 2);
      ctx.fillStyle = 'rgba(90,60,10,0.35)';
      ctx.fill(center);
      lines(ctx, [[0, -2, 0, 18], [-6, 8, 6, 8], [-11, -10, -7, -24], [11, -10, 7, -24]]);
      rivets(ctx, [-27, 4, -27, 9, -27, 14, 27, 4, 27, 9, 27, 14, -9, 0, 9, 0, -9, 16, 9, 16]);
      for (const x of [-6, 6]) nozzle(ctx, x, 27.5, 7, 4);
      canopy(ctx, 0, -18, 4.6, 5.4, '#ffb347');
      lines(ctx, [[-3.6, -18, 3.6, -18], [0, -23, 0, -13]], 'rgba(40,30,10,0.8)', 0.7);
    },
    anim(ctx, t) {
      navLights(ctx, 29, 9, t);
    },
  },

  // Хронос: експериментальне кільцеве крило з енергетичним ядром
  chronos: {
    body(ctx) {
      const purple = '#7a34e8';
      const ring = new Path2D();
      ring.ellipse(0, 4, 25, 21, 0, 0, Math.PI * 2);
      ring.ellipse(0, 4, 18.5, 14.5, 0, 0, Math.PI * 2, true);
      metal(ctx, ring, purple, { shadow: true });
      lines(ctx, [[-25, 4, -18.5, 4], [25, 4, 18.5, 4], [0, -17, 0, -10.5], [0, 25, 0, 18.5]], 'rgba(255,255,255,0.25)');
      for (const x of [-18.5, 4]) metal(ctx, roundRect(x, 2.5, 14.5, 3, 1), '#b8bccc');
      const hull = sym([0, -31, -2.8, -22, -4, -6, -4, 24, -2.6, 29]);
      metal(ctx, hull, '#c9cadc', { shadow: true });
      lines(ctx, [[-3.8, -2, 3.8, -2], [-3.8, 12, 3.8, 12]]);
      nozzle(ctx, 0, 28.5, 4.6, 2.6, '#c08aff');
      canopy(ctx, 0, -16, 2.6, 6.5, '#3ae0f0');
    },
    anim(ctx, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // енергія, що біжить по кільцю
      for (let i = 0; i < 8; i++) {
        const a = t * 1.6 + (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * 21.7;
        const y = 4 + Math.sin(a) * 17.7;
        glow(ctx, x, y, 3.2, '#5af0ff', 0.9);
      }
      glow(ctx, 0, 4, 7 + Math.sin(t * 4) * 1.5, '#9a5aff', 0.7);
      ctx.restore();
    },
  },

  // Грім: синя ударна дельта з блискавками і великим двигуном
  thunder: {
    body(ctx) {
      const blue = '#2a62e0';
      const delta = sym([0, -30, -6, -18, -29, 20, -26.5, 24, -8, 20, -3, 22]);
      metal(ctx, delta, blue, { shadow: true });
      // блискавки на крилах
      for (const s of [1, -1]) {
        const bolt = poly([-11 * s, -3, -18 * s, 9, -14 * s, 9, -19 * s, 21, -9 * s, 6, -13 * s, 6, -8 * s, -3]);
        ctx.fillStyle = '#ffd23a';
        ctx.fill(bolt);
        ctx.strokeStyle = 'rgba(80,50,0,0.7)';
        ctx.lineWidth = 0.6;
        ctx.stroke(bolt);
      }
      lines(ctx, [[-5, -14, -25, 19], [5, -14, 25, 19], [0, -20, 0, 14]], 'rgba(255,255,255,0.18)');
      metal(ctx, roundRect(-6.5, 14, 13, 13, 2), '#8f96a8', { shadow: true });
      lines(ctx, [[-6.5, 18, 6.5, 18], [-6.5, 22, 6.5, 22]]);
      nozzle(ctx, 0, 28, 9, 3.4, '#8ad4ff');
      canopy(ctx, 0, -11, 3.2, 7.5, '#9ad8ff');
    },
    anim(ctx, t) {
      // електричні розряди на кінцях крил
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const seed = Math.floor(t * 18);
      for (const s of [-1, 1]) {
        const rnd = (n: number) => Math.sin(seed * 12.9898 + n * 78.233 + s * 3.1) * 0.5 + 0.5;
        if (rnd(9) < 0.35) continue;
        ctx.strokeStyle = 'rgba(160,220,255,0.9)';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        let x = 27 * s;
        let y = 21;
        ctx.moveTo(x, y);
        for (let i = 0; i < 4; i++) {
          x += s * (1 + rnd(i) * 3);
          y += (rnd(i + 4) - 0.5) * 6;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        glow(ctx, 27 * s, 21, 5, '#7ac8ff', 0.6);
      }
      ctx.restore();
    },
  },

  // НЛО: срібна тарілка з куполом і вогнями, що біжать по колу
  ufo: {
    body(ctx) {
      const disc = ellipsePath(0, 0, 29, 29);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1.6;
      ctx.shadowOffsetY = 2.4;
      const g = ctx.createRadialGradient(-9, -10, 2, 0, 0, 30);
      g.addColorStop(0, '#f2f5fb');
      g.addColorStop(0.55, '#a9b2c4');
      g.addColorStop(1, '#4e5568');
      ctx.fillStyle = g;
      ctx.fill(disc);
      ctx.restore();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 1.1;
      ctx.stroke(disc);
      // панелі обода
      ctx.strokeStyle = 'rgba(30,34,48,0.5)';
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 23.5, Math.sin(a) * 23.5);
        ctx.lineTo(Math.cos(a) * 29, Math.sin(a) * 29);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 23.5, 0, Math.PI * 2);
      ctx.stroke();
      const inner = ellipsePath(0, 0, 17, 17);
      const gi = ctx.createRadialGradient(-5, -6, 1, 0, 0, 18);
      gi.addColorStop(0, '#c9d0de');
      gi.addColorStop(1, '#5d6478');
      ctx.fillStyle = gi;
      ctx.fill(inner);
      ctx.strokeStyle = 'rgba(20,24,36,0.7)';
      ctx.stroke(inner);
      canopy(ctx, 0, 0, 11, 11, '#3ad478');
      // силует пілота під куполом
      ctx.fillStyle = 'rgba(10,60,30,0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 1.5, 3.2, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    anim(ctx, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const colors = ['#ffd23a', '#ff4a4a', '#5af0ff'];
      for (let i = 0; i < 12; i++) {
        const a = -t * 2.2 + (i / 12) * Math.PI * 2;
        const on = (Math.floor(t * 6) + i) % 3 === 0 ? 1 : 0.45;
        glow(ctx, Math.cos(a) * 26.2, Math.sin(a) * 26.2, 3, colors[i % 3], on);
      }
      glow(ctx, 0, 0, 12, '#3ad478', 0.25 + 0.1 * Math.sin(t * 3));
      ctx.restore();
    },
  },

  // Фенікс: вогняний птах, крила махають (малюються щокадру)
  phoenix: {
    body(ctx) {
      // хвостове пір'я
      for (const a of [-0.32, 0, 0.32]) {
        ctx.save();
        ctx.translate(0, 12);
        ctx.rotate(a);
        const f = ellipsePath(0, 10, 2.6, 11);
        const g = ctx.createLinearGradient(0, 0, 0, 21);
        g.addColorStop(0, '#e8401a');
        g.addColorStop(1, '#ffe27a');
        ctx.fillStyle = g;
        ctx.fill(f);
        ctx.strokeStyle = 'rgba(80,10,0,0.7)';
        ctx.lineWidth = 0.7;
        ctx.stroke(f);
        ctx.restore();
      }
      const bodyP = ellipsePath(0, 0, 5.4, 16);
      metal(ctx, bodyP, '#e8501a', { shadow: true });
      lines(ctx, [[-3, -4, 0, -1, 3, -4], [-3, 3, 0, 6, 3, 3], [-2.6, 10, 0, 13, 2.6, 10]], 'rgba(255,220,120,0.55)', 0.7);
      metal(ctx, ellipsePath(0, -18, 4.6, 4.8), '#f0641e');
      ctx.fillStyle = '#ffd23a';
      ctx.fill(poly([0, -28.5, -2, -22, 2, -22]));
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = 0.7;
      ctx.stroke(poly([0, -28.5, -2, -22, 2, -22]));
      // гребінь
      ctx.fillStyle = '#ffb020';
      ctx.fill(poly([0, -22, -1.5, -15, 0, -17, 1.5, -15]));
      canopy(ctx, -1.8, -19, 1.1, 1.3, '#fff3b0');
      canopy(ctx, 1.8, -19, 1.1, 1.3, '#fff3b0');
    },
    anim(ctx, t) {
      const flap = Math.sin(t * 6);
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(3.5 * s, -6);
        ctx.scale(s * (0.88 + flap * 0.12), 1);
        // 6 пір'їн віялом: від верхнього махового до нижнього
        for (let i = 0; i < 6; i++) {
          const a = Math.PI + 0.42 - i * 0.24 + flap * 0.1;
          const len = 31 - i * 2.6;
          ctx.save();
          ctx.rotate(a);
          const f = ellipsePath(len / 2, 0, len / 2, 3.4 - i * 0.25);
          const g = ctx.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, '#d8301a');
          g.addColorStop(0.6, '#ff8a1f');
          g.addColorStop(1, '#ffe27a');
          ctx.fillStyle = g;
          ctx.fill(f);
          ctx.strokeStyle = 'rgba(80,10,0,0.75)';
          ctx.lineWidth = 0.6;
          ctx.stroke(f);
          ctx.restore();
        }
        ctx.restore();
      }
      glow(ctx, 0, 0, 16, '#ff8a1f', 0.35 + 0.15 * flap);
    },
  },
};

// ---------- кеш і публічне API ----------

/** Скільки одиниць займає кеш-полотно (з запасом під тінь і крила, що махають). */
const UNITS = 72;
const CACHE_PX = 288;
const bodyCache = new Map<PlaneId, HTMLCanvasElement>();
const iconCache = new Map<PlaneId, string>();

function bodyCanvas(id: PlaneId): HTMLCanvasElement {
  let c = bodyCache.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = CACHE_PX;
  const ctx = c.getContext('2d')!;
  ctx.translate(CACHE_PX / 2, CACHE_PX / 2);
  ctx.scale(CACHE_PX / UNITS, CACHE_PX / UNITS);
  ART[id].body(ctx);
  bodyCache.set(id, c);
  return c;
}

/**
 * Малює літак з центром у поточному початку координат, ніс угору.
 * size — розмір у пікселях світу для квадрата 64 одиниці.
 */
export function drawPlane(ctx: Ctx, id: PlaneId, size: number, t: number): void {
  const k = size / 64;
  const s = UNITS * k;
  ctx.drawImage(bodyCanvas(id), -s / 2, -s / 2, s, s);
  const anim = ART[id].anim;
  if (anim) {
    ctx.save();
    ctx.scale(k, k);
    anim(ctx, t);
    ctx.restore();
  }
}

/** Картинка літака для HTML (ангар, меню) — data URL, генерується один раз. */
export function planeIconUrl(id: PlaneId): string {
  let url = iconCache.get(id);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = CACHE_PX;
  const ctx = c.getContext('2d')!;
  ctx.translate(CACHE_PX / 2, CACHE_PX / 2);
  ctx.drawImage(bodyCanvas(id), -CACHE_PX / 2, -CACHE_PX / 2);
  ctx.scale(CACHE_PX / UNITS, CACHE_PX / UNITS);
  ART[id].anim?.(ctx, 0.4);
  url = c.toDataURL('image/png');
  iconCache.set(id, url);
  return url;
}
