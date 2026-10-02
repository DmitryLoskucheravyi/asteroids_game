import { api } from './api';
import type { PlaneId } from '../game/planes';

export type CrateType = 'common' | 'rare' | 'legendary';
export type QuestKind = 'levelsCompleted' | 'crystalsCollected' | 'survivalSeconds' | 'cratesOpened';

export interface QuestView {
  questId: string;
  periodKey: string;
  kind: QuestKind;
  period: 'daily' | 'weekly';
  progress: number;
  target: number;
  reward: { coins: number; xp: number; crate?: CrateType };
  claimed: boolean;
}

export interface PassView {
  seasonId: string;
  bpPoints: number;
  claimedTiers: number[];
}

export interface CrateView {
  id: string;
  crateType: CrateType;
  source: string;
  acquiredAt: string;
  openedAt: string | null;
}

export interface ServerProfile {
  id: string;
  nickname: string;
  email: string;
  coins: number;
  xp: number;
  level: number;
  selectedPlane: PlaneId;
  ownedPlanes: PlaneId[];
  stars: number[];
  unlocked: number;
  survivalTop: { time: number; date: string }[];
  daily: { last: string; streak: number };
  quests: QuestView[];
  pass: PassView;
  crates: CrateView[];
}

export interface RewardResult {
  coins: number;
  xp: number;
  leveledUp: boolean;
  newLevel: number;
  crateAwarded: CrateType | null;
}

export type CrateReward = { kind: 'coins'; amount: number } | { kind: 'plane'; planeId: PlaneId } | { kind: 'xp'; amount: number };

export interface PassTierView {
  tier: number;
  bpRequired: number;
  reward: { coins: number; xp: number; crate?: CrateType };
}

export const Server = {
  register: (nickname: string, email: string, password: string) => api.post<{ token: string; profile: ServerProfile }>('/auth/register', { nickname, email, password }),
  login: (email: string, password: string) => api.post<{ token: string; profile: ServerProfile }>('/auth/login', { email, password }),

  profile: () => api.get<{ profile: ServerProfile }>('/profile'),
  selectPlane: (planeId: PlaneId) => api.post<{ profile: ServerProfile }>('/profile/select-plane', { planeId }),
  buyPlane: (planeId: PlaneId) => api.post<{ profile: ServerProfile }>('/profile/buy-plane', { planeId }),
  importLocal: (data: { coins: number; owned: string[]; stars: number[]; unlocked: number; survivalTop: { time: number; date: string }[] }) =>
    api.post<{ profile: ServerProfile }>('/profile/import-local', data),
  resetProgress: () => api.post<{ profile: ServerProfile }>('/profile/reset'),

  levelComplete: (level: number, stars: number, crystals: number) =>
    api.post<{ profile: ServerProfile; reward: RewardResult & { firstClear: boolean } }>('/events/level-complete', { level, stars, crystals }),
  survival: (seconds: number, crystals: number) => api.post<{ profile: ServerProfile; reward: RewardResult & { place: number } }>('/events/survival', { seconds, crystals }),
  crystalsOnly: (crystals: number) => api.post<{ profile: ServerProfile; reward: RewardResult }>('/events/crystals', { crystals }),

  dailyState: () => api.get<{ state: { available: boolean; day: number; reward: number } }>('/daily'),
  dailyClaim: () => api.post<{ profile: ServerProfile; reward: RewardResult & { day: number } }>('/daily/claim'),

  quests: () => api.get<{ profile: ServerProfile }>('/quests'),
  claimQuest: (questId: string, periodKey: string) => api.post<{ profile: ServerProfile; reward: RewardResult }>(`/quests/${questId}/claim`, { periodKey }),

  pass: () => api.get<{ season: { id: string; startsAt: string; endsAt: string; tiers: PassTierView[] }; bpPoints: number; claimedTiers: number[] }>('/pass'),
  claimTier: (tier: number) => api.post<{ profile: ServerProfile; reward: RewardResult }>(`/pass/claim/${tier}`),

  openCrate: (crateId: string) => api.post<{ profile: ServerProfile; reward: CrateReward }>(`/crates/${crateId}/open`),
};
