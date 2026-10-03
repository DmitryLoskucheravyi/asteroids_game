import type { PlaneId } from './planes';

/**
 * Піксель-арт графіка літаків — усе малюється кодом, без картинок.
 *
 * Кожен літак описаний як набір плоских фігур (багатокутник/еліпс/прямокутник/піксель)
 * у системі координат 72×72 одиниці з центром у (0,0), ніс дивиться вгору (−y).
 * Фігури растеризуються на тверду сітку без згладжування (жорсткі краї, квантоване
 * освітлення у 3 тони, суцільний темний контур по силуету) — справжня піксельна графіка,
 * а не векторні градієнти. Статичний корпус кешується в офскрін-канвасі; анімовані
 * деталі (вогні, вогонь двигуна, іскри) растеризуються окремим шаром щокадру.
 */

type Ctx = CanvasRenderingContext2D;

// ---------- кольори ----------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseColor(c: string): [number, number, number] {
  if (c[0] === '#') return hexToRgb(c);
  const m = c.match(/\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((s) => parseFloat(s));
    return [r, g, b];
  }
  return [255, 0, 255];
}

/** k > 0 — світліше (до білого), k < 0 — темніше (до чорного). Приймає і '#hex', і 'rgb(...)' (для подвійного тонування). */
function shade(color: string, k: number): string {
  const [r, g, b] = parseColor(color);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ---------- геометрія ----------

/** Дзеркальна копія лівої деталі праворуч. */
function mirror(pts: number[]): number[] {
  return pts.map((v, i) => (i % 2 === 0 ? -v : v));
}

/** Симетричний контур із точок лівої половини (від носа до хвоста). */
function sym(half: number[]): number[] {
  const pts = [...half];
  for (let i = half.length - 2; i >= 0; i -= 2) pts.push(-half[i], half[i + 1]);
  return pts;
}

function rotatePts(pts: number[], cx: number, cy: number, angle: number): number[] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    out.push(cx + x * c - y * s, cy + x * s + y * c);
  }
  return out;
}

/** Перо-подібний (лінзовидний) контур довжиною len і півшириною w; вістря в (0,0), напрям +x. */
function feather(len: number, w: number): number[] {
  const n = 5;
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push((i / n) * len, -w * Math.sin((i / n) * Math.PI));
  for (let i = n; i >= 0; i--) pts.push((i / n) * len, w * Math.sin((i / n) * Math.PI));
  return pts;
}

// ---------- фігури ----------

/** Частина літака: багатокутник, еліпс, прямокутник, "дірка" (виріз) або один піксель. */
type Part =
  | { kind: 'poly'; pts: number[]; base: string; flat?: boolean }
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number; base: string; flat?: boolean }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; base: string; flat?: boolean }
  | { kind: 'hole'; x: number; y: number; rx: number; ry: number }
  | { kind: 'dot'; x: number; y: number; color: string };

type ShapePart = Exclude<Part, { kind: 'dot' }>;

function poly(pts: number[], base: string, flat?: boolean): Part {
  return { kind: 'poly', pts, base, flat };
}
function ellipse(x: number, y: number, rx: number, ry: number, base: string, flat?: boolean): Part {
  return { kind: 'ellipse', x, y, rx, ry, base, flat };
}
function rect(x: number, y: number, w: number, h: number, base: string, flat?: boolean): Part {
  return { kind: 'rect', x, y, w, h, base, flat };
}
function hole(x: number, y: number, rx: number, ry: number): Part {
  return { kind: 'hole', x, y, rx, ry };
}
function dot(x: number, y: number, color: string): Part {
  return { kind: 'dot', x, y, color };
}

/** Скляний ліхтар кабіни + відблиск у вигляді світлого пікселя. */
function canopy(x: number, y: number, rx: number, ry: number, glass: string): Part[] {
  return [ellipse(x, y, rx, ry, glass), dot(x - rx * 0.35, y - ry * 0.45, '#ffffff')];
}

/** Сопло двигуна (темний корпус; полум'я домальовується в анімації). */
function nozzle(x: number, y: number, w: number, h: number): Part {
  return rect(x - w / 2, y - h / 2, w, h, '#2a2d38', true);
}

/** Пляма полум'я/жару заданого кольору. */
function flame(x: number, y: number, w: number, h: number, hot: string): Part {
  return rect(x - w / 2, y - h / 2, w, h, hot, true);
}

/** Мерехтливе полум'я — перемикається між двома кольорами (піксельна анімація, без плавних переходів). */
function flicker(x: number, y: number, w: number, h: number, t: number, a: string, b: string): Part {
  return flame(x, y, w, h, Math.floor(t * 14) % 2 === 0 ? a : b);
}

/** Ракета під крилом: корпус + бойова частина. */
function missile(x: number, y: number, len: number, tip = '#ff4a3a'): Part[] {
  return [rect(x - 1.1, y, 2.2, len, '#e6e9f0'), ellipse(x, y + 1.1, 1.3, 1.5, tip, true)];
}

/** Навігаційні вогні на кінцях крил: червоний ліворуч, зелений праворуч, жорстко блимають. */
function navLights(x: number, y: number, t: number): Part[] {
  const on = Math.floor(t * 6) % 2 === 0;
  return [dot(-x, y, on ? '#ff3030' : '#902020'), dot(x, y, on ? '#30ff70' : '#1a7a40')];
}

// ---------- літаки ----------

interface ShipDef {
  parts: Part[];
  anim?: (t: number) => Part[];
}

