import { Assets, assetUrl } from '../core/assets';
import { Sfx } from '../core/audio';
import { t } from '../core/i18n';
import { InputState } from '../core/input';
import { clamp } from '../core/math';
import { APP_VERSION } from '../core/version';
import type { Playable, Viewport } from '../game/Game';
import { Modal } from '../ui/Modal';
import { moveFocus } from '../ui/nav';
import type { Screen } from '../ui/Screen';
import { MenuBackdrop } from './MenuBackdrop';

/** Логічна висота ігрового світу; ширина підлаштовується під пропорції екрана. */
export const WORLD_HEIGHT = 900;
const WORLD_MIN_W = 1200;
const WORLD_MAX_W = 1920;
const FIXED_DT = 1 / 120;

/**
 * Корінь застосунку: canvas, ігровий цикл, перемикання екранів, глобальні клавіші.
 */
export class App {
  readonly input = new InputState();
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly backdrop = new MenuBackdrop();
  private current: Screen | null = null;
  /** Активна гра (керується GameScreen) */
  game: Playable | null = null;
  viewport: Viewport = { scale: 1, ox: 0, oy: 0, cw: 1, ch: 1, dpr: 1 };
  worldW = 1600;
  worldH = WORLD_HEIGHT;
  private last = performance.now();
  private acc = 0;
  private readonly resizeListeners = new Set<() => void>();

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;

    const root = document.documentElement.style;
    root.setProperty('--arrow-left', `url("${assetUrl('arrowLeft')}")`);
    root.setProperty('--arrow-right', `url("${assetUrl('arrowRight')}")`);
    root.setProperty('--splash', `url("${assetUrl('splash')}")`);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    // курсор вікна → координати видимої області гри (для керування мишею)
    this.input.viewMapper = (x, y) => {
      const v = this.viewport;
      return { x: (x * v.dpr - v.ox) / v.scale, y: (y * v.dpr - v.oy) / v.scale };
    };
    this.bindGlobalKeys();
    document.getElementById('rotate-hint')!.textContent = t('rotate');

    const versionTag = document.createElement('div');
    versionTag.className = 'version-tag';
    versionTag.textContent = `v${APP_VERSION}`;
    document.getElementById('app')!.append(versionTag);
  }

  onResize(fn: () => void): () => void {
    this.resizeListeners.add(fn);
    return () => this.resizeListeners.delete(fn);
  }

  private resize(): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;

    this.worldH = WORLD_HEIGHT;
    this.worldW = Math.round(clamp((WORLD_HEIGHT * cssW) / Math.max(1, cssH), WORLD_MIN_W, WORLD_MAX_W));
    const s = Math.min(cssW / this.worldW, cssH / this.worldH);
    this.viewport = {
      scale: s * dpr,
      ox: ((cssW - this.worldW * s) / 2) * dpr,
      oy: ((cssH - this.worldH * s) / 2) * dpr,
      cw: this.canvas.width,
      ch: this.canvas.height,
      dpr,
    };
    this.backdrop.resize(cssW, cssH);
    this.game?.resize(this.worldW, this.worldH);
    document.documentElement.style.setProperty('--world-scale', String(s));
    this.resizeListeners.forEach((fn) => fn());
  }

  show(screen: Screen): void {
    Modal.closeAll();
    const host = document.getElementById('screens')!;
    if (this.current) {
      this.current.onHide();
      const old = this.current.el;
      old.classList.remove('active');
      old.classList.add('leaving');
      setTimeout(() => old.remove(), 250);
    }
    this.current = screen;
    const el = screen.render();
    host.append(el);
    requestAnimationFrame(() => {
      el.classList.add('active');
      screen.onShow();
    });
  }

  /** Перебудувати поточний екран (після зміни мови). */
  refresh(): void {
    this.current?.render();
    document.getElementById('rotate-hint')!.textContent = t('rotate');
  }

  private bindGlobalKeys(): void {
    window.addEventListener('keydown', (e) => {
      Sfx.unlock();
      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) {
        toggleFullscreen();
        return;
      }
      if (e.code === 'Escape') {
        // у грі Esc повністю обробляє GameScreen (через InputState), інакше пауза відкривалась і одразу закривалась
        if (this.game) return;
        if (!Modal.escape()) this.current?.onBack();
        return;
      }
      const inGame = this.game && !Modal.top();
      if (inGame) return;
      const active = document.activeElement;
      // у текстовому полі стрілки рухають курсор, а не фокус між кнопками
      if (active instanceof HTMLInputElement && ['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(active.type)) return;
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        KeyW: [0, -1],
        KeyS: [0, 1],
        KeyA: [-1, 0],
        KeyD: [1, 0],
      };
      const d = dirs[e.code];
      if (d) {
        e.preventDefault();
        moveFocus(d[0], d[1]);
      }
    });
    window.addEventListener('pointerdown', () => Sfx.unlock(), { capture: true });
  }

  start(): void {
    const frame = (now: number): void => {
      const dt = Math.min(0.25, (now - this.last) / 1000);
      this.last = now;
      // плануємо наступний кадр до рендеру — помилка в одному кадрі не зупинить гру назавжди
      requestAnimationFrame(frame);
      try {
        this.tick(dt);
      } catch (err) {
        console.error(err);
      }
    };
    requestAnimationFrame(frame);
  }

  private tick(dt: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!Assets.ready) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#04030a';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    if (this.game && !this.current?.menuBackdrop) {
      // фіксований крок фізики — швидкі комети не "проскакують" крізь літак
      this.acc += dt;
      while (this.acc >= FIXED_DT) {
        this.game.update(FIXED_DT);
        this.acc -= FIXED_DT;
      }
      this.game.render(ctx, this.viewport);
    } else {
      this.acc = 0;
      this.backdrop.update(dt);
      ctx.setTransform(this.viewport.dpr, 0, 0, this.viewport.dpr, 0, 0);
      this.backdrop.render(ctx);
    }
  }
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
