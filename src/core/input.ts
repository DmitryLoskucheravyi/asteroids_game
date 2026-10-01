export type Action = 'freeze' | 'boost' | 'jump' | 'pause';

/**
 * Стан керування (аналог InputState).
 * Напрям руху — аналоговий вектор: клавіатура дає -1/0/1, сенсорний джойстик — плавні значення.
 */
export class InputState {
  private readonly keys = new Set<string>();
  private readonly listeners = new Set<(a: Action) => void>();
  /** Вектор з сенсорного джойстика (null — джойстик не активний). */
  touchAxis: { x: number; y: number } | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const action = InputState.actionFor(e.code);
      if (action) this.emit(action);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Баг оригіналу: при втраті фокусу клавіші "залипали"
    window.addEventListener('blur', () => this.clear());
  }

  private static actionFor(code: string): Action | null {
    switch (code) {
      case 'Digit1':
      case 'Numpad1':
      case 'KeyE':
        return 'freeze';
      case 'Digit2':
      case 'Numpad2':
      case 'KeyQ':
        return 'boost';
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
        return 'jump';
      case 'Escape':
      case 'KeyP':
        return 'pause';
      default:
        return null;
    }
  }

  onAction(fn: (a: Action) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(a: Action): void {
    this.listeners.forEach((fn) => fn(a));
  }

  private down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  axis(): { x: number; y: number } {
    if (this.touchAxis) return this.touchAxis;
    let x = 0;
    let y = 0;
    if (this.down('ArrowLeft', 'KeyA')) x -= 1;
    if (this.down('ArrowRight', 'KeyD')) x += 1;
    if (this.down('ArrowUp', 'KeyW')) y -= 1;
    if (this.down('ArrowDown', 'KeyS')) y += 1;
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
  }
}