function falconParts(): Part[] {
  const blue = '#2f7bff';
  const wingL = [-4, -7, -28, 9, -28, 14, -5, 12];
  const tailL = [-4, 18, -14, 26, -14, 29, -4, 26];
  const hull = sym([0, -31, -2.2, -26, -4, -16, -5.2, 0, -5.2, 20, -4, 28, -2, 30]);
  return [
    poly(wingL, shade(blue, -0.1)),
    poly(mirror(wingL), shade(blue, -0.1)),
    poly(tailL, shade(blue, -0.15)),
    poly(mirror(tailL), shade(blue, -0.15)),
    ...missile(-18, 1, 11),
    ...missile(18, 1, 11),
    poly(hull, blue),
    rect(-5.6, -3, 1.4, 6, '#12182a', true),
    rect(4.2, -3, 1.4, 6, '#12182a', true),
    nozzle(0, 29, 5.5, 3),
    ...canopy(0, -15, 3, 7.5, '#6fc6ff'),
  ];
}
function falconAnim(t: number): Part[] {
  return [...navLights(28, 11.5, t), flicker(0, 29.5, 3.2, 2, t, '#ffcf6a', '#ff9a3c')];
}

function phantomParts(): Part[] {
  const pink = '#e0308e';
  const wing = sym([0, -28, -6, -16, -30, 8, -26, 12, -19, 8, -15, 14, -9, 10, -5, 16, 0, 13]);
  const spine = sym([0, -28, -3.6, -16, -4, 6, -2, 12, 0, 13]);
  return [
    poly(wing, pink),
    poly(spine, shade(pink, 0.15), true),
    rect(-9.6, 2, 5.2, 13, shade(pink, -0.35)),
    rect(4.4, 2, 5.2, 13, shade(pink, -0.35)),
    nozzle(-7, 14.3, 4.4, 2.6),
    nozzle(7, 14.3, 4.4, 2.6),
    ...canopy(0, -12, 2.8, 6.5, '#c070ff'),
  ];
}
function phantomAnim(t: number): Part[] {
  return [flicker(-7, 14.3, 2.6, 1.6, t, '#ff6ad0', '#ff3fa4'), flicker(7, 14.3, 2.6, 1.6, t, '#ff6ad0', '#ff3fa4'), ...navLights(29, 9, t)];
}

function blazeParts(): Part[] {
  const red = '#e8361a';
  const wing = [-3.5, -6, -25, 8, -25, 12, -4, 11];
  const tail = [-3.5, 20, -12.5, 27, -12.5, 29.5, -3.5, 27.5];
  const hull = sym([0, -31, -2, -24, -3.6, -12, -4.2, 6, -4.2, 24, -3, 29, -1.5, 30.5]);
  return [
    poly(wing, red),
    poly(mirror(wing), red),
    poly(tail, shade(red, -0.1)),
    poly(mirror(tail), shade(red, -0.1)),
    ...missile(-24.5, 0, 11, '#ffd23a'),
    ...missile(24.5, 0, 11, '#ffd23a'),
    poly(hull, red),
    ellipse(-15, 6.5, 3, 3, '#1d3f9c'),
    dot(-15, 6.5, '#ffffff'),
    ellipse(15, 6.5, 3, 3, '#1d3f9c'),
    dot(15, 6.5, '#ffffff'),
    nozzle(0, 29.5, 4.8, 2.6),
    ...canopy(0, -17, 2.7, 7, '#ffcf6a'),
  ];
}
function blazeAnim(t: number): Part[] {
  return [...navLights(25, 10, t), flicker(0, 30, 2.8, 1.8, t, '#ffd23a', '#ff8a1f')];
}

function waspParts(): Part[] {
  const yellow = '#f5c518';
  const fw = [-3, -8, -24, -21, -29, -16, -5, -1];
  const bw = [-3, 5, -21, 21, -17, 25, -3, 13];
  const glass = '#cfeeff';
  return [
    poly(fw, glass, true),
    poly(mirror(fw), glass, true),
    poly(bw, glass, true),
    poly(mirror(bw), glass, true),
    poly([0, 31, -1.8, 25, 1.8, 25], '#1a1a22', true),
    ellipse(0, 14, 5.8, 12, yellow),
    rect(-4.6, 7, 9.2, 2.2, '#1a1a22', true),
    rect(-5.8, 13, 11.6, 2.2, '#1a1a22', true),
    rect(-5.1, 19, 10.2, 2.2, '#1a1a22', true),
    rect(-3.1, 24, 6.2, 2.2, '#1a1a22', true),
    ellipse(0, -6, 6.2, 8.5, yellow),
    ellipse(0, -17, 4.4, 4.2, shade(yellow, -0.15)),
    ellipse(-2, -18.5, 1.9, 2.4, '#ff3030'),
    dot(-2.6, -19.3, '#ffffff'),
    ellipse(2, -18.5, 1.9, 2.4, '#ff3030'),
    dot(1.4, -19.3, '#ffffff'),
    dot(-3, -27, '#1a1a22'),
    dot(3, -27, '#1a1a22'),
  ];
}
function waspAnim(t: number): Part[] {
  const c = Math.floor(t * 10) % 2 === 0 ? '#ffffff' : '#cfeeff';
  return [dot(-28, -17, c), dot(28, -17, c)];
}

