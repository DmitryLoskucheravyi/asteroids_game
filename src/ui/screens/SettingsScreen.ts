import { Sfx } from '../../core/audio';
import { AuthStore } from '../../core/auth';
import { t, type Lang, type TKey } from '../../core/i18n';
import { BINDABLE_ACTIONS, DEFAULT_KEYBINDS, MOVE_ACTIONS, displayKey, primaryKeyFor, type BindAction } from '../../core/input';
import { Server } from '../../core/server';
import { DEFAULT_CROSSHAIR, Save, type ControlScheme, type CrosshairStyle } from '../../core/storage';
import { toggleFullscreen } from '../../app/App';
import { CROSSHAIR_COLORS, drawCrosshair } from '../../game/crosshair';
import { Icons, button, h, icon } from '../dom';
import { Modal, toast } from '../Modal';
import { Screen } from '../Screen';
import { AuthScreen } from './AuthScreen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

type Tab = 'controls' | 'interface' | 'audio' | 'account';

const TABS: [Tab, string, TKey][] = [
  ['controls', Icons.homing, 'settings.tab.controls'],
  ['interface', Icons.radar, 'settings.tab.interface'],
  ['audio', Icons.sound, 'settings.tab.audio'],
  ['account', Icons.user, 'settings.tab.account'],
];

/** Секції біндів: рух, бій, система. */
const BIND_GROUPS: [TKey, readonly BindAction[]][] = [
  ['settings.sec.movement', MOVE_ACTIONS],
  ['settings.sec.combat', ['fire', 'boost', 'jump', 'flare', 'item', 'scan', 'freeze']],
  ['settings.sec.system', ['pause']],
];

/** Чи зайнятий код клавіші іншою (ніж except) дією — щоб не прив'язати одну клавішу двічі. */
function keyTakenBy(code: string, except: BindAction): BindAction | null {
  for (const action of BINDABLE_ACTIONS) {
    if (action === except) continue;
    const custom = Save.data.keybinds[action];
    const codes = custom ? [custom] : DEFAULT_KEYBINDS[action];
    if (codes.includes(code)) return action;
  }
  return null;
}

/** Налаштування: вкладки зверху, усередині — логічні секції. */
export class SettingsScreen extends Screen {
  private tab: Tab = 'controls';
  private listeningFor: BindAction | null = null;

  constructor(
    app: ConstructorParameters<typeof Screen>[0],
    private readonly back: () => Screen = () => new MainMenuScreen(app),
  ) {
    super(app);
  }

  // ---------- спільне ----------

  private section(title: TKey, ...rows: (HTMLElement | null)[]): HTMLElement {
    return h('section', { class: 'card set-section' }, h('h3', {}, t(title)), ...rows);
  }

  private row(label: string, control: HTMLElement, hint?: string, disabled = false): HTMLElement {
    return h('div', { class: `set-row${disabled ? ' disabled' : ''}` }, h('span', { class: 'set-label' }, label, hint ? h('small', {}, hint) : null), control);
  }

  private seg<T extends string | boolean>(options: [T, string][], value: T, set: (v: T) => void): HTMLElement {
    return h(
      'div',
      { class: 'seg' },
      ...options.map(([v, label]) =>
        button(label, () => {
          set(v);
          Save.save();
          Sfx.pickup();
          this.render();
        }, `seg-btn${v === value ? ' on' : ''}`),
      ),
    );
  }

  private slider(min: number, max: number, step: number, value: number, format: (v: number) => string, onInput: (v: number) => void, label: string): HTMLElement {
    const input = h('input', { type: 'range', min, max, step, value, 'data-nav': true, 'aria-label': label }) as HTMLInputElement;
    const out = h('span', { class: 'vol-val' }, format(value));
    input.addEventListener('input', () => {
      onInput(Number(input.value));
      out.textContent = format(Number(input.value));
    });
    input.addEventListener('change', () => {
      Save.save();
      Sfx.pickup();
    });
    return h('div', { class: 'vol' }, input, out);
  }

  // ---------- керування ----------

  private async saveKeybinds(): Promise<void> {
    try {
      const { profile } = await Server.setKeybinds(Save.data.keybinds);
      Save.applyProfile(profile);
    } catch {
      // лишається в локальному кеші — спробуємо синхронізувати наступного разу
    }
  }

