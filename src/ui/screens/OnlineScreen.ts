import type { App } from '../../app/App';
import { t, type TKey } from '../../core/i18n';
import { Save } from '../../core/storage';
import { getItemDef } from '../../game/items';
import { itemSvg, weaponSvg } from '../../game/ItemArt';
import { planeIconUrl } from '../../game/PlaneArt';
import { getPlane } from '../../game/planes';
import { DIVISIONS, RANK_IDS, RANK_MODES, RP_PER_DIVISION, TEAM_SIZE, rankEmblem, rankInfo, type RankMode } from '../../game/ranks';
import { getWeaponDef } from '../../game/weapons';
import { getSocket } from '../../net/socket';
import { Sfx } from '../../core/audio';
import { Server, type PartyMember, type PartyView } from '../../core/server';
import { toast } from '../Modal';
import type { PlaneId } from '../../game/planes';
import type { MatchInit } from '../../net/pvpProtocol';
import { Icons, button, h, icon } from '../dom';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';
import { PvpScreen } from './PvpScreen';

type Mode = 'casual' | RankMode;

/** Онлайн: вибір режиму (звичайний / рейтинговий), ранг і сітка рангів, лоадаут, пошук матчу. */
export class OnlineScreen extends Screen {
  private searching = false;
  private partyView: PartyView | null = null;
  private partyPoll = 0;
  private partyVersion = -1;

  constructor(
    app: App,
    private mode: Mode = 'casual',
  ) {
    super(app);
  }

  private modeTab(mode: Mode, ic: string, labelKey: TKey, subKey: TKey): HTMLElement {
    return button(
      h('span', { class: 'mode-inner' }, ic.includes('viewBox="0 0 64 64"') ? h('span', { class: 'mode-emblem', html: ic }) : icon(ic, 'ico'), h('span', { class: 'mode-text' }, h('b', {}, t(labelKey)), h('small', {}, t(subKey)))),
      () => {
        if (this.searching) return;
        // у групі режим перемикає лідер (і він змінюється для всіх); соло групою недоступне
        const party = this.partyView?.party;
        if (party && party.members.length > 1) {
          if (!party.isLeader || mode === 'casual' || mode === 'solo') return;
          void this.partyAct('mode', { mode });
        }
        this.mode = mode;
        this.render();
        this.el.querySelector<HTMLElement>(`.mode-tab[data-mode="${mode}"]`)?.focus();
      },
      `mode-tab${this.mode === mode ? ' on' : ''}`,
      { 'data-mode': mode, 'aria-pressed': this.mode === mode ? 'true' : 'false' },
    );
  }

  private rankCard(): HTMLElement {
    const mode = this.mode as RankMode;
    const rk = Save.rank(mode);
    const seasonEndsAt = Save.data.ranked.seasonEndsAt;
    const info = rankInfo(rk.points);
    const best = rankInfo(rk.best);
    return h(
      'section',
      { class: `card rank-card rank-${info.id}` },
      h('div', { class: 'rank-emblem big', html: rankEmblem(info.id, info.roman, mode) }),
      h(
        'div',
        { class: 'rank-main' },
        h('small', { class: 'rank-mode' }, t(`mode.${mode}` as TKey)),
        h('h3', {}, `${t(info.nameKey)} ${info.roman}`),
        h('div', { class: 'rank-progress' }, h('i', { style: `width:${Math.round(info.progress * 100)}%` })),
        h('span', { class: 'muted small' }, info.top ? t('rank.top', { n: rk.points }) : t('rank.toNext', { n: RP_PER_DIVISION - info.inDivision, rp: rk.points })),
        h(
          'div',
          { class: 'rank-stats' },
          h('span', {}, t('rank.matches'), h('b', {}, String(rk.matches))),
          h('span', {}, t('rank.wins'), h('b', {}, String(rk.wins))),
          h('span', {}, t('rank.best'), h('b', {}, `${t(best.nameKey)} ${best.roman}`)),
        ),
        seasonEndsAt ? h('span', { class: 'rank-season' }, t('rank.seasonEnds', { d: new Date(seasonEndsAt).toLocaleDateString('uk-UA') })) : null,
        rk.lastSeason
          ? (() => {
              const last = rankInfo(rk.lastSeason.points);
              return h('span', { class: 'rank-season' }, t('rank.lastSeason', { rank: `${t(last.nameKey)} ${last.roman}`, crate: t(`crate.${rk.lastSeason.crate}` as TKey), c: rk.lastSeason.crystals }));
            })()
          : null,
      ),
    );
  }

