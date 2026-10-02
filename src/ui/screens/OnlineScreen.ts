import type { App } from '../../app/App';
import { t, type TKey } from '../../core/i18n';
import { Save } from '../../core/storage';
import { getItemDef } from '../../game/items';
import { itemSvg, weaponSvg } from '../../game/ItemArt';
import { planeIconUrl } from '../../game/PlaneArt';
import { getPlane } from '../../game/planes';
import { DIVISIONS, RANK_IDS, RP_PER_DIVISION, rankEmblem, rankInfo } from '../../game/ranks';
import { getWeaponDef } from '../../game/weapons';
import { getSocket } from '../../net/socket';
import type { MatchInit } from '../../net/pvpProtocol';
import { Icons, button, h, icon } from '../dom';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';
import { PvpScreen } from './PvpScreen';

type Mode = 'casual' | 'ranked';

/** Онлайн: вибір режиму (звичайний / рейтинговий), ранг і сітка рангів, лоадаут, пошук матчу. */
export class OnlineScreen extends Screen {
  private searching = false;

  constructor(
    app: App,
    private mode: Mode = 'casual',
  ) {
    super(app);
  }

  private modeTab(mode: Mode, ic: string, labelKey: TKey, subKey: TKey): HTMLElement {
    return button(
      h('span', { class: 'mode-inner' }, icon(ic, 'ico'), h('span', { class: 'mode-text' }, h('b', {}, t(labelKey)), h('small', {}, t(subKey)))),
      () => {
        if (this.searching) return;
        this.mode = mode;
        this.render();
        this.el.querySelector<HTMLElement>(`.mode-tab[data-mode="${mode}"]`)?.focus();
      },
      `mode-tab${this.mode === mode ? ' on' : ''}`,
      { 'data-mode': mode, 'aria-pressed': this.mode === mode ? 'true' : 'false' },
    );
  }

  private rankCard(): HTMLElement {
    const rk = Save.data.ranked;
    const info = rankInfo(rk.points);
    const best = rankInfo(rk.best);
    return h(
      'section',
      { class: `card rank-card rank-${info.id}` },
      h('div', { class: 'rank-emblem big', html: rankEmblem(info.id, info.roman) }),
      h(
        'div',
        { class: 'rank-main' },
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
      ),
    );
  }

  /** Сітка рангів: 7 стовпців по 5 підрівнів, поточний підсвічено, пройдені — заповнені. */
  private ladder(): HTMLElement {
    const cur = rankInfo(Save.data.ranked.points);
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
            h('div', { class: 'rank-emblem', html: rankEmblem(id) }),
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

  private startSearch(): void {
    this.searching = true;
    this.render();
    const socket = getSocket();
    socket.once('match:init', (data: MatchInit) => {
      this.app.show(new PvpScreen(this.app, socket, data));
    });
    socket.emit('queue:join', { mode: this.mode });
  }

  private cancelSearch(): void {
    getSocket().emit('queue:leave');
    this.searching = false;
    this.render();
  }

  protected build(): HTMLElement {
    const ranked = this.mode === 'ranked';
    return h(
      'div',
      { class: 'page online' },
      screenHeader(t('online.title'), () => this.onBack()),
      h('div', { class: 'mode-tabs' }, this.modeTab('casual', Icons.homing, 'online.casual', 'online.casualSub'), this.modeTab('ranked', Icons.trophy, 'online.ranked', 'online.rankedSub')),
      h('div', { class: `online-layout${ranked ? ' ranked' : ''}` }, h('div', { class: 'online-col' }, ranked ? this.rankCard() : null, this.loadoutCard()), ranked ? this.ladder() : h('section', { class: 'card' }, h('p', { class: 'muted' }, t('online.subtitle')))),
      h(
        'div',
        { class: 'online-action' },
        this.searching
          ? h('div', { class: 'searching' }, h('span', { class: 'spinner' }), t(ranked ? 'online.searchingRanked' : 'online.searching'), button(t('online.cancel'), () => this.cancelSearch(), 'btn danger'))
          : button(t(ranked ? 'online.searchRanked' : 'online.search'), () => this.startSearch(), `launch-btn main online-go${ranked ? ' ranked' : ''}`, { 'data-autofocus': true }),
      ),
    );
  }

  onBack(): void {
    if (this.searching) this.cancelSearch();
    this.app.show(new MainMenuScreen(this.app));
  }
}