  private startListening(action: BindAction, btn: HTMLButtonElement): void {
    if (this.listeningFor) return;
    this.listeningFor = action;
    btn.textContent = t('controls.listening');
    btn.classList.add('listening');
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      window.removeEventListener('keydown', onKey, true);
      this.listeningFor = null;
      if (e.code === 'Escape') {
        this.render();
        return;
      }
      const conflict = keyTakenBy(e.code, action);
      if (conflict) {
        Sfx.warning();
        toast(t('controls.conflictWith', { action: t(`control.${conflict}` as TKey) }));
        this.render();
        return;
      }
      Save.data.keybinds = { ...Save.data.keybinds, [action]: e.code };
      Save.save();
      Sfx.pickup();
      void this.saveKeybinds();
      this.render();
    };
    window.addEventListener('keydown', onKey, true);
  }

  private controlsTab(): HTMLElement[] {
    const s = Save.data.settings;
    const mouse = s.controlScheme === 'mouse';
    const scheme = this.section(
      'settings.sec.scheme',
      this.row(t('settings.scheme'), this.seg<ControlScheme>([['mouse', t('settings.scheme.mouse')], ['keyboard', t('settings.scheme.keyboard')]], s.controlScheme, (v) => {
        s.controlScheme = v;
        s.controlSchemeChosen = true;
      })),
      h('p', { class: 'muted small set-note' }, t(mouse ? 'settings.scheme.mouseHint' : 'settings.scheme.keyboardHint')),
    );
    const groups = BIND_GROUPS.map(([title, actions]) => {
      const off = mouse && title === 'settings.sec.movement';
      return this.section(
        title,
        off ? h('p', { class: 'muted small set-note' }, t('settings.movementOff')) : null,
        ...actions.map((action) => {
          const btn = button(displayKey(primaryKeyFor(action)), () => this.startListening(action, btn), 'btn key-btn', off ? { disabled: true } : {});
          const hint = action === 'fire' && mouse ? t('settings.fireMouseHint') : action === 'scan' ? t('settings.scanHint') : undefined;
          return this.row(t(`control.${action}` as TKey), btn, hint, off);
        }),
      );
    });
    const reset = h(
      'div',
      { class: 'set-actions' },
      button(t('controls.reset'), () => {
        Save.data.keybinds = {};
        Save.save();
        void this.saveKeybinds();
        toast(t('controls.resetDone'));
        this.render();
      }, 'btn'),
    );
    return [scheme, ...groups, reset];
  }

  // ---------- інтерфейс ----------

  private crosshairPreview(): HTMLElement {
    const c = h('canvas', { class: 'xhair-preview', width: 320, height: 160, 'aria-hidden': 'true' }) as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const ch = Save.data.settings.crosshair;
    // зоряний фон і шматок астероїда — щоб видно, як приціл читається в бою
    ctx.fillStyle = '#07061a';
    ctx.fillRect(0, 0, 320, 160);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 10) / 15})`;
      ctx.fillRect((i * 83) % 320, (i * 47) % 160, 2, 2);
    }
    ctx.fillStyle = '#5a4a40';
    ctx.beginPath();
    ctx.arc(270, 130, 46, 0, Math.PI * 2);
    ctx.fill();
    if (ch.enabled) {
      drawCrosshair(ctx, 110, 80, 0, ch);
      drawCrosshair(ctx, 248, 104, -0.5, ch);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '600 13px Onest, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('settings.off'), 160, 84);
    }
    return c;
  }

  private interfaceTab(): HTMLElement[] {
    const s = Save.data.settings;
    const ch = s.crosshair;
    const refreshPreview = () => this.el.querySelector('.xhair-preview')?.replaceWith(this.crosshairPreview());
    const colors = h(
      'div',
      { class: 'swatches' },
      ...CROSSHAIR_COLORS.map((col) =>
        button('', () => {
          ch.color = col;
          Save.save();
          this.render();
        }, `swatch${ch.color.toLowerCase() === col ? ' on' : ''}`, { style: `--c:${col}`, 'aria-label': col }),
      ),
      (() => {
        const pick = h('input', { type: 'color', value: ch.color, class: 'swatch-custom', 'aria-label': t('settings.xhair.custom') }) as HTMLInputElement;
        pick.addEventListener('input', () => {
          ch.color = pick.value;
          refreshPreview();
        });
        pick.addEventListener('change', () => {
          Save.save();
          this.render();
        });
        return pick;
      })(),
    );
    const styles: [CrosshairStyle, string][] = [
      ['cross', t('settings.xhair.cross')],
      ['dot', t('settings.xhair.dot')],
      ['circle', t('settings.xhair.circle')],
      ['chevron', t('settings.xhair.chevron')],
    ];
    const crosshair = this.section(
      'settings.sec.crosshair',
      h('div', { class: 'xhair-wrap' }, this.crosshairPreview()),
      this.row(t('settings.xhair.show'), this.seg<boolean>([[true, t('settings.on')], [false, t('settings.off')]], ch.enabled, (v) => (ch.enabled = v))),
      this.row(t('settings.xhair.style'), this.seg<CrosshairStyle>(styles, ch.style, (v) => (ch.style = v)), undefined, !ch.enabled),
      this.row(t('settings.xhair.color'), colors, undefined, !ch.enabled),
      this.row(t('settings.xhair.size'), this.slider(0.6, 1.8, 0.1, ch.size, (v) => `×${v.toFixed(1)}`, (v) => ((ch.size = v), refreshPreview()), t('settings.xhair.size')), undefined, !ch.enabled),
      this.row(t('settings.xhair.opacity'), this.slider(20, 100, 5, Math.round(ch.opacity * 100), (v) => `${v}%`, (v) => ((ch.opacity = v / 100), refreshPreview()), t('settings.xhair.opacity')), undefined, !ch.enabled),
      this.row(t('settings.xhair.distance'), this.slider(120, 360, 10, ch.distance, (v) => `${v} px`, (v) => (ch.distance = v), t('settings.xhair.distance')), t('settings.xhair.distanceHint'), !ch.enabled),
      h(
        'div',
        { class: 'set-actions' },
        button(t('settings.xhair.reset'), () => {
          s.crosshair = { ...DEFAULT_CROSSHAIR };
          Save.save();
          this.render();
        }, 'btn small'),
      ),
    );
    const display = this.section(
      'settings.sec.display',
      this.row(t('settings.lang'), this.seg<Lang>([['uk', 'Українська'], ['en', 'English']], s.lang, (v) => {
        s.lang = v;
        this.app.refresh();
      })),
      this.row(t('settings.shake'), this.seg<boolean>([[true, t('settings.on')], [false, t('settings.off')]], s.shake, (v) => (s.shake = v))),
      this.row(t('settings.fullscreen'), button('⛶', toggleFullscreen, 'seg-btn')),
    );
    return [crosshair, display];
  }

  // ---------- звук ----------

  private audioTab(): HTMLElement[] {
    const s = Save.data.settings;
    return [
      this.section(
        'settings.sec.volume',
        this.row(t('settings.volume'), this.slider(0, 100, 5, Math.round(s.volume * 100), (v) => `${v}%`, (v) => {
          s.volume = v / 100;
          Sfx.applyVolume();
        }, t('settings.volume'))),
      ),
    ];
  }

  // ---------- акаунт ----------

  private accountTab(): HTMLElement[] {
    return [
      this.section(
        'settings.sec.session',
        this.row(Save.data.nickname, button(t('settings.logout'), () => {
          AuthStore.logout();
          this.app.show(new AuthScreen(this.app));
        }, 'btn'), Save.data.publicId ?? undefined),
      ),
      this.section(
        'settings.sec.danger',
        this.row(t('settings.reset'), button(t('settings.reset'), () => {
          const m = new Modal({
            title: t('settings.reset'),
            body: [h('p', {}, t('settings.resetConfirm'))],
            actions: [
              button(t('common.cancel'), () => m.close(), 'btn', { 'data-autofocus': true }),
              button(t('settings.reset'), async () => {
                const { profile } = await Server.resetProgress();
                Save.applyProfile(profile);
                m.close();
                toast(t('settings.resetDone'));
                this.render();
              }, 'btn danger'),
            ],
            onEscape: () => m.close(),
          }).open();
        }, 'btn danger'), t('settings.resetHint')),
      ),
    ];
  }

  protected build(): HTMLElement {
    const body = this.tab === 'controls' ? this.controlsTab() : this.tab === 'interface' ? this.interfaceTab() : this.tab === 'audio' ? this.audioTab() : this.accountTab();
    return h(
      'div',
      { class: 'page settings' },
      screenHeader(t('menu.settings'), () => this.onBack()),
      h(
        'div',
        { class: 'set-tabs', role: 'tablist' },
        ...TABS.map(([tab, ic, label]) =>
          button(h('span', {}, icon(ic, 'ico'), t(label)), () => {
            this.tab = tab;
            this.render();
          }, `set-tab${this.tab === tab ? ' on' : ''}`, { role: 'tab', 'aria-selected': String(this.tab === tab) }),
        ),
      ),
      h('div', { class: `set-body tab-${this.tab}` }, ...body),
    );
  }

  onBack(): void {
    if (this.listeningFor) return;
    this.app.show(this.back());
  }
}
