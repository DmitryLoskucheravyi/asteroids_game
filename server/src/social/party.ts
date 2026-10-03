import { randomUUID } from 'node:crypto';
import { TEAM_SIZE_BY_MODE, type RankMode } from '../pvp/constants.js';

/**
 * Групи (паті) в памʼяті сервера: лідер, учасники, запрошення, вибраний режим і стан пошуку.
 * Учасники дізнаються про зміни опитуванням GET /api/party; коли лідер запускає пошук,
 * кожен клієнт сам стає в чергу з partyId — матчмейкер збирає всіх і ставить в одну команду.
 */
export interface Party {
  id: string;
  leaderId: string;
  members: string[];
  /** userId → коли запрошено (запрошення живуть 2 хв) */
  invites: Map<string, number>;
  mode: RankMode;
  state: 'idle' | 'searching';
  /** Учасники (крім лідера), що натиснули «Готовий» — без цього лідер не почне пошук */
  ready: Set<string>;
  /** Змінюється при кожній зміні — клієнт бачить, що треба перерендерити */
  version: number;
}

const INVITE_TTL_MS = 2 * 60 * 1000;
const parties = new Map<string, Party>();
const partyOf = new Map<string, string>();

const bump = (p: Party): void => {
  p.version++;
};

export const maxSize = (mode: RankMode): number => TEAM_SIZE_BY_MODE[mode];

export function getParty(userId: string): Party | null {
  const id = partyOf.get(userId);
  return id ? parties.get(id) ?? null : null;
}

export function getPartyById(id: string): Party | null {
  return parties.get(id) ?? null;
}

/** Запрошення, що чекають цього гравця. */
export function invitesFor(userId: string): Party[] {
  const now = Date.now();
  const out: Party[] = [];
  for (const p of parties.values()) {
    const at = p.invites.get(userId);
    if (at === undefined) continue;
    if (now - at > INVITE_TTL_MS) {
      p.invites.delete(userId);
      continue;
    }
    out.push(p);
  }
  return out;
}

function create(leaderId: string, mode: RankMode): Party {
  const p: Party = { id: randomUUID(), leaderId, members: [leaderId], invites: new Map(), mode: mode === 'solo' ? 'duo' : mode, state: 'idle', ready: new Set(), version: 1 };
  parties.set(p.id, p);
  partyOf.set(leaderId, p.id);
  return p;
}

export type PartyError = 'not_leader' | 'party_full' | 'already_in_party' | 'no_invite' | 'searching' | 'bad_mode' | 'not_ready';

/** Запросити гравця (група створюється автоматично). */
export function invite(fromId: string, toId: string, mode: RankMode): Party | PartyError {
  const p = getParty(fromId) ?? create(fromId, mode);
  if (p.leaderId !== fromId) return 'not_leader';
  if (p.state === 'searching') return 'searching';
  if (p.members.includes(toId)) return 'already_in_party';
  if (p.members.length + p.invites.size >= maxSize(p.mode)) return 'party_full';
  p.invites.set(toId, Date.now());
  bump(p);
  return p;
}

export function accept(userId: string, partyId: string): Party | PartyError {
  const p = parties.get(partyId);
  if (!p || !p.invites.has(userId)) return 'no_invite';
  if (p.state === 'searching') return 'searching';
  if (p.members.length >= maxSize(p.mode)) return 'party_full';
  leave(userId);
  p.invites.delete(userId);
  p.members.push(userId);
  partyOf.set(userId, p.id);
  bump(p);
  return p;
}

export function decline(userId: string, partyId: string): void {
  const p = parties.get(partyId);
  if (p?.invites.delete(userId)) bump(p);
}

/** Вийти з групи; якщо виходить лідер — лідером стає наступний, порожня група зникає. */
export function leave(userId: string): void {
  const p = getParty(userId);
  if (!p) return;
  p.members = p.members.filter((m) => m !== userId);
  partyOf.delete(userId);
  p.ready.delete(userId);
  p.state = 'idle';
  if (!p.members.length) {
    parties.delete(p.id);
    return;
  }
  if (p.leaderId === userId) {
    p.leaderId = p.members[0];
    // новий лідер не "чекає сам на себе"
    p.ready.delete(p.leaderId);
  }
  bump(p);
}

export function kick(leaderId: string, userId: string): Party | PartyError {
  const p = getParty(leaderId);
  if (!p || p.leaderId !== leaderId) return 'not_leader';
  if (p.members.includes(userId)) leave(userId);
  else p.invites.delete(userId);
  bump(p);
  return p;
}

export function setMode(leaderId: string, mode: RankMode): Party | PartyError {
  const p = getParty(leaderId);
  if (!p || p.leaderId !== leaderId) return 'not_leader';
  if (p.state === 'searching') return 'searching';
  if (mode === 'solo' || p.members.length > maxSize(mode)) return 'bad_mode';
  p.mode = mode;
  p.ready.clear();
  // зайві запрошення відкликаємо, якщо нова команда менша
  while (p.members.length + p.invites.size > maxSize(mode)) p.invites.delete([...p.invites.keys()].pop()!);
  bump(p);
  return p;
}

export function setSearching(userId: string, searching: boolean): Party | PartyError {
  const p = getParty(userId);
  if (!p) return 'not_leader';
  // зупинити пошук може будь-хто з групи, почати — лише лідер
  if (searching && p.leaderId !== userId) return 'not_leader';
  if (searching && !allReady(p)) return 'not_ready';
  p.state = searching ? 'searching' : 'idle';
  bump(p);
  return p;
}

/** Матчмейкер знайшов матч для групи — пошук завершено (після бою група сама в чергу не стане). */
export function setIdle(partyId: string): void {
  const p = parties.get(partyId);
  if (!p || p.state === 'idle') return;
  p.state = 'idle';
  p.ready.clear();
  bump(p);
}

/** Усі, крім лідера, натиснули «Готовий». */
export function allReady(p: Party): boolean {
  return p.members.every((m) => m === p.leaderId || p.ready.has(m));
}

/** Учасник (не лідер) перемикає «Готовий»; під час пошуку — не можна (спершу скасувати). */
export function setReady(userId: string, ready: boolean): Party | PartyError {
  const p = getParty(userId);
  if (!p) return 'not_leader';
  if (p.leaderId === userId) return 'not_leader';
  if (p.state === 'searching') return 'searching';
  if (ready) p.ready.add(userId);
  else p.ready.delete(userId);
  bump(p);
  return p;
}
