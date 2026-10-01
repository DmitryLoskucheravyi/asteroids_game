export type Hazard = 'comet' | 'homing' | 'bouncer' | 'wall';

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
  /** Скільки кристалів потрібно для 3 зірок */
  crystalTarget: number;
}

type LevelDef = Omit<LevelConfig, 'id' | 'crystalTarget'>;

const DEFS: LevelDef[] = [
  // 1 — знайомство
  { duration: 30, spawnMin: 0.75, spawnMax: 1.0, maxAsteroids: 14, speedMul: 1.0, pLarge: 0.6, pMedium: 0.3, homing: 0, bouncer: 0, cometEvery: 0, wallEvery: 0, wallGap: 0 },
  { duration: 40, spawnMin: 0.6, spawnMax: 0.85, maxAsteroids: 18, speedMul: 1.15, pLarge: 0.5, pMedium: 0.35, homing: 0, bouncer: 0, cometEvery: 0, wallEvery: 0, wallGap: 0 },
  // 3 — з'являються комети
  { duration: 45, spawnMin: 0.55, spawnMax: 0.8, maxAsteroids: 20, speedMul: 1.25, pLarge: 0.45, pMedium: 0.35, homing: 0, bouncer: 0, cometEvery: 9, wallEvery: 0, wallGap: 0 },
  // 4 — самонавідні
  { duration: 50, spawnMin: 0.5, spawnMax: 0.75, maxAsteroids: 22, speedMul: 1.35, pLarge: 0.4, pMedium: 0.4, homing: 0.12, bouncer: 0, cometEvery: 10, wallEvery: 0, wallGap: 0 },
  // 5 — стіни з проходом
  { duration: 55, spawnMin: 0.5, spawnMax: 0.7, maxAsteroids: 24, speedMul: 1.45, pLarge: 0.35, pMedium: 0.4, homing: 0.1, bouncer: 0, cometEvery: 11, wallEvery: 14, wallGap: 230 },
  // 6 — рикошетні
  { duration: 60, spawnMin: 0.45, spawnMax: 0.65, maxAsteroids: 26, speedMul: 1.55, pLarge: 0.35, pMedium: 0.4, homing: 0.08, bouncer: 0.14, cometEvery: 9, wallEvery: 15, wallGap: 220 },
  { duration: 65, spawnMin: 0.42, spawnMax: 0.6, maxAsteroids: 28, speedMul: 1.65, pLarge: 0.3, pMedium: 0.45, homing: 0.12, bouncer: 0.12, cometEvery: 8, wallEvery: 13, wallGap: 210 },
  { duration: 70, spawnMin: 0.38, spawnMax: 0.55, maxAsteroids: 30, speedMul: 1.75, pLarge: 0.3, pMedium: 0.45, homing: 0.14, bouncer: 0.15, cometEvery: 7, wallEvery: 12, wallGap: 200 },
  { duration: 75, spawnMin: 0.35, spawnMax: 0.5, maxAsteroids: 32, speedMul: 1.85, pLarge: 0.25, pMedium: 0.45, homing: 0.16, bouncer: 0.16, cometEvery: 5.5, wallEvery: 12, wallGap: 195 },
  { duration: 80, spawnMin: 0.32, spawnMax: 0.47, maxAsteroids: 34, speedMul: 1.95, pLarge: 0.25, pMedium: 0.45, homing: 0.18, bouncer: 0.18, cometEvery: 6, wallEvery: 9, wallGap: 190 },
  { duration: 90, spawnMin: 0.3, spawnMax: 0.44, maxAsteroids: 36, speedMul: 2.05, pLarge: 0.22, pMedium: 0.45, homing: 0.2, bouncer: 0.2, cometEvery: 5, wallEvery: 9, wallGap: 180 },
  // 12 — фінал
  { duration: 100, spawnMin: 0.27, spawnMax: 0.4, maxAsteroids: 40, speedMul: 2.2, pLarge: 0.2, pMedium: 0.45, homing: 0.22, bouncer: 0.22, cometEvery: 4.5, wallEvery: 8, wallGap: 175 },
];

/** Кристали з'являються в середньому раз на ~5 c, для 3 зірок треба зібрати ~65 %. */
export const CRYSTAL_INTERVAL = 5;

export const LEVELS: readonly LevelConfig[] = DEFS.map((d, i) => ({
  ...d,
  id: i + 1,
  crystalTarget: Math.max(3, Math.floor((d.duration / CRYSTAL_INTERVAL) * 0.65)),
}));

export const MAX_LEVEL = LEVELS.length;

export const getLevel = (id: number): LevelConfig => LEVELS[Math.min(Math.max(id, 1), MAX_LEVEL) - 1];

export function hazardsOf(cfg: LevelConfig): Hazard[] {
  const h: Hazard[] = [];
  if (cfg.cometEvery > 0) h.push('comet');
  if (cfg.homing > 0) h.push('homing');
  if (cfg.bouncer > 0) h.push('bouncer');
  if (cfg.wallEvery > 0) h.push('wall');
  return h;
}

/** Рівень, на якому небезпека з'являється вперше (щоб показати підказку). */
export function introducedHazard(cfg: LevelConfig): Hazard | null {
  if (cfg.id === 1) return null;
  const prev = new Set(hazardsOf(getLevel(cfg.id - 1)));
  return hazardsOf(cfg).find((h) => !prev.has(h)) ?? null;
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