function collectorParts(): Part[] {
  const teal = '#18b8a2';
  const pod = '#3a8cd8';
  const hull = sym([0, -29, 5, -25, 9, -16, 10, -5, 10, 18, 8, 25, 4, 28]);
  return [
    rect(-28.5, -13, 10, 36, pod),
    rect(18.5, -13, 10, 36, pod),
    rect(-27, -4, 7, 3, '#13344a', true),
    rect(20, -4, 7, 3, '#13344a', true),
    rect(-27, 8, 7, 3, '#13344a', true),
    rect(20, 8, 7, 3, '#13344a', true),
    nozzle(-23.5, 23, 5.5, 3),
    nozzle(23.5, 23, 5.5, 3),
    rect(-19, -4, 38, 4, '#8a92a6'),
    rect(-19, 10, 38, 4, '#8a92a6'),
    poly(hull, teal),
    rect(-6.5, -1, 13, 21, '#143232', true),
    rect(-6.5, 9, 13, 2, '#0a1f1f', true),
    nozzle(0, 28, 6, 2.6),
    ...canopy(0, -17, 5, 4.5, '#7fd0ff'),
    rect(-26.5, -15, 1.6, 4, '#e03a3a', true),
    rect(-21.9, -15, 1.6, 4, '#e03a3a', true),
    rect(-26.5, -15.6, 6.2, 1.6, '#e03a3a', true),
    rect(20.3, -15, 1.6, 4, '#e03a3a', true),
    rect(24.9, -15, 1.6, 4, '#e03a3a', true),
    rect(20.3, -15.6, 6.2, 1.6, '#e03a3a', true),
  ];
}
function collectorAnim(t: number): Part[] {
  const r = 4 + ((t * 3) % 3) * 2;
  const pts: Part[] = [];
  for (const x of [-23.5, 23.5]) {
    pts.push(dot(x - r, -13, '#7adcff'), dot(x + r, -13, '#7adcff'), dot(x, -13 - r, '#7adcff'), dot(x, -13 + r, '#7adcff'));
  }
  pts.push(
    flicker(-23.5, 23, 3.2, 1.8, t, '#a8fff0', '#18c8b0'),
    flicker(23.5, 23, 3.2, 1.8, t, '#a8fff0', '#18c8b0'),
    flicker(0, 28, 3.6, 1.8, t, '#a8fff0', '#18c8b0'),
  );
  return pts;
}

function swiftParts(): Part[] {
  const white = '#dfe6f2';
  const wing = [-3.5, 9, -27, -9, -28.5, -4.5, -3.5, 18];
  const canard = [-3, -14, -11.5, -17.5, -11.5, -14, -3, -10];
  const fin = [-3, 22, -10, 30, -3, 28];
  const hull = sym([0, -31.5, -2.4, -22, -3.6, -8, -3.6, 20, -2.6, 28, -1.2, 29.5]);
  return [
    poly(wing, white),
    poly(mirror(wing), white),
    poly(canard, shade(white, -0.1)),
    poly(mirror(canard), shade(white, -0.1)),
    poly(fin, shade(white, -0.1)),
    poly(mirror(fin), shade(white, -0.1)),
    poly(hull, white),
    rect(-28.5, -6, 2, 4, '#1ec0ec', true),
    rect(26.5, -6, 2, 4, '#1ec0ec', true),
    nozzle(0, 28, 4.4, 2.6),
    ...canopy(0, -20, 2.5, 6.5, '#2ad0ff'),
  ];
}
function swiftAnim(t: number): Part[] {
  return [...navLights(28, -6.5, t), flicker(0, 28.8, 2.6, 1.6, t, '#c8f8ff', '#7fe8ff')];
}

function titanParts(): Part[] {
  const gold = '#d2a034';
  const wing = [-11, -6, -29, 2, -29, 16, -12, 19];
  const hull = sym([0, -30, -7, -26, -11.5, -14, -12.5, 14, -10.5, 25, -4, 28]);
  return [
    poly(wing, shade(gold, -0.32)),
    poly(mirror(wing), shade(gold, -0.32)),
    rect(-28.6, -9, 3.2, 14, '#9aa0b0'),
    rect(25.4, -9, 3.2, 14, '#9aa0b0'),
    rect(-28, -9.6, 2.2, 2.2, '#15161c', true),
    rect(25.8, -9.6, 2.2, 2.2, '#15161c', true),
    poly(hull, gold),
    rect(-25, 4, 11, 9, '#5c4a28', true),
    rect(14, 4, 11, 9, '#5c4a28', true),
    rect(-6, -2, 12, 20, '#5c4a28', true),
    rect(-9.5, 25.5, 7, 4, '#2a2d38', true),
    rect(2.5, 25.5, 7, 4, '#2a2d38', true),
    ...canopy(0, -18, 4.6, 5.4, '#ffb347'),
  ];
}
function titanAnim(t: number): Part[] {
  return [...navLights(29, 9, t), flicker(-6, 29, 4, 2, t, '#fff1a8', '#ffb020'), flicker(6, 29, 4, 2, t, '#fff1a8', '#ffb020')];
}

function chronosParts(): Part[] {
  const purple = '#7a34e8';
  const hull = sym([0, -31, -2.8, -22, -4, -6, -4, 24, -2.6, 29]);
  return [
    ellipse(0, 4, 25, 21, purple),
    hole(0, 4, 18.5, 14.5),
    rect(-18.5, 2.5, 14.5, 3, '#b8bccc'),
    rect(4, 2.5, 14.5, 3, '#b8bccc'),
    poly(hull, '#c9cadc'),
    nozzle(0, 28.5, 4.6, 2.6),
    ...canopy(0, -16, 2.6, 6.5, '#3ae0f0'),
  ];
}
function chronosAnim(t: number): Part[] {
  const pts: Part[] = [];
  for (let i = 0; i < 8; i++) {
    const a = t * 1.6 + (i / 8) * Math.PI * 2;
    const on = (Math.floor(t * 6) + i) % 3 === 0;
    pts.push(dot(Math.cos(a) * 21.7, 4 + Math.sin(a) * 17.7, on ? '#9affff' : '#5af0ff'));
  }
  pts.push(rect(-1.8, 2.5, 3.6, 3.6, Math.floor(t * 8) % 2 === 0 ? '#c08aff' : '#9a5aff', true));
  return pts;
}

