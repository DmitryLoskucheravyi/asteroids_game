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
  /** Зібране на полі (переживе матч лише у переможця) */
  lootCoins: number;
  lootCrystals: number;
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
  lootCoins: number;
  lootCrystals: number;
}

/** Монети / кристали на полі; 'pile' — усе, що випало зі збитого літака. */
export interface Pickup {
  id: number;
  kind: 'coin' | 'crystal' | 'pile';
  x: number;
  y: number;
  coins: number;
  crystals: number;
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
  /** Що гравець отримав за матч (місце + фраги + джекпот переможця) */
  reward: { coins: number; crystals: number; crate: 'common' | 'rare' | 'epic' | 'mythic' | 'legendary' | null };
  jackpot: { coins: number; crystals: number };
  id: string;
  userId: string | null;
  nickname: string;
  place: number;
  kills: number;
  isBot: boolean;
}
