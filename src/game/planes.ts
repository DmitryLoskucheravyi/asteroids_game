export type PlaneId = 'falcon' | 'phantom' | 'blaze' | 'wasp' | 'collector' | 'swift' | 'titan' | 'chronos' | 'thunder' | 'ufo' | 'phoenix';

/** Унікальна механіка літака. Кожен літак має свою комбінацію. */
export interface PlaneFeature {
  /** Додаткові заряди заморозки на старті */
  extraFreeze?: number;
  /** Додаткові заряди форсажу на старті */
  extraBoost?: number;
  /** Множник тривалості форсажу */
  boostDurationMul?: number;
  /** Множник тривалості заморозки */
  freezeDurationMul?: number;
  /** Множник перезарядки ривка (0.5 — удвічі швидше) */
  jumpCooldownMul?: number;
  /** Множник дальності ривка */
  jumpDistanceMul?: number;
  /** Скільки зарядів ривка можна накопичити */
  jumpCharges?: number;
  /** Під час форсажу таранить малі й середні астероїди */
  ramOnBoost?: boolean;
  /** Радіус, з якого притягуються кристали й бонуси */
  magnetRadius?: number;
  /** Старт зі щитом */
  startShield?: boolean;
  /** Щит відновлюється через N секунд після втрати */
  shieldRegen?: number;
  /** Після ривка — ударна хвиля такого радіуса знищує астероїди */
  dashShockwave?: number;
  /** Не притягується чорними дірами і не зноситься вітром */
  gravityImmune?: boolean;
  /** Не повертається за напрямом руху (тарілка) */
  noRotate?: boolean;
  /** Додаткові життя на рівень */
  extraLives?: number;
}

/** Характеристики літака. У WinForms-версії скіни відрізнялись лише картинкою. */
export interface PlaneSpec {
  id: PlaneId;
  /** Прискорення, px/s² */
  accel: number;
  /** Максимальна швидкість, px/s */
  maxSpeed: number;
  /** Опір (чим більше — тим швидше гальмує) */
  drag: number;
  /** Радіус хітбокса */
  radius: number;
  /** Колір вихлопу двигуна */
  flame: [string, string];
  feature: PlaneFeature;
  /** Ціна в коінс (0 — є з самого початку) */
  price: number;
}

export const PLANES: readonly PlaneSpec[] = [
  { id: 'falcon', accel: 2600, maxSpeed: 420, drag: 5.5, radius: 15, flame: ['#9fe3ff', '#2f7bff'], feature: { extraBoost: 1, boostDurationMul: 1.5 }, price: 0 },
  { id: 'phantom', accel: 3300, maxSpeed: 370, drag: 7.5, radius: 13, flame: ['#ffc2ef', '#ff3fa4'], feature: { jumpDistanceMul: 1.5, jumpCooldownMul: 0.75 }, price: 150 },
  { id: 'blaze', accel: 2300, maxSpeed: 500, drag: 4.2, radius: 16, flame: ['#ffe39a', '#ff5a1f'], feature: { ramOnBoost: true }, price: 250 },
  { id: 'wasp', accel: 3100, maxSpeed: 380, drag: 7, radius: 10, flame: ['#fff3a0', '#ffb000'], feature: { extraFreeze: 1 }, price: 400 },
  { id: 'collector', accel: 2500, maxSpeed: 400, drag: 5.5, radius: 16, flame: ['#a8fff0', '#18c8b0'], feature: { magnetRadius: 260 }, price: 600 },
  { id: 'swift', accel: 2900, maxSpeed: 450, drag: 6, radius: 14, flame: ['#d8f6ff', '#28c8f0'], feature: { jumpCharges: 2 }, price: 800 },
  { id: 'titan', accel: 2100, maxSpeed: 390, drag: 5, radius: 17, flame: ['#fff1a8', '#ffb020'], feature: { startShield: true, shieldRegen: 22 }, price: 1100 },
  { id: 'chronos', accel: 2700, maxSpeed: 420, drag: 6, radius: 14, flame: ['#e2c2ff', '#8a3cff'], feature: { freezeDurationMul: 2, extraFreeze: 1 }, price: 1400 },
  { id: 'thunder', accel: 2800, maxSpeed: 440, drag: 5.5, radius: 15, flame: ['#c8e8ff', '#3a7bff'], feature: { dashShockwave: 150, jumpCooldownMul: 0.85 }, price: 1800 },
  { id: 'ufo', accel: 7000, maxSpeed: 380, drag: 16, radius: 15, flame: ['#c8ffd8', '#3adc78'], feature: { gravityImmune: true, noRotate: true }, price: 2300 },
  { id: 'phoenix', accel: 3000, maxSpeed: 460, drag: 6, radius: 14, flame: ['#fff1a8', '#ff5a1f'], feature: { extraLives: 1, extraBoost: 1 }, price: 3000 },
];