function thunderParts(): Part[] {
  const blue = '#2a62e0';
  const delta = sym([0, -30, -6, -18, -29, 20, -26.5, 24, -8, 20, -3, 22]);
  const boltL = [-11, -3, -18, 9, -14, 9, -19, 21, -9, 6, -13, 6, -8, -3];
  return [
    poly(delta, blue),
    poly(boltL, '#ffd23a', true),
    poly(mirror(boltL), '#ffd23a', true),
    rect(-6.5, 14, 13, 13, '#8f96a8'),
    nozzle(0, 28, 9, 3.4),
    ...canopy(0, -11, 3.2, 7.5, '#9ad8ff'),
  ];
}
function thunderAnim(t: number): Part[] {
  const pts: Part[] = [flicker(0, 29.5, 6.4, 2.4, t, '#c8f0ff', '#8ad4ff')];
  const seed = Math.floor(t * 18);
  for (const s of [-1, 1]) {
    const rnd = (n: number) => Math.sin(seed * 12.9898 + n * 78.233 + s * 3.1) * 0.5 + 0.5;
    if (rnd(9) < 0.35) continue;
    pts.push(dot(27 * s, 21, '#c8f0ff'), dot(27 * s + s * 2, 21 + (rnd(2) - 0.5) * 6, '#7ac8ff'));
  }
  return pts;
}

function ufoParts(): Part[] {
  const pts: Part[] = [ellipse(0, 0, 29, 29, '#a9b2c4')];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(dot(Math.cos(a) * 26, Math.sin(a) * 26, '#4e5568'));
  }
  pts.push(ellipse(0, 0, 17, 17, '#9aa2b8'), ellipse(0, 0, 11, 11, '#3ad478'), dot(-3, -3, '#ffffff'), ellipse(0, 1.5, 3.2, 4, '#123018', true));
  return pts;
}
function ufoAnim(t: number): Part[] {
  const colors = ['#ffd23a', '#ff4a4a', '#5af0ff'];
  const pts: Part[] = [];
  for (let i = 0; i < 12; i++) {
    const a = -t * 2.2 + (i / 12) * Math.PI * 2;
    const on = (Math.floor(t * 6) + i) % 3 === 0;
    pts.push(dot(Math.cos(a) * 26.2, Math.sin(a) * 26.2, on ? '#ffffff' : colors[i % 3]));
  }
  return pts;
}

const PHOENIX_TAIL_COLORS = ['#e8401a', '#ff8a1f', '#ffe27a'];
const PHOENIX_WING_COLORS = ['#d8301a', '#e8501a', '#ff6a1f', '#ff8a1f', '#ffb24a', '#ffe27a'];

function phoenixParts(): Part[] {
  const pts: Part[] = [];
  [-0.32, 0, 0.32].forEach((a, i) => {
    pts.push(poly(rotatePts(feather(20, 2.8), 0, 11, Math.PI / 2 + a), PHOENIX_TAIL_COLORS[i], true));
  });
  pts.push(
    ellipse(0, 0, 5.4, 16, '#e8501a'),
    ellipse(0, -18, 4.6, 4.8, '#f0641e'),
    poly([0, -28.5, -2, -22, 2, -22], '#ffd23a', true),
    poly([0, -22, -1.5, -15, 0, -17, 1.5, -15], '#ffb020', true),
    ellipse(-1.8, -19, 1.1, 1.3, '#fff3b0'),
    ellipse(1.8, -19, 1.1, 1.3, '#fff3b0'),
  );
  return pts;
}
function phoenixAnim(t: number): Part[] {
  const flap = Math.sin(t * 6);
  const pts: Part[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + 0.42 - i * 0.24 + flap * 0.1;
      const len = 31 - i * 2.6;
      const halfW = 3.4 - i * 0.25;
      const rotated = rotatePts(feather(len, halfW), 0, 0, a);
      const scaleX = s * (0.88 + flap * 0.12);
      const px = 3.5 * s;
      const py = -6;
      const world: number[] = [];
      for (let j = 0; j < rotated.length; j += 2) world.push(rotated[j] * scaleX + px, rotated[j + 1] + py);
      pts.push(poly(world, PHOENIX_WING_COLORS[i], true));
    }
  }
  return pts;
}


/** Гадюка — вузький зелений перехоплювач: довгий ніс, передні кріла (канарди), стріловидні крила. */
function viperParts(): Part[] {
  const green = '#3fae3a';
  const wingL = [-4, -2, -24, 14, -26, 19, -16, 18, -4, 12];
  const canardL = [-3.4, -17, -11, -11, -11, -8, -3.6, -11];
  const finL = [-3, 17, -10, 27, -7, 29, -2.5, 24];
  const hull = sym([0, -33, -2, -24, -3.6, -8, -4.4, 12, -3.4, 26, -1.6, 29]);
  return [
    poly(wingL, shade(green, -0.12)),
    poly(mirror(wingL), shade(green, -0.12)),
    poly(finL, shade(green, -0.32)),
    poly(mirror(finL), shade(green, -0.32)),
    poly(canardL, shade(green, -0.22)),
    poly(mirror(canardL), shade(green, -0.22)),
    poly(hull, green),
    rect(-0.8, -4, 1.6, 26, '#1d4a1b', true),
    rect(-22, 13, 6, 2, '#d8ffb0', true),
    rect(16, 13, 6, 2, '#d8ffb0', true),
    nozzle(0, 29, 4, 2.6),
    ...canopy(0, -14, 2.4, 6.5, '#b8ff7a'),
  ];
}
function viperAnim(t: number): Part[] {
  return [...navLights(25, 17, t), flicker(0, 29.5, 2.6, 1.8, t, '#e8ffb0', '#6adc2a')];
}

