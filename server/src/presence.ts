/**
 * Присутність гравців у памʼяті сервера: коли востаннє робив запит (онлайн, якщо < 2 хв)
 * і чи зараз у матчі. Скидається з перезапуском сервера — для статусу друзів цього досить.
 */
const lastSeen = new Map<string, number>();
const inMatch = new Set<string>();

export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function touch(userId: string): void {
  lastSeen.set(userId, Date.now());
}

export function setInMatch(userId: string, value: boolean): void {
  if (value) inMatch.add(userId);
  else inMatch.delete(userId);
  touch(userId);
}

export type PresenceStatus = 'match' | 'online' | 'offline';

export function presence(userId: string): PresenceStatus {
  if (inMatch.has(userId)) return 'match';
  const seen = lastSeen.get(userId);
  return seen && Date.now() - seen < ONLINE_WINDOW_MS ? 'online' : 'offline';
}
