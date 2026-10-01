import type { App } from '../../app/App';
import { toggleFullscreen } from '../../app/App';
import { Sfx } from '../../core/audio';
import { levelName, t } from '../../core/i18n';
import type { Action } from '../../core/input';
import { formatTime } from '../../core/math';
import { Save } from '../../core/storage';
import { Game, type GameMode, type GameResult } from '../../game/Game';
import { levelReward, survivalReward } from '../../game/economy';
import { MAX_LEVEL } from '../../game/levels';
import { BOOST_DURATION, FREEZE_DURATION } from '../../game/systems/SkillSystem';
import { Icons, button, h, icon } from '../dom';
import { Modal } from '../Modal';
import { Screen } from '../Screen';
import { LevelSelectScreen, starsRow } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

interface SkillSlot {
  el: HTMLButtonElement;
  count: HTMLElement;
}

const isTouch = (): boolean => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Ігровий екран (аналог GameForm): HUD поверх canvas, пауза, результати. */
export class GameScreen extends Screen {
  readonly menuBackdrop = false;
  private game!: Game;
  private raf = 0;
  private cleanup: (() => void)[] = [];

  private hudTime!: HTMLElement;
  private hudProgress!: HTMLElement;
  private hudCenter!: HTMLElement;
  private hudCoins!: HTMLElement;
  private hudCoinsText!: HTMLElement;
  private slots!: Record<'freeze' | 'boost' | 'jump', SkillSlot>;
  private shieldSlot!: HTMLElement;
  private featSlot!: HTMLElement;
  private featIcon!: HTMLElement;
  private featText!: HTMLElement;
  private pauseBtn!: HTMLButtonElement;
  private cache = new Map<HTMLElement, string>();

  constructor(
    app: App,
    private readonly mode: GameMode,
    private readonly levelId: number,
  ) {
    super(app);
  }

  protected build(): HTMLElement {
    const campaign = this.mode === 'campaign';
    this.hudTime = h('div', { class: 'hud-time' }, '00:00');
    this.hudProgress = h('i');
    this.hudCenter = h('div', { class: 'hud-center' });
    this.hudCoinsText = h('span', {}, String(Save.data.coins));
    this.hudCoins = h('div', { class: 'hud-coins' }, icon(Icons.coin, 'ico coin'), this.hudCoinsText);

    const slot = (key: 'freeze' | 'boost' | 'jump', ic: string, hint: string): SkillSlot => {
      const count = h('span', { class: 'sk-count' });
      const el = button(
        h('span', { class: 'sk-inner' }, icon(ic), count, h('span', { class: 'sk-key' }, hint), h('span', { class: 'sk-label' }, t(`hud.${key}`))),
        () => this.action(key),
        `skill sk-${key}`,
        { tabindex: -1 },
      );
      el.removeAttribute('data-nav');
      return { el, count };
    };
    this.slots = {
      freeze: slot('freeze', Icons.snow, '1'),
      boost: slot('boost', Icons.bolt, '2'),
      jump: slot('jump', Icons.dash, 'SPC'),
    };
    this.featIcon = h('span', { class: 'ico' });
    this.featText = h('span', { class: 'sk-label' });
    this.featSlot = h('div', { class: 'skill sk-feat', hidden: true }, h('span', { class: 'sk-inner' }, this.featIcon, this.featText));
    this.shieldSlot = h('div', { class: 'skill sk-shield' }, h('span', { class: 'sk-inner' }, icon(Icons.shield), h('span', { class: 'sk-label' }, t('hud.shield'))));

    this.pauseBtn = button(icon(Icons.pause), () => this.action('pause'), 'icon-btn', { 'aria-label': t('game.paused'), tabindex: -1 });
    this.pauseBtn.removeAttribute('data-nav');
    const fsBtn = button(icon(Icons.fullscreen), toggleFullscreen, 'icon-btn', { 'aria-label': 'fullscreen', tabindex: -1 });
    fsBtn.removeAttribute('data-nav');

    const label = campaign ? `${t('levels.level')} ${this.levelId} · ${levelName(this.levelId)}` : t('menu.survival');

    const el = h(
      'div',
      { class: `game${isTouch() ? ' touch' : ''}` },
      h('div', { class: 'hud-tl' }, h('div', { class: 'hud-label' }, label), this.hudTime, campaign ? h('div', { class: 'hud-bar' }, this.hudProgress) : null),
      this.hudCenter,
      h('div', { class: 'hud-tr' }, this.hudCoins, fsBtn, this.pauseBtn),
      h('div', { class: 'hud-skills' }, this.featSlot, this.shieldSlot, this.slots.freeze.el, this.slots.boost.el, this.slots.jump.el),
      isTouch() ? this.buildJoystick() : null,
    );
    return el;
  }

