import type { CrateType } from '../core/server';
import { h } from '../ui/dom';

/**
 * Піксельний 3D-ящик: кожна грань — текстура 16×16, намальована кодом і збільшена без згладжування,
 * а сам ящик — CSS-куб (preserve-3d) з кришкою на шарнірі по задньому верхньому ребру.
 */

interface Palette {
  wood: string;
  woodDark: string;
  band: string;
  bandDark: string;
  gem: string;
}

export const CRATE_PALETTE: Record<CrateType, Palette> = {
  common: { wood: '#9a6a3a', woodDark: '#6a4420', band: '#b8c0d4', bandDark: '#6a7288', gem: '#e8ecf5' },
  rare: { wood: '#2e5a9a', woodDark: '#1c3a6a', band: '#4fa8ff', bandDark: '#2a6ab8', gem: '#9fe3ff' },
  epic: { wood: '#5a3090', woodDark: '#3a1a60', band: '#c07bff', bandDark: '#7a3ac0', gem: '#f0d0ff' },
  mythic: { wood: '#8a1f45', woodDark: '#5a0f2a', band: '#ff5a8a', bandDark: '#b02a5a', gem: '#ffe0ea' },
  legendary: { wood: '#6a4a12', woodDark: '#44300a', band: '#ffd24a', bandDark: '#b88a10', gem: '#fff6c0' },
};

/** Колір світіння ящика (промінь, частинки, ореол). */
export const CRATE_GLOW: Record<CrateType, string> = {
  common: '#d8e0f0',
  rare: '#4fa8ff',
  epic: '#c07bff',
  mythic: '#ff4f8a',
  legendary: '#ffd24a',
};

type Face = 'side' | 'front' | 'top';
const N = 16;
const cache = new Map<string, string>();

function texture(type: CrateType, face: Face): string {
  const key = `${type}:${face}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pal = CRATE_PALETTE[type];
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };

  // дошки з волокнами
  g.fillStyle = pal.wood;
  g.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const seam = face === 'top' ? x % 5 === 0 : y % 5 === 0;
      if (seam) px(x, y, pal.woodDark);
      else if ((x * 7 + y * 13) % 11 === 0) px(x, y, pal.woodDark);
    }
  }
  // окуті краї (2 пікселі) з темним зовнішнім контуром
  for (let i = 0; i < N; i++) {
    for (const [x, y] of [
      [i, 1],
      [i, N - 2],
      [1, i],
      [N - 2, i],
    ]) px(x, y, pal.band);
    for (const [x, y] of [
      [i, 0],
      [i, N - 1],
      [0, i],
      [N - 1, i],
    ]) px(x, y, pal.bandDark);
  }
  // заклепки по кутах
  for (const [x, y] of [
    [2, 2],
    [N - 3, 2],
    [2, N - 3],
    [N - 3, N - 3],
  ]) px(x, y, pal.gem);

  if (face === 'top') {
    // хрест із металевих смуг на кришці
    for (let i = 2; i < N - 2; i++) {
      px(7, i, pal.band);
      px(8, i, pal.bandDark);
      px(i, 7, pal.band);
      px(i, 8, pal.bandDark);
    }
    px(7, 7, pal.gem);
    px(8, 8, pal.gem);
  }
  if (face === 'front') {
    // замок: пластина + камінь
    for (let y = 2; y <= 7; y++) for (let x = 5; x <= 10; x++) px(x, y, y === 2 || y === 7 || x === 5 || x === 10 ? pal.bandDark : pal.band);
    px(7, 4, pal.gem);
    px(8, 4, pal.gem);
    px(7, 5, pal.gem);
    px(8, 5, '#ffffff');
    // смуга посередині (лінія кришки)
    for (let x = 2; x < N - 2; x++) if (x < 5 || x > 10) px(x, 3, pal.bandDark);
  }
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

const face = (cls: string, url: string): HTMLElement => h('div', { class: `c3-face ${cls}`, style: `background-image:url(${url})` });

/** DOM 3D-ящика. size — довжина ребра в px. Кришку відкриває клас `.open` на корені. */
export function crate3d(type: CrateType, size: number, cls = ''): HTMLElement {
  const side = texture(type, 'side');
  return h(
    'div',
    { class: `crate3d crate-${type} ${cls}`, style: `--s:${size}px;--glow:${CRATE_GLOW[type]}` },
    h('div', { class: 'c3-shadow' }),
    h(
      'div',
      { class: 'c3-body' },
      face('back', side),
      face('left', side),
      face('bottom', side),
      h('div', { class: 'c3-face c3-inner' }),
      face('right', side),
      face('front', texture(type, 'front')),
      h('div', { class: 'c3-lid' }, face('top', texture(type, 'top'))),
    ),
  );
}
