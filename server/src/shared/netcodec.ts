/**
 * Бінарний протокол PvP — спільний для сервера й клієнта (без залежностей, лише DataView).
 *
 * Стан матчу: ключовий кадр раз на секунду + дельти між ними. У дельті для кожного літака —
 * 1 байт індексу, 1 байт маски змін і лише змінені поля (квантовані цілі). Незмінні літаки
 * взагалі не потрапляють у пакет. Статичне (нік, літак, команда, рейтинг) йде один раз у match:init,
 * учасник у бінарних пакетах — це його індекс у списку з init.
 *
 * Транспорт надійний і впорядкований (WebSocket/TCP), тож дельта завжди до попереднього пакета;
 * клієнт, що підключився посеред матчу, ігнорує дельти до першого ключового кадру.
 */

export const MSG = {
  STATE: 1,
  SHOT: 2,
  MOVE: 3,
  FIRE: 4,
} as const;

/** Квантування: координати з кроком 1/8 px (світ ≤ 8191 px), кут — 1/65536 оберту, HP — 0.5. */
const POS_Q = 8;
const ANG_Q = 65536 / (Math.PI * 2);
const HP_Q = 2;

const F_POS = 1 << 0;
const F_ANGLE = 1 << 1;
const F_HP = 1 << 2;
const F_FLAGS = 1 << 3;
const F_KILLS = 1 << 4;
const F_LOOT = 1 << 5;
const F_FIRED = 1 << 6;
const F_MAXHP = 1 << 7;

const B_ALIVE = 1 << 0;
const B_FIRING = 1 << 1;
const B_FLARE = 1 << 2;
const B_PHASE = 1 << 3;
const B_SLOWED = 1 << 4;

export const SHOT_KINDS = ['bullet', 'rocket', 'missile', 'laser'] as const;
export type ShotKind = (typeof SHOT_KINDS)[number];

const clampU16 = (v: number): number => (v < 0 ? 0 : v > 65535 ? 65535 : Math.round(v));
const qPos = (v: number): number => clampU16(v * POS_Q);
const qAng = (a: number): number => {
  const t = a % (Math.PI * 2);
  return Math.round((t < 0 ? t + Math.PI * 2 : t) * ANG_Q) & 0xffff;
};
const dAng = (v: number): number => {
  const a = v / ANG_Q;
  return a > Math.PI ? a - Math.PI * 2 : a;
};

/** Динамічний стан учасника (те, що змінюється під час матчу). */
export interface NetState {
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  firing: boolean;
  flare: boolean;
  phase: boolean;
  slowed: boolean;
  kills: number;
  lootCoins: number;
  lootCrystals: number;
  /** Мс від старту матчу (0 — ще не стріляв) */
  lastFiredAt: number;
}

/** Квантований вигляд — ним і порівнюємо, щоб шум float не робив дельту "брудною". */
type Q = [x: number, y: number, a: number, hp: number, flags: number, kills: number, coins: number, crystals: number, fired: number, maxHp: number];

const quantize = (s: NetState): Q => [
  qPos(s.x),
  qPos(s.y),
  qAng(s.angle),
  clampU16(s.hp * HP_Q),
  (s.alive ? B_ALIVE : 0) | (s.firing ? B_FIRING : 0) | (s.flare ? B_FLARE : 0) | (s.phase ? B_PHASE : 0) | (s.slowed ? B_SLOWED : 0),
  Math.min(255, s.kills),
  clampU16(s.lootCoins),
  clampU16(s.lootCrystals),
  Math.max(0, Math.min(0xffffffff, Math.round(s.lastFiredAt))),
  clampU16(s.maxHp * HP_Q),
];

/** Простий записувач у буфер, що росте. */
class Writer {
  private buf = new ArrayBuffer(256);
  private view = new DataView(this.buf);
  len = 0;

  private need(n: number): void {
    if (this.len + n <= this.buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.len + n));
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.len));
    this.buf = next;
    this.view = new DataView(next);
  }
  u8(v: number): void {
    this.need(1);
    this.view.setUint8(this.len, v);
    this.len += 1;
  }
  u16(v: number): void {
    this.need(2);
    this.view.setUint16(this.len, v);
    this.len += 2;
  }
  u32(v: number): void {
    this.need(4);
    this.view.setUint32(this.len, v);
    this.len += 4;
  }
  /** Знімок рівно записаних байтів */
  bytes(): Uint8Array {
    return new Uint8Array(this.buf.slice(0, this.len));
  }
}

