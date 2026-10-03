import { api } from './api';
import type { PlaneId } from '../game/planes';
import type { ItemRarity } from '../game/items';

export type CrateType = 'common' | 'rare' | 'epic' | 'mythic' | 'legendary';
export type QuestKind =
  | 'levelsCompleted'
  | 'crystalsCollected'
  | 'survivalSeconds'
  | 'cratesOpened'
  | 'pvpMatches'
  | 'pvpKills'
  | 'pvpTop3'
  | 'pvpWins'
  | 'threeStarLevels'
  | 'planeUpgrades'
  | 'coinsEarned'
  | 'itemsBought'
  | 'dailyClaimed'
  | 'passClaims'
  | 'questsCompleted'
  | 'survivalRuns';

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
  premium: boolean;
  claimedFree: number[];
  claimedPremium: number[];
  /** Скільки тьєрів можна забрати зараз (рахує сервер) */
  claimable?: number;
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
  keybinds: Record<string, string>;
  crystals: number;
  planeProgress: { planeId: PlaneId; tier: number; level: number }[];
  items: { id: string; defId: string; rarity: ItemRarity; level?: number }[];
  weaponLevels?: Record<string, number>;
  loadouts: { planeId: PlaneId; active: string | null; passive: string | null; weapon: string | null }[];
  ownedWeapons: string[];
  ranked?: RankedView;
  stats?: PlayerStats;
  publicId?: string | null;
  friendRequests?: number;
  rankedModes?: Record<'solo' | 'duo' | 'trio' | 'squad', RankedView>;
}

export type PlayerStats = Record<'pvpMatches' | 'pvpWins' | 'pvpTop3' | 'pvpKills' | 'pvpDeaths' | 'pvpDamage' | 'bestKills' | 'cratesOpened' | 'coinsEarned' | 'levelsCompleted' | 'stars' | 'survivalBest', number>;

export interface FriendCard {
  publicId: string;
  nickname: string;
  level: number;
  plane: string;
  rankPoints: number;
  stats: { matches: number; wins: number; kills: number };
  status: 'match' | 'online' | 'offline';
  lastLoginAt?: string;
}

export interface FriendsView {
  me: { publicId: string };
  friends: FriendCard[];
  incoming: FriendCard[];
  outgoing: FriendCard[];
}

export interface PartyMember {
  publicId: string;
  nickname: string;
  level: number;
  plane: string;
  rankPoints: number;
  status: 'match' | 'online' | 'offline';
  leader?: boolean;
  self?: boolean;
  /** Учасник групи натиснув «Готовий» (лідер — завжди готовий) */
  ready?: boolean;
  inParty?: boolean;
}

export interface PartyView {
  party: {
    id: string;
    mode: 'solo' | 'duo' | 'trio' | 'squad';
    state: 'idle' | 'searching';
    version: number;
    isLeader: boolean;
    /** Усі, крім лідера, готові — можна шукати матч */
    allReady: boolean;
    maxSize: number;
    members: PartyMember[];
    invited: PartyMember[];
  } | null;
  invites: { partyId: string; mode: 'solo' | 'duo' | 'trio' | 'squad'; from: PartyMember | null; size: number }[];
  friends: PartyMember[];
}

export interface PlayerProfileView {
  relation: 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';
  player: {
    publicId: string;
    nickname: string;
    level: number;
    status: 'match' | 'online' | 'offline';
    lastLoginAt?: string;
    createdAt?: string;
    plane: { id: string; tier: number; level: number };
    planesOwned: number;
    stats: PlayerStats;
    ranked: Record<'solo' | 'duo' | 'trio' | 'squad', RankedView | undefined>;
  };
}

export interface LeaderboardView {
  by: string;
  top: { place: number; id: string; nickname: string; level: number; rankPoints: number; plane?: string; value: number }[];
  me: { place: number | null; value: number };
  total: number;
  minMatches: number;
}

export interface RankedView {
  points: number;
  best: number;
  matches: number;
  wins: number;
  seasonEndsAt?: string;
  lastSeason?: { seasonId: string; points: number; division: number; crate: CrateType; crystals: number } | null;
}

export interface RewardResult {
  coins: number;
  xp: number;
  leveledUp: boolean;
  newLevel: number;
  crateAwarded: CrateType | null;
  crystals: number;
}

export type CrateReward =
  | { kind: 'coins'; amount: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'crystals'; amount: number }
  | { kind: 'plane'; planeId: PlaneId }
  | { kind: 'item'; defId: string; rarity: ItemRarity }
  | { kind: 'weapon'; weaponId: string };

export interface PassRewardView {
  coins: number;
  xp: number;
  crate?: CrateType;
  crystals?: number;
  item?: string;
  weapon?: string;
  plane?: PlaneId;
}

export interface PassTierView {
  tier: number;
  bpRequired: number;
  reward: PassRewardView;
  premiumReward: PassRewardView;
}

