import { drawGlow } from './fx';

/**
 * Анімовані візуальні ефекти бою: промені, блискавки, вибухи, ударні хвилі, спалахи.
 * Усе малюється шарами з адитивним змішуванням: широке м'яке світіння → кольорове тіло → білe ядро.
 * Спільне для кампанії й PvP.
 */

type Ctx = CanvasRenderingContext2D;

/** '#rrggbb' або 'r,g,b' → 'r,g,b' */
export function rgbOf(color: string): string {
  if (color[0] !== '#') return color;
  const n = parseInt(color.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Детермінований шум (щоб блискавки й іскри не "мерехтіли" хаотично між кадрами одного кроку). */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Чотирипроменевий спалах (дуло, точка влучання, вибух). */
export function starFlare(ctx: Ctx, x: number, y: number, size: number, color: string, alpha = 1, rot = 0): void {
  if (size < 1 || alpha <= 0) return;
  const c = rgbOf(color);
  drawGlow(ctx, x, y, `rgba(${c},1)`, size * 1.4, 0.6 * alpha);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    ctx.rotate(Math.PI / 2 * i);
    const g = ctx.createLinearGradient(-size, 0, size, 0);
    g.addColorStop(0, `rgba(${c},0)`);
    g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.lineTo(0, -size * 0.09);
    ctx.lineTo(size, 0);
    ctx.lineTo(0, size * 0.09);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface BeamStyle {
  color: string;
  /** Базова ширина тіла променя */
  width?: number;
  /** Рейкотрон: подвійна спіраль навколо ядра й повільне згасання */
  rail?: boolean;
  /** Множник ширини (промінь-тягач) */
  wide?: number;
}

/**
 * Лазерний промінь з анімацією: k — "життя" 1→0. Енергетичні імпульси біжать від дула до цілі,
 * тіло пульсує по ширині, на дулі й у точці влучання — спалахи та іскри.
 */
export function beam(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, k: number, time: number, st: BeamStyle): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1 || k <= 0) return;
  const c = rgbOf(st.color);
  const w = (st.width ?? (st.rail ? 7 : 5)) * (st.wide ?? 1);
  // поява — різкий спалах, далі плавне звуження
  const grow = Math.min(1, (1 - k) * 8 + 0.35);
  const body = w * (0.55 + 0.45 * k) * grow;
  const ang = Math.atan2(y2 - y1, x2 - x1);

  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  // широке м'яке світіння
  ctx.strokeStyle = `rgba(${c},${0.16 * k})`;
  ctx.lineWidth = body * 5;
  line(ctx, 0, len);
  ctx.strokeStyle = `rgba(${c},${0.35 * k})`;
  ctx.lineWidth = body * 2.4;
  line(ctx, 0, len);

  // тіло: хвиляста ширина вздовж довжини
  const seg = 18;
  ctx.fillStyle = `rgba(${c},${0.75 * k})`;
  ctx.beginPath();
  for (let i = 0; i <= seg; i++) {
    const s = (i / seg) * len;
    const wob = 1 + Math.sin(s * 0.05 - time * 40) * 0.22;
    ctx.lineTo(s, -body * 0.6 * wob);
  }
  for (let i = seg; i >= 0; i--) {
    const s = (i / seg) * len;
    const wob = 1 + Math.sin(s * 0.05 - time * 40 + 1.3) * 0.22;
    ctx.lineTo(s, body * 0.6 * wob);
  }
  ctx.closePath();
  ctx.fill();

  // біле розпечене ядро
  ctx.strokeStyle = `rgba(255,255,255,${0.95 * k})`;
  ctx.lineWidth = Math.max(1, body * 0.32);
  line(ctx, 0, len);

  // енергетичні імпульси, що біжать до цілі
  const pulses = Math.max(2, Math.floor(len / 90));
  for (let i = 0; i < pulses; i++) {
    const s = ((time * 900 + (i * len) / pulses) % len + len) % len;
    const g = ctx.createRadialGradient(s, 0, 0, s, 0, body * 1.6);
    g.addColorStop(0, `rgba(255,255,255,${0.8 * k})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(s, 0, body * 3, body * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (st.rail) {
    // подвійна спіраль навколо ядра (рейка)
    for (const ph of [0, Math.PI]) {
      ctx.strokeStyle = `rgba(${c},${0.85 * k})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let s = 0; s <= len; s += 6) {
        const r = body * (0.9 + (1 - k) * 2.2);
        ctx.lineTo(s, Math.sin(s * 0.12 + ph - time * 18) * r);
      }
      ctx.stroke();
    }
  }
  ctx.restore();

  // спалахи на дулі й у точці влучання
  starFlare(ctx, x1, y1, (14 + w * 2.2) * grow, st.color, k, time * 6);
  starFlare(ctx, x2, y2, (12 + w * 2.6) * (0.7 + 0.3 * Math.sin(time * 50)), st.color, k, -time * 4);
  // іскри в точці влучання — лінії-штрихи, що розлітаються
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,240,220,${0.8 * k})`;
  ctx.lineWidth = 1.4;
  const seed = Math.floor(time * 30);
  for (let i = 0; i < 5; i++) {
    const a = ang + Math.PI + (hash(seed + i) - 0.5) * 2.4;
    const r0 = 4 + hash(seed * 3 + i) * 6;
    const r1 = r0 + 6 + hash(seed * 7 + i) * 14 * (1 - k * 0.5);
    ctx.beginPath();
    ctx.moveTo(x2 + Math.cos(a) * r0, y2 + Math.sin(a) * r0);
    ctx.lineTo(x2 + Math.cos(a) * r1, y2 + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

function line(ctx: Ctx, from: number, to: number): void {
  ctx.beginPath();
  ctx.moveTo(from, 0);
  ctx.lineTo(to, 0);
  ctx.stroke();
}

/** Ламана блискавки між двома точками з відгалуженнями. seed — щоб форма мінялась кілька разів на секунду. */
export function lightning(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, color: string, alpha: number, seed: number, width = 2.4): void {
  const c = rgbOf(color);
  const pts = boltPoints(x1, y1, x2, y2, seed, 6);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const stroke = (p: number[], w: number, col: string) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.stroke();
  };
  stroke(pts, width * 5, `rgba(${c},${0.18 * alpha})`);
  stroke(pts, width * 2.2, `rgba(${c},${0.6 * alpha})`);
  stroke(pts, width * 0.8, `rgba(255,255,255,${alpha})`);
  // відгалуження
  for (let b = 0; b < 2; b++) {
    const i = 2 + Math.floor(hash(seed + b * 13) * (pts.length / 2 - 4)) * 2;
    const bx = pts[i];
    const by = pts[i + 1];
    const a = Math.atan2(y2 - y1, x2 - x1) + (hash(seed + b) - 0.5) * 2.2;
    const l = Math.hypot(x2 - x1, y2 - y1) * (0.15 + hash(seed * 2 + b) * 0.2);
    const br = boltPoints(bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l, seed + 99 + b, 3);
    stroke(br, width * 1.4, `rgba(${c},${0.45 * alpha})`);
    stroke(br, width * 0.5, `rgba(255,255,255,${0.7 * alpha})`);
  }
  ctx.restore();
  drawGlow(ctx, x2, y2, `rgba(${c},1)`, 26, 0.7 * alpha);
}

function boltPoints(x1: number, y1: number, x2: number, y2: number, seed: number, depth: number): number[] {
  let pts = [x1, y1, x2, y2];
  let amp = Math.hypot(x2 - x1, y2 - y1) * 0.18;
  for (let d = 0; d < depth; d++) {
    const out: number[] = [];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const ax = pts[i];
      const ay = pts[i + 1];
      const bx = pts[i + 2];
      const by = pts[i + 3];
      const nx = -(by - ay);
      const ny = bx - ax;
      const nl = Math.hypot(nx, ny) || 1;
      const off = (hash(seed * 31 + d * 7 + i) - 0.5) * 2 * amp;
      out.push(ax, ay, (ax + bx) / 2 + (nx / nl) * off, (ay + by) / 2 + (ny / nl) * off);
    }
    out.push(pts[pts.length - 2], pts[pts.length - 1]);
    pts = out;
    amp *= 0.55;
  }
  return pts;
}

/** Ударна хвиля: товсте м'яке кільце з яскравою кромкою та променями-штрихами. k — прогрес 0→1. */
export function shockwave(ctx: Ctx, x: number, y: number, r: number, k: number, color: string): void {
  if (r < 2) return;
  const c = rgbOf(color);
  const fade = 1 - k;
  const th = Math.max(4, r * 0.18 * fade + 3);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, Math.max(0, r - th * 2), x, y, r + th);
  g.addColorStop(0, `rgba(${c},0)`);
  g.addColorStop(0.65, `rgba(${c},${0.35 * fade})`);
  g.addColorStop(0.85, `rgba(255,255,255,${0.55 * fade})`);
  g.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r + th, 0, Math.PI * 2);
  ctx.fill();
  // радіальні штрихи уздовж фронту
  ctx.strokeStyle = `rgba(255,255,255,${0.5 * fade})`;
  ctx.lineWidth = 1.5;
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(i + Math.floor(x)) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * (r - th), y + Math.sin(a) * (r - th));
    ctx.lineTo(x + Math.cos(a) * (r + th * 0.6), y + Math.sin(a) * (r + th * 0.6));
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- система вибухів і хвиль ----------

interface Blast {
  x: number;
  y: number;
  t: number;
  dur: number;
  size: number;
  color: string;
  seed: number;
}

interface Wave {
  x: number;
  y: number;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  color: string;
}

interface Flash {
  x: number;
  y: number;
  t: number;
  dur: number;
  size: number;
  color: string;
  rot: number;
}

interface Bolt {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  dur: number;
  color: string;
  seed: number;
  width: number;
}

/**
 * Менеджер "великих" ефектів: вогняні кулі з димом і уламками, ударні хвилі, короткі блискавки.
 * Частинки лишаються в ParticleSystem — тут те, що малюється формою й градієнтами.
 */
export class Vfx {
  private blasts: Blast[] = [];
  private waves: Wave[] = [];
  private bolts: Bolt[] = [];
  private flashes: Flash[] = [];

  /** Короткий спалах (дуло, влучання): зірка, що гасне за dur. */
  flash(x: number, y: number, size: number, color: string, dur = 0.08): void {
    if (this.flashes.length > 80) this.flashes.shift();
    this.flashes.push({ x, y, t: 0, dur, size, color, rot: Math.random() * Math.PI });
  }

  /** Вибух: size — радіус вогняної кулі в px. */
  explode(x: number, y: number, size: number, color = '#ff8a3a', dur = 0.75): void {
    if (this.blasts.length > 60) this.blasts.shift();
    this.blasts.push({ x, y, t: 0, dur, size, color, seed: Math.random() * 1000 });
  }

  wave(x: number, y: number, r1: number, color: string, dur = 0.5, r0 = 8): void {
    if (this.waves.length > 60) this.waves.shift();
    this.waves.push({ x, y, t: 0, dur, r0, r1, color });
  }

  bolt(x1: number, y1: number, x2: number, y2: number, color: string, dur = 0.22, width = 2.4): void {
    if (this.bolts.length > 40) this.bolts.shift();
    this.bolts.push({ x1, y1, x2, y2, t: 0, dur, color, seed: Math.random() * 1000, width });
  }

  update(dt: number): void {
    for (const b of this.blasts) b.t += dt;
    for (const w of this.waves) w.t += dt;
    for (const b of this.bolts) b.t += dt;
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.dur);
    this.blasts = this.blasts.filter((b) => b.t < b.dur);
    this.waves = this.waves.filter((w) => w.t < w.dur);
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
  }

  clear(): void {
    this.blasts = [];
    this.waves = [];
    this.bolts = [];
    this.flashes = [];
  }

  render(ctx: Ctx, time: number): void {
    for (const w of this.waves) {
      const k = w.t / w.dur;
      const ease = 1 - Math.pow(1 - k, 3);
      shockwave(ctx, w.x, w.y, w.r0 + (w.r1 - w.r0) * ease, k, w.color);
    }
    for (const b of this.blasts) this.renderBlast(ctx, b);
    for (const b of this.bolts) {
      const k = 1 - b.t / b.dur;
      lightning(ctx, b.x1, b.y1, b.x2, b.y2, b.color, k, b.seed + Math.floor(time * 24), b.width);
    }
    for (const f of this.flashes) {
      const k = 1 - f.t / f.dur;
      starFlare(ctx, f.x, f.y, f.size * (0.6 + 0.4 * k), f.color, k, f.rot);
    }
  }

  private renderBlast(ctx: Ctx, b: Blast): void {
    const k = b.t / b.dur;
    const c = rgbOf(b.color);
    const s = b.size;
    ctx.save();
    // спалах у перші миті
    if (k < 0.18) {
      const f = 1 - k / 0.18;
      drawGlow(ctx, b.x, b.y, 'rgba(255,250,230,1)', s * 2.2, f);
      starFlare(ctx, b.x, b.y, s * 2.4 * f + 6, b.color, f, b.seed);
    }
    // дим: темні клуби, що розходяться й тануть (звичайне змішування)
    const smokeA = Math.max(0, 0.6 * (1 - k)) * Math.min(1, k * 4);
    if (smokeA > 0.01) {
      for (let i = 0; i < 6; i++) {
        const a = hash(b.seed + i) * Math.PI * 2;
        const d = s * (0.4 + k * 0.9) * (0.6 + hash(b.seed * 2 + i) * 0.6);
        const r = s * (0.45 + k * 0.6);
        const px = b.x + Math.cos(a) * d;
        const py = b.y + Math.sin(a) * d - k * s * 0.3;
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, `rgba(78,66,72,${smokeA})`);
        g.addColorStop(1, 'rgba(78,66,72,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // вогняна куля: біле ядро → колір → темно-червоний край
    ctx.globalCompositeOperation = 'lighter';
    const fireK = Math.max(0, 1 - k * 1.15);
    if (fireK > 0) {
      const r = s * (0.65 + Math.pow(k, 0.5) * 1.1);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, `rgba(255,255,235,${fireK})`);
      g.addColorStop(0.3, `rgba(255,220,120,${0.95 * fireK})`);
      g.addColorStop(0.55, `rgba(${c},${0.85 * fireK})`);
      g.addColorStop(0.8, `rgba(200,40,20,${0.45 * fireK})`);
      g.addColorStop(1, 'rgba(120,20,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      // кулясте полум'я з нерівним краєм
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.85 + hash(b.seed + i * 3.1 + Math.floor(k * 8)) * 0.3);
        ctx.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    // розпечені уламки-штрихи
    const debrisA = Math.max(0, 1 - k * 1.2);
    if (debrisA > 0) {
      ctx.strokeStyle = `rgba(255,220,150,${debrisA})`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let i = 0; i < 10; i++) {
        const a = hash(b.seed * 5 + i) * Math.PI * 2;
        const sp = s * (1.2 + hash(b.seed * 9 + i) * 1.6);
        const d0 = sp * Math.pow(k, 0.6);
        const d1 = d0 + 6 + s * 0.15;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(a) * d0, b.y + Math.sin(a) * d0);
        ctx.lineTo(b.x + Math.cos(a) * d1, b.y + Math.sin(a) * d1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/** Іній по краях екрана під час заморозки: k — сила 0..1. */
export function frostOverlay(ctx: Ctx, w: number, h: number, k: number, time: number): void {
  if (k <= 0) return;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, 'rgba(120,190,255,0)');
  g.addColorStop(0.55, `rgba(120,190,255,${0.14 * k})`);
  g.addColorStop(1, `rgba(210,240,255,${0.6 * k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // морозні смуги вздовж країв
  const band = 70 * k;
  const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const e = ctx.createLinearGradient(x0, y0, x1, y1);
    e.addColorStop(0, `rgba(230,248,255,${0.35 * k})`);
    e.addColorStop(1, 'rgba(230,248,255,0)');
    ctx.fillStyle = e;
    ctx.fillRect(rx, ry, rw, rh);
  };
  edge(0, 0, 0, band, 0, 0, w, band);
  edge(0, h, 0, h - band, 0, h - band, w, band);
  edge(0, 0, band, 0, 0, 0, band, h);
  edge(w, 0, w - band, 0, w - band, 0, band, h);
  // крижані кристали-голки від країв
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const n = 72;
  for (let i = 0; i < n; i++) {
    const side = i % 4;
    const p = hash(i * 7.3);
    const len = (40 + hash(i * 3.1) * 130) * k * (0.92 + Math.sin(time * 2 + i) * 0.08);
    let x = 0;
    let y = 0;
    let a = 0;
    if (side === 0) [x, y, a] = [p * w, 0, Math.PI / 2];
    else if (side === 1) [x, y, a] = [w, p * h, Math.PI];
    else if (side === 2) [x, y, a] = [p * w, h, -Math.PI / 2];
    else [x, y, a] = [0, p * h, 0];
    a += (hash(i * 11) - 0.5) * 0.9;
    ctx.strokeStyle = `rgba(235,250,255,${0.55 * k})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    for (const f of [0.35, 0.6]) {
      for (const s of [-1, 1]) {
        const mx = x + Math.cos(a) * len * f;
        const my = y + Math.sin(a) * len * f;
        const bl = len * (0.42 - f * 0.3);
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(a + s * 0.75) * bl, my + Math.sin(a + s * 0.75) * bl);
      }
    }
    ctx.stroke();
    drawGlow(ctx, x + Math.cos(a) * len, y + Math.sin(a) * len, 'rgba(200,235,255,1)', 6, 0.6 * k);
  }
  ctx.restore();
}

/** Крижана шкаралупа навколо замороженого об'єкта: шестикутні грані з відблиском. */
export function iceShell(ctx: Ctx, x: number, y: number, r: number, time: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(hash(Math.floor(x * 0.1)) * Math.PI);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.15);
  g.addColorStop(0, 'rgba(120,200,255,0.05)');
  g.addColorStop(1, 'rgba(160,220,255,0.35)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,245,255,0.75)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  // внутрішні грані
  ctx.strokeStyle = 'rgba(220,245,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ctx.moveTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
    ctx.lineTo(-Math.cos(a) * r * 1.12, -Math.sin(a) * r * 1.12);
  }
  ctx.stroke();
  // відблиск, що пробігає
  const s = ((time * 0.8) % 1) * 2 - 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(s * r - r * 0.3, -r * 0.8);
  ctx.lineTo(s * r + r * 0.1, -r * 0.2);
  ctx.stroke();
  ctx.restore();
}

/** Щит: гексагональна бульбашка з бігучими відблисками; hit — спалах від удару (0..1). */
export function shieldBubble(ctx: Ctx, x: number, y: number, r: number, time: number, color = '120,210,255', hit = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(0.75, `rgba(${color},${0.22 + hit * 0.3})`);
  g.addColorStop(1, `rgba(${color},${0.7 + hit * 0.3})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // гекс-сітка, видна смугою, що обертається
  ctx.rotate(time * 0.6);
  const cell = r * 0.32;
  ctx.lineWidth = 1;
  for (let q = -3; q <= 3; q++) {
    for (let s = -3; s <= 3; s++) {
      const hx = cell * 1.5 * q;
      const hy = cell * Math.sqrt(3) * (s + q / 2);
      const d = Math.hypot(hx, hy);
      if (d > r * 0.92) continue;
      const band = Math.max(0, Math.cos(Math.atan2(hy, hx) * 1 - time * 2.4));
      const a = (0.1 + band * 0.5) * (0.4 + (d / r) * 0.6);
      if (a < 0.03) continue;
      ctx.strokeStyle = `rgba(${color},${a})`;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const an = (i / 6) * Math.PI * 2;
        ctx.lineTo(hx + Math.cos(an) * cell * 0.5, hy + Math.sin(an) * cell * 0.5);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
  // кромка з бігучою дугою
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(220,245,255,${0.75 + hit * 0.25})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, time * 2.2, time * 2.2 + Math.PI * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r, time * 2.2 + Math.PI, time * 2.2 + Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
}

/** Форсаж: смуги швидкості навколо літака й вогняний конус. */
export function boostFx(ctx: Ctx, x: number, y: number, angle: number, time: number, flame: readonly string[]): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalCompositeOperation = 'lighter';
  // вогняний конус позаду
  const flick = 0.8 + Math.sin(time * 60) * 0.2;
  const len = 78 * flick;
  drawGlow(ctx, -30, 0, 'rgba(255,190,80,1)', 40, 0.55);
  const g = ctx.createLinearGradient(-22, 0, -22 - len, 0);
  g.addColorStop(0, 'rgba(255,255,235,0.95)');
  g.addColorStop(0.3, 'rgba(255,200,80,0.8)');
  g.addColorStop(1, `rgba(${rgbOf(flame[1] ?? '#ff5a1f')},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-18, -9);
  ctx.quadraticCurveTo(-22 - len * 0.45, -7, -22 - len, 0);
  ctx.quadraticCurveTo(-22 - len * 0.45, 7, -18, 9);
  ctx.closePath();
  ctx.fill();
  // ударні діаманти (shock diamonds) у реактивному струмені
  for (let i = 1; i <= 3; i++) {
    const px = -24 - i * 16 * flick;
    ctx.fillStyle = `rgba(255,255,255,${0.6 - i * 0.14})`;
    ctx.beginPath();
    ctx.ellipse(px, 0, 4.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // смуги швидкості з боків
  ctx.strokeStyle = 'rgba(255,240,200,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const off = ((time * 900 + i * 53) % 160) - 40;
    const side = i % 2 ? 1 : -1;
    const yy = side * (26 + hash(i) * 22);
    ctx.beginPath();
    ctx.moveTo(-off, yy);
    ctx.lineTo(-off - 30 - hash(i * 3) * 30, yy);
    ctx.stroke();
  }
  ctx.restore();
}

/** Слід історії позицій (ракети, плазма, ракети-самонаводки): товстий градієнтний шлейф диму/енергії. */
export function trail(ctx: Ctx, pts: { x: number; y: number }[], color: string, width: number, smoke = false): void {
  if (pts.length < 2) return;
  const c = rgbOf(color);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (smoke) {
    for (let i = 1; i < pts.length; i++) {
      const k = i / pts.length;
      ctx.strokeStyle = `rgba(150,140,160,${0.28 * k})`;
      ctx.lineWidth = width * (2.4 - k * 1.4);
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < pts.length; i++) {
    const k = i / pts.length;
    ctx.strokeStyle = `rgba(${c},${0.8 * k * k})`;
    ctx.lineWidth = width * (0.3 + k * 0.9);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Хвіст комети з голови (0,0) проти напрямку (ux,uy): три шари полум'я, що тремтять, і іскри. */
export function cometTail(ctx: Ctx, ux: number, uy: number, r: number, time: number, seed = 0): void {
  const px = -uy;
  const py = ux;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const layers: [number, number, string, string][] = [
    [r * 14, r * 1.7, 'rgba(255,90,30,0.35)', 'rgba(255,40,10,0)'],
    [r * 10, r * 1.05, 'rgba(255,170,60,0.7)', 'rgba(255,90,30,0)'],
    [r * 6, r * 0.5, 'rgba(255,250,220,0.95)', 'rgba(255,200,120,0)'],
  ];
  for (const [len, w, c0, c1] of layers) {
    const wob = Math.sin(time * 30 + len + seed) * w * 0.15;
    const g = ctx.createLinearGradient(0, 0, ux * len, uy * len);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(px * w, py * w);
    ctx.quadraticCurveTo(ux * len * 0.5 + px * (w * 0.6 + wob), uy * len * 0.5 + py * (w * 0.6 + wob), ux * len, uy * len);
    ctx.quadraticCurveTo(ux * len * 0.5 - px * (w * 0.6 - wob), uy * len * 0.5 - py * (w * 0.6 - wob), -px * w, -py * w);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < 8; i++) {
    const k = (time * 3 + i / 8 + seed * 0.13) % 1;
    const off = Math.sin(i * 12.9 + time * 9) * r * 0.8 * k;
    ctx.fillStyle = `rgba(255,${Math.round(200 - k * 120)},${Math.round(120 - k * 100)},${1 - k})`;
    ctx.fillRect(ux * k * r * 12 + px * off - 1.5, uy * k * r * 12 + py * off - 1.5, 3, 3);
  }
  ctx.restore();
}
