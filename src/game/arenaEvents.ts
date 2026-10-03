import type { TKey } from '../core/i18n';
import { Icons } from '../ui/dom';
import type { ArenaEvent } from '../../server/src/shared/hazards';

/** Як показувати івент арени: назва (ті ж, що в кампанії), іконка й колір. */
export const ARENA_EVENT_INFO: Record<ArenaEvent, { nameKey: TKey; descKey: TKey; icon: string; color: string }> = {
  comets: { nameKey: 'hazard.comet', descKey: 'howto.comet', icon: Icons.comet, color: '#ff9a3a' },
  hunters: { nameKey: 'hazard.homing', descKey: 'howto.homing', icon: Icons.homing, color: '#ff5a5a' },
  walls: { nameKey: 'hazard.wall', descKey: 'howto.wall', icon: Icons.wall, color: '#b77bff' },
  bouncers: { nameKey: 'hazard.bouncer', descKey: 'howto.bouncer', icon: Icons.bouncer, color: '#58d2ff' },
  fog: { nameKey: 'hazard.fog', descKey: 'howto.fog', icon: Icons.fog, color: '#aab0c8' },
  shower: { nameKey: 'hazard.meteor', descKey: 'howto.meteor', icon: Icons.meteor, color: '#ffb050' },
  mines: { nameKey: 'hazard.mine', descKey: 'howto.mine', icon: Icons.mine, color: '#ff6a5a' },
  wind: { nameKey: 'hazard.wind', descKey: 'howto.wind', icon: Icons.wind, color: '#bfe9ff' },
  boss: { nameKey: 'hazard.boss', descKey: 'howto.boss', icon: Icons.boss, color: '#ff5a3a' },
};

/** "2 год 14 хв" / "14 хв" до кінця івенту. */
export function eventTimeLeft(endsAt: number, now = Date.now()): string {
  const min = Math.max(0, Math.ceil((endsAt - now) / 60_000));
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return hh ? `${hh} год ${mm} хв` : `${mm} хв`;
}
