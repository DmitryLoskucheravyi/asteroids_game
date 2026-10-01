export type Hazard = 'comet' | 'homing' | 'bouncer' | 'wall' | 'meteor' | 'fog' | 'mine' | 'wind' | 'boss' | 'blackhole' | 'laser';

/** Параметри рівня (розширений LevelConfig з WinForms-версії). */
export interface LevelConfig {
  id: number;
  /** Скільки секунд треба протриматись */
  duration: number;
  spawnMin: number;
  spawnMax: number;
  maxAsteroids: number;
  speedMul: number;
  pLarge: number;
  pMedium: number;
  /** Ймовірність, що звичайний астероїд буде самонавідним */
  homing: number;
  /** Ймовірність, що астероїд буде відбиватись від стін */
  bouncer: number;
  /** Інтервал між кометами, с (0 — без комет) */
  cometEvery: number;
  /** Інтервал між "стінами" астероїдів, с (0 — без стін) */
  wallEvery: number;
  /** Ширина проходу у стіні, px */
  wallGap: number;
  /** Інтервал між чорними дірами, с */
  blackHoleEvery: number;
  /** Інтервал між метеоритними дощами, с */
  meteorEvery: number;
  /** Радіус видимості в тумані, px (0 — без туману) */
  fog: number;
  /** Сила сонячного вітру, px/s */
  wind: number;
  /** Інтервал появи мін, с */
  mineEvery: number;
  /** Інтервал лазерних бар'єрів, с */
  laserEvery: number;
  /** Інтервал залпів боса, с (0 — без боса) */
  boss: number;
  /** Скільки кристалів потрібно для 3 зірок */
  crystalTarget: number;
}

type Extra = 'homing' | 'bouncer' | 'cometEvery' | 'wallEvery' | 'wallGap' | 'blackHoleEvery' | 'meteorEvery' | 'fog' | 'wind' | 'mineEvery' | 'laserEvery' | 'boss';
type LevelDef = Omit<LevelConfig, 'id' | 'crystalTarget' | Extra> & Partial<Pick<LevelConfig, Extra>>;

/** Базові параметри: тривалість, спавн, кількість, швидкість, частки великих і середніх. */
const base = (duration: number, spawnMin: number, spawnMax: number, maxAsteroids: number, speedMul: number, pLarge: number, pMedium = 0.45) => ({
  duration,
  spawnMin,
  spawnMax,
  maxAsteroids,
  speedMul,
  pLarge,
  pMedium,
});

const DEFS: LevelDef[] = [
  // ---- Сектор 1: знайомство з базовими небезпеками ----
  { ...base(30, 0.75, 1.0, 14, 1.0, 0.6, 0.3) },
  { ...base(40, 0.6, 0.85, 18, 1.15, 0.5, 0.35) },
  { ...base(45, 0.55, 0.8, 20, 1.25, 0.45, 0.35), cometEvery: 9 },
  { ...base(50, 0.5, 0.75, 22, 1.35, 0.4, 0.4), homing: 0.12, cometEvery: 10 },
  { ...base(55, 0.5, 0.7, 24, 1.45, 0.35, 0.4), homing: 0.1, cometEvery: 11, wallEvery: 14, wallGap: 230 },
  { ...base(60, 0.48, 0.68, 24, 1.5, 0.35, 0.4), homing: 0.08, bouncer: 0.14, cometEvery: 10, wallEvery: 16, wallGap: 220 },
  // ---- Сектор 2: середовище ----
  // 7 — туман
  { ...base(60, 0.5, 0.7, 24, 1.45, 0.4, 0.4), homing: 0.1, cometEvery: 10, fog: 300 },
  // 8 — метеоритний дощ
  { ...base(65, 0.45, 0.65, 26, 1.6, 0.3), bouncer: 0.12, cometEvery: 9, meteorEvery: 16 },
  { ...base(70, 0.42, 0.6, 26, 1.7, 0.3), homing: 0.12, cometEvery: 5.5, meteorEvery: 12 },
  // 10 — міни
  { ...base(70, 0.45, 0.62, 26, 1.7, 0.3), homing: 0.12, bouncer: 0.12, cometEvery: 8, mineEvery: 4.5 },
  // 11 — сонячний вітер
  { ...base(75, 0.4, 0.58, 30, 1.8, 0.28), homing: 0.14, cometEvery: 7, wallEvery: 13, wallGap: 210, wind: 110 },
  // 12 — перший бос
  { ...base(90, 0.55, 0.8, 22, 1.75, 0.3), homing: 0.1, bouncer: 0.1, cometEvery: 9, boss: 4 },
  // ---- Сектор 3: глибокий космос ----
  // 13 — чорні діри
  { ...base(80, 0.36, 0.52, 32, 1.9, 0.25), homing: 0.14, bouncer: 0.14, cometEvery: 7, blackHoleEvery: 12 },
  // 14 — лазери
  { ...base(80, 0.38, 0.55, 32, 1.95, 0.25), homing: 0.14, bouncer: 0.14, cometEvery: 7, laserEvery: 6 },
  { ...base(85, 0.34, 0.5, 34, 2.0, 0.25), homing: 0.16, cometEvery: 6.5, blackHoleEvery: 13, fog: 280 },
  { ...base(90, 0.33, 0.48, 36, 2.1, 0.22), bouncer: 0.18, cometEvery: 6, laserEvery: 4.5, meteorEvery: 15 },
  { ...base(90, 0.32, 0.47, 36, 2.15, 0.22), homing: 0.18, cometEvery: 6, blackHoleEvery: 12, wind: 150 },
  { ...base(95, 0.31, 0.46, 38, 2.2, 0.22), homing: 0.18, bouncer: 0.18, cometEvery: 6, mineEvery: 3.5, fog: 260 },
  { ...base(100, 0.3, 0.44, 38, 2.25, 0.2), homing: 0.2, bouncer: 0.2, cometEvery: 5.5, wallEvery: 11, wallGap: 195, blackHoleEvery: 10, laserEvery: 5.5 },
  // 20 — другий бос
  { ...base(100, 0.4, 0.6, 30, 2.2, 0.22), homing: 0.18, bouncer: 0.18, cometEvery: 7, mineEvery: 5, boss: 3.2 },
  // ---- Сектор 4: край галактики ----
  { ...base(105, 0.29, 0.43, 40, 2.35, 0.2), homing: 0.2, cometEvery: 5, laserEvery: 4.5, meteorEvery: 13, wind: 130 },
  { ...base(105, 0.28, 0.42, 40, 2.4, 0.2), bouncer: 0.22, cometEvery: 5, wallEvery: 9, wallGap: 185, mineEvery: 2.8 },
  { ...base(110, 0.27, 0.4, 42, 2.45, 0.18), homing: 0.22, bouncer: 0.22, cometEvery: 4.5, meteorEvery: 11, fog: 240 },
  { ...base(115, 0.26, 0.39, 44, 2.5, 0.18), homing: 0.24, bouncer: 0.24, cometEvery: 4.5, wallEvery: 9, wallGap: 180, blackHoleEvery: 8, laserEvery: 4 },
  // 25 — фінал
  { ...base(120, 0.32, 0.48, 40, 2.55, 0.18), homing: 0.24, bouncer: 0.24, cometEvery: 5, wallEvery: 10, wallGap: 180, blackHoleEvery: 14, laserEvery: 5, meteorEvery: 18, mineEvery: 5, boss: 2.8 },
];

