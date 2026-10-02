import type { CrateType } from '../core/server';
import { h } from '../ui/dom';

/**
 * Піксельний 3D-ящик: кожна грань — текстура 24×24, намальована кодом і збільшена без згладжування,
 * а сам ящик — CSS-куб (preserve-3d) з кришкою на шарнірі по задньому верхньому ребру.
 */

interface Palette {
  wood: string;
  woodDark: string;
  woodLight: string;
  metal: string;
  metalDark: string;
  metalLight: string;
  gem: string;
  /** Світло, що пробивається з шпарин (епічні й вище) */
  glow: string | null;
}

export const CRATE_PALETTE: Record<CrateType, Palette> = {
  common: { wood: '#9a6a3a', woodDark: '#5e3c1c', woodLight: '#b98652', metal: '#a8b0c4', metalDark: '#5a6278', metalLight: '#e2e8f4', gem: '#e8ecf5', glow: null },
  rare: { wood: '#2e5a9a', woodDark: '#183462', woodLight: '#4778b8', metal: '#5aa8ff', metalDark: '#1f5aa8', metalLight: '#bfe2ff', gem: '#9fe3ff', glow: null },
  epic: { wood: '#4e2a80', woodDark: '#2c1450', woodLight: '#6a40a4', metal: '#b77bff', metalDark: '#6a2ab8', metalLight: '#ead6ff', gem: '#f6e2ff', glow: '#e2b8ff' },
  mythic: { wood: '#7a1a3c', woodDark: '#440a20', woodLight: '#9a2a52', metal: '#ff5a8a', metalDark: '#a8204e', metalLight: '#ffd0de', gem: '#fff0f4', glow: '#ff9ab8' },
  legendary: { wood: '#2a2236', woodDark: '#16111e', woodLight: '#3e3350', metal: '#ffcf3a', metalDark: '#a8740a', metalLight: '#fff4b8', gem: '#ffffff', glow: '#fff1a8' },
};

/** Колір світіння ящика (промінь, частинки, ореол). */
export const CRATE_GLOW: Record<CrateType, string> = {
  common: '#d8e0f0',
  rare: '#4fa8ff',
  epic: '#c07bff',
  mythic: '#ff4f8a',
  legendary: '#ffd24a',
};

const TIERS: readonly CrateType[] = ['common', 'rare', 'epic', 'mythic', 'legendary'];

type Face = 'side' | 'front' | 'top';
const N = 24;
const cache = new Map<string, string>();

