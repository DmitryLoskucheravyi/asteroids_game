/**
 * Навігація по меню стрілками/WASD: фокус переходить до найближчої кнопки в заданому напрямку.
 * Працює в межах найвищого активного шару (модалка або екран).
 */
export function activeLayer(): HTMLElement | null {
  const modals = document.querySelectorAll<HTMLElement>('#modals .modal');
  if (modals.length) return modals[modals.length - 1];
  return document.querySelector<HTMLElement>('#screens .screen.active');
}

function navigables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-nav]')].filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

export function focusFirst(root: HTMLElement | null): void {
  if (!root) return;
  const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
  (preferred ?? navigables(root)[0])?.focus({ preventScroll: false });
}

export function moveFocus(dx: number, dy: number): void {
  const root = activeLayer();
  if (!root) return;
  const items = navigables(root);
  if (!items.length) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !items.includes(cur)) {
    items[0].focus();
    return;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    const vx = bx - ax;
    const vy = by - ay;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const across = Math.abs(vx * dy - vy * dx);
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  best?.focus();
}
