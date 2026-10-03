/**
 * Анімації слотів скілів у HUD без змін у логіці екранів: стежимо за класами слота.
 * Зник клас `empty` (перезарядка скінчилась) — спалах "готово"; з'явився `active` — поштовх.
 */
export function animateSkillSlots(root: HTMLElement): HTMLElement {
  const restart = (el: HTMLElement, cls: string, ms: number) => {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    window.setTimeout(() => el.classList.remove(cls), ms);
  };
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      const el = m.target as HTMLElement;
      if (!el.classList.contains('skill')) continue;
      const before = ` ${m.oldValue ?? ''} `;
      const wasEmpty = before.includes(' empty ');
      const wasActive = before.includes(' active ');
      if (wasEmpty && !el.classList.contains('empty') && !el.classList.contains('active')) restart(el, 'just-ready', 700);
      if (!wasActive && el.classList.contains('active')) restart(el, 'just-used', 350);
    }
  });
  obs.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  return root;
}
