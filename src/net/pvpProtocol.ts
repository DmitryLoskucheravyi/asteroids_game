export interface Vec {
  x: number;
  y: number;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
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

export interface MatchInit {
  roomId: string;
  world: { w: number; h: number };
  obstacles: Obstacle[];
  participants: PublicParticipant[];
}

export interface MatchResultEntry {
  id: string;
  userId: string | null;
  nickname: string;
  place: number;
  kills: number;
  isBot: boolean;
}