export const Server = {
  register: (nickname: string, email: string, password: string) => api.post<{ token: string; profile: ServerProfile }>('/auth/register', { nickname, email, password }),
  /** login — нікнейм або email */
  login: (login: string, password: string) => api.post<{ token: string; profile: ServerProfile }>('/auth/login', { login, password }),

  profile: () => api.get<{ profile: ServerProfile }>('/profile'),
  selectPlane: (planeId: PlaneId) => api.post<{ profile: ServerProfile }>('/profile/select-plane', { planeId }),
  buyCrate: (type: 'common' | 'rare' | 'epic' | 'mythic' | 'legendary') => api.post<{ profile: ServerProfile }>('/shop/buy-crate', { type }),
  buyGems: (pack: string) => api.post<{ profile: ServerProfile }>('/shop/buy-gems', { pack }),
  buyPlane: (planeId: PlaneId) => api.post<{ profile: ServerProfile }>('/profile/buy-plane', { planeId }),
  importLocal: (data: { coins: number; owned: string[]; stars: number[]; unlocked: number; survivalTop: { time: number; date: string }[] }) =>
    api.post<{ profile: ServerProfile }>('/profile/import-local', data),
  resetProgress: () => api.post<{ profile: ServerProfile }>('/profile/reset'),
  setKeybinds: (keybinds: Record<string, string>) => api.post<{ profile: ServerProfile }>('/profile/keybinds', { keybinds }),
  levelUpPlane: (planeId: PlaneId) => api.post<{ profile: ServerProfile }>(`/profile/plane/${planeId}/level-up`),
  tierUpPlane: (planeId: PlaneId) => api.post<{ profile: ServerProfile }>(`/profile/plane/${planeId}/tier-up`),

  levelComplete: (level: number, stars: number, crystals: number, prisms: number) =>
    api.post<{ profile: ServerProfile; reward: RewardResult & { firstClear: boolean } }>('/events/level-complete', { level, stars, crystals, prisms }),
  survival: (seconds: number, crystals: number, prisms: number, active?: number) =>
    api.post<{ profile: ServerProfile; reward: RewardResult & { place: number } }>('/events/survival', { seconds, crystals, prisms, active }),
  crystalsOnly: (crystals: number, prisms: number) => api.post<{ profile: ServerProfile; reward: RewardResult }>('/events/crystals', { crystals, prisms }),

  dailyState: () => api.get<{ state: { available: boolean; day: number; reward: number } }>('/daily'),
  dailyClaim: () => api.post<{ profile: ServerProfile; reward: RewardResult & { day: number } }>('/daily/claim'),

  quests: () => api.get<{ profile: ServerProfile }>('/quests'),
  claimQuest: (questId: string, periodKey: string) => api.post<{ profile: ServerProfile; reward: RewardResult }>(`/quests/${questId}/claim`, { periodKey }),

  pass: () =>
    api.get<{
      season: { id: string; startsAt: string; endsAt: string; tiers: PassTierView[]; premiumPrice: number };
      bpPoints: number;
      premium: boolean;
      claimedFree: number[];
      claimedPremium: number[];
    }>('/pass'),
  claimTier: (tier: number, track: 'free' | 'premium') => api.post<{ profile: ServerProfile; reward: RewardResult }>(`/pass/claim/${tier}`, { track }),
  claimAllPass: () => api.post<{ profile: ServerProfile; total: { coins: number; xp: number; crystals: number; crates: number; tiers: number } }>('/pass/claim-all'),
  buyPremiumPass: () => api.post<{ profile: ServerProfile }>('/pass/buy-premium'),

  friends: () => api.get<FriendsView>('/friends'),
  friendsPing: () => api.get<{ ok: boolean; partyInvites?: number }>('/friends/ping'),
  party: () => api.get<PartyView>('/party'),
  player: (key: string) => api.get<PlayerProfileView>(`/players/${encodeURIComponent(key.replace(/^#/, ''))}`),
  partyAction: (action: 'invite' | 'accept' | 'decline' | 'leave' | 'kick' | 'mode' | 'search' | 'ready', body: Record<string, unknown> = {}) => api.post<PartyView>(`/party/${action}`, body),
  findPlayer: (publicId: string) => api.get<{ player: FriendCard; relation: 'self' | 'friend' | 'outgoing' | 'incoming' | 'none' }>(`/friends/search/${encodeURIComponent(publicId.replace(/^#/, ''))}`),
  friendAction: (action: 'request' | 'accept' | 'decline' | 'cancel' | 'remove', publicId: string) => api.post<FriendsView>(`/friends/${action}`, { publicId }),
  leaderboard: (by: string) => api.get<LeaderboardView>(`/leaderboard/${by}`),
  openAllCrates: () => api.post<{ profile: ServerProfile; results: { crateId: string; crateType: CrateType; rewards: CrateReward[] }[] }>('/crates/open-all'),
  openCrate: (crateId: string) => api.post<{ profile: ServerProfile; rewards: CrateReward[] }>(`/crates/${crateId}/open`),

  buyItem: (defId: string) => api.post<{ profile: ServerProfile }>('/items/buy', { defId }),
  buyWeapon: (weaponId: string) => api.post<{ profile: ServerProfile }>('/items/buy-weapon', { weaponId }),
  /** Прокачати зброю (id зброї) або предмет (_id власного предмета) на 1 рівень */
  upgradeGear: (kind: 'weapon' | 'item', id: string) => api.post<{ profile: ServerProfile }>('/items/upgrade', { kind, id }),
  setLoadout: (planeId: PlaneId, active: string | null, passive: string | null, weapon: string | null) =>
    api.post<{ profile: ServerProfile }>('/items/loadout', { planeId, active, passive, weapon }),
};
