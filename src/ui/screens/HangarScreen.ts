import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { planeIconUrl } from '../../game/PlaneArt';
import { PLANES, planeStats, type PlaneSpec } from '../../game/planes';
import { Icons, button, coinBadge, h, icon } from '../dom';
import { toast } from '../Modal';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Ангар-магазин (аналог PlaneSelectForm): літаки купуються за коінс, у кожного своя фіча. */
export class HangarScreen extends Screen {
  private refocus(i: number): void {
    this.el.querySelectorAll<HTMLElement>('.plane-card')[i]?.querySelector<HTMLElement>('.btn')?.focus();
  }

  private actionFor(p: PlaneSpec, i: number): HTMLElement {
    const coins = Save.data.coins;
    if (Save.owns(p.id)) {
      const selected = Save.data.plane === p.id;
      return button(selected ? t('planes.selected') : t('planes.select'), async () => {
        const { profile } = await Server.selectPlane(p.id);
        Save.applyProfile(profile);
        this.render();
        this.refocus(i);
      }, `btn${selected ? ' btn-on' : ''}`, selected ? { 'data-autofocus': true } : {});
    }
    const affordable = coins >= p.price;
    return h(
      'div',
      { class: 'buy-row' },
      button(
        h('span', { class: 'buy-label' }, t('planes.buy'), coinBadge(p.price, 'coin-badge small')),
        async () => {
          try {
            const { profile } = await Server.buyPlane(p.id);
            Save.applyProfile(profile);
            Sfx.powerup();
            toast(t('planes.bought'));
            this.render();
            this.refocus(i);
          } catch {
            Sfx.warning();
          }
        },
        `btn buy${affordable ? ' affordable' : ' locked'}`,
        affordable ? {} : { 'aria-disabled': 'true' },
      ),
      affordable ? null : h('span', { class: 'need' }, t('planes.notEnough', { n: p.price - coins })),
    );
  }

  protected build(): HTMLElement {
    const bar = (label: string, v: number) =>
      h('div', { class: 'stat-bar' }, h('span', {}, label), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(Math.max(0.1, Math.min(1, v)) * 100)}%` })));

    const cards = PLANES.map((p, i) => {
      const owned = Save.owns(p.id);
      const selected = owned && Save.data.plane === p.id;
      const st = planeStats(p);
      return h(
        'div',
        { class: `plane-card${selected ? ' selected' : ''}${owned ? '' : ' locked'}` },
        h('div', { class: 'plane-pic' }, h('img', { src: planeIconUrl(p.id), alt: '' }), owned ? null : h('span', { class: 'price-tag' }, icon(Icons.lock))),
        h('h3', {}, t(`plane.${p.id}` as TKey)),
        h('p', { class: 'plane-desc' }, t(`planeDesc.${p.id}` as TKey)),
        h('div', { class: 'feature' }, h('span', { class: 'feature-tag' }, t('planes.feature')), t(`feat.${p.id}` as TKey)),
        bar(t('planes.speed'), st.speed),
        bar(t('planes.agility'), st.agility),
        bar(t('planes.size'), st.size),
        this.actionFor(p, i),
      );
    });

    return h(
      'div',
      { class: 'page hangar' },
      screenHeader(t('planes.title'), () => this.onBack(), coinBadge(Save.data.coins, 'coin-badge big')),
      h('p', { class: 'page-sub' }, t('planes.subtitle')),
      h('div', { class: 'plane-grid' }, ...cards),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
