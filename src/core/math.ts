/** 2D-вектор. Мутабельний — щоб не плодити об'єкти в ігровому циклі. */
export class Vec2 {
  constructor(public x = 0, public y = 0) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v: Vec2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  add(v: Vec2, k = 1): this {
    this.x += v.x * k;
    this.y += v.y * k;
    return this;
  }

  scale(k: number): this {
    this.x *= k;
    this.y *= k;
    return this;
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  normalize(): this {
    const len = this.length();
    if (len > 1e-4) {
      this.x /= len;
      this.y /= len;
    } else {
      this.x = 0;
      this.y = 0;
    }
    return this;
  }

  clampLength(max: number): this {
    const len = this.length();
    if (len > max) this.scale(max / len);
    return this;
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  static fromAngle(a: number, len = 1): Vec2 {
    return new Vec2(Math.cos(a) * len, Math.sin(a) * len);
  }

  static dist(a: Vec2, b: Vec2): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const rand = (min: number, max: number): number => min + Math.random() * (max - min);
export const randInt = (min: number, maxInclusive: number): number => Math.floor(rand(min, maxInclusive + 1));
export const chance = (p: number): boolean => Math.random() < p;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Найкоротша різниця між кутами в діапазоні [-PI, PI]. */
export function angleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = ra + rb;
  return dx * dx + dy * dy <= r * r;
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
