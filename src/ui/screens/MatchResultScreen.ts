import type { Socket } from 'socket.io-client';
import type { App } from '../../app/App';
import { t, type TKey } from '../../core/i18n';
import { crate3d } from '../../game/CrateArt';
import { rankEmblem, rankInfo } from '../../game/ranks';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import type { MatchResultEntry } from '../../net/pvpProtocol';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { Screen } from '../Screen';
import { MainMenuScreen } from './MainMenuScreen';
import { OnlineScreen } from './OnlineScreen';

/** Підсумок матчу: таблиця місць, своє місце підсвічене, фраги. */
export class MatchResultScreen extends Screen {
  constructor(
    app: App,
    private readonly results: MatchResultEntry[],
    private readonly socket: Socket,
  ) {
    super(app);
  }

  protected build(): HTMLElement {
    const selfId = this.socket.id;
    const rows = this.results.map((r) => {
      const isSelf = r.id === selfId;
      return h(
        'div',
        { class: `match-row${isSelf ? ' self' : ''}${r.place === 1 ? ' winner' : ''}` },
        h('span', { class: 'match-place' }, r.place === 1 ? icon(Icons.trophy, 'ico gold') : `#${r.place}`),
        h('span', { class: 'match-name' }, isSelf ? `${r.nickname} (${t('matchresult.you')})` : r.nickname),
        h('span', { class: 'match-kills' }, `${r.kills} ${t('matchresult.kills')}`),
      );
    });
    const me = this.results.find((r) => r.id === selfId);
    const winner = this.results.find((r) => r.place === 1);
    const jackpot = winner && (winner.jackpot.coins > 0 || winner.jackpot.crystals > 0)
      ? h('div', { class: 'mr-jackpot' }, h('span', {}, t('matchresult.jackpot', { name: winner.nickname })), coinBadge(winner.jackpot.coins, 'coin-badge'), winner.jackpot.crystals ? crystalBadge(winner.jackpot.crystals, 'coin-badge crystal-badge') : null)
      : null;
    const myReward = me
      ? h('div', { class: 'mr-reward' }, h('span', {}, t('matchresult.reward')), coinBadge(me.reward.coins, 'coin-badge big'), me.reward.crystals ? crystalBadge(me.reward.crystals, 'coin-badge big crystal-badge') : null, me.reward.crate ? h('span', { class: 'mr-crate' }, crate3d(me.reward.crate, 44, 'tile-crate idle'), t(`crate.${me.reward.crate}` as TKey)) : null)
      : null;

    return h(
      'div',
      { class: 'page matchresult' },
      h('h2', { class: 'mr-title' }, t('matchresult.title')),
      h('div', { class: 'match-list' }, ...rows),
      jackpot,
      myReward,
      me?.rank ? this.rankBlock(me.rank) : null,
      h(
        'div',
        { class: 'mr-actions' },
        button(t('matchresult.again'), () => this.app.show(new OnlineScreen(this.app, this.results.some((r) => r.rank) ? 'ranked' : 'casual')), 'btn primary', { 'data-autofocus': true }),
        button(t('matchresult.toMenu'), () => this.app.show(new MainMenuScreen(this.app)), 'btn'),
      ),
    );
  }

  private rankBlock(r: { before: number; after: number; delta: number }): HTMLElement {
    const before = rankInfo(r.before);
    const after = rankInfo(r.after);
    const up = after.index > before.index;
    const down = after.index < before.index;
    return h(
      'div',
      { class: `mr-rank rank-${after.id}${up ? ' up' : ''}` },
      h('div', { class: 'rank-emblem', html: rankEmblem(after.id, after.roman) }),
      h(
        'div',
        { class: 'mr-rank-text' },
        h('b', {}, `${t(after.nameKey)} ${after.roman}`),
        h('span', { class: r.delta >= 0 ? 'rp-up' : 'rp-down' }, `${r.delta >= 0 ? '+' : ''}${r.delta} RP`),
        up ? h('small', { class: 'rank-change up' }, t('rank.promoted')) : down ? h('small', { class: 'rank-change down' }, t('rank.demoted')) : null,
      ),
      h('div', { class: 'rank-progress' }, h('i', { style: `width:${Math.round(after.progress * 100)}%` })),
    );
  }

  onShow(): void {
    super.onShow();
    // нагороду нарахував сервер — підтягуємо свіжий профіль (монети/кристали/квести)
    setTimeout(() => {
      void Server.profile().then(({ profile }) => Save.applyProfile(profile)).catch(() => {});
    }, 800);
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