/** Емблема рідкості на замку (відносні пікселі навколо центру). */
const EMBLEMS: Record<CrateType, [number, number][]> = {
  common: [],
  rare: [
    [0, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [0, 2],
  ],
  epic: [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 3],
    [-1, -1],
    [1, -1],
    [-1, 2],
    [1, 2],
    [0, 0],
    [0, 1],
  ],
  mythic: [
    [-3, 1],
    [-2, 1],
    [-1, 1],
    [0, 1],
    [1, 1],
    [2, 1],
    [-2, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
    [-2, 2],
    [-1, 2],
    [0, 2],
    [1, 2],
  ],
  legendary: [
    [0, -2],
    [-1, -1],
    [0, -1],
    [1, -1],
    [-3, 0],
    [-2, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [-2, 2],
    [-1, 2],
    [1, 2],
    [2, 2],
  ],
};

/**
 * Текстура грані: дошки з волокнами, металева рамка з фаскою, L-скоби з заклепками.
 * Рідкісні й вище отримують хрестові розпірки на боках, епічні й вище — світний шов під кришкою,
 * легендарний — темне дерево з золотою філігранню.
 */
function texture(type: CrateType, face: Face): string {
  const key = `${type}:${face}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pal = CRATE_PALETTE[type];
  const tier = TIERS.indexOf(type);
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, col: string) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    g.fillStyle = col;
    g.fillRect(x, y, 1, 1);
  };

  // дошки
  g.fillStyle = pal.wood;
  g.fillRect(0, 0, N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const along = face === 'top' ? x : y;
      const across = face === 'top' ? y : x;
      if (along % 6 === 0) px(x, y, pal.woodDark);
      else if (along % 6 === 1) px(x, y, pal.woodLight);
      else if ((across * 5 + along * 11) % 13 === 0) px(x, y, pal.woodDark);
    }
  }

  // хрестові розпірки на боках
  if (face === 'side' && tier >= 1) {
    for (let i = 3; i < N - 3; i++) {
      px(i, i, pal.metalDark);
      px(i + 1, i, pal.metal);
      px(N - 1 - i, i, pal.metalDark);
      px(N - 2 - i, i, pal.metal);
    }
  }

  // металева рамка з фаскою: світлий верх-ліво, темний низ-право, чорний контур
  for (let i = 0; i < N; i++) {
    for (let d = 1; d < 3; d++) {
      px(i, d, d === 2 ? pal.metalLight : pal.metal);
      px(d, i, d === 2 ? pal.metalLight : pal.metal);
      px(i, N - 1 - d, d === 2 ? pal.metalDark : pal.metal);
      px(N - 1 - d, i, d === 2 ? pal.metalDark : pal.metal);
    }
    px(i, 0, '#0b0a18');
    px(0, i, '#0b0a18');
    px(i, N - 1, '#0b0a18');
    px(N - 1, i, '#0b0a18');
  }

  // кутові скоби у формі L із заклепкою
  const brace = (cx: number, cy: number, sx: number, sy: number) => {
    for (let i = 0; i < 6; i++) {
      px(cx + sx * i, cy, pal.metalLight);
      px(cx, cy + sy * i, pal.metalLight);
      px(cx + sx * i, cy + sy, pal.metal);
      px(cx + sx, cy + sy * i, pal.metal);
    }
    px(cx + sx * 2, cy + sy * 2, pal.gem);
  };
  brace(3, 3, 1, 1);
  brace(N - 4, 3, -1, 1);
  brace(3, N - 4, 1, -1);
  brace(N - 4, N - 4, -1, -1);

  if (face === 'top') {
    // ремені кришки
    for (let i = 3; i < N - 3; i++) {
      px(11, i, pal.metal);
      px(i, 11, pal.metal);
      px(12, i, pal.metalDark);
      px(i, 12, pal.metalDark);
    }
    // медальйон по центру
    for (let y = 9; y <= 14; y++) for (let x = 9; x <= 14; x++) px(x, y, (x + y) % 2 ? pal.metal : pal.metalLight);
    px(11, 11, pal.gem);
    px(12, 12, pal.gem);
    if (pal.glow) {
      px(11, 12, pal.glow);
      px(12, 11, pal.glow);
    }
  }

  if (face === 'front') {
    // шов під кришкою — у рідкісних ящиків із нього б'є світло
    for (let x = 3; x < N - 3; x++) {
      px(x, 6, pal.glow ?? pal.metalDark);
      px(x, 7, pal.metalDark);
    }
    // пластина замка з фаскою
    const cx = 12;
    const cy = 12;
    for (let y = cy - 3; y <= cy + 5; y++) {
      for (let x = cx - 4; x <= cx + 3; x++) {
        const edgeLight = y === cy - 3 || x === cx - 4;
        const edgeDark = y === cy + 5 || x === cx + 3;
        px(x, y, edgeLight ? pal.metalLight : edgeDark ? pal.metalDark : pal.metal);
      }
    }
    if (type === 'common') {
      // проста замкова щілина
      px(cx - 1, cy - 1, '#1a1a24');
      px(cx, cy - 1, '#1a1a24');
      for (let y = cy; y < cy + 3; y++) {
        px(cx - 1, y, '#1a1a24');
        px(cx, y, '#1a1a24');
      }
    } else {
      for (const [dx, dy] of EMBLEMS[type]) px(cx + dx, cy + dy, pal.glow ?? pal.gem);
      px(cx, cy, '#ffffff');
    }
  }

  // легендарний — золота філігрань на боках
  if (type === 'legendary' && face === 'side') {
    for (const [x, y] of [
      [10, 8],
      [13, 8],
      [9, 9],
      [14, 9],
      [9, 14],
      [14, 14],
      [10, 15],
      [13, 15],
    ]) px(x, y, pal.metal);
    px(11, 11, pal.glow!);
    px(12, 12, pal.glow!);
  }

  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Окремий кольоровий "пояс" кришки — тонка смуга металу, видна збоку, щоб кришка мала товщину. */
function lipTexture(type: CrateType): string {
  const key = `${type}:lip`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pal = CRATE_PALETTE[type];
  const c = document.createElement('canvas');
  c.width = N;
  c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = pal.metal;
  g.fillRect(0, 0, N, 4);
  g.fillStyle = pal.metalLight;
  g.fillRect(0, 0, N, 1);
  g.fillStyle = pal.metalDark;
  g.fillRect(0, 3, N, 1);
  g.fillStyle = '#0b0a18';
  g.fillRect(0, 0, 1, 4);
  g.fillRect(N - 1, 0, 1, 4);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

const face = (cls: string, url: string): HTMLElement => h('div', { class: `c3-face ${cls}`, style: `background-image:url(${url})` });

/** DOM 3D-ящика. size — довжина ребра в px. Кришку відкриває клас `.open` на корені. */
export function crate3d(type: CrateType, size: number, cls = ''): HTMLElement {
  const side = texture(type, 'side');
  const lip = lipTexture(type);
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
      h('div', { class: 'c3-lid' }, face('top', texture(type, 'top')), face('lip lip-front', lip), face('lip lip-right', lip), face('lip lip-left', lip)),
    ),
  );
}
