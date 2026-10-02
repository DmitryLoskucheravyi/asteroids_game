// Тримати синхронізовано з src/game/planes.ts (id і price) — тут потрібні лише для
// валідації купівлі й для розіграшу ящиків, геймплейні характеристики лишаються на клієнті.
export const PLANE_IDS = ['falcon', 'phantom', 'blaze', 'wasp', 'collector', 'swift', 'titan', 'chronos', 'thunder', 'ufo', 'phoenix'] as const;
export type PlaneId = (typeof PLANE_IDS)[number];

export const PLANE_PRICES: Record<PlaneId, number> = {
  falcon: 0,
  phantom: 150,
  blaze: 250,
  wasp: 400,
  collector: 600,
  swift: 800,
  titan: 1100,
  chronos: 1400,
  thunder: 1800,
  ufo: 2300,
  phoenix: 3000,
};

export const isPlaneId = (id: string): id is PlaneId => (PLANE_IDS as readonly string[]).includes(id);
