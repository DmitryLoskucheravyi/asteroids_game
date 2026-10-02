import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { Server, type FriendCard, type FriendsView } from '../../core/server';
import { Save } from '../../core/storage';
import { planeIconUrl } from '../../game/PlaneArt';
import type { PlaneId } from '../../game/planes';
import { rankEmblem, rankInfo } from '../../game/ranks';
import { Icons, button, h, icon } from '../dom';
import { toast } from '../Modal';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

type Tab = 'friends' | 'incoming' | 'outgoing';
type Relation = 'self' | 'friend' | 'outgoing' | 'incoming' | 'none';

/** Друзі: мій ID, пошук гравця за ID, список друзів зі статусом, вхідні й надіслані заявки. */
export class FriendsScreen extends Screen {
  private data: FriendsView | null = null;
  private tab: Tab = 'friends';
  private found: { player: FriendCard; relation: Relation } | null = null;
  private searchError: TKey | null = null;
  private query = '';

  onShow(): void {
    super.onShow();
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.data = await Server.friends();
      if (this.data.incoming.length && !this.data.friends.length) this.tab = 'incoming';
    } catch {
      this.data = null;
    }
    this.render();
  }

  private async act(action: 'request' | 'accept' | 'decline' | 'cancel' | 'remove', publicId: string, okKey: TKey): Promise<void> {
    try {
      this.data = await Server.friendAction(action, publicId);
      Sfx.pickup();
      toast(t(okKey));
      if (this.found && this.found.player.publicId === publicId) {
        const rel = this.data.friends.some((f) => f.publicId === publicId) ? 'friend' : this.data.outgoing.some((f) => f.publicId === publicId) ? 'outgoing' : 'none';
        this.found = { ...this.found, relation: rel };
      }
      this.render();
    } catch {
      Sfx.warning();
      toast(t('friends.error'));
    }
  }

  private async search(): Promise<void> {
    const q = this.query.trim();
    this.found = null;
    this.searchError = null;
    if (!q) {
      this.render();
      return;
    }
    try {
      this.found = await Server.findPlayer(q);
    } catch {
      this.searchError = 'friends.notFound';
    }
    this.render();
    this.el.querySelector<HTMLInputElement>('.friend-search input')?.focus();
  }

  private statusChip(c: FriendCard): HTMLElement {
    const label: TKey = c.status === 'match' ? 'friends.inMatch' : c.status === 'online' ? 'friends.online' : 'friends.offline';
    return h('span', { class: `friend-status ${c.status}` }, h('i'), t(label));
  }

  private card(c: FriendCard, actions: HTMLElement[]): HTMLElement {
    const rk = rankInfo(c.rankPoints);
    return h(
      'div',
      { class: 'friend-row' },
      h('img', { class: 'friend-plane', src: planeIconUrl((c.plane as PlaneId) ?? 'falcon'), alt: '' }),
      h('div', { class: 'friend-info' }, h('b', {}, c.nickname), h('small', {}, `${c.publicId} · ${t('lb.level')} ${c.level}`), this.statusChip(c)),
      h('span', { class: 'friend-rank', html: rankEmblem(rk.id, rk.roman), title: `${t(rk.nameKey)} ${rk.roman}` }),
      h('span', { class: 'friend-stats' }, `${c.stats.wins} ${t('lb.wins').toLowerCase()} · ${c.stats.kills} ${t('lb.kills').toLowerCase()}`),
      h('div', { class: 'friend-actions' }, ...actions),
    );
  }

  private searchBlock(): HTMLElement {
    const input = h('input', { type: 'text', placeholder: '#ABCD234567', maxlength: 15, value: this.query, 'aria-label': t('friends.searchLabel') }) as HTMLInputElement;
    input.addEventListener('input', () => (this.query = input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.search();
    });
    let result: HTMLElement | null = null;
    if (this.searchError) result = h('p', { class: 'muted small' }, t(this.searchError));
    else if (this.found) {
      const f = this.found;
      const actions: HTMLElement[] = [];
      if (f.relation === 'none') actions.push(button(h('span', { class: 'buy-label' }, icon(Icons.star, 'ico'), t('friends.add')), () => void this.act('request', f.player.publicId, 'friends.requestSent'), 'btn primary small'));
      else if (f.relation === 'incoming') actions.push(button(t('friends.accept'), () => void this.act('accept', f.player.publicId, 'friends.accepted'), 'btn primary small'));
      else actions.push(h('span', { class: 'muted small' }, t(`friends.rel.${f.relation}` as TKey)));
      result = this.card(f.player, actions);
    }
    return h(
      'section',
      { class: 'card friend-search' },
      h('h3', {}, icon(Icons.homing, 'ico'), t('friends.find')),
      h('div', { class: 'friend-search-row' }, input, button(t('friends.searchBtn'), () => void this.search(), 'btn primary')),
      result,
    );
  }

  private myIdBlock(): HTMLElement {
    const id = this.data?.me.publicId ?? Save.data.publicId ?? '—';
    return h(
      'section',
      { class: 'card my-id' },
      h('small', {}, t('friends.myId')),
      h('b', { class: 'my-id-value' }, id),
      button(t('friends.copy'), () => {
        void navigator.clipboard?.writeText(id).then(() => toast(t('friends.copied')));
      }, 'btn small'),
      h('p', { class: 'muted small' }, t('friends.myIdHint')),
    );
  }

  protected build(): HTMLElement {
    const d = this.data;
    const tabBtn = (tab: Tab, label: TKey, n: number) =>
      button(h('span', {}, t(label), n ? h('span', { class: 'rail-badge inline' }, String(n)) : null), () => {
        this.tab = tab;
        this.render();
      }, `lb-tab friend-tab${this.tab === tab ? ' on' : ''}`);

    let list: HTMLElement[] = [];
    if (d) {
      if (this.tab === 'friends') list = d.friends.map((c) => this.card(c, [button(icon(Icons.close), () => void this.act('remove', c.publicId, 'friends.removed'), 'icon-btn', { 'aria-label': t('friends.remove'), title: t('friends.remove') })]));
      if (this.tab === 'incoming')
        list = d.incoming.map((c) =>
          this.card(c, [button(t('friends.accept'), () => void this.act('accept', c.publicId, 'friends.accepted'), 'btn primary small'), button(t('friends.decline'), () => void this.act('decline', c.publicId, 'friends.declined'), 'btn small')]),
        );
      if (this.tab === 'outgoing') list = d.outgoing.map((c) => this.card(c, [button(t('friends.cancel'), () => void this.act('cancel', c.publicId, 'friends.cancelled'), 'btn small')]));
    }
    const emptyKey: TKey = this.tab === 'friends' ? 'friends.emptyFriends' : this.tab === 'incoming' ? 'friends.emptyIncoming' : 'friends.emptyOutgoing';

    return h(
      'div',
      { class: 'page friends' },
      screenHeader(t('friends.title'), () => this.onBack()),
      h(
        'div',
        { class: 'friends-layout' },
        h('div', { class: 'friends-side' }, this.myIdBlock(), this.searchBlock()),
        h(
          'section',
          { class: 'card friends-main' },
          h('div', { class: 'friend-tabs' }, tabBtn('friends', 'friends.tabFriends', 0), tabBtn('incoming', 'friends.tabIncoming', d?.incoming.length ?? 0), tabBtn('outgoing', 'friends.tabOutgoing', 0)),
          !d ? h('p', { class: 'muted' }, t('common.loading')) : list.length ? h('div', { class: 'friend-list' }, ...list) : h('p', { class: 'muted' }, t(emptyKey)),
        ),
      ),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
