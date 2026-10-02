import type { TKey } from '../core/i18n';

// Дзеркалить server/src/content/ranks.ts
export const RANK_IDS = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'galaxy'] as const;
export type RankId = (typeof RANK_IDS)[number];
export const RP_PER_DIVISION = 100;
export const DIVISIONS = 5;
const MAX_INDEX = RANK_IDS.length * DIVISIONS - 1;
const ROMAN = ['V', 'IV', 'III', 'II', 'I'];

export const RANK_COLORS: Record<RankId, [string, string]> = {
  bronze: ['#e09a5a', '#8a4a1e'],
  silver: ['#eef2fa', '#7a8498'],
  gold: ['#ffe27a', '#c8900a'],
  platinum: ['#8ff5e6', '#1f9a8a'],
  diamond: ['#9fd8ff', '#2a62d0'],
  master: ['#e2b8ff', '#7a2ad0'],
  galaxy: ['#ff8ae0', '#3a1a9a'],
};

export interface RankInfo {
  id: RankId;
  rankIndex: number;
  /** 0..4 усередині рангу (0 — V, 4 — I) */
  step: number;
  /** Глобальний індекс підрівня 0..34 */
  index: number;
  roman: string;
  nameKey: TKey;
  /** Прогрес до наступного підрівня 0..1 (на Галактиці I — завжди 1) */
  progress: number;
  /** RP у межах поточного підрівня */
  inDivision: number;
  top: boolean;
}

export function rankInfo(rp: number): RankInfo {
  const points = Math.max(0, rp);
  const index = Math.min(MAX_INDEX, Math.floor(points / RP_PER_DIVISION));
  const rankIndex = Math.floor(index / DIVISIONS);
  const step = index % DIVISIONS;
  const top = index === MAX_INDEX;
  const inDivision = top ? points - MAX_INDEX * RP_PER_DIVISION : points % RP_PER_DIVISION;
  return {
    id: RANK_IDS[rankIndex],
    rankIndex,
    step,
    index,
    roman: ROMAN[step],
    nameKey: `rank.${RANK_IDS[rankIndex]}` as TKey,
    progress: top ? 1 : inDivision / RP_PER_DIVISION,
    inDivision,
    top,
  };
}

/**
 * Емблема рангу (SVG): гранований щит кольору рангу; з Платини з'являються крила,
 * з Майстра — корона, у Галактики — зоряна туманність усередині. Римська цифра — підрівень.
 */
export function rankEmblem(id: RankId, roman: string | null = null): string {
  const [hi, lo] = RANK_COLORS[id];
  const idx = RANK_IDS.indexOf(id);
  const gid = `rg-${id}`;
  const wings =
    idx >= 3
      ? `<path d="M14 30 2 22l4 14 10 4zM50 30l12-8-4 14-10 4z" fill="${lo}" stroke="#0b0a18" stroke-width="2" stroke-linejoin="round"/>
         <path d="M14 30 6 26l3 8M50 30l8-4-3 8" stroke="${hi}" stroke-width="1.5" fill="none"/>`
      : '';
  const crown =
    idx >= 5 ? `<path d="M20 12l5-8 7 6 7-6 5 8z" fill="${hi}" stroke="#0b0a18" stroke-width="2" stroke-linejoin="round"/><circle cx="32" cy="8" r="2" fill="#fff"/>` : '';
  const core =
    id === 'galaxy'
      ? `<circle cx="32" cy="34" r="11" fill="url(#${gid}-neb)"/><circle cx="27" cy="30" r="1.3" fill="#fff"/><circle cx="37" cy="37" r="1" fill="#fff"/><circle cx="34" cy="28" r="0.8" fill="#fff"/>
         <path d="M22 36c6-6 14-6 20-2" stroke="#fff" stroke-width="1" fill="none" opacity=".7"/>`
      : `<path d="M32 22l3.5 7.5 8 .8-6 5.4 1.8 7.8L32 39.6l-7.3 3.9 1.8-7.8-6-5.4 8-.8z" fill="#fff" opacity=".85"/>`;
  const label = roman
    ? `<text x="32" y="60" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="800" font-size="11" fill="#fff" stroke="#0b0a18" stroke-width="3" paint-order="stroke">${roman}</text>`
    : '';
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="1" stop-color="${lo}"/></linearGradient>
      <radialGradient id="${gid}-neb"><stop offset="0" stop-color="#ffd0f4"/><stop offset=".5" stop-color="#9a4aff"/><stop offset="1" stop-color="#1a0a4a"/></radialGradient>
    </defs>
    ${wings}
    <path d="M32 8 50 16v18c0 10-8 17-18 21-10-4-18-11-18-21V16z" fill="url(#${gid})" stroke="#0b0a18" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M32 13 45 19v14c0 7-5.5 12.5-13 16" fill="none" stroke="#fff" stroke-width="1.5" opacity=".45"/>
    ${core}
    ${crown}
    ${label}
  </svg>`;
}
