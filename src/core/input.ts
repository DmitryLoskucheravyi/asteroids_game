import { Save } from './storage';

export type Action = 'freeze' | 'boost' | 'jump' | 'pause' | 'item';
/** 'fire' — утримувана дія (стрільба), не дискретна emit()-подія, тому окремо від Action. */
export type BindAction = 'up' | 'down' | 'left' | 'right' | 'fire' | Action;

/** Дефолтні клавіші (декілька варіантів на дію) — використовуються, доки гравець не перебʼє дію своєю. */
export const DEFAULT_KEYBINDS: Record<BindAction, string[]> = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  fire: ['KeyX'],
  freeze: ['Digit1', 'Numpad1', 'KeyE'],
  boost: ['Digit2', 'Numpad2', 'KeyQ'],
  jump: ['Space', 'ShiftLeft', 'ShiftRight'],
  item: ['Digit4', 'Numpad4', 'KeyR'],
  pause: ['Escape', 'KeyP'],
};

export const BINDABLE_ACTIONS: readonly BindAction[] = ['up', 'down', 'left', 'right', 'fire', 'freeze', 'boost', 'jump', 'item', 'pause'];

/** Коди клавіш для дії: кастомний бінд гравця (якщо є) замінює дефолтний набір повністю. */
function codesFor(action: BindAction): string[] {
  const custom = Save.data.keybinds[action];
  return custom ? [custom] : DEFAULT_KEYBINDS[action];
}

/** Перша клавіша дії — для показу в UI (HUD-підказки, екран керування). */
export function primaryKeyFor(action: BindAction): string {
  return codesFor(action)[0];
}

const CODE_LABELS: Record<string, string> = {
  Space: 'SPC',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  Escape: 'ESC',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Коротка людська назва KeyboardEvent.code для HUD/кнопок керування. */
export function displayKey(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `NUM${code.slice(6)}`;
  return code;
}

/**
 * Стан керування (аналог InputState).
 * Напрям руху — аналоговий вектор: клавіатура дає -1/0/1, сенсорний джойстик — плавні значення.
 */
export class InputState {
  private readonly keys = new Set<string>();
  private readonly listeners = new Set<(a: Action) => void>();
  /** Вектор з сенсорного джойстика (null — джойстик не активний). */
  touchAxis: { x: number; y: number } | null = null;
  /** Кнопка вогню на сенсорному HUD утримується окремо від клавіатури. */
  touchFiring = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      // повтори теж додають клавішу: якщо стан очистили (blur, контекстне меню),
      // затиснута клавіша має знову запрацювати без повторного натискання
      this.keys.add(e.code);
      if (e.repeat) return;
      const action = this.actionFor(e.code);
      if (action) this.emit(action);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Баг оригіналу: при втраті фокусу клавіші "залипали"
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => this.clear());
    // ПКМ відкривав контекстне меню, яке "з'їдало" keyup — літак летів сам, а WASD не слухались
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.clear();
    });
  }

  private actionFor(code: string): Action | null {
    if (codesFor('freeze').includes(code)) return 'freeze';
    if (codesFor('boost').includes(code)) return 'boost';
    if (codesFor('jump').includes(code)) return 'jump';
    if (codesFor('item').includes(code)) return 'item';
    if (codesFor('pause').includes(code)) return 'pause';
    return null;
  }

  onAction(fn: (a: Action) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(a: Action): void {
    this.listeners.forEach((fn) => fn(a));
  }

  private down(action: BindAction): boolean {
    return codesFor(action).some((c) => this.keys.has(c));
  }

  /** Чи утримується вогонь зараз (клавіатура або сенсорна кнопка). */
  firing(): boolean {
    return this.down('fire') || this.touchFiring;
  }

  axis(): { x: number; y: number } {
    if (this.touchAxis) return this.touchAxis;
    let x = 0;
    let y = 0;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (x !== 0 && y !== 0) {
      // діагональ не повинна бути швидшою
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  clear(): void {
    this.keys.clear();
    this.touchAxis = null;
    this.touchFiring = false;
  }
}