/** Кристали з'являються в середньому раз на ~5 c, для 3 зірок треба зібрати ~65 %. */
export const CRYSTAL_INTERVAL = 5;

export const LEVELS: readonly LevelConfig[] = DEFS.map((d, i) => ({
  homing: 0,
  bouncer: 0,
  cometEvery: 0,
  wallEvery: 0,
  wallGap: 0,
  blackHoleEvery: 0,
  meteorEvery: 0,
  fog: 0,
  wind: 0,
  mineEvery: 0,
  laserEvery: 0,
  boss: 0,
  ...d,
  id: i + 1,
  crystalTarget: Math.max(3, Math.floor((d.duration / CRYSTAL_INTERVAL) * 0.65)),
}));

export const MAX_LEVEL = LEVELS.length;

/** Номери рівнів, з яких починається новий сектор (для заголовків у меню). */
export const SECTORS = [1, 6, 11, 16, 21] as const;

export const getLevel = (id: number): LevelConfig => LEVELS[Math.min(Math.max(id, 1), MAX_LEVEL) - 1];

export function hazardsOf(cfg: LevelConfig): Hazard[] {
  const h: Hazard[] = [];
  if (cfg.boss > 0) h.push('boss');
  if (cfg.cometEvery > 0) h.push('comet');
  if (cfg.homing > 0) h.push('homing');
  if (cfg.bouncer > 0) h.push('bouncer');
  if (cfg.wallEvery > 0) h.push('wall');
  if (cfg.meteorEvery > 0) h.push('meteor');
  if (cfg.fog > 0) h.push('fog');
  if (cfg.mineEvery > 0) h.push('mine');
  if (cfg.wind > 0) h.push('wind');
  if (cfg.blackHoleEvery > 0) h.push('blackhole');
  if (cfg.laserEvery > 0) h.push('laser');
  return h;
}

/** Небезпека, яка з'являється на цьому рівні вперше (щоб показати підказку). */
export function introducedHazard(cfg: LevelConfig): Hazard | null {
  const seen = new Set(LEVELS.slice(0, cfg.id - 1).flatMap(hazardsOf));
  return hazardsOf(cfg).find((h) => !seen.has(h)) ?? null;
}

/** Базовий конфіг для режиму виживання — далі він ускладнюється з часом. */
export const SURVIVAL_BASE: LevelConfig = {
  ...LEVELS[0],
  id: 0,
  duration: Infinity,
  maxAsteroids: 16,
  spawnMin: 0.7,
  spawnMax: 0.95,
};