export const getPlane = (id: PlaneId): PlaneSpec => PLANES.find((p) => p.id === id) ?? PLANES[0];

// ---------- тіри та рівні ----------

export const MAX_TIER = 4;
export const MAX_LEVEL_IN_TIER = 4;

export interface PlaneProgress {
  planeId: PlaneId;
  tier: number;
  level: number;
}

export const defaultProgress = (planeId: PlaneId): PlaneProgress => ({ planeId, tier: 1, level: 1 });

/** Вартість прокачки рівня (в межах тіру) — монети, зростають з тіром і рівнем. */
export function levelUpCost(price: number, tier: number, level: number): number {
  return Math.max(20, Math.round((price || 60) * 0.08 * tier * level));
}

/** Вартість підвищення тіру — монети (помітний стрибок) + кристали (рідкісна валюта, робить тір "подією"). */
export function tierUpCost(price: number, tier: number): { coins: number; crystals: number } {
  const crystalsByTier = [0, 40, 120, 300];
  return {
    coins: levelUpCost(price, tier, MAX_LEVEL_IN_TIER) * 6,
    crystals: crystalsByTier[tier] ?? 300,
  };
}

/** Структурна надбавка статів за тір (понад рівневі бонуси) — спільна для всіх літаків. */
const TIER_STAT_BONUS = 0.09;

/** Для кожного тіру понад 1-й — яке поле PlaneFeature підсилюється і на скільки (своя "фішка" під кожен літак). */
const TIER_FEATURE_BONUS: Partial<Record<PlaneId, (feature: PlaneFeature, tier: number) => PlaneFeature>> = {
  falcon: (f, tier) => ({ ...f, boostDurationMul: (f.boostDurationMul ?? 1) + 0.15 * (tier - 1) }),
  phantom: (f, tier) => ({ ...f, jumpDistanceMul: (f.jumpDistanceMul ?? 1) + 0.1 * (tier - 1), jumpCooldownMul: Math.max(0.5, (f.jumpCooldownMul ?? 1) - 0.03 * (tier - 1)) }),
  blaze: (f, tier) => ({ ...f, extraBoost: (f.extraBoost ?? 0) + (tier >= 4 ? 1 : 0) }),
  wasp: (f, tier) => ({ ...f, extraFreeze: (f.extraFreeze ?? 0) + Math.floor((tier - 1) / 2) }),
  collector: (f, tier) => ({ ...f, magnetRadius: (f.magnetRadius ?? 0) + 40 * (tier - 1) }),
  swift: (f, tier) => ({ ...f, jumpCharges: (f.jumpCharges ?? 1) + (tier >= 4 ? 1 : 0) }),
  titan: (f, tier) => ({ ...f, shieldRegen: Math.max(10, (f.shieldRegen ?? 22) - 2 * (tier - 1)) }),
  chronos: (f, tier) => ({ ...f, freezeDurationMul: (f.freezeDurationMul ?? 1) + 0.15 * (tier - 1) }),
  thunder: (f, tier) => ({ ...f, dashShockwave: (f.dashShockwave ?? 0) + 20 * (tier - 1) }),
  phoenix: (f, tier) => ({ ...f, extraBoost: (f.extraBoost ?? 0) + (tier >= 3 ? 1 : 0) }),
};

/** Рахує фінальний PlaneSpec із базового + бонусів тіру/рівня. Єдина точка, де "сирий" PLANES перетворюється на той, що летить. */
export function effectivePlaneSpec(base: PlaneSpec, progress: PlaneProgress): PlaneSpec {
  const tier = Math.min(MAX_TIER, Math.max(1, progress.tier));
  const level = Math.min(MAX_LEVEL_IN_TIER, Math.max(1, progress.level));
  const tierFactor = 1 + TIER_STAT_BONUS * (tier - 1);
  const levelAccelFactor = 1 + 0.025 * (level - 1);
  const levelSpeedFactor = 1 + 0.015 * (level - 1);
  const levelDragFactor = 1 - 0.01 * (level - 1);
  const featureBonus = TIER_FEATURE_BONUS[base.id];
  return {
    ...base,
    accel: base.accel * tierFactor * levelAccelFactor,
    maxSpeed: base.maxSpeed * tierFactor * levelSpeedFactor,
    drag: base.drag * levelDragFactor,
    feature: featureBonus ? featureBonus(base.feature, tier) : base.feature,
  };
}

/** Нормовані показники 0..1 для смужок на екрані вибору. */
export function planeStats(p: PlaneSpec): { speed: number; agility: number; size: number } {
  return {
    speed: (p.maxSpeed - 300) / 220,
    agility: Math.min(1, (p.accel / p.maxSpeed - 4) / 8),
    size: 1 - (p.radius - 9) / 9,
  };
}
