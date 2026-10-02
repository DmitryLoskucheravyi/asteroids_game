import { Sfx } from '../core/audio';

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** Мінімальний helper для створення DOM-елементів. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'style') {
      el.setAttribute('style', String(v));
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

/** Елемент з SVG-іконкою. */
export function icon(svg: string, cls = 'ico', style?: string): HTMLSpanElement {
  return h('span', { class: cls, html: svg, 'aria-hidden': 'true', style });
}

/** Кнопка зі звуками наведення/кліку. */
export function button(label: string | Node, onClick: () => void, cls = 'btn', extra: Attrs = {}): HTMLButtonElement {
  const b = h('button', { class: cls, type: 'button', 'data-nav': true, ...extra }, label);
  b.addEventListener('click', () => {
    Sfx.click();
    onClick();
  });
  b.addEventListener('mouseenter', () => Sfx.hover());
  return b;
}

const svg = (body: string, vb = '0 0 24 24'): string =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const Icons = {
  snow: svg('<path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11"/><path d="M9 4l3 2.5L15 4M9 20l3-2.5 3 2.5M3.5 9.5l3.6.9-1 3.6M20.5 14.5l-3.6-.9 1-3.6M3.5 14.5l3.6-.9-1-3.6M20.5 9.5l-3.6.9 1 3.6"/>'),
  bolt: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none"/>'),
  dash: svg('<path d="M5 12h11M12 6l6 6-6 6"/><path d="M2 8h4M1 16h5" opacity=".6"/>'),
  shield: svg('<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor" fill-opacity=".25"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>'),
  play: svg('<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>'),
  fullscreen: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" fill-opacity=".25"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
  mute: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" fill-opacity=".25"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  star: svg('<path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z" fill="currentColor"/>'),
  crystal: svg('<path d="M12 2l6 7-6 13L6 9z" fill="currentColor" fill-opacity=".35"/><path d="M6 9h12M12 2l-2 7 2 13 2-13z"/>'),
  trophy: svg('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  comet: svg('<circle cx="16" cy="8" r="4" fill="currentColor" fill-opacity=".35"/><path d="M13 11 3 21M10 8 4 14M16 14l-6 6"/>'),
  radar: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12L19 5" /><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="16.5" cy="14.5" r="1.3" fill="currentColor"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.4-7 8-7s7 2.5 8 7"/>'),
  homing: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
  bouncer: svg('<path d="M3 20 10 6l5 9 6-11"/><path d="M2 21h20" opacity=".5"/>'),
  blackhole: svg('<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 4a8 8 0 0 1 8 8M12 20a8 8 0 0 1-8-8M17 6.5a8 8 0 0 0-10 0M7 17.5a8 8 0 0 0 10 0"/>'),
  meteor: svg('<circle cx="6" cy="18" r="2.5" fill="currentColor"/><circle cx="13" cy="15" r="2" fill="currentColor"/><circle cx="18" cy="20" r="1.8" fill="currentColor"/><path d="M8 16 14 6M15 13l5-8M20 18l3-5"/>'),
  fog: svg('<path d="M3 9h13M6 13h15M3 17h12M17 17h4"/>'),
  mine: svg('<circle cx="12" cy="12" r="5" fill="currentColor" fill-opacity=".3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/>'),
  wind: svg('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>'),
  boss: svg('<path d="M4 8l4 3 4-6 4 6 4-3-2 11H6z" fill="currentColor" fill-opacity=".3"/>'),
  laser: svg('<path d="M2 12h20" stroke-width="3"/><circle cx="3" cy="12" r="2" fill="currentColor"/><circle cx="21" cy="12" r="2" fill="currentColor"/><path d="M7 7v2M12 6v3M17 7v2M7 15v2M12 15v3M17 15v2" opacity=".6"/>'),
  heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" fill-opacity=".35"/>'),
  coin: svg('<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".3"/><circle cx="12" cy="12" r="6"/><path d="M12 9v6"/>'),
  gift: svg('<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9c-2-4-7-4-6-1 .5 1.5 3 1 6 1zM12 9c2-4 7-4 6-1-.5 1.5-3 1-6 1z"/>'),
  flare: svg('<path d="M12 3v6" /><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M6 20c1-4 3-6 6-8M18 20c-1-4-3-6-6-8M3 14c3-1 6-1 9-2M21 14c-3-1-6-1-9-2"/><circle cx="5.5" cy="20.5" r="1.5" fill="currentColor"/><circle cx="18.5" cy="20.5" r="1.5" fill="currentColor"/><circle cx="2.5" cy="14" r="1.2" fill="currentColor"/><circle cx="21.5" cy="14" r="1.2" fill="currentColor"/>'),
  wall: svg('<rect x="2" y="5" width="7" height="5" rx="1"/><rect x="15" y="5" width="7" height="5" rx="1"/><rect x="2" y="14" width="4" height="5" rx="1"/><rect x="11" y="14" width="11" height="5" rx="1"/>'),
};

/** Бейдж з кількістю коінс. */
export function coinBadge(amount: number, cls = 'coin-badge'): HTMLElement {
  return h('span', { class: cls }, icon(Icons.coin, 'ico coin'), h('span', { class: 'coin-amount' }, amount.toLocaleString('uk-UA')));
}

/** Бейдж з кількістю кристалів (рідкісна валюта тір-апів). */
export function crystalBadge(amount: number, cls = 'coin-badge crystal-badge'): HTMLElement {
  return h('span', { class: cls }, icon(Icons.crystal, 'ico crystal'), h('span', { class: 'coin-amount' }, amount.toLocaleString('uk-UA')));
}