/** Бастіон — широка броньована "коробка": сталь і помаранчеві броньовані пілони, два двигуни. */
function bastionParts(): Part[] {
  const steel = '#7a8296';
  const orange = '#e8742a';
  const wingL = [-10, -8, -30, -2, -32, 14, -24, 20, -10, 18];
  const hull = sym([0, -28, -6, -25, -11, -14, -12, 18, -9, 27, -4, 29]);
  return [
    poly(wingL, shade(steel, -0.15)),
    poly(mirror(wingL), shade(steel, -0.15)),
    rect(-32, -4, 4.5, 17, orange),
    rect(27.5, -4, 4.5, 17, orange),
    rect(-24, 3, 10, 4, '#2a2d38', true),
    rect(14, 3, 10, 4, '#2a2d38', true),
    poly(hull, steel),
    rect(-7, -6, 14, 22, shade(steel, -0.3), true),
    rect(-7, -6, 14, 3, orange, true),
    rect(-7, 8, 14, 2, orange, true),
    rect(-9.5, 26, 6.5, 4, '#2a2d38', true),
    rect(3, 26, 6.5, 4, '#2a2d38', true),
    ...canopy(0, -17, 4.4, 4.8, '#ffb070'),
  ];
}
function bastionAnim(t: number): Part[] {
  return [...navLights(30, -5, t), flicker(-6.2, 30.5, 3.8, 2, t, '#ffe0b0', '#ff7a2a'), flicker(6.2, 30.5, 3.8, 2, t, '#ffe0b0', '#ff7a2a')];
}

/** Нова — біло-фіолетовий зоряний перехоплювач: крила вперед і енергетичне ядро, що пульсує. */
function novaParts(): Part[] {
  const violet = '#7a4ae8';
  const white = '#e8eeff';
  const wingL = [-4, 2, -30, -7, -27, 4, -14, 12, -5, 14];
  const tailL = [-4, 16, -16, 22, -15, 27, -4, 24];
  const hull = sym([0, -32, -3, -22, -5, -6, -5, 20, -3.4, 28]);
  return [
    poly(tailL, shade(violet, -0.25)),
    poly(mirror(tailL), shade(violet, -0.25)),
    poly(wingL, violet),
    poly(mirror(wingL), violet),
    poly([-29, -6.4, -24, -4.6, -25, -1, -28.5, -1.8], white, true),
    poly(mirror([-29, -6.4, -24, -4.6, -25, -1, -28.5, -1.8]), white, true),
    poly(hull, white),
    poly(sym([0, -6, -3, 0, -3, 12, 0, 16]), shade(violet, -0.1), true),
    nozzle(0, 28, 5, 2.8),
    ...canopy(0, -16, 2.6, 6, '#c8a8ff'),
  ];
}
function novaAnim(t: number): Part[] {
  const r = 2.2 + Math.sin(t * 6) * 0.6;
  return [...navLights(28, -5, t), ellipse(0, 5, r, r, '#ffd8ff', true), flicker(0, 28.5, 3, 2, t, '#f0e0ff', '#a06aff')];
}

/** Затемнення — сезонний літак: чорний корпус, золота корона навколо "диска", що світиться. */
function eclipseParts(): Part[] {
  const black = '#1c1a2a';
  const gold = '#f0b030';
  const wingL = [-4, -4, -29, 6, -30, 12, -18, 15, -5, 14];
  const tailL = [-3, 18, -11, 27, -8, 29, -2.5, 25];
  const hull = sym([0, -32, -2.6, -24, -4.6, -10, -5, 16, -3.4, 27, -1.6, 29]);
  return [
    poly(tailL, shade(gold, -0.25)),
    poly(mirror(tailL), shade(gold, -0.25)),
    poly(wingL, black),
    poly(mirror(wingL), black),
    poly([-29, 6, -30, 12, -24, 13.5, -24, 8], gold, true),
    poly(mirror([-29, 6, -30, 12, -24, 13.5, -24, 8]), gold, true),
    poly(hull, black),
    rect(-0.7, -22, 1.4, 40, gold, true),
    ellipse(0, 2, 7.5, 7.5, gold),
    ellipse(0, 2, 5.2, 5.2, '#0a0812', true),
    nozzle(0, 29, 4.4, 2.6),
    ...canopy(0, -15, 2.4, 5.6, '#ffe08a'),
  ];
}
function eclipseAnim(t: number): Part[] {
  const r = 1.6 + Math.abs(Math.sin(t * 3)) * 1.4;
  return [...navLights(29, 9, t), ellipse(0, 2, r, r, '#fff1b0', true), flicker(0, 29.5, 2.8, 1.8, t, '#fff6c8', '#ffb020')];
}

const SHIPS: Record<PlaneId, ShipDef> = {
  falcon: { parts: falconParts(), anim: falconAnim },
  phantom: { parts: phantomParts(), anim: phantomAnim },
  blaze: { parts: blazeParts(), anim: blazeAnim },
  wasp: { parts: waspParts(), anim: waspAnim },
  collector: { parts: collectorParts(), anim: collectorAnim },
  swift: { parts: swiftParts(), anim: swiftAnim },
  titan: { parts: titanParts(), anim: titanAnim },
  chronos: { parts: chronosParts(), anim: chronosAnim },
  viper: { parts: viperParts(), anim: viperAnim },
  thunder: { parts: thunderParts(), anim: thunderAnim },
  bastion: { parts: bastionParts(), anim: bastionAnim },
  ufo: { parts: ufoParts(), anim: ufoAnim },
  nova: { parts: novaParts(), anim: novaAnim },
  phoenix: { parts: phoenixParts(), anim: phoenixAnim },
  eclipse: { parts: eclipseParts(), anim: eclipseAnim },
};