/** Серверний кодувальник стану однієї кімнати: памʼятає надіслане, щоб слати лише зміни. */
export class StateEncoder {
  private last: (Q | null)[] = [];
  private sinceKey = Infinity;

  constructor(private readonly keyframeEvery = 30) {}

  /** Наступний пакет стану (ключовий кадр — на першому й кожному keyframeEvery-му). */
  encode(t: number, states: readonly NetState[], forceKey = false): Uint8Array {
    const key = forceKey || this.sinceKey >= this.keyframeEvery;
    this.sinceKey = key ? 1 : this.sinceKey + 1;
    const w = new Writer();
    w.u8(MSG.STATE);
    w.u8(key ? 1 : 0);
    w.u32(Math.max(0, Math.round(t)));
    const countAt = w.len;
    w.u8(0);
    let count = 0;
    for (let i = 0; i < states.length; i++) {
      const q = quantize(states[i]);
      const prev = key ? null : this.last[i];
      let mask = 0;
      if (!prev || prev[0] !== q[0] || prev[1] !== q[1]) mask |= F_POS;
      if (!prev || prev[2] !== q[2]) mask |= F_ANGLE;
      if (!prev || prev[3] !== q[3]) mask |= F_HP;
      if (!prev || prev[4] !== q[4]) mask |= F_FLAGS;
      if (!prev || prev[5] !== q[5]) mask |= F_KILLS;
      if (!prev || prev[6] !== q[6] || prev[7] !== q[7]) mask |= F_LOOT;
      if (!prev || prev[8] !== q[8]) mask |= F_FIRED;
      if (!prev || prev[9] !== q[9]) mask |= F_MAXHP;
      this.last[i] = q;
      if (!mask) continue;
      count++;
      w.u8(i);
      w.u8(mask);
      if (mask & F_POS) {
        w.u16(q[0]);
        w.u16(q[1]);
      }
      if (mask & F_ANGLE) w.u16(q[2]);
      if (mask & F_HP) w.u16(q[3]);
      if (mask & F_FLAGS) w.u8(q[4]);
      if (mask & F_KILLS) w.u8(q[5]);
      if (mask & F_LOOT) {
        w.u16(q[6]);
        w.u16(q[7]);
      }
      if (mask & F_FIRED) w.u32(q[8]);
      if (mask & F_MAXHP) w.u16(q[9]);
    }
    const out = w.bytes();
    out[countAt] = count;
    return out;
  }
}

/** Розібраний пакет стану: лише змінені учасники й лише змінені поля. */
export interface StatePatch {
  key: boolean;
  t: number;
  entries: { index: number; patch: Partial<NetState> }[];
}

const view = (data: ArrayBuffer | ArrayBufferView): DataView =>
  data instanceof ArrayBuffer ? new DataView(data) : new DataView(data.buffer, data.byteOffset, data.byteLength);

export function decodeState(data: ArrayBuffer | ArrayBufferView): StatePatch {
  const v = view(data);
  let o = 1;
  const key = v.getUint8(o++) === 1;
  const t = v.getUint32(o);
  o += 4;
  const count = v.getUint8(o++);
  const entries: StatePatch['entries'] = [];
  for (let n = 0; n < count; n++) {
    const index = v.getUint8(o++);
    const mask = v.getUint8(o++);
    const patch: Partial<NetState> = {};
    if (mask & F_POS) {
      patch.x = v.getUint16(o) / POS_Q;
      patch.y = v.getUint16(o + 2) / POS_Q;
      o += 4;
    }
    if (mask & F_ANGLE) {
      patch.angle = dAng(v.getUint16(o));
      o += 2;
    }
    if (mask & F_HP) {
      patch.hp = v.getUint16(o) / HP_Q;
      o += 2;
    }
    if (mask & F_FLAGS) {
      const f = v.getUint8(o++);
      patch.alive = !!(f & B_ALIVE);
      patch.firing = !!(f & B_FIRING);
      patch.flare = !!(f & B_FLARE);
      patch.phase = !!(f & B_PHASE);
      patch.slowed = !!(f & B_SLOWED);
    }
    if (mask & F_KILLS) patch.kills = v.getUint8(o++);
    if (mask & F_LOOT) {
      patch.lootCoins = v.getUint16(o);
      patch.lootCrystals = v.getUint16(o + 2);
      o += 4;
    }
    if (mask & F_FIRED) {
      patch.lastFiredAt = v.getUint32(o);
      o += 4;
    }
    if (mask & F_MAXHP) {
      patch.maxHp = v.getUint16(o) / HP_Q;
      o += 2;
    }
    entries.push({ index, patch });
  }
  return { key, t, entries };
}