  /** Сітка рангів: 7 стовпців по 5 підрівнів, поточний підсвічено, пройдені — заповнені. */
  private ladder(): HTMLElement {
    const mode = this.mode as RankMode;
    const cur = rankInfo(Save.rank(mode).points);
    return h(
      'section',
      { class: 'card rank-ladder' },
      h('h3', {}, icon(Icons.trophy, 'ico'), t('rank.ladder')),
      h(
        'div',
        { class: 'ladder-grid' },
        ...RANK_IDS.map((id, r) =>
          h(
            'div',
            { class: `ladder-col rank-${id}${r === cur.rankIndex ? ' current' : ''}${r < cur.rankIndex ? ' passed' : ''}` },
            h('div', { class: 'rank-emblem', html: rankEmblem(id, null, mode) }),
            h('span', { class: 'ladder-name' }, t(`rank.${id}` as TKey)),
            h(
              'div',
              { class: 'ladder-steps' },
              ...Array.from({ length: DIVISIONS }, (_, s) => {
                const idx = r * DIVISIONS + s;
                return h('span', { class: `ladder-step${idx < cur.index ? ' done' : ''}${idx === cur.index ? ' here' : ''}`, title: `${idx * RP_PER_DIVISION} RP` }, ['V', 'IV', 'III', 'II', 'I'][s]);
              }),
            ),
          ),
        ),
      ),
      h('p', { class: 'muted small' }, t('rank.rules')),
    );
  }

  private loadoutCard(): HTMLElement {
    const plane = getPlane(Save.owns(Save.data.plane) ? Save.data.plane : 'falcon');
    const progress = Save.progressFor(plane.id);
    const loadout = Save.loadoutFor(plane.id);
    const weapon = getWeaponDef(loadout.weapon ?? undefined) ?? getWeaponDef('machine_gun')!;
    const activeDef = getItemDef(Save.itemById(loadout.active)?.defId ?? '');
    const passiveDef = getItemDef(Save.itemById(loadout.passive)?.defId ?? '');
    const gear = (svg: string | null, title: string, rarity?: string) => h('span', { class: `stage-gear${svg ? '' : ' empty'} rarity-frame-${rarity ?? 'weapon'}`, title, html: svg ?? '' });
    return h(
      'section',
      { class: 'card online-loadout' },
      h('img', { class: 'online-plane', src: planeIconUrl(plane.id, progress.tier, progress.level), alt: '' }),
      h(
        'div',
        {},
        h('h3', {}, t(`plane.${plane.id}` as TKey)),
        h('div', { class: 'stage-gears' }, gear(weaponSvg(weapon.id), t(weapon.nameKey)), gear(activeDef ? itemSvg(activeDef.id) : null, activeDef ? t(activeDef.nameKey) : t('items.slotActive'), activeDef?.rarity), gear(passiveDef ? itemSvg(passiveDef.id) : null, passiveDef ? t(passiveDef.nameKey) : t('items.slotPassive'), passiveDef?.rarity)),
      ),
    );
  }

  private startSearch(partyId?: string): void {
    this.searching = true;
    this.render();
    const socket = getSocket();
    socket.off('match:init');
    socket.once('match:init', (data: MatchInit) => {
      this.app.show(new PvpScreen(this.app, socket, data));
    });
    socket.emit('queue:join', { mode: this.mode, partyId });
  }

  private cancelSearch(): void {
    getSocket().emit('queue:leave');
    this.searching = false;
    this.render();
  }

  /** Кнопка пошуку: у групі — лідер запускає пошук для всіх. */
  private onSearch(): void {
    const party = this.partyView?.party;
    if (party && party.members.length > 1 && this.mode !== 'casual') {
      if (!party.isLeader) return;
      void this.partyAct('search', { searching: true });
      return;
    }
    this.startSearch();
  }

