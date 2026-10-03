/**
 * Піксельні примітиви для літаків: кольори, геометрія й фігури (спільні для корпусів і їхньої еволюції).
 */


// ---------- кольори ----------

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function parseColor(c: string): [number, number, number] {
  if (c[0] === '#') return hexToRgb(c);
  const m = c.match(/\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((s) => parseFloat(s));
    return [r, g, b];
  }
  return [255, 0, 255];
}

/** k > 0 — світліше (до білого), k < 0 — темніше (до чорного). Приймає і '#hex', і 'rgb(...)' (для подвійного тонування). */
export function shade(color: string, k: number): string {
  const [r, g, b] = parseColor(color);
  const f = (c: number) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// ---------- геометрія ----------

/** Дзеркальна копія лівої деталі праворуч. */
export function mirror(pts: number[]): number[] {
  return pts.map((v, i) => (i % 2 === 0 ? -v : v));
}

/** Симетричний контур із точок лівої половини (від носа до хвоста). */
export function sym(half: number[]): number[] {
  const pts = [...half];
  for (let i = half.length - 2; i >= 0; i -= 2) pts.push(-half[i], half[i + 1]);
  return pts;
}

export function rotatePts(pts: number[], cx: number, cy: number, angle: number): number[] {
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
export function feather(len: number, w: number): number[] {
  const n = 5;
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push((i / n) * len, -w * Math.sin((i / n) * Math.PI));
  for (let i = n; i >= 0; i--) pts.push((i / n) * len, w * Math.sin((i / n) * Math.PI));
  return pts;
}

// ---------- фігури ----------

/** Частина літака: багатокутник, еліпс, прямокутник, "дірка" (виріз) або один піксель. */
export type Part =
  | { kind: 'poly'; pts: number[]; base: string; flat?: boolean }
  | { kind: 'ellipse'; x: number; y: number; rx: number; ry: number; base: string; flat?: boolean }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; base: string; flat?: boolean }
  | { kind: 'hole'; x: number; y: number; rx: number; ry: number }
  | { kind: 'dot'; x: number; y: number; color: string };

export type ShapePart = Exclude<Part, { kind: 'dot' }>;

export function poly(pts: number[], base: string, flat?: boolean): Part {
  return { kind: 'poly', pts, base, flat };
}
export function ellipse(x: number, y: number, rx: number, ry: number, base: string, flat?: boolean): Part {
  return { kind: 'ellipse', x, y, rx, ry, base, flat };
}
export function rect(x: number, y: number, w: number, h: number, base: string, flat?: boolean): Part {
  return { kind: 'rect', x, y, w, h, base, flat };
}
export function hole(x: number, y: number, rx: number, ry: number): Part {
  return { kind: 'hole', x, y, rx, ry };
}
export function dot(x: number, y: number, color: string): Part {
  return { kind: 'dot', x, y, color };
}

/** Скляний ліхтар кабіни + відблиск у вигляді світлого пікселя. */
export function canopy(x: number, y: number, rx: number, ry: number, glass: string): Part[] {
  return [ellipse(x, y, rx, ry, glass), dot(x - rx * 0.35, y - ry * 0.45, '#ffffff')];
}

/** Сопло двигуна (темний корпус; полум'я домальовується в анімації). */
export function nozzle(x: number, y: number, w: number, h: number): Part {
  return rect(x - w / 2, y - h / 2, w, h, '#2a2d38', true);
}

/** Пляма полум'я/жару заданого кольору. */
export function flame(x: number, y: number, w: number, h: number, hot: string): Part {
  return rect(x - w / 2, y - h / 2, w, h, hot, true);
}

/** Мерехтливе полум'я — перемикається між двома кольорами (піксельна анімація, без плавних переходів). */
export function flicker(x: number, y: number, w: number, h: number, t: number, a: string, b: string): Part {
  return flame(x, y, w, h, Math.floor(t * 14) % 2 === 0 ? a : b);
}

/** Ракета під крилом: корпус + бойова частина. */
export function missile(x: number, y: number, len: number, tip = '#ff4a3a'): Part[] {
  return [rect(x - 1.1, y, 2.2, len, '#e6e9f0'), ellipse(x, y + 1.1, 1.3, 1.5, tip, true)];
}

/** Навігаційні вогні на кінцях крил: червоний ліворуч, зелений праворуч, жорстко блимають. */
export function navLights(x: number, y: number, t: number): Part[] {
  const on = Math.floor(t * 6) % 2 === 0;
  return [dot(-x, y, on ? '#ff3030' : '#902020'), dot(x, y, on ? '#30ff70' : '#1a7a40')];
}

/** Пара симетричних деталей (ліва + дзеркальна права). */
export function pair(make: (side: 1 | -1) => Part[]): Part[] {
  return [...make(-1), ...make(1)];
}

/** Обидві сторони однієї деталі: ліва (як задано) і дзеркальна права. */
export function both(pts: number[], base: string, flat?: boolean): Part[] {
  return [poly(pts, base, flat), poly(mirror(pts), base, flat)];
}

/** Кільце (еліпс з отвором) одним багатокутником: зовнішній контур + внутрішній у зворотному порядку (even-odd). */
export function annulus(cx: number, cy: number, rx: number, ry: number, ix: number, iy: number, base: string, flat?: boolean, n = 32): Part {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  for (let i = n; i >= 0; i--) {
    const a = (i / n) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * ix, cy + Math.sin(a) * iy);
  }
  return poly(pts, base, flat);
}
