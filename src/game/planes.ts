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

/** Нормовані показники 0..1 для смужок на екрані вибору. */
export function planeStats(p: PlaneSpec): { speed: number; agility: number; size: number } {
  return {
    speed: (p.maxSpeed - 300) / 220,
    agility: Math.min(1, (p.accel / p.maxSpeed - 4) / 8),
    size: 1 - (p.radius - 9) / 9,
  };
}
