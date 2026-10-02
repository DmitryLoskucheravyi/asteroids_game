/**
 * Інтерполяція чужих літаків за буфером знімків сервера.
 *
 * Сервер шле стан ~20–30 разів на секунду з міткою часу матчу. Клієнт показує інших гравців
 * трохи "в минулому" (на INTERP_DELAY_MS), між двома відомими знімками, — тож рух плавний
 * незалежно від частоти тіків і нерівномірності доставки пакетів.
 */

/** Наскільки показуємо минуле: ~2 тіки сервера + запас на джитер мережі. */
export const INTERP_DELAY_MS = 100;
/** Якщо знімки скінчились (втрата пакетів) — продовжуємо рух не довше цього. */
const MAX_EXTRAPOLATE_MS = 120;
/** Стрибок, більший за цей, — ривок/телепорт: не "ковзаємо", а переносимо одразу. */
const TELEPORT_DIST = 300;
const KEEP_MS = 1000;

export interface Sample {
  t: number;
  x: number;
  y: number;
  a: number;
}

const angleDiff = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Оцінка годинника сервера: offset = serverT − local. Пакет з найменшою затримкою дає найбільший
 * зсув, тому беремо максимум, а повільний спад компенсує дрейф годинників і зміну маршруту.
 */
export class ServerClock {
  private offset: number | null = null;
  private lastLocal = 0;

  sample(serverT: number, local = performance.now()): void {
    const s = serverT - local;
    if (this.offset === null) this.offset = s;
    else {
      const elapsed = Math.max(0, local - this.lastLocal);
      // спад 2 мс за секунду: якщо мережа стала повільнішою, оцінка поступово "наздожене"
      this.offset = Math.max(s, this.offset - elapsed * 0.002);
    }
    this.lastLocal = local;
  }

  get ready(): boolean {
    return this.offset !== null;
  }

  /** Поточний час сервера (мс від старту матчу). */
  now(local = performance.now()): number {
    return local + (this.offset ?? 0);
  }
}

/** Знімки одного учасника з інтерполяцією на заданий момент. */
export class SnapshotBuffer {
  private readonly samples: Sample[] = [];

  push(s: Sample): void {
    const last = this.samples[this.samples.length - 1];
    if (last && s.t <= last.t) return; // дублікати й пакети не по порядку
    this.samples.push(s);
    while (this.samples.length > 2 && this.samples[1].t < s.t - KEEP_MS) this.samples.shift();
  }

  get latest(): Sample | undefined {
    return this.samples[this.samples.length - 1];
  }

  /** Стан на момент t (час сервера). */
  at(t: number): Sample | null {
    const n = this.samples.length;
    if (!n) return null;
    if (t <= this.samples[0].t) return this.samples[0];
    for (let i = n - 1; i > 0; i--) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      if (t >= a.t && t <= b.t) {
        if (Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT_DIST) return t - a.t < b.t - t ? a : b;
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, a: a.a + angleDiff(a.a, b.a) * k };
      }
    }
    // попереду знімків нема — недовго екстраполюємо за останньою швидкістю
    const b = this.samples[n - 1];
    const a = this.samples[n - 2];
    if (!a || Math.hypot(b.x - a.x, b.y - a.y) > TELEPORT_DIST) return b;
    const ahead = Math.min(t - b.t, MAX_EXTRAPOLATE_MS);
    const span = Math.max(1, b.t - a.t);
    return { t, x: b.x + ((b.x - a.x) / span) * ahead, y: b.y + ((b.y - a.y) / span) * ahead, a: b.a };
  }
}
