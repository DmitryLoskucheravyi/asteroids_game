import type { App } from '../../app/App';
import { t, type TKey } from '../../core/i18n';
import { formatTime } from '../../core/math';
import { Server, type LeaderboardView } from '../../core/server';
import { Save } from '../../core/storage';
import { planeIconUrl } from '../../game/PlaneArt';
import type { PlaneId } from '../../game/planes';
import { rankEmblem, rankInfo, type RankMode } from '../../game/ranks';
import { Icons, button, h, icon } from '../dom';
import { Screen } from '../Screen';
import { profileLink } from '../PlayerProfile';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

type Board = 'wins' | 'rank' | 'rankDuo' | 'rankTrio' | 'rankSquad' | 'kills' | 'kd' | 'winrate' | 'top3' | 'matches' | 'bestKills' | 'damage' | 'level' | 'survival' | 'stars' | 'coins' | 'crates';

/** Категорії, згруповані за змістом: PvP, рейтинг, прогрес. */
const GROUPS: { title: TKey; boards: { id: Board; icon: string }[] }[] = [
  {
    title: 'lb.groupPvp',
    boards: [
      { id: 'wins', icon: Icons.trophy },
      { id: 'kills', icon: Icons.boss },
      { id: 'kd', icon: Icons.homing },
      { id: 'winrate', icon: Icons.star },
      { id: 'top3', icon: Icons.trophy },
      { id: 'bestKills', icon: Icons.bolt },
      { id: 'damage', icon: Icons.bolt },
      { id: 'matches', icon: Icons.clock },
    ],
  },
  {
    title: 'lb.groupRanked',
    boards: [
      { id: 'rank', icon: Icons.star },
      { id: 'rankDuo', icon: Icons.star },
      { id: 'rankTrio', icon: Icons.star },
      { id: 'rankSquad', icon: Icons.star },
    ],
  },
  {
    title: 'lb.groupProgress',
    boards: [
      { id: 'level', icon: Icons.star },
      { id: 'stars', icon: Icons.star },
      { id: 'survival', icon: Icons.clock },
      { id: 'coins', icon: Icons.coin },
      { id: 'crates', icon: Icons.gift },
    ],
  },
];

/** Таблиці лідерів за різними параметрами: топ-50 і твоє місце, навіть якщо ти поза топом. */
export class LeaderboardScreen extends Screen {
  private data: LeaderboardView | null = null;
  private loading = true;

  constructor(
    app: App,
    private board: Board = 'wins',
  ) {
    super(app);
  }

  onShow(): void {
    super.onShow();
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.render();
    try {
      this.data = await Server.leaderboard(this.board);
    } catch {
      this.data = null;
    } finally {
      this.loading = false;
      this.render();
      this.el.querySelector<HTMLElement>(`.lb-tab[data-board="${this.board}"]`)?.focus();
    }
  }

  /** Режим, чию іконку рангу показувати в рядках. */
  private get rankMode(): RankMode {
    return this.board === 'rankDuo' ? 'duo' : this.board === 'rankTrio' ? 'trio' : this.board === 'rankSquad' ? 'squad' : 'solo';
  }

  /** Значення в читабельному вигляді для кожної категорії. */
  private format(board: Board, value: number): string {
    switch (board) {
      case 'kd':
        return value.toFixed(2);
      case 'winrate':
        return `${value.toFixed(1)}%`;
      case 'survival':
        return formatTime(value);
      case 'level':
        return `${Math.floor(value / 100000)}`;
      case 'rank':
      case 'rankDuo':
      case 'rankTrio':
      case 'rankSquad': {
        const r = rankInfo(value);
        return `${t(r.nameKey)} ${r.roman} · ${value} RP`;
      }
      default:
        return value.toLocaleString('uk-UA');
    }
  }

  private row(place: number | null, nickname: string, plane: string | undefined, rankPoints: number, level: number, value: number, self: boolean, id?: string): HTMLElement {
    const rk = rankInfo(rankPoints);
    return profileLink(h(
      'div',
      { class: `lb-row${self ? ' self' : ''}${place && place <= 3 ? ` podium p${place}` : ''}` },
      h('span', { class: 'lb-place' }, place === 1 ? icon(Icons.trophy, 'ico') : place ? `#${place}` : '—'),
      plane ? h('img', { class: 'lb-plane', src: planeIconUrl(plane as PlaneId), alt: '' }) : h('span', {}),
      h('span', { class: 'lb-name' }, h('b', {}, nickname), h('small', {}, `${t('lb.level')} ${level}`)),
      h('span', { class: 'lb-rank', html: rankEmblem(rk.id, rk.roman, this.rankMode), title: `${t(rk.nameKey)} ${rk.roman}` }),
      h('span', { class: 'lb-value' }, this.format(this.board, value)),
    ), self ? null : id);
  }

  protected build(): HTMLElement {
    const tabs = GROUPS.map((g) =>
      h(
        'div',
        { class: 'lb-group' },
        h('small', {}, t(g.title)),
        ...g.boards.map((b) =>
          button(
            h('span', { class: 'lb-tab-inner' }, icon(b.icon, 'ico'), t(`lb.${b.id}` as TKey)),
            () => {
              if (this.board === b.id) return;
              this.board = b.id;
              void this.load();
            },
            `lb-tab${this.board === b.id ? ' on' : ''}`,
            { 'data-board': b.id },
          ),
        ),
      ),
    );

    const d = this.data;
    const meInTop = d?.top.some((r) => r.nickname === Save.data.nickname);
    let body: HTMLElement;
    if (this.loading && !d) body = h('p', { class: 'muted' }, t('common.loading'));
    else if (!d || !d.top.length) body = h('p', { class: 'muted lb-empty' }, t('lb.empty'));
    else
      body = h(
        'div',
        { class: 'lb-list' },
        ...d.top.map((r) => this.row(r.place, r.nickname, r.plane, r.rankPoints, r.level, r.value, r.nickname === Save.data.nickname, r.id)),
        !meInTop ? h('div', { class: 'lb-sep' }, '···') : null,
        !meInTop ? this.row(d.me.place, Save.data.nickname, Save.data.plane, Save.rank(this.rankMode).points, Save.data.level, d.me.value, true) : null,
      );

    return h(
      'div',
      { class: 'page leaderboard' },
      screenHeader(t('lb.title'), () => this.onBack()),
      h(
        'div',
        { class: 'lb-layout' },
        h('nav', { class: 'lb-tabs' }, ...tabs),
        h(
          'section',
          { class: `lb-board${this.loading ? ' loading' : ''}` },
          h('h3', {}, t(`lb.${this.board}` as TKey), d ? h('small', {}, t('lb.total', { n: d.total })) : null),
          d?.minMatches ? h('p', { class: 'muted small' }, t('lb.minMatches', { n: d.minMatches })) : null,
          body,
        ),
      ),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