// ---------- тір-скіни та піпси рівня ----------

/** Колір тіру за номером тіру (1 — без тінту, виглядає як базовий корпус). Експортується для UI (бейджі/зірки в ангарі). */
export const TIER_COLORS: Record<number, string> = { 1: '', 2: '#8fd8ff', 3: '#c08aff', 4: '#ffd24a' };

/** Змішує колір у бік target на amount (0..1), зберігаючи загальну яскравість деталі. */
function tintToward(base: string, target: string, amount: number): string {
  const [r1, g1, b1] = parseColor(base);
  const [r2, g2, b2] = parseColor(target);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return `rgb(${mix(r1, r2)},${mix(g1, g2)},${mix(b1, b2)})`;
}

/** Ключові точки силуету: кінчик крила (найдальша від осі точка), ніс і хвіст. */
function silhouette(parts: Part[]): { tipX: number; tipY: number; noseY: number; tailY: number; bodyW: number } {
  let tipX = 0;
  let tipY = 0;
  let noseY = Infinity;
  let tailY = -Infinity;
  let bodyW = 3;
  const visit = (x: number, y: number) => {
    if (Math.abs(x) > tipX) {
      tipX = Math.abs(x);
      tipY = y;
    }
    if (y < noseY) noseY = y;
    if (y > tailY) tailY = y;
    // ширина фюзеляжу в районі центру — для бронеплит
    if (Math.abs(y) < 6 && Math.abs(x) < 8) bodyW = Math.max(bodyW, Math.abs(x));
  };
  for (const p of parts) {
    if (p.kind === 'poly') for (let i = 0; i < p.pts.length; i += 2) visit(p.pts[i], p.pts[i + 1]);
    else if (p.kind === 'rect') {
      visit(p.x, p.y);
      visit(p.x + p.w, p.y + p.h);
    } else if (p.kind === 'ellipse') {
      visit(p.x - p.rx, p.y);
      visit(p.x + p.rx, p.y);
      visit(p.x, p.y - p.ry);
      visit(p.x, p.y + p.ry);
    }
  }
  return { tipX, tipY, noseY, tailY, bodyW };
}

const LIMIT = 34.5;
const clampX = (x: number) => Math.max(-LIMIT, Math.min(LIMIT, x));

/** Пара симетричних деталей (ліва + дзеркальна права). */
function pair(make: (side: 1 | -1) => Part[]): Part[] {
  return [...make(-1), ...make(1)];
}

/**
 * Тір — помітно новий корпус поверх базового силуету:
 * 2 — бронеплити вздовж фюзеляжу й бокові повітрозабірники, корпус у тіровому кольорі;
 * 3 — додаються передні кермà (canards), подвійні кілі й темні броньовані смуги;
 * 4 — розширені крила-лезо з золотою окантовкою, додаткові сопла й світне ядро.
 */
function applyTierSkin(parts: Part[], tier: number): Part[] {
  if (tier <= 1) return parts;
  const tint = TIER_COLORS[Math.min(tier, 4)];
  // легкий тінт — корпус лишається насиченим, а новий вигляд дають деталі
  const amount = 0.08 + tier * 0.06;
  const recolored = parts.map((p) => {
    if (p.kind === 'hole' || p.kind === 'dot' || p.flat) return p;
    return { ...p, base: tintToward(p.base, tint, amount) };
  });
  const { tipX, tipY, noseY, tailY, bodyW } = silhouette(parts);
  const len = tailY - noseY;
  const gun = '#3a4258';
  const under: Part[] = [];
  const over: Part[] = [];

  // T2: темні бронеплити вздовж фюзеляжу з яскравою окантовкою + повітрозабірники
  over.push(
    ...pair((sd) => [
      poly([sd * (bodyW - 0.5), noseY + len * 0.26, sd * (bodyW + 4.2), noseY + len * 0.36, sd * (bodyW + 4.2), noseY + len * 0.74, sd * (bodyW - 0.5), noseY + len * 0.84], gun),
      rect(sd > 0 ? bodyW + 3 : -bodyW - 4.2, noseY + len * 0.38, 1.2, len * 0.34, tint, true),
      rect(sd > 0 ? bodyW + 0.6 : -bodyW - 2.6, noseY + len * 0.4, 2, 4, '#0c0f1c', true),
    ]),
  );

  if (tier >= 3) {
    // великі передні кермà
    under.push(...pair((sd) => [poly([sd * bodyW, noseY + len * 0.16, sd * clampX(bodyW + 12), noseY + len * 0.3, sd * clampX(bodyW + 11), noseY + len * 0.36, sd * bodyW, noseY + len * 0.32], shade(tint, -0.25))]));
    // подвійні кілі
    over.push(...pair((sd) => [poly([sd * (bodyW + 0.5), tailY - len * 0.3, sd * (bodyW + 5.5), tailY - len * 0.02, sd * (bodyW + 1), tailY - len * 0.06], shade(tint, -0.1)), dot(sd * (bodyW + 4.5), tailY - len * 0.05, tint)]));
    // яскраві смуги на крилах
    over.push(...pair((sd) => [poly([sd * tipX * 0.5, tipY - 3, sd * tipX * 0.62, tipY - 3, sd * tipX * 0.62, tipY + 4, sd * tipX * 0.5, tipY + 4], tint, true)]));
  }

  if (tier >= 4) {
    const gold = '#ffd24a';
    // крила-лезо з золотою кромкою
    under.push(
      ...pair((sd) => [
        poly([sd * tipX * 0.55, tipY - 3, sd * clampX(tipX + 6.5), tipY + 2, sd * clampX(tipX + 5), tipY + 11, sd * tipX * 0.65, tipY + 5], shade(tint, -0.3)),
        poly([sd * clampX(tipX + 3), tipY + 1, sd * clampX(tipX + 6.5), tipY + 2, sd * clampX(tipX + 5), tipY + 11, sd * clampX(tipX + 3.5), tipY + 8], gold),
      ]),
    );
    // додаткові сопла з вогнем
    over.push(...pair((sd) => [rect(sd > 0 ? bodyW + 0.4 : -bodyW - 4.4, tailY - 3.6, 4, 4, '#2a2d38', true), rect(sd > 0 ? bodyW + 1.2 : -bodyW - 3.6, tailY, 2.4, 2, '#ffcf6a', true)]));
    // світне ядро і золотий ніс
    over.push(ellipse(0, noseY + len * 0.56, 2, 3.6, '#fff3b0', true), poly([0, noseY - 0.5, -1.8, noseY + 4, 1.8, noseY + 4], gold, true));
  }
  return [...under, ...recolored, ...over];
}

