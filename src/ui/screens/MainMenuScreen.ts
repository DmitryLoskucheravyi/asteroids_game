import { Assets } from '../../core/assets';
import { Sfx } from '../../core/audio';
import { t } from '../../core/i18n';
import { formatTime } from '../../core/math';
import { Save } from '../../core/storage';
import { dailyState } from '../../game/economy';
import { MAX_LEVEL } from '../../game/levels';
import { getPlane } from '../../game/planes';
import { toggleFullscreen } from '../../app/App';
import { openDailyModal } from '../DailyModal';
import { Icons, button, coinBadge, h, icon } from '../dom';
import { Screen } from '../Screen';
import { GameScreen } from './GameScreen';
import { HangarScreen } from './HangarScreen';
import { HowToScreen } from './HowToScreen';
import { LevelSelectScreen } from './LevelSelectScreen';
import { RecordsScreen } from './RecordsScreen';
import { SettingsScreen } from './SettingsScreen';

/** Щоденну нагороду пропонуємо автоматично лише раз за сесію. */
let dailyOffered = false;

/** Головне меню. */
export class MainMenuScreen extends Screen {
  onShow(): void {
    super.onShow();
    if (!dailyOffered && dailyState().available) {
      dailyOffered = true;
      setTimeout(() => this.openDaily(), 450);
    }
  }

  private openDaily(): void {
    openDailyModal(() => this.render());
  }

  protected build(): HTMLElement {
    const go = (s: Screen) => () => this.app.show(s);
    const plane = getPlane(Save.owns(Save.data.plane) ? Save.data.plane : 'falcon');
    const daily = dailyState();
    const dailyBtn = button(icon(Icons.gift), () => this.openDaily(), `icon-btn gift-btn${daily.available ? ' ready' : ''}`, {
      'aria-label': t('menu.daily'),
      title: t('menu.daily'),
    });
    const planeImg = h('img', { class: 'menu-plane', src: Assets.get(plane.sprite).src, alt: '' });

    const items: [string, () => void, boolean?][] = [
      [t('menu.play'), go(new LevelSelectScreen(this.app)), true],
      [t('menu.survival'), () => this.app.show(new GameScreen(this.app, 'survival', 0))],
      [t('menu.planes'), go(new HangarScreen(this.app))],
      [t('menu.records'), go(new RecordsScreen(this.app))],
      [t('menu.howto'), go(new HowToScreen(this.app))],
      [t('menu.settings'), go(new SettingsScreen(this.app))],
    ];

    const soundBtn = button(icon(Save.data.settings.volume > 0 ? Icons.sound : Icons.mute), () => {
      const s = Save.data.settings;
      s.volume = s.volume > 0 ? 0 : 0.7;
      Save.save();
      Sfx.applyVolume();
      this.render();
      this.el.querySelector<HTMLElement>('.icon-btn')?.focus();
    }, 'icon-btn', { 'aria-label': 'sound' });

    return h(
      'div',
      { class: 'menu' },
      h('div', { class: 'wallet' }, coinBadge(Save.data.coins, 'coin-badge big'), dailyBtn),
      h('div', { class: 'corner-actions' }, soundBtn, button(icon(Icons.fullscreen), toggleFullscreen, 'icon-btn', { 'aria-label': 'fullscreen' })),
      h('div', { class: 'menu-head' }, h('h1', { class: 'logo' }, 'ASTEROIDS'), h('p', { class: 'menu-sub' }, t('menu.subtitle'))),
      h(
        'nav',
        { class: 'menu-list' },
        ...items.map(([label, fn, primary]) => button(h('span', {}, label), fn, `menu-btn${primary ? ' primary' : ''}`, primary ? { 'data-autofocus': true } : {})),
      ),
      h(
        'footer',
        { class: 'menu-foot' },
        h('div', { class: 'stat' }, icon(Icons.star, 'ico gold'), h('span', {}, `${Save.totalStars} / ${MAX_LEVEL * 3}`), h('small', {}, t('menu.stars'))),
        h('div', { class: 'stat' }, icon(Icons.clock, 'ico cyan'), h('span', {}, formatTime(Save.bestSurvival)), h('small', {}, t('menu.best'))),
        h('div', { class: 'stat plane-stat' }, planeImg, h('span', {}, t(`plane.${plane.id}`))),
      ),
    );
  }
}
