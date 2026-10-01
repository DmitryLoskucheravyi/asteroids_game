import { Sfx } from '../../core/audio';
import { t, type Lang } from '../../core/i18n';
import { Save } from '../../core/storage';
import { toggleFullscreen } from '../../app/App';
import { button, h } from '../dom';
import { Modal, toast } from '../Modal';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Налаштування: мова, гучність, тряска, скидання прогресу. */
export class SettingsScreen extends Screen {
  protected build(): HTMLElement {
    const s = Save.data.settings;
    const seg = <T extends string | boolean>(options: [T, string][], value: T, set: (v: T) => void, idx: number) =>
      h(
        'div',
        { class: 'seg' },
        ...options.map(([v, label]) =>
          button(label, () => {
            set(v);
            Save.save();
            this.render();
            this.el.querySelectorAll<HTMLElement>('.set-row')[idx]?.querySelector<HTMLElement>('.on')?.focus();
          }, `seg-btn${v === value ? ' on' : ''}`),
        ),
      );

    const volume = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(s.volume * 100), 'data-nav': true, 'aria-label': t('settings.volume') }) as HTMLInputElement;
    const volLabel = h('span', { class: 'vol-val' }, `${Math.round(s.volume * 100)}%`);
    volume.addEventListener('input', () => {
      s.volume = Number(volume.value) / 100;
      volLabel.textContent = `${volume.value}%`;
      Sfx.applyVolume();
    });
    volume.addEventListener('change', () => {
      Save.save();
      Sfx.pickup();
    });

    const row = (label: string, control: HTMLElement) => h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, label), control);

    return h(
      'div',
      { class: 'page settings' },
      screenHeader(t('settings.title'), () => this.onBack()),
      h(
        'div',
        { class: 'card set-card' },
        row(
          t('settings.lang'),
          seg<Lang>(
            [
              ['uk', 'Українська'],
              ['en', 'English'],
            ],
            s.lang,
            (v) => {
              s.lang = v;
              this.app.refresh();
            },
            0,
          ),
        ),
        row(t('settings.volume'), h('div', { class: 'vol' }, volume, volLabel)),
        row(
          t('settings.shake'),
          seg<boolean>(
            [
              [true, t('settings.on')],
              [false, t('settings.off')],
            ],
            s.shake,
            (v) => (s.shake = v),
            2,
          ),
        ),
        row(t('settings.fullscreen'), button('⛶', toggleFullscreen, 'seg-btn')),
        row(
          '',
          button(t('settings.reset'), () => {
            const m = new Modal({
              title: t('settings.reset'),
              body: [h('p', {}, t('settings.resetConfirm'))],
              actions: [
                button(t('common.cancel'), () => m.close(), 'btn', { 'data-autofocus': true }),
                button(t('settings.reset'), () => {
                  Save.resetProgress();
                  m.close();
                  toast(t('settings.resetDone'));
                }, 'btn danger'),
              ],
              onEscape: () => m.close(),
            }).open();
          }, 'btn danger'),
        ),
      ),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
