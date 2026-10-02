import type { App } from '../app/App';
import { focusFirst } from './nav';

/** Базовий клас екрана (аналог Form у WinForms-версії). */
export abstract class Screen {
  el!: HTMLElement;
  /** Показувати анімований фон меню (false — гра малює свій фон) */
  readonly menuBackdrop: boolean = true;

  constructor(protected readonly app: App) {}

  protected abstract build(): HTMLElement;

  /** Перебудувати вміст (напр. після зміни мови). */
  render(): HTMLElement {
    const fresh = this.build();
    fresh.classList.add('screen');
    if (this.el) {
      const wasActive = this.el.classList.contains('active');
      const scroll = this.el.scrollTop;
      this.el.replaceWith(fresh);
      if (wasActive) fresh.classList.add('active');
      // перебудова після покупки/екіпірування не повинна кидати сторінку нагору
      fresh.scrollTop = scroll;
    }
    this.el = fresh;
    return fresh;
  }

  onShow(): void {
    focusFirst(this.el);
  }

  onHide(): void {}

  /** Esc / кнопка "назад". */
  onBack(): void {}
}
