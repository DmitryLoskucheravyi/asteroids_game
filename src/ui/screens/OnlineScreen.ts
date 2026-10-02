import { t, type TKey } from '../../core/i18n';
import { Save } from '../../core/storage';
import { getItemDef } from '../../game/items';
import { getPlane } from '../../game/planes';
import { getWeaponDef } from '../../game/weapons';
import { getSocket } from '../../net/socket';
import type { MatchInit } from '../../net/pvpProtocol';
import { Icons, button, h, icon } from '../dom';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';
import { PvpScreen } from './PvpScreen';

/** Пошук онлайн-матчу: коротка перевʼязка лоадауту + кнопка пошуку/скасування. */
export class OnlineScreen extends Screen {
  private searching = false;

  private loadoutCard(): HTMLElement {
    const plane = getPlane(Save.data.plane);
    const loadout = Save.loadoutFor(plane.id);
    const weapon = getWeaponDef(loadout.weapon ?? undefined) ?? getWeaponDef('machine_gun')!;
    const active = Save.itemById(loadout.active);
    const activeDef = active ? getItemDef(active.defId) : undefined;
    const row = (label: string, value: string) => h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, label), h('span', {}, value));
    return h(
      'section',
      { class: 'card' },
      h('h3', {}, icon(Icons.bolt, 'ico'), t('online.loadout')),
      row(t('planes.title'), t(`plane.${plane.id}` as TKey)),
      row(t('items.weapon'), t(weapon.nameKey)),
      row(t('items.slotActive'), activeDef ? t(activeDef.nameKey) : t('items.empty')),
    );
  }

  private startSearch(): void {
    this.searching = true;
    this.render();
    const socket = getSocket();
    socket.once('match:init', (data: MatchInit) => {
      this.app.show(new PvpScreen(this.app, socket, data));
    });
    socket.emit('queue:join');
  }

  private cancelSearch(): void {
    getSocket().emit('queue:leave');
    this.searching = false;
    this.render();
  }

  protected build(): HTMLElement {
    return h(
      'div',
      { class: 'page online' },
      screenHeader(t('online.title'), () => this.onBack()),
      h('p', { class: 'page-sub' }, t('online.subtitle')),
      this.loadoutCard(),
      h(
        'div',
        { class: 'online-action' },
        this.searching
          ? h('div', { class: 'searching' }, h('span', { class: 'spinner' }), t('online.searching'), button(t('online.cancel'), () => this.cancelSearch(), 'btn danger'))
          : button(t('online.search'), () => this.startSearch(), 'btn primary', { 'data-autofocus': true }),
      ),
    );
  }

  onBack(): void {
    if (this.searching) this.cancelSearch();
    this.app.show(new MainMenuScreen(this.app));
  }
}
