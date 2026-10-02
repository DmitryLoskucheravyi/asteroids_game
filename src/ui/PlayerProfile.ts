import { Sfx } from '../core/audio';
import { t, type TKey } from '../core/i18n';
import { formatTime } from '../core/math';
import { Server, type PlayerProfileView } from '../core/server';
import { planeIconUrl } from '../game/PlaneArt';
import type { PlaneId } from '../game/planes';
import { RANK_MODES, rankEmblem, rankInfo } from '../game/ranks';
import { Icons, button, h, icon } from './dom';
import { Modal, toast } from './Modal';

/**
 * Профіль іншого гравця у вікні поверх будь-якого екрана (лідери, друзі, результати матчу, група).
 * key — публічний ID (#ABC…) або внутрішній id гравця.
 */
export async function openPlayerProfile(key: string): Promise<void> {
  let view: PlayerProfileView;
  try {
    view = await Server.player(key);
  } catch {
    Sfx.warning();
    toast(t('friends.notFound'));
    return;
  }
  const m = new Modal({ cls: 'player-modal', body: [], actions: [], onEscape: () => m.close() });
  // перемальовуємо вміст (напр. після «Додати в друзі»), не закриваючи вікна
  const mount = (v: PlayerProfileView): void => {
    const el = render(v, () => m.close(), mount);
    const old = m.el.querySelector('.pp');
    if (old) old.replaceWith(el);
    else m.el.querySelector('.modal-body')!.append(el);
  };
  mount(view);
  m.open();
}

function render(v: PlayerProfileView, close: () => void, update: (v: PlayerProfileView) => void): HTMLElement {
  const p = v.player;
  const st = p.stats;
  const n = (x: number) => x.toLocaleString('uk-UA');
  const statusKey: TKey = p.status === 'match' ? 'friends.inMatch' : p.status === 'online' ? 'friends.online' : 'friends.offline';

  // дія залежно від стосунку: додати, прийняти, або лише позначка
  const act = async (action: 'request' | 'accept', okKey: TKey) => {
    try {
      await Server.friendAction(action, p.publicId);
      Sfx.pickup();
      toast(t(okKey));
      update({ ...v, relation: action === 'accept' ? 'friend' : 'outgoing' });
    } catch {
      Sfx.warning();
      toast(t('friends.error'));
    }
  };
  let action: HTMLElement | null = null;
  if (v.relation === 'none') action = button(h('span', { class: 'buy-label' }, icon(Icons.star, 'ico'), t('friends.add')), () => void act('request', 'friends.requestSent'), 'btn primary');
  else if (v.relation === 'incoming') action = button(t('friends.accept'), () => void act('accept', 'friends.accepted'), 'btn primary');
  else action = h('span', { class: `pp-rel rel-${v.relation}` }, t(`friends.rel.${v.relation}` as TKey));

  const cell = (label: TKey, value: string) => h('div', { class: 'stat-cell' }, h('b', {}, value), h('small', {}, t(label)));
  const kd = st.pvpKills / Math.max(1, st.pvpDeaths);
  const wr = st.pvpMatches ? (st.pvpWins / st.pvpMatches) * 100 : 0;

  return h(
    'div',
    { class: 'pp' },
    h(
      'header',
      { class: 'pp-head' },
      h('img', { class: 'pp-plane', src: planeIconUrl(p.plane.id as PlaneId, p.plane.tier, p.plane.level), alt: '' }),
      h(
        'div',
        { class: 'pp-id' },
        h('b', { class: 'pp-nick' }, p.nickname),
        h('div', { class: 'pp-meta' }, h('span', { class: 'level-badge' }, t('menu.level', { n: p.level })), h('span', { class: 'profile-pid' }, p.publicId), h('span', { class: `friend-status ${p.status}` }, h('i'), t(statusKey))),
        h('small', { class: 'muted' }, `${t(`plane.${p.plane.id}` as TKey)} · ${t('planes.tier')} ${p.plane.tier} · ${t('pp.planes', { n: p.planesOwned })}`),
      ),
      button(icon(Icons.close), close, 'icon-btn pp-close', { 'aria-label': t('common.close') }),
    ),
    h('h3', { class: 'pp-sub' }, icon(Icons.trophy, 'ico gold'), t('pp.ranks')),
    h(
      'div',
      { class: 'pp-ranks' },
      ...RANK_MODES.map((mode) => {
        const r = p.ranked[mode];
        const ri = rankInfo(r?.points ?? 0);
        const best = rankInfo(r?.best ?? 0);
        return h(
          'div',
          { class: `pp-rank${r?.matches ? '' : ' unplayed'}` },
          h('span', { class: 'pp-rank-emblem', html: rankEmblem(ri.id, ri.roman, mode) }),
          h('small', { class: 'pp-rank-mode' }, t(`mode.${mode}` as TKey)),
          h('b', {}, `${t(ri.nameKey)} ${ri.roman}`),
          h('small', { class: 'muted' }, r?.matches ? `${n(r.points)} RP · ${t('pp.best')} ${t(best.nameKey)} ${best.roman}` : t('pp.noMatches')),
          r?.matches ? h('small', { class: 'muted' }, `${n(r.wins)} / ${n(r.matches)} ${t('pp.winsOf')}`) : null,
        );
      }),
    ),
    h('h3', { class: 'pp-sub' }, icon(Icons.boss, 'ico'), t('profile.stats')),
    h(
      'div',
      { class: 'stat-grid' },
      cell('lb.matches', n(st.pvpMatches)),
      cell('lb.wins', n(st.pvpWins)),
      cell('lb.winrate', `${wr.toFixed(1)}%`),
      cell('lb.top3', n(st.pvpTop3)),
      cell('lb.kills', n(st.pvpKills)),
      cell('lb.kd', kd.toFixed(2)),
      cell('lb.bestKills', n(st.bestKills)),
      cell('lb.damage', n(st.pvpDamage)),
      cell('lb.stars', n(st.stars)),
      cell('lb.survival', formatTime(st.survivalBest)),
    ),
    h('footer', { class: 'pp-actions' }, action),
  );
}

/** Робить рядок (лідери, друзі, результати матчу) клікабельним — відкриває профіль гравця. */
export function profileLink<T extends HTMLElement>(el: T, key: string | null | undefined): T {
  if (!key) return el;
  el.classList.add('pp-link');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('data-nav', 'true');
  el.title = t('pp.open');
  el.addEventListener('click', (e) => {
    // кнопки всередині рядка (прийняти, видалити…) мають свою дію
    if ((e.target as HTMLElement).closest('button')) return;
    Sfx.click();
    void openPlayerProfile(key);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === el) void openPlayerProfile(key);
  });
  return el;
}