  private buildJoystick(): HTMLElement {
    const knob = h('div', { class: 'stick-knob' });
    const base = h('div', { class: 'stick-base' }, knob);
    const zone = h('div', { class: 'stick-zone' }, base);
    let id: number | null = null;
    let ox = 0;
    let oy = 0;
    const R = 60;
    zone.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      ox = e.clientX;
      oy = e.clientY;
      base.style.left = `${ox}px`;
      base.style.top = `${oy}px`;
      base.classList.add('on');
      knob.style.transform = 'translate(-50%,-50%)';
      this.app.input.touchAxis = { x: 0, y: 0 };
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const m = Math.min(1, len / R);
      this.app.input.touchAxis = len > 6 ? { x: (dx / Math.max(len, 1)) * m, y: (dy / Math.max(len, 1)) * m } : { x: 0, y: 0 };
    });
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== id) return;
      id = null;
      base.classList.remove('on');
      this.app.input.touchAxis = null;
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    return zone;
  }

  onShow(): void {
    const app = this.app;
    // якщо прогрес скинули і обраний літак більше не куплений — летимо на стартовому
    const plane = Save.owns(Save.data.plane) ? Save.data.plane : 'falcon';
    this.game = new Game(this.mode, this.levelId, plane, app.input);
    this.game.resize(app.worldW, app.worldH);
    this.game.onEnd = (r) => setTimeout(() => this.showResult(r), 150);
    app.game = this.game;
    this.game.start();

    this.cleanup.push(app.input.onAction((a) => this.action(a)));

    // кнопки HUD не забирають фокус: інакше пробіл/Enter "натискали" б сфокусовану кнопку (напр. паузу)
    const keepFocus = (e: MouseEvent): void => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    };
    this.el.addEventListener('mousedown', keepFocus);
    // ігрові клавіші не скролять сторінку й не активують елементи
    const blockDefaults = (e: KeyboardEvent): void => {
      if (!Modal.top() && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', blockDefaults);
    this.cleanup.push(() => window.removeEventListener('keydown', blockDefaults));
    const onHidden = (): void => {
      if (document.hidden) this.pause();
    };
    const onBlur = (): void => this.pause();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onBlur);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', onHidden));
    this.cleanup.push(() => window.removeEventListener('blur', onBlur));

    (document.activeElement as HTMLElement | null)?.blur?.();
    const loop = (): void => {
      this.updateHud();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  onHide(): void {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.app.input.clear();
    if (this.app.game === this.game) this.app.game = null;
  }

  private action(a: Action): void {
    if (Modal.top()) {
      if (a === 'pause') Modal.escape();
      return;
    }
    switch (a) {
      case 'freeze':
        this.game.useFreeze();
        break;
      case 'boost':
        this.game.useBoost();
        break;
      case 'jump':
        this.game.useJump();
        break;
      case 'pause':
        this.pause();
        break;
    }
  }

  // ---------- HUD ----------

  /** Оновлює текст лише якщо він змінився — менше роботи для DOM щокадру. */
  private set(el: HTMLElement, value: string): void {
    if (this.cache.get(el) === value) return;
    this.cache.set(el, value);
    el.textContent = value;
  }

  private updateHud(): void {
    const g = this.game;
    const sk = g.skills;
    if (this.mode === 'campaign') {
      this.set(this.hudTime, formatTime(Math.ceil(g.timeLeft)));
      this.hudProgress.style.width = `${Math.min(100, (g.elapsed / g.level.duration) * 100)}%`;
      this.hudTime.classList.toggle('urgent', g.timeLeft <= 5 && g.state === 'running');
      const target = g.level.crystalTarget;
      this.set(this.hudCenter, `◆ ${g.crystals} / ${target}`);
      this.hudCenter.classList.toggle('done', g.crystals >= target);
    } else {
      this.set(this.hudTime, formatTime(g.elapsed));
      this.set(this.hudCenter, `${t('hud.difficulty')} ${g.difficultyStep + 1}  ·  ${t('hud.best')} ${formatTime(Math.max(Save.bestSurvival, g.elapsed))}`);
    }

    const coinsNow = String(Save.data.coins + g.coins);
    if (this.cache.get(this.hudCoinsText) !== coinsNow && this.cache.has(this.hudCoinsText)) {
      // коротка анімація при отриманні коінс
      this.hudCoins.classList.remove('bump');
      void this.hudCoins.offsetWidth;
      this.hudCoins.classList.add('bump');
    }
    this.set(this.hudCoinsText, coinsNow);

    const fz = this.slots.freeze;
    this.set(fz.count, String(sk.freezeCharges));
    fz.el.classList.toggle('empty', sk.freezeCharges === 0 && !sk.isFrozen);
    fz.el.classList.toggle('active', sk.isFrozen);
    fz.el.style.setProperty('--p', String(sk.isFrozen ? sk.freezeLeft / FREEZE_DURATION : 0));

    const bs = this.slots.boost;
    this.set(bs.count, String(sk.boostCharges));
    bs.el.classList.toggle('empty', sk.boostCharges === 0 && !sk.isBoosted);
    bs.el.classList.toggle('active', sk.isBoosted);
    bs.el.style.setProperty('--p', String(sk.isBoosted ? sk.boostLeft / BOOST_DURATION : 0));

    const jp = this.slots.jump;
    const multi = sk.jumpChargesMax > 1;
    this.set(jp.count, multi ? `${sk.jumpCharges}/${sk.jumpChargesMax}` : sk.jumpCharges > 0 ? t('hud.ready') : sk.jumpCooldown.toFixed(1));
    jp.el.classList.toggle('empty', sk.jumpCharges === 0);
    jp.el.style.setProperty('--p', String(sk.jumpCharges < sk.jumpChargesMax ? sk.jumpCooldown / sk.jumpCooldownMax : 0));

    const fs = g.featureStatus();
    this.featSlot.hidden = !fs;
    if (fs) {
      if (this.featIcon.dataset.kind !== fs.icon) {
        this.featIcon.dataset.kind = fs.icon;
        this.featIcon.innerHTML = fs.icon === 'heart' ? Icons.heart : Icons.shield;
      }
      this.set(this.featText, fs.text);
    }

    this.shieldSlot.classList.toggle('on', g.player.shield);
  }

  // ---------- модалки ----------

  private pause(): void {
    if (Modal.top() || (this.game.state !== 'running' && this.game.state !== 'countdown')) return;
    this.game.pause();
    const resume = (): void => {
      m.close();
      this.game.resume();
    };
    const m = new Modal({
      title: t('game.paused'),
      cls: 'pause-modal',
      body: [],
      actions: [
        button(t('game.resume'), resume, 'btn primary', { 'data-autofocus': true }),
        button(t('game.restart'), () => this.restart(), 'btn'),
        this.mode === 'campaign' ? button(t('game.toLevels'), () => this.app.show(new LevelSelectScreen(this.app, this.levelId)), 'btn') : null,
        button(t('game.toMenu'), () => this.app.show(new MainMenuScreen(this.app)), 'btn'),
      ].filter((x): x is HTMLButtonElement => !!x),
      onEscape: resume,
    }).open();
  }

  private restart(): void {
    Modal.closeAll();
    this.app.input.clear();
    this.game.start();
  }

  /** Зараховує коінс і повертає блок із розбивкою нагороди та анімованим підсумком. */
  private rewardBlock(lines: [string, number, string?][]): HTMLElement {
    const total = lines.reduce((sum, [, n]) => sum + n, 0);
    Save.addCoins(total);
    const totalEl = h('span', { class: 'coin-amount' }, '0');
    const block = h(
      'div',
      { class: 'reward' },
      ...lines
        .filter(([, n]) => n > 0)
        .map(([label, n, note]) => h('div', { class: 'reward-line' }, h('span', {}, label, note ? h('small', {}, ` · ${note}`) : null), h('span', { class: 'reward-num' }, `+${n}`))),
      h('div', { class: 'reward-total' }, h('span', {}, t('reward.total')), h('span', { class: 'coin-badge big' }, icon(Icons.coin, 'ico coin'), totalEl)),
    );
    // відлік від 0 до суми
    const started = performance.now();
    const tick = (): void => {
      const k = Math.min(1, (performance.now() - started) / 900);
      totalEl.textContent = `+${Math.round(total * (1 - Math.pow(1 - k, 3)))}`;
      if (k < 1 && block.isConnected) requestAnimationFrame(tick);
    };
    setTimeout(() => requestAnimationFrame(tick), 300);
    return block;
  }

  private showResult(r: GameResult): void {
    if (Modal.top()) Modal.closeAll();
    const toLevels = (): void => this.app.show(new LevelSelectScreen(this.app, r.won && r.level < MAX_LEVEL ? r.level + 1 : r.level));
    const toMenu = (): void => this.app.show(new MainMenuScreen(this.app));

    if (r.mode === 'survival') {
      const place = Save.addSurvival(r.time);
      const reward = this.rewardBlock([
        [t('reward.survival'), survivalReward(r.time)],
        [t('reward.crystals'), r.coins],
      ]);
      new Modal({
        title: t('game.survivalOver'),
        cls: 'result',
        body: [
          h('div', { class: 'res-label' }, t('game.yourTime')),
          h('div', { class: 'res-big' }, formatTime(r.time)),
          place === 0 ? h('div', { class: 'res-badge' }, icon(Icons.trophy), t('game.newRecord')) : '',
          place > 0 ? h('div', { class: 'muted' }, t('game.place', { n: place + 1 })) : '',
          reward,
        ],
        actions: [button(t('game.retry'), () => this.restart(), 'btn primary', { 'data-autofocus': true }), button(t('game.toMenu'), toMenu, 'btn')],
      }).open();
      return;
    }

    if (r.won) {
      const firstClear = Save.starsFor(r.level) === 0;
      Save.completeLevel(r.level, r.stars, MAX_LEVEL);
      const reward = this.rewardBlock([
        [t('reward.level'), levelReward(r.level, r.stars, firstClear), firstClear ? t('reward.first') : undefined],
        [t('reward.crystals'), r.coins],
      ]);
      const stars = starsRow(0);
      stars.classList.add('res-stars');
      const last = r.level >= MAX_LEVEL;
      new Modal({
        title: t('game.complete'),
        cls: 'result win',
        body: [
          h('div', { class: 'res-label' }, `${t('levels.level')} ${r.level} · ${levelName(r.level)}`),
          stars,
          h('div', { class: 'res-crystals' }, icon(Icons.crystal), `${t('game.crystals')}: ${r.crystals} / ${r.crystalTarget}`),
          last ? h('p', { class: 'res-final' }, t('game.allDone', { n: MAX_LEVEL })) : '',
          reward,
        ],
        actions: [
          !last ? button(t('game.nextLevel'), () => this.app.show(new GameScreen(this.app, 'campaign', r.level + 1)), 'btn primary', { 'data-autofocus': true }) : null,
          button(t('game.retry'), () => this.restart(), last ? 'btn primary' : 'btn', last ? { 'data-autofocus': true } : {}),
          button(t('game.toLevels'), toLevels, 'btn'),
        ].filter((x): x is HTMLButtonElement => !!x),
      }).open();
      stars.querySelectorAll('.star').forEach((s, i) => {
        if (i < r.stars)
          setTimeout(() => {
            s.classList.add('on', 'pop');
            Sfx.star(i);
          }, 450 + i * 350);
      });
      return;
    }

    const pct = Math.min(100, (r.time / r.duration) * 100);
    new Modal({
      title: t('game.lost'),
      cls: 'result lose',
      body: [
        h('div', { class: 'res-label' }, `${t('levels.level')} ${r.level} · ${levelName(r.level)}`),
        h('div', { class: 'res-sub' }, t('game.lostSub', { t: formatTime(r.time), total: formatTime(r.duration) })),
        h('div', { class: 'res-bar' }, h('i', { style: `width:${pct}%` })),
        // кристали, зібрані до загибелі, все одно зараховуються
        r.coins > 0 ? this.rewardBlock([[t('reward.crystals'), r.coins]]) : '',
      ],
      actions: [button(t('game.retry'), () => this.restart(), 'btn primary', { 'data-autofocus': true }), button(t('game.toLevels'), toLevels, 'btn'), button(t('game.toMenu'), toMenu, 'btn')],
    }).open();
  }
}
