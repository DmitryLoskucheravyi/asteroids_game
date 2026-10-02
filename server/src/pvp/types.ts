import type { ItemMeta } from '../content/items.js';

export interface Vec {
  x: number;
  y: number;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export type MatchState = 'searching' | 'countdown' | 'active' | 'ended';

export type SkillKind = 'flare' | 'jump' | 'emp' | 'phase' | 'nanoRepair' | 'overdrive' | 'swarm';

export interface Participant {
  id: string;
  userId: string | null;
  isBot: boolean;
  nickname: string;
  planeId: string;
  tier: number;
  level: number;
  weaponId: string;
  activeItem: ItemMeta | null;
  passiveItem: ItemMeta | null;
  damageMul: number;
  fireRateMul: number;
  cooldownMul: number;
  pos: Vec;
  angle: number;
  firing: boolean;
  lastFiredAt: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  kills: number;
  place: number | null;
  /** Таймстемпи (мс) дії ефектів */
  flareUntil: number;
  phaseUntil: number;
  slowUntil: number;
  lastFlareAt: number;
  lastItemAt: number;
  /** Анти-чит: вікно підрахунку влучань */
  hitWindowStart: number;
  hitsInWindow: number;
  /** Боти: поточний behavior-стан */
  botState?: 'patrol' | 'chase' | 'attack' | 'flee';
  botDir?: Vec;
  botTimer?: number;
  botSpeed?: number;
  botRounds?: number;
  botCooldownUntil?: number;
  botLastHitAt?: number;
  botJumpAt?: number;
}

export interface PublicParticipant {
  id: string;
  isBot: boolean;
  nickname: string;
  planeId: string;
  tier: number;
  level: number;
  pos: Vec;
  angle: number;
  firing: boolean;
  lastFiredAt: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  kills: number;
  flare: boolean;
  phase: boolean;
  slowed: boolean;
}

/** Снаряд, який симулює сервер (постріли ботів). */
export interface ServerProjectile {
  ownerId: string;
  kind: 'bullet' | 'rocket';
  x: number;
  y: number;
  vx: number;
  vy: number;
  traveled: number;
  range: number;
  damage: number;
  splash: number;
}

export interface MatchResultEntry {
  id: string;
  userId: string | null;
  nickname: string;
  place: number;
  kills: number;
  isBot: boolean;
}
