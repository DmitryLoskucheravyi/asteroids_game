// Дзеркалить server/src/pvp/types.ts (публічна частина).
export interface Vec {
  x: number;
  y: number;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
}

export type SkillKind = 'flare' | 'jump' | 'emp' | 'phase' | 'nanoRepair' | 'overdrive' | 'swarm';

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

export interface MatchInit {
  roomId: string;
  world: { w: number; h: number };
  obstacles: Obstacle[];
  participants: PublicParticipant[];
  countdownMs: number;
  timeLimitMs: number;
}

export interface ShotEvent {
  ownerId: string;
  x: number;
  y: number;
  angle: number;
  kind: 'bullet' | 'rocket' | 'missile';
  speed: number;
}

export interface SkillEvent {
  id: string;
  kind: SkillKind;
  x: number;
  y: number;
  angle: number;
  radius?: number;
  duration?: number;
}

export interface HitEvent {
  attackerId: string;
  targetId: string;
  hp: number;
  died: boolean;
  damage: number;
}

export interface MatchResultEntry {
  id: string;
  userId: string | null;
  nickname: string;
  place: number;
  kills: number;
  isBot: boolean;
}
