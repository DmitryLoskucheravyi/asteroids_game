// Дзеркалить server/src/content/economy.ts — потрібно лише для відображення (прогрес-бар XP).
export function xpToNext(level: number): number {
  return 80 + (level - 1) * 45;
}
