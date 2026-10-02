import type { Socket } from 'socket.io-client';
import type { App } from '../../app/App';
import { t } from '../../core/i18n';
import { Save } from '../../core/storage';
import { PvpGame } from '../../game/PvpGame';
import type { MatchInit, MatchResultEntry } from '../../net/pvpProtocol';
import { Icons, button, h, icon } from '../dom';
import { Modal } from '../Modal';
import { Screen } from '../Screen';
import { MainMenuScreen } from './MainMenuScreen';
import { MatchResultScreen } from './MatchResultScreen';

const RADAR_W = 170;
const RADAR_H = 100;

/** Бойовий екран онлайн-матчу: радар, HP, фід фрагів. Малює через той самий app.game слот, що й GameScreen. */
export class PvpScreen extends Screen {
  readonly menuBackdrop = false;
  private game!: PvpGame;
  private raf = 0;
  private hpFill!: HTMLElement;
  private hpText!: HTMLElement;
  private radarCanvas!: HTMLCanvasElement;
  private feed!: HTMLElement;
  private leftViaResult = false;

  constructor(
    app: App,
    private readonly socket: Socket,
    private readonly initData: MatchInit,
  ) {
    super(app);
  }

  protected build(): HTMLElement {
    this.hpText = h('span', {}, '');
    this.hpFill = h('i');
    this.radarCanvas = h('canvas', { width: RADAR_W, height: RADAR_H, class: 'radar-canvas' }) as HTMLCanvasElement;
    this.feed = h('div', { class: 'frag-feed' });

    const leaveBtn = button(icon(Icons.close), () => this.confirmLeave(), 'icon-btn', { 'aria-label': t('pvp.leave'), tabindex: -1 });
    leaveBtn.removeAttribute('data-nav');

    return h(
      'div',
      { class: 'game pvp' },
      h('div', { class: 'hud-tl' }, h('div', { class: 'hp-bar' }, h('div', { class: 'hp-track' }, this.hpFill), this.hpText)),
      h('div', { class: 'hud-tr' }, leaveBtn),
      h('div', { class: 'radar-box' }, h('div', { class: 'radar-label' }, t('pvp.radar')), this.radarCanvas),
      this.feed,
    );
  }

  onShow(): void {
    const app = this.app;
    this.game = new PvpGame(this.socket, app.input, Save.data.plane);
    // onInit вже відбувся до створення екрана (init прийшов у OnlineScreen) — застосуємо дані напряму
    this.game.worldW = this.initData.world.w;
    this.game.worldH = this.initData.world.h;
    this.game.obstacles = this.initData.obstacles;
    for (const p of this.initData.participants) this.game.participants.set(p.id, p);
    this.game.selfId = this.socket.id ?? null;
    this.game.player.reset(this.game.worldW / 2, this.game.worldH / 2);

    this.game.onMatchEnd = (results: MatchResultEntry[]) => {
      this.leftViaResult = true;
      this.app.show(new MatchResultScreen(this.app, results, this.socket));
    };
    this.game.onHitFeed = (text: string) => this.pushFeed(text);

    app.game = this.game;

    const loop = (): void => {
      this.updateHud();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  onHide(): void {
    cancelAnimationFrame(this.raf);
    if (this.app.game === this.game) this.app.game = null;
    if (!this.leftViaResult) this.socket.emit('queue:leave');
  }

  private pushFeed(text: string): void {
    const row = h('div', { class: 'frag-row' }, text);
    this.feed.prepend(row);
    setTimeout(() => row.remove(), 4000);
    while (this.feed.children.length > 5) this.feed.lastElementChild?.remove();
  }

  private confirmLeave(): void {
    const m = new Modal({
      title: t('pvp.leave'),
      body: [h('p', {}, t('pvp.leaveConfirm'))],
      actions: [
        button(t('common.cancel'), () => m.close(), 'btn', { 'data-autofocus': true }),
        button(t('pvp.leave'), () => {
          m.close();
          this.leftViaResult = true;
          this.socket.emit('queue:leave');
          this.app.show(new MainMenuScreen(this.app));
        }, 'btn danger'),
      ],
      onEscape: () => m.close(),
    }).open();
  }

  private updateHud(): void {
    const self = this.game.self;
    const pct = self ? Math.max(0, self.hp / self.maxHp) : 1;
    this.hpFill.style.width = `${pct * 100}%`;
    this.hpFill.className = pct > 0.4 ? '' : 'low';
    this.hpText.textContent = self ? `${Math.ceil(self.hp)} / ${self.maxHp}` : '';

    const ctx = this.radarCanvas.getContext('2d')!;
    ctx.clearRect(0, 0, RADAR_W, RADAR_H);
    ctx.fillStyle = 'rgba(10,9,24,0.7)';
    ctx.fillRect(0, 0, RADAR_W, RADAR_H);
    const sx = RADAR_W / this.game.worldW;
    const sy = RADAR_H / this.game.worldH;
    for (const c of this.game.radarContacts()) {
      ctx.fillStyle = c.isSelf ? '#58d2ff' : '#ff4a5a';
      ctx.beginPath();
      ctx.arc(c.x * sx, c.y * sy, c.isSelf ? 3 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
