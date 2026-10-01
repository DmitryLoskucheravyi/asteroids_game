import { Assets } from '../../core/assets';
import { t, type TKey } from '../../core/i18n';
import { Save } from '../../core/storage';
import { PLANES, planeStats } from '../../game/planes';
import { button, h } from '../dom';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Вибір літака (аналог PlaneSelectForm) — тепер з характеристиками. */
export class HangarScreen extends Screen {
  protected build(): HTMLElement {
    const bar = (label: string, v: number) =>
      h('div', { class: 'stat-bar' }, h('span', {}, label), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(Math.max(0.1, Math.min(1, v)) * 100)}%` })));

    const cards = PLANES.map((p) => {
      const selected = Save.data.plane === p.id;
      const st = planeStats(p);
      return h(
        'div',
        { class: `plane-card${selected ? ' selected' : ''}` },
        h('div', { class: 'plane-pic' }, h('img', { src: Assets.get(p.sprite).src, alt: '' })),
        h('h3', {}, t(`plane.${p.id}` as TKey)),
        h('p', { class: 'plane-desc' }, t(`planeDesc.${p.id}` as TKey)),
        bar(t('planes.speed'), st.speed),
        bar(t('planes.agility'), st.agility),
        bar(t('planes.size'), st.size),
        button(selected ? t('planes.selected') : t('planes.select'), () => {
          Save.data.plane = p.id;
          Save.save();
          this.render();
          this.el.querySelectorAll<HTMLElement>('.plane-card .btn')[PLANES.indexOf(p)]?.focus();
        }, `btn${selected ? ' btn-on' : ''}`, selected ? { 'data-autofocus': true } : {}),
      );
    });

    return h('div', { class: 'page hangar' }, screenHeader(t('planes.title'), () => this.onBack()), h('p', { class: 'page-sub' }, t('planes.subtitle')), h('div', { class: 'plane-grid' }, ...cards));
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
