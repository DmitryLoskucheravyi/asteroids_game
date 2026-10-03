import type { ItemMeta } from '../content/items.js';

export interface Vec {
  x: number;
  y: number;
}

/** Скеля арени: дрейфує (позиція — спільна формула від часу), руйнується від влучань. */
export interface Obstacle {
  id: number;
  /** Поточна позиція (оновлюється щотіку) */
  x: number;
  y: number;
  /** Позиція на старті матчу й швидкість дрейфу */
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
}

export type { QueueMode as MatchMode } from './constants.js';

export type MatchState = 'searching' | 'countdown' | 'active' | 'ended';

export type SkillKind = 'flare' | 'jump' | 'emp' | 'phase' | 'nanoRepair' | 'overdrive' | 'swarm' | 'scan';

export interface Participant {
  id: string;
  userId: string | null;
  isBot: boolean;
  nickname: string;
  planeId: string;
  tier: number;
  level: number;
  weaponId: string;
  /** Рівень прокачки зброї (боти — 1) */
  weaponLevel?: number;
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
  /** Команда (у соло кожен сам собі команда) і місце команди */
  team: number;
  teamPlace: number | null;
  diedAt: number;
  /** Таймстемпи (мс) дії ефектів */
  flareUntil: number;
  phaseUntil: number;
  slowUntil: number;
  lastFlareAt: number;
  lastItemAt: number;
  lastScanAt: number;
  /** Анти-чит: бюджет пострілів (token bucket) і бюджет переміщення (px) */
  shotTokens: number;
  shotTokensAt: number;
  /** Бюджет пострілів фірмової гармати (окремо від основної зброї) */
  sigTokens?: number;
  sigTokensAt?: number;
  moveBudget: number;
  lastMoveAt: number;
  lastJumpAt: number;
  /** Зібране на полі (переживе матч лише у переможця) */
  lootCoins: number;
  lootCrystals: number;
  /** Рейтинг на початку матчу (лише для гравців у рейтинговому режимі) */
  rankPoints: number;
  /** Анти-ферма: скільки пострілів і скільки пролетів за матч */
  shots: number;
  travelled: number;
  /** Скільки урону завдав за матч (для статистики) */
  damageDealt: number;
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
  rankPoints: number;
  team: number;
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

/** Снаряд, який симулює сервер — і ботів, і гравців (сервер — єдине джерело влучань). */
export interface ServerProjectile {
  ownerId: string;
  kind: 'bullet' | 'rocket' | 'missile';
  /** Компенсація лагу: цілі перевіряємо в їхніх позиціях на (зараз − lagMs) — як їх бачив стрілець */
  lagMs: number;
  /** До якого моменту (мс) снаряд уже просимульований — крок рахується від нього, а не від тіку */
  simT: number;
  /** Ракети з самонаведенням: курс і залишок життя (с) */
  angle?: number;
  life?: number;
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
  reward: { coins: number; crystals: number; crate: 'common' | 'rare' | 'epic' | 'mythic' | 'legendary' | null; xp: number; bp: number };
  jackpot: { coins: number; crystals: number };
  team: number;
  teamPlace: number;
  /** Рейтинговий матч: рейтинг до і після */
  rank: { before: number; after: number; delta: number } | null;
  id: string;
  userId: string | null;
  nickname: string;
  place: number;
  kills: number;
  isBot: boolean;
}
