import { Assets } from '../../core/assets';
import { Sfx } from '../../core/audio';
import { t } from '../../core/i18n';
import { h } from '../dom';
import { Screen } from '../Screen';
import { MainMenuScreen } from './MainMenuScreen';

const MIN_DURATION = 1400;

/** Заставка із завантаженням ресурсів (аналог IntroForm). */
export class IntroScreen extends Screen {
  private fill!: HTMLElement;
  private hint!: HTMLElement;
  private ready = false;

  protected build(): HTMLElement {
    this.fill = h('div', { class: 'loadbar-fill' });
    this.hint = h('div', { class: 'intro-hint' }, t('intro.loading'));
    return h('div', { class: 'intro' }, h('div', { class: 'intro-splash' }), h('div', { class: 'loadbar' }, this.fill), this.hint);
  }

  onShow(): void {
    const started = performance.now();
    let progress = 0;
    const tick = (): void => {
      const timeP = Math.min(1, (performance.now() - started) / MIN_DURATION);
      this.fill.style.width = `${Math.min(progress, timeP) * 100}%`;
      if (progress >= 1 && timeP >= 1) this.onLoaded();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    void Assets.loadAll((p) => (progress = p));

    const go = (): void => {
      if (!this.ready) return;
      window.removeEventListener('keydown', go);
      window.removeEventListener('pointerdown', go);
      Sfx.unlock();
      Sfx.click();
      this.app.show(new MainMenuScreen(this.app));
    };
    window.addEventListener('keydown', go);
    window.addEventListener('pointerdown', go);
  }

  private onLoaded(): void {
    this.ready = true;
    this.hint.textContent = t('intro.press');
    this.hint.classList.add('pulse');
    this.el.classList.add('loaded');
  }
}
