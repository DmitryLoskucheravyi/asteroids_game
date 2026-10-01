import { h } from './dom';
import { focusFirst } from './nav';

export interface ModalOptions {
  title?: string;
  cls?: string;
  body: (HTMLElement | string)[];
  actions: HTMLElement[];
  /** Що робити на Esc (якщо не задано — Esc нічого не робить) */
  onEscape?: () => void;
}

/** Модальне вікно поверх екрана. */
export class Modal {
  readonly el: HTMLElement;
  private static stack: Modal[] = [];

  constructor(private readonly opts: ModalOptions) {
    this.el = h(
      'div',
      { class: `modal ${opts.cls ?? ''}`, role: 'dialog', 'aria-modal': 'true' },
      h(
        'div',
        { class: 'modal-panel' },
        opts.title ? h('h2', { class: 'modal-title' }, opts.title) : null,
        h('div', { class: 'modal-body' }, ...opts.body),
        h('div', { class: 'modal-actions' }, ...opts.actions),
      ),
    );
  }

  open(): this {
    document.getElementById('modals')!.append(this.el);
    Modal.stack.push(this);
    requestAnimationFrame(() => {
      this.el.classList.add('open');
      focusFirst(this.el);
    });
    return this;
  }

  close(): void {
    Modal.stack = Modal.stack.filter((m) => m !== this);
    this.el.remove();
  }

  static top(): Modal | undefined {
    return Modal.stack[Modal.stack.length - 1];
  }

  static escape(): boolean {
    const m = Modal.top();
    if (!m) return false;
    m.opts.onEscape?.();
    return true;
  }

  static closeAll(): void {
    [...Modal.stack].forEach((m) => m.close());
  }
}

export function toast(text: string): void {
  const el = h('div', { class: 'toast' }, text);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, 1800);
}