  // ---------- групи ----------

  onShow(): void {
    super.onShow();
    void this.refreshParty();
    this.partyPoll = window.setInterval(() => void this.refreshParty(), 2000);
  }

  onHide(): void {
    window.clearInterval(this.partyPoll);
  }

  private async refreshParty(): Promise<void> {
    try {
      const v = await Server.party();
      this.applyParty(v);
    } catch {
      // сервер недоступний — спробуємо наступного разу
    }
  }

  private applyParty(v: PartyView): void {
    const party = v.party;
    const changed = JSON.stringify(v) !== JSON.stringify(this.partyView);
    this.partyView = v;
    // група визначає режим для всіх учасників
    if (party && party.members.length > 1 && this.mode !== party.mode) this.mode = party.mode;
    // лідер запустив пошук — кожен учасник сам стає в чергу; хтось скасував — виходимо з пошуку
    if (party && party.members.length > 1) {
      if (party.state === 'searching' && !this.searching) {
        this.startSearch(party.id);
        return;
      }
      if (party.state === 'idle' && this.searching && this.partyVersion !== -1) {
        this.searching = false;
        getSocket().emit('queue:leave');
      }
    }
    this.partyVersion = party?.version ?? 0;
    if (changed) this.renderParty();
  }

  /** Перебудовуємо лише блок групи, щоб не збивати фокус і стан решти екрана. */
  private renderParty(): void {
    const old = this.el?.querySelector('.party-block');
    if (!old) {
      this.render();
      return;
    }
    old.replaceWith(this.partyBlock());
  }

  private async partyAct(action: Parameters<typeof Server.partyAction>[0], body: Record<string, unknown> = {}): Promise<void> {
    try {
      const v = await Server.partyAction(action, body);
      Sfx.pickup();
      this.applyParty(v);
      this.render();
    } catch {
      Sfx.warning();
      toast(t('party.error'));
    }
  }

  private memberRow(m: PartyMember, actions: HTMLElement[]): HTMLElement {
    const rk = rankInfo(m.rankPoints);
    return h(
      'div',
      { class: `party-member${m.self ? ' self' : ''}` },
      h('img', { class: 'friend-plane', src: planeIconUrl((m.plane as PlaneId) ?? 'falcon'), alt: '' }),
      h('div', { class: 'friend-info' }, h('b', {}, m.leader ? '★ ' : '', m.nickname), h('small', {}, m.publicId), h('span', { class: `friend-status ${m.status}` }, h('i'), t(m.status === 'match' ? 'friends.inMatch' : m.status === 'online' ? 'friends.online' : 'friends.offline'))),
      this.mode !== 'casual' ? h('span', { class: 'friend-rank', html: rankEmblem(rk.id, rk.roman, this.mode as RankMode) }) : h('span'),
      h('div', { class: 'friend-actions' }, ...actions),
    );
  }