/**
 * Рівень у межах тіру — обвіси, які видно з першого погляду:
 * 2 — підвісні паливні баки під крилами; 3 — пара великих ракет на пілонах;
 * 4 — сенсорна штанга на носі, напрямні на кінцях крил і спинний гребінь.
 */
function levelPips(parts: Part[], tier: number, level: number): Part[] {
  if (level <= 1) return [];
  const accent = TIER_COLORS[Math.max(2, Math.min(tier, 4))] || '#8fd8ff';
  const { tipX, tipY, noseY, tailY, bodyW } = silhouette(parts);
  const len = tailY - noseY;
  const out: Part[] = [];
  // паливні баки
  out.push(...pair((sd) => [ellipse(sd * tipX * 0.4, tipY + 3, 2.6, 6.2, '#d8dce8'), rect(sd * tipX * 0.4 - 1.3, tipY + 7, 2.6, 1.6, accent, true)]));
  if (level >= 3) {
    // великі ракети з червоними боєголовками
    out.push(
      ...pair((sd) => {
        const x = sd * tipX * 0.74;
        return [rect(x - 1.5, tipY - 6, 3, 13, '#e6e9f0'), ellipse(x, tipY - 6, 1.6, 2.4, '#ff3a3a', true), rect(x - 2.6, tipY + 5, 5.2, 2, shade(accent, -0.2))];
      }),
    );
  }
  if (level >= 4) {
    out.push(
      rect(-0.8, noseY - 5, 1.6, 6, '#d8dce8', true),
      dot(0, noseY - 5.2, '#ff3a3a'),
      // спинний гребінь
      poly([0, noseY + len * 0.45, -1.6, noseY + len * 0.6, 0, noseY + len * 0.75, 1.6, noseY + len * 0.6], accent, true),
      ...pair((sd) => [rect(sd > 0 ? clampX(tipX) - 2 : -clampX(tipX), tipY - 6, 2, 10, '#9aa6c0'), dot(sd * (clampX(tipX) - 1), tipY - 6.4, accent)]),
    );
  }
  void bodyW;
  return out;
}

// ---------- растеризатор (тверда піксельна сітка, без згладжування) ----------

