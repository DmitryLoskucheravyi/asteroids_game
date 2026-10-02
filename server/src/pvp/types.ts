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

export interface Participant {
  id: string;
  userId: string | null;
  isBot: boolean;
  nickname: string;
  planeId: string;
  weaponId: string;
  pos: Vec;
  angle: number;
  firing: boolean;
  lastFiredAt: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  kills: number;
  place: number | null;
  /** Боти: поточний behavior-стан */
  botState?: 'patrol' | 'chase' | 'attack' | 'flee';
  botTargetId?: string | null;
  botDir?: Vec;
  botTimer?: number;
}

export interface PublicParticipant {
  id: string;
  isBot: boolean;
  nickname: string;
  planeId: string;
  pos: Vec;
  angle: number;
  firing: boolean;
  lastFiredAt: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  kills: number;
}

export interface MatchResultEntry {
  id: string;
  userId: string | null;
  nickname: string;
  place: number;
  kills: number;
  isBot: boolean;
}
