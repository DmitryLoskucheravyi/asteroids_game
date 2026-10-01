import type { ImageKey } from '../core/assets';

export type PlaneId = 'falcon' | 'phantom' | 'blaze';

/** Характеристики літака. У WinForms-версії скіни відрізнялись лише картинкою. */
export interface PlaneSpec {
  id: PlaneId;
  sprite: ImageKey;
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
}

export const PLANES: readonly PlaneSpec[] = [
  {
    id: 'falcon',
    sprite: 'planeFalcon',
    accel: 2600,
    maxSpeed: 420,
    drag: 5.5,
    radius: 15,
    flame: ['#9fe3ff', '#2f7bff'],
  },
  {
    id: 'phantom',
    sprite: 'planePhantom',
    accel: 3300,
    maxSpeed: 370,
    drag: 7.5,
    radius: 13,
    flame: ['#ffc2ef', '#ff3fa4'],
  },
  {
    id: 'blaze',
    sprite: 'planeBlaze',
    accel: 2300,
    maxSpeed: 500,
    drag: 4.2,
    radius: 16,
    flame: ['#ffe39a', '#ff5a1f'],
  },
];

export const getPlane = (id: PlaneId): PlaneSpec => PLANES.find((p) => p.id === id) ?? PLANES[0];

/** Нормовані показники 0..1 для смужок на екрані вибору. */
export function planeStats(p: PlaneSpec): { speed: number; agility: number; size: number } {
  return {
    speed: (p.maxSpeed - 300) / 220,
    agility: (p.accel / p.maxSpeed - 4) / 6,
    size: 1 - (p.radius - 11) / 7,
  };
}
