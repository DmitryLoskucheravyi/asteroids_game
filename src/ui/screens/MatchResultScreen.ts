import type { Socket } from 'socket.io-client';
import type { App } from '../../app/App';
import { t } from '../../core/i18n';
import type { MatchResultEntry } from '../../net/pvpProtocol';
import { Icons, button, h, icon } from '../dom';
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

    return h(
      'div',
      { class: 'page matchresult' },
      h('h2', { class: 'mr-title' }, t('matchresult.title')),
      h('div', { class: 'match-list' }, ...rows),
      h(
        'div',
        { class: 'mr-actions' },
        button(t('matchresult.again'), () => this.app.show(new OnlineScreen(this.app)), 'btn primary', { 'data-autofocus': true }),
        button(t('matchresult.toMenu'), () => this.app.show(new MainMenuScreen(this.app)), 'btn'),
      ),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