  private partyBlock(): HTMLElement {
    const v = this.partyView;
    const party = v?.party ?? null;
    const teamMode = this.mode === 'duo' || this.mode === 'trio' || this.mode === 'squad';
    const size = teamMode ? TEAM_SIZE[this.mode as RankMode] : 1;
    const inParty = !!party && party.members.length > 1;
    const leader = !party || party.isLeader;

    const invites = (v?.invites ?? []).map((inv) =>
      h(
        'div',
        { class: 'party-invite' },
        h('span', {}, t('party.invitedBy', { name: inv.from?.nickname ?? '?', mode: t(`mode.${inv.mode}` as TKey) })),
        button(t('friends.accept'), () => void this.partyAct('accept', { partyId: inv.partyId }), 'btn primary small'),
        button(t('friends.decline'), () => void this.partyAct('decline', { partyId: inv.partyId }), 'btn small'),
      ),
    );

    const slots: HTMLElement[] = [];
    if (party) {
      for (const m of party.members) slots.push(this.memberRow(m, party.isLeader && !m.self ? [button(icon(Icons.close), () => void this.partyAct('kick', { publicId: m.publicId }), 'icon-btn', { title: t('party.kick'), 'aria-label': t('party.kick') })] : []));
      for (const m of party.invited) slots.push(h('div', { class: 'party-member pending' }, h('span', { class: 'party-slot-ico' }, '…'), h('div', { class: 'friend-info' }, h('b', {}, m.nickname), h('small', {}, t('party.waiting')))));
    } else slots.push(this.memberRow({ publicId: Save.data.publicId ?? '', nickname: Save.data.nickname, level: Save.data.level, plane: Save.data.plane, rankPoints: this.mode !== 'casual' ? Save.rank(this.mode as RankMode).points : 0, status: 'online', leader: true, self: true }, []));
    const filled = slots.length;
    for (let i = filled; i < size; i++) slots.push(h('div', { class: 'party-member empty' }, h('span', { class: 'party-slot-ico' }, '+'), h('small', { class: 'muted' }, t('party.emptySlot'))));

    const canInvite = teamMode && leader && filled < size && party?.state !== 'searching';
    const friends = (v?.friends ?? []).filter((f) => !f.inParty).sort((a, b) => (a.status === 'offline' ? 1 : 0) - (b.status === 'offline' ? 1 : 0));

    return h(
      'section',
      { class: 'card party-block' },
      h('h3', {}, icon(Icons.heart, 'ico'), t('party.title'), party ? h('small', {}, `${party.members.length} / ${party.maxSize}`) : null),
      invites.length ? h('div', { class: 'party-invites' }, ...invites) : null,
      !teamMode ? h('p', { class: 'muted small' }, t('party.teamOnly')) : null,
      h('div', { class: `party-slots s${Math.max(size, 1)}` }, ...slots),
      inParty && !party!.isLeader ? h('p', { class: 'muted small' }, t('party.leaderStarts')) : null,
      party ? h('div', { class: 'party-actions' }, button(t('party.leave'), () => void this.partyAct('leave'), 'btn small danger')) : null,
      canInvite
        ? h(
            'div',
            { class: 'party-friends' },
            h('small', { class: 'muted' }, t('party.inviteFriends')),
            friends.length
              ? h('div', { class: 'party-friend-list' }, ...friends.map((f) => this.memberRow(f, [button(t('party.invite'), () => void this.partyAct('invite', { publicId: f.publicId, mode: this.mode }), 'btn small primary')])))
              : h('p', { class: 'muted small' }, t('party.noFriends')),
          )
        : null,
    );
  }

  protected build(): HTMLElement {
    const ranked = this.mode !== 'casual';
    return h(
      'div',
      { class: 'page online' },
      screenHeader(t('online.title'), () => this.onBack()),
      h(
        'div',
        { class: 'mode-tabs five' },
        this.modeTab('casual', Icons.homing, 'online.casual', 'online.casualSub'),
        ...RANK_MODES.map((m) => {
          const r = rankInfo(Save.rank(m).points);
          return this.modeTab(m, rankEmblem(r.id, r.roman, m), `mode.${m}` as TKey, `mode.${m}Sub` as TKey);
        }),
      ),
      h('div', { class: `online-layout${ranked ? ' ranked' : ''}` }, h('div', { class: 'online-col' }, ranked ? this.rankCard() : null, this.loadoutCard()), ranked ? this.ladder() : h('section', { class: 'card' }, h('p', { class: 'muted' }, t('online.subtitle')))),
      h(
        'div',
        { class: 'online-action' },
        this.searching
          ? h('div', { class: 'searching' }, h('span', { class: 'spinner' }), ranked ? t('online.searchingMode', { m: t(`mode.${this.mode}` as TKey) }) : t('online.searching'), button(t('online.cancel'), () => this.cancelSearch(), 'btn danger'))
          : button(ranked ? t('online.searchMode', { m: t(`mode.${this.mode}` as TKey) }) : t('online.search'), () => this.onSearch(), `launch-btn main online-go${ranked ? ' ranked' : ''}${this.partyView?.party && this.partyView.party.members.length > 1 && !this.partyView.party.isLeader ? ' locked' : ''}`, { 'data-autofocus': true }),
      ),
      ranked ? this.partyBlock() : null,
    );
  }

  onBack(): void {
    if (this.searching) this.cancelSearch();
    this.app.show(new MainMenuScreen(this.app));
  }
}