// ---------- постріл (сервер → клієнти) ----------

export interface NetShot {
  owner: number;
  x: number;
  y: number;
  angle: number;
  kind: ShotKind;
  speed: number;
}

export function encodeShot(s: NetShot): Uint8Array {
  const b = new Uint8Array(12);
  const v = new DataView(b.buffer);
  v.setUint8(0, MSG.SHOT);
  v.setUint8(1, s.owner);
  v.setUint16(2, qPos(s.x));
  v.setUint16(4, qPos(s.y));
  v.setUint16(6, qAng(s.angle));
  v.setUint8(8, Math.max(0, SHOT_KINDS.indexOf(s.kind)));
  v.setUint16(9, clampU16(s.speed));
  return b;
}

export function decodeShot(data: ArrayBuffer | ArrayBufferView): NetShot {
  const v = view(data);
  return { owner: v.getUint8(1), x: v.getUint16(2) / POS_Q, y: v.getUint16(4) / POS_Q, angle: dAng(v.getUint16(6)), kind: SHOT_KINDS[v.getUint8(8)] ?? 'bullet', speed: v.getUint16(9) };
}

// ---------- рух (клієнт → сервер) ----------

export interface NetMove {
  x: number;
  y: number;
  angle: number;
  firing: boolean;
}

export function encodeMove(m: NetMove): Uint8Array {
  const b = new Uint8Array(8);
  const v = new DataView(b.buffer);
  v.setUint8(0, MSG.MOVE);
  v.setUint16(1, qPos(m.x));
  v.setUint16(3, qPos(m.y));
  v.setUint16(5, qAng(m.angle));
  v.setUint8(7, m.firing ? 1 : 0);
  return b;
}

export function decodeMove(data: ArrayBuffer | ArrayBufferView): NetMove | null {
  const v = view(data);
  if (v.byteLength < 8 || v.getUint8(0) !== MSG.MOVE) return null;
  return { x: v.getUint16(1) / POS_Q, y: v.getUint16(3) / POS_Q, angle: dAng(v.getUint16(5)), firing: v.getUint8(7) === 1 };
}

// ---------- свій постріл (клієнт → сервер) ----------

export interface NetFire {
  x: number;
  y: number;
  angle: number;
  kind: ShotKind;
  /** Час сервера, який бачив клієнт у момент пострілу (для компенсації лагу), мс від старту матчу */
  viewT: number;
}

export function encodeFire(f: NetFire): Uint8Array {
  const b = new Uint8Array(12);
  const v = new DataView(b.buffer);
  v.setUint8(0, MSG.FIRE);
  v.setUint16(1, qPos(f.x));
  v.setUint16(3, qPos(f.y));
  v.setUint16(5, qAng(f.angle));
  v.setUint8(7, Math.max(0, SHOT_KINDS.indexOf(f.kind)));
  v.setUint32(8, Math.max(0, Math.round(f.viewT)));
  return b;
}

export function decodeFire(data: ArrayBuffer | ArrayBufferView): NetFire | null {
  const v = view(data);
  if (v.byteLength < 12 || v.getUint8(0) !== MSG.FIRE) return null;
  return { x: v.getUint16(1) / POS_Q, y: v.getUint16(3) / POS_Q, angle: dAng(v.getUint16(5)), kind: SHOT_KINDS[v.getUint8(7)] ?? 'bullet', viewT: v.getUint32(8) };
}