/** Розмір сітки (пікселів на сторону) і світових одиниць на один піксель. */
const GRID = 40;
const CELL = 1.8;
const HALF = GRID / 2;
/** Розмір сторони кешованого спрайта у "світових" одиницях — як UNITS у попередній версії. */
const UNITS = GRID * CELL;
const SUPER = 3;
const OUTLINE: [number, number, number] = [10, 7, 18];
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function pointInPoly(x: number, y: number, pts: number[]): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2];
    const yi = pts[i * 2 + 1];
    const xj = pts[j * 2];
    const yj = pts[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function shapeTest(part: ShapePart): (x: number, y: number) => boolean {
  if (part.kind === 'poly') {
    const pts = part.pts;
    return (x, y) => pointInPoly(x, y, pts);
  }
  if (part.kind === 'rect') {
    const { x: x0, y: y0, w, h } = part;
    return (x, y) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
  }
  const { x: cx, y: cy, rx, ry } = part;
  return (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

function bboxOf(part: ShapePart): [number, number, number, number] {
  if (part.kind === 'poly') {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < part.pts.length; i += 2) {
      const x = part.pts[i];
      const y = part.pts[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return [minX, minY, maxX, maxY];
  }
  if (part.kind === 'rect') return [part.x, part.y, part.x + part.w, part.y + part.h];
  return [part.x - part.rx, part.y - part.ry, part.x + part.rx, part.y + part.ry];
}

function worldToGrid(w: number): number {
  return w / CELL + HALF;
}

function cellCoverage(test: (x: number, y: number) => boolean, gx: number, gy: number): number {
  const wx0 = (gx - HALF) * CELL;
  const wy0 = (gy - HALF) * CELL;
  let hits = 0;
  for (let sy = 0; sy < SUPER; sy++) {
    for (let sx = 0; sx < SUPER; sx++) {
      const x = wx0 + (sx + 0.5) * (CELL / SUPER);
      const y = wy0 + (sy + 0.5) * (CELL / SUPER);
      if (test(x, y)) hits++;
    }
  }
  return hits / (SUPER * SUPER);
}

/** Квантоване освітлення в 3 тони: світло зліва-згори (як і в усіх кораблях — єдине джерело). */
function lightTone(base: string, gx: number, gy: number): string {
  const x = (gx - HALF + 0.5) * CELL;
  const y = (gy - HALF + 0.5) * CELL;
  const t = (x + y) / 30;
  if (t < -0.25) return shade(base, 0.38);
  if (t > 0.25) return shade(base, -0.4);
  return base;
}

function setPixel(buf: Uint8ClampedArray, gx: number, gy: number, r: number, g: number, b: number, a: number): void {
  if (gx < 0 || gy < 0 || gx >= GRID || gy >= GRID) return;
  const i = (gy * GRID + gx) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

function paintPart(buf: Uint8ClampedArray, part: Part): void {
  if (part.kind === 'dot') {
    const gx = Math.floor(worldToGrid(part.x));
    const gy = Math.floor(worldToGrid(part.y));
    const [r, g, b] = parseColor(part.color);
    setPixel(buf, gx, gy, r, g, b, 255);
    return;
  }
  const [minX, minY, maxX, maxY] = bboxOf(part);
  const gx0 = Math.max(0, Math.floor(worldToGrid(minX)) - 1);
  const gy0 = Math.max(0, Math.floor(worldToGrid(minY)) - 1);
  const gx1 = Math.min(GRID - 1, Math.ceil(worldToGrid(maxX)) + 1);
  const gy1 = Math.min(GRID - 1, Math.ceil(worldToGrid(maxY)) + 1);
  const test = shapeTest(part);
  for (let gy = gy0; gy <= gy1; gy++) {
    for (let gx = gx0; gx <= gx1; gx++) {
      if (cellCoverage(test, gx, gy) < 0.5) continue;
      if (part.kind === 'hole') {
        setPixel(buf, gx, gy, 0, 0, 0, 0);
        continue;
      }
      const color = part.flat ? part.base : lightTone(part.base, gx, gy);
      const [r, g, b] = parseColor(color);
      setPixel(buf, gx, gy, r, g, b, 255);
    }
  }
}

/** Суцільний темний контур по всьому силуету (включно з внутрішніми вирізами). */
function outlinePass(buf: Uint8ClampedArray): void {
  const src = buf.slice();
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const i = (gy * GRID + gx) * 4;
      if (src[i + 3] !== 0) continue;
      let touches = false;
      for (const [dx, dy] of NEIGHBORS) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        if (src[(ny * GRID + nx) * 4 + 3] !== 0) {
          touches = true;
          break;
        }
      }
      if (touches) setPixel(buf, gx, gy, OUTLINE[0], OUTLINE[1], OUTLINE[2], 255);
    }
  }
}

function rasterize(parts: Part[], outline: boolean): ImageData {
  const buf = new Uint8ClampedArray(GRID * GRID * 4);
  for (const part of parts) paintPart(buf, part);
  if (outline) outlinePass(buf);
  return new ImageData(buf, GRID, GRID);
}

function canvasFrom(data: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = GRID;
  c.height = GRID;
  c.getContext('2d')!.putImageData(data, 0, 0);
  return c;
}

// ---------- кеш і публічне API ----------

const bodyCache = new Map<string, HTMLCanvasElement>();
const iconCache = new Map<string, string>();
let animScratch: HTMLCanvasElement | null = null;

function skinnedParts(id: PlaneId, tier: number, level: number): Part[] {
  const base = SHIPS[id].parts;
  const skinned = applyTierSkin(base, tier);
  return [...skinned, ...levelPips(base, tier, level)];
}

function bodyCanvas(id: PlaneId, tier: number, level: number): HTMLCanvasElement {
  const key = `${id}:${tier}:${level}`;
  let c = bodyCache.get(key);
  if (c) return c;
  c = canvasFrom(rasterize(skinnedParts(id, tier, level), true));
  bodyCache.set(key, c);
  return c;
}

/**
 * Малює літак з центром у поточному початку координат, ніс угору.
 * size — розмір у пікселях світу для квадрата 64 одиниці. Масштабування — без
 * згладжування (nearest-neighbor), щоб пікселі лишались чіткими квадратами.
 * tier/level — прокачка (1 — базовий вигляд без змін).
 */
export function drawPlane(ctx: Ctx, id: PlaneId, size: number, t: number, tier = 1, level = 1): void {
  const k = size / 64;
  const s = UNITS * k;
  if (tier >= 3) {
    const tint = TIER_COLORS[Math.min(tier, 4)];
    const [r, g, b] = parseColor(tint);
    const pulse = 0.75 + Math.sin(t * 3) * 0.25;
    const grad = ctx.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 0.62);
    grad.addColorStop(0, `rgba(${r},${g},${b},${(tier >= 4 ? 0.38 : 0.22) * pulse})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(-s * 0.62, -s * 0.62, s * 1.24, s * 1.24);
  }
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bodyCanvas(id, tier, level), -s / 2, -s / 2, s, s);
  const anim = SHIPS[id].anim?.(t);
  if (anim && anim.length) {
    if (!animScratch) {
      animScratch = document.createElement('canvas');
      animScratch.width = GRID;
      animScratch.height = GRID;
    }
    const actx = animScratch.getContext('2d')!;
    actx.clearRect(0, 0, GRID, GRID);
    actx.putImageData(rasterize(anim, false), 0, 0);
    ctx.drawImage(animScratch, -s / 2, -s / 2, s, s);
  }
  ctx.imageSmoothingEnabled = prevSmooth;
}

/** Картинка літака для HTML (ангар, меню) — data URL, генерується один раз. CSS має додати image-rendering: pixelated. */
export function planeIconUrl(id: PlaneId, tier = 1, level = 1): string {
  const key = `${id}:${tier}:${level}`;
  let url = iconCache.get(key);
  if (url) return url;
  const def = SHIPS[id];
  const parts = def.anim ? [...skinnedParts(id, tier, level), ...def.anim(0.4)] : skinnedParts(id, tier, level);
  const c = canvasFrom(rasterize(parts, true));
  url = c.toDataURL('image/png');
  iconCache.set(key, url);
  return url;
}
