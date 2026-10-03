import type { PlaneId } from '../planes';
import { annulus, both, canopy, dot, ellipse, feather, flicker, missile, mirror, nozzle, pair, poly, rect, rotatePts, shade, sym, type Part } from './shapes';

/**
 * Еволюція вигляду літака по тірах і рівнях — своя для кожного літака.
 *
 * Шари: корпус (палітра літака) → морфи тіру T2..T4 (накопичуються) → обвіси рівня L2..L4 (накопичуються)
 * → піпси тіру (єдине місце, де корпус бере колір тіру) → ефекти (анімації, напівпрозорі "ехо", сяйво).
 * Глобального тінту корпусу немає: літак лишається у своїй палітрі на всіх 16 кроках.
 */

export interface Palette {
  /** Домінантний колір корпусу */
  primary: string;
  /** Деталі та смуги */
  secondary: string;
  /** Світні елементи: ліхтар, вогні, ядро, сяйво T3/T4 */
  accent: string;
}

export interface Morph {
  /** Під корпусом (подовження крил, кільця, опори) */
  under?: Part[];
  /** Поверх корпусу (броня, смуги, ядра) */
  over?: Part[];
}

export interface Evolution {
  palette: Palette;
  /** Морфи для T2, T3, T4 */
  morphs: [Morph, Morph, Morph];
  /** Обвіси для рівнів 2, 3, 4 */
  addons: [Part[], Part[], Part[]];
  /** Анімовані деталі морфів (tier — поточний тір) */
  morphAnim?: (t: number, tier: number) => Part[];
  /** Анімовані деталі обвісів */
  addonAnim?: (t: number, level: number) => Part[];
  /** Напівпрозорий шар ("ехо", фантомні контури) */
  ghost?: (t: number, tier: number) => Part[];
  /** Заміна базової анімації корпусу (фенікс махає більшою кількістю пер) */
  baseAnim?: (t: number, tier: number) => Part[];
  /** Де стоять піпси тіру: перший піксель і крок до наступного */
  pips: { x: number; y: number; dx: number; dy: number };
}

const DARK = '#2a2d38';
const STEEL = '#c9ccd8';

/** Точки по дузі — для анімованих кілець, орбіт і дуг. */
function orbitDots(cx: number, cy: number, rx: number, ry: number, n: number, phase: number, colors: string[], blink = 0): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push(dot(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, colors[(i + blink) % colors.length]));
  }
  return out;
}

/** Мерехтіння між двома кольорами з власною фазою (щоб сусідні вогні не блимали разом). */
const blinkC = (t: number, k: number, a: string, b: string, speed = 8) => (Math.floor(t * speed + k) % 2 === 0 ? a : b);

// ---------- 1. Сокіл: синій класичний винищувач ----------

const falcon: Evolution = {
  palette: { primary: '#2f7bff', secondary: '#dfe8ff', accent: '#6fc6ff' },
  morphs: [
    // T2: подовжені кінці крил зі стабілізаторами
    {
      under: [...both([-27, 7, -33.5, 4, -33.5, 16, -27, 15], shade('#2f7bff', -0.15)), ...both([-34, 6, -31.5, -4, -29.5, 6], shade('#2f7bff', -0.3))],
      over: both([-33.5, 13, -27.5, 13, -27.5, 15, -33.5, 16], '#dfe8ff', true),
    },
    // T3: кільце форсажної камери навколо сопла + другий ряд вогнів
    {
      under: [ellipse(0, 30, 7, 4, '#5a6680'), ellipse(0, 30, 4.4, 2.4, '#ff9a3c', true)],
      over: both([-21.5, 10, -19, 10, -19, 12.4, -21.5, 12.4], '#dfe8ff', true),
    },
    // T4: подвійна дельта з білим кантом
    {
      under: [...both([-5, 4, -31, 22, -26, 25.5, -5, 21], shade('#2f7bff', -0.25)), ...both([-31, 22, -26, 25.5, -25, 27.4, -32.5, 23.6], '#ffffff', true)],
    },
  ],
  addons: [
    // L2: закрилки на задній кромці
    both([-25, 13.5, -12, 12.5, -12, 15.2, -25, 16.2], shade('#2f7bff', -0.4)),
    // L3: внутрішня пара ракет з жовтими боєголовками
    [...missile(-11, 0, 9, '#ffd24a'), ...missile(11, 0, 9, '#ffd24a')],
    // L4: антена та хвостовий ліхтар
    [rect(-0.9, 30, 1.8, 4.4, '#dfe8ff', true)],
  ],
  morphAnim: (t, tier) => (tier >= 3 ? [dot(-20.3, 11.2, blinkC(t, 1, '#ffffff', '#6fc6ff')), dot(20.3, 11.2, blinkC(t, 0, '#ffffff', '#6fc6ff'))] : []),
  addonAnim: (t, level) => (level >= 4 ? [dot(0, 34, blinkC(t, 0, '#ff3030', '#601010', 4))] : []),
  pips: { x: 0, y: 3, dx: 0, dy: 3.6 },
};

// ---------- 2. Фантом: рожеве летюче крило ----------

const phantom: Evolution = {
  palette: { primary: '#e0308e', secondary: '#7a1850', accent: '#c070ff' },
  morphs: [
    // T2: глибша "пилка" й світлі прожилки
    {
      under: [...both([-27, 11, -25, 18.5, -21.5, 10], shade('#e0308e', -0.2)), ...both([-16, 13, -13.5, 20, -11, 11.5], shade('#e0308e', -0.2))],
      over: both([-6, -11, -25, 6, -23.6, 8, -6, -8], '#f7a8d4', true),
    },
    // T3: фантомні "ехо-крила" (напівпрозорий шар) + темні гондоли з фіолетовими кромками
    { under: both([-29, 7, -34, 10.5, -27, 13.5], '#ffb0e0', true), over: both([-9.6, 13, -4.4, 13, -4.4, 15, -9.6, 15], '#c070ff', true) },
    // T4: крило розколюється на два півкрила, між ними пульсує ядро
    {
      over: [...both([-13.5, -2, -16, -2, -21, 8.5, -18.5, 9], '#2a0a20', true), ellipse(0, 1, 3.4, 3.8, '#7a28d0'), ellipse(0, 1, 1.9, 2.2, '#e0a0ff', true)],
    },
  ],
  addons: [
    // L2: випромінювачі фазових іскор на задній кромці
    [ellipse(-22, 10.5, 2, 2.6, '#ffc2ef', true), ellipse(22, 10.5, 2, 2.6, '#ffc2ef', true)],
    // L3: підкрилкові ножі
    both([-10.5, -3, -17, -18, -13.5, -2], '#c070ff'),
    // L4: кільця ехо-вогнів за соплами
    [...both([-9.6, 15, -12, 20.5, -7, 16.5], '#c070ff', true), ...both([-9, 16, -5, 16, -5, 18, -9, 18], '#7a1850', true)],
  ],
  morphAnim: (t, tier) => {
    if (tier < 4) return [];
    const on = Math.sin(t * 6) > 0;
    return [ellipse(0, 1, on ? 2.4 : 1.6, on ? 2.8 : 1.9, on ? '#ffffff' : '#e0a0ff', true)];
  },
  addonAnim: (t, level) => {
    const out: Part[] = [];
    if (level >= 2) out.push(dot(-22, 12, blinkC(t, 0, '#ffc2ef', '#ff3fa4', 10)), dot(22, 12, blinkC(t, 1, '#ffc2ef', '#ff3fa4', 10)));
    if (level >= 4) out.push(dot(-7, 19.6, blinkC(t, 0, '#ff6ad0', '#c070ff', 6)), dot(7, 19.6, blinkC(t, 1, '#ff6ad0', '#c070ff', 6)));
    return out;
  },
  ghost: (t, tier) => {
    if (tier < 3) return [];
    const k = 2.5 + Math.sin(t * 3) * 1.2;
    const tip = [-30, 8, -26, 12, -19, 8, -15, 0];
    const shifted = tip.map((v, i) => (i % 2 === 0 ? v - k : v + k * 1.4));
    return [poly(shifted, '#ff7ad0', true), poly(mirror(shifted), '#ff7ad0', true)];
  },
  pips: { x: -9.5, y: 5, dx: -3.6, dy: 0 },
};

// ---------- 3. Блискавка: червоний гоночний ----------

const blaze: Evolution = {
  palette: { primary: '#e8361a', secondary: '#ffd23a', accent: '#ff8a1f' },
  morphs: [
    // T2: носові шпильки й вогняні смуги-плавці по боках
    {
      under: [...both([-3, -12, -5.6, -30, -1.4, -17], '#ffd23a', true), ...both([-4.2, 0, -7, 10, -4.2, 20], '#ff8a1f', true)],
    },
    // T3: таранний наконечник і леза перед кабіною
    {
      over: [poly([0, -34.5, -3.2, -28.5, -2, -25, 2, -25, 3.2, -28.5], STEEL), ...both([-3.6, -23, -9.5, -19, -3.6, -15.5], STEEL)],
    },
    // T4: бронейований ніс із розжареним кінцем і полум'яні крильця за соплом
    {
      under: both([-2, 29, -8.5, 34.5, -4, 33.5], '#ff8a1f', true),
      over: [poly(sym([0, -33, -3.4, -27, -4.4, -20, -4.4, -11]), '#8a8fa0'), ellipse(0, -32.4, 1.8, 2, '#ffe27a', true)],
    },
  ],
  addons: [
    // L2: теплові ребра на крилах
    both([-9, 0, -20, 5, -20, 7.4, -9, 2.6], '#ffd23a', true),
    // L3: подвійні ракети ближче до кінців крил
    [...missile(-20, 1, 9, '#ffd23a'), ...missile(20, 1, 9, '#ffd23a')],
    // L4: підкрилкові форсажні сопла
    [nozzle(-8, 12, 3.6, 4.4), nozzle(8, 12, 3.6, 4.4)],
  ],
  morphAnim: (t, tier) => (tier >= 4 ? [dot(0, -33, blinkC(t, 0, '#ffffff', '#ffd23a', 12)), flicker(-6, 33.4, 2, 1.8, t, '#ffd23a', '#ff5a1f'), flicker(6, 33.4, 2, 1.8, t + 0.05, '#ffd23a', '#ff5a1f')] : []),
  addonAnim: (t, level) => (level >= 4 ? [flicker(-8, 15, 2.2, 1.8, t, '#ffd23a', '#ff8a1f'), flicker(8, 15, 2.2, 1.8, t + 0.04, '#ffd23a', '#ff8a1f')] : []),
  pips: { x: 0, y: 6, dx: 0, dy: 3.6 },
};

// ---------- 4. Оса: жовто-чорна ----------

const WASP_Y = '#f5c518';
const WASP_K = '#1a1a22';

const wasp: Evolution = {
  palette: { primary: WASP_Y, secondary: WASP_K, accent: '#cfeeff' },
  morphs: [
    // T2: довше жало й додаткові чорні смуги на грудях
    {
      under: [poly([0, 34.5, -2, 27, 2, 27], WASP_K, true)],
      over: [rect(-5.6, -8.6, 11.2, 2, WASP_K, true), rect(-6, -3.4, 12, 2, WASP_K, true)],
    },
    // T3: багатошарові слюдяні крила з прожилками й антени
    {
      under: [...both([-3, -6, -27, -27, -32.5, -20, -5, 0], '#a8d8f0', true), ...both([-3, 7, -25, 25, -20, 29.5, -3, 15], '#a8d8f0', true)],
      over: [...both([-6, -5, -26, -20, -25, -18, -6, -3], '#ffffff', true), ...both([-2, -21, -6.5, -30.5, -4.6, -31, -1, -22], WASP_K, true)],
    },
    // T4: кріплення для дронів-осят (самі дрони кружляють в анімації)
    { over: both([-6.2, 9, -9, 9, -9, 11, -6.2, 11], WASP_K, true) },
  ],
  addons: [
    // L2: отруйні залози з боків черевця
    [ellipse(-5.8, 20, 1.9, 2.8, '#7adc3a'), ellipse(5.8, 20, 1.9, 2.8, '#7adc3a')],
    // L3: зубчасті передні кромки крил
    [...both([-10, -12, -12.5, -16, -13.5, -11], WASP_K, true), ...both([-18, -17, -20.5, -21, -21.5, -16], WASP_K, true)],
    // L4: крапля отрути на жалі
    [ellipse(0, 31.5, 1.7, 1.7, '#7adc3a', true)],
  ],
  morphAnim: (t, tier) => {
    if (tier < 4) return [];
    // два дрони-осята кружляють навколо
    const out: Part[] = [];
    for (let i = 0; i < 2; i++) {
      const a = t * 2.6 + i * Math.PI;
      const x = Math.cos(a) * 29;
      const y = 4 + Math.sin(a) * 26;
      out.push(ellipse(x, y, 2, 2.4, WASP_Y, true), dot(x, y + 1, WASP_K), dot(x - 2, y - 1.6, blinkC(t, i, '#ffffff', '#cfeeff', 14)), dot(x + 2, y - 1.6, blinkC(t, i + 1, '#ffffff', '#cfeeff', 14)));
    }
    return out;
  },
  addonAnim: (t, level) => (level >= 4 ? [dot(0, 34, blinkC(t, 0, '#b8ff7a', '#3a8a1a', 5))] : []),
  pips: { x: -4, y: 14.6, dx: 3.6, dy: 0 },
};

// ---------- 5. Колектор: бірюзовий вантажник ----------

const MAG = '#e03a3a';

const collector: Evolution = {
  palette: { primary: '#18b8a2', secondary: '#3a8cd8', accent: '#7adcff' },
  morphs: [
    // T2: більші магніти, видно мідні котушки
    {
      over: [
        ...pair((s) => [rect(s < 0 ? -28.2 : 19.8, -20.5, 2.4, 6.5, MAG), rect(s < 0 ? -21.6 : 26.2, -20.5, 2.4, 6.5, MAG), rect(s < 0 ? -28.2 : 19.8, -21, 8.4, 2.4, MAG)]),
        ...pair((s) => [rect(s < 0 ? -28.4 : 18.6, -11.5, 9.8, 1.8, '#c8a040', true), rect(s < 0 ? -28.4 : 18.6, -8, 9.8, 1.8, '#c8a040', true)]),
      ],
    },
    // T3: малі магніти на пілонах (дуга притягання — в анімації)
    { over: pair((s) => [rect(s * 12 - 2.1, -7.8, 1.8, 3.4, MAG), rect(s * 12 + 0.3, -7.8, 1.8, 3.4, MAG), rect(s * 12 - 2.1, -8.4, 4.2, 1.8, MAG)]) },
    // T4: основа гравітаційного кільця (кільце обертається в анімації)
    { over: [annulus(0, 6, 15, 15, 13, 13, '#2a6a8a')] },
  ],
  addons: [
    // L2: магніти-"сережки" на капсулах
    [ellipse(-30.6, 6, 1.9, 2.8, MAG), ellipse(30.6, 6, 1.9, 2.8, MAG)],
    // L3: вантажні контейнери на нижній балці
    pair((s) => [rect(s < 0 ? -17 : 10, 10.5, 7, 5.4, '#c8a040'), rect(s < 0 ? -17 : 10, 12.4, 7, 1.8, '#7a5a20', true)]),
    // L4: індикатор рівня здобичі на корпусі
    [rect(-1.8, 2, 3.6, 15, '#0a1f1f', true), rect(-1.8, 10, 3.6, 7, '#4fe08a', true)],
  ],
  morphAnim: (t, tier) => {
    const out: Part[] = [];
    if (tier >= 3) {
      // дуга притягання між капсулами: точки біжать від однієї до іншої
      for (let i = 0; i < 7; i++) {
        const k = (i / 7 + t * 0.6) % 1;
        const x = -23.5 + 47 * k;
        const y = -21 - Math.sin(k * Math.PI) * 11;
        out.push(dot(x, y, i % 2 ? '#7adcff' : '#ffffff'));
      }
    }
    if (tier >= 4) out.push(...orbitDots(0, 6, 14, 14, 10, t * 2.2, ['#7adcff', '#ffffff']));
    return out;
  },
  addonAnim: (t, level) => (level >= 4 ? [dot(0, 9, blinkC(t, 0, '#b8ffd0', '#4fe08a', 4))] : []),
  pips: { x: -4, y: -9, dx: 3.6, dy: 0 },
};

// ---------- 6. Стриж: білий перехоплювач ----------

const SW = '#dfe6f2';
const SW_B = '#1ec0ec';

const swift: Evolution = {
  palette: { primary: SW, secondary: SW_B, accent: '#2ad0ff' },
  morphs: [
    // T2: довші передні кермà з блакитним ребром
    { under: [...both([-3, -15.5, -17, -22, -17, -16.5, -3, -10], shade(SW, -0.12)), ...both([-17, -22, -17, -16.5, -14.8, -17, -14.8, -21], SW_B, true)] },
    // T3: ще сильніша стрілоподібність (кінці крил уперед) і голчасті обтічники біля носа
    { under: [...both([-25.5, -8.5, -32, -16.5, -30, -4.5], SW), ...both([-1.4, -24, -3.6, -33, -0.4, -26], SW_B, true)] },
    // T4: ніс-голка й сяючі ребра на крилах
    { over: [rect(-0.9, -35.5, 1.8, 6, '#ffffff', true), ...both([-6, 7, -24.5, -7.5, -24.5, -5.2, -6, 9.4], '#7fe8ff', true)] },
  ],
  addons: [
    // L2: блакитні кінці кілів
    both([-9.5, 25.5, -13.5, 32, -8.6, 31], SW_B, true),
    // L3: обтічники-контейнери під крилами
    [ellipse(-14, 5, 2.2, 5.4, '#8a96b0'), ellipse(14, 5, 2.2, 5.4, '#8a96b0'), dot(-14, 0.4, SW_B), dot(14, 0.4, SW_B)],
    // L4: дві малі форсажні камери біля основного сопла
    [nozzle(-3.6, 28.6, 2.2, 3), nozzle(3.6, 28.6, 2.2, 3)],
  ],
  morphAnim: (t, tier) => (tier >= 4 ? [dot(0, -35.2, blinkC(t, 0, '#ffffff', '#2ad0ff', 6)), dot(-15, 0.6, blinkC(t, 0, '#ffffff', '#7fe8ff', 3)), dot(15, 0.6, blinkC(t, 1, '#ffffff', '#7fe8ff', 3))] : []),
  addonAnim: (t, level) => (level >= 4 ? [flicker(-3.6, 30.6, 1.8, 1.8, t, '#c8f8ff', '#2ad0ff'), flicker(3.6, 30.6, 1.8, 1.8, t + 0.03, '#c8f8ff', '#2ad0ff')] : []),
  pips: { x: 0, y: 2, dx: 0, dy: 3.6 },
};

// ---------- 7. Титан: золотий ганшип ----------

const GOLD = '#d2a034';

const titan: Evolution = {
  palette: { primary: GOLD, secondary: '#5c4a28', accent: '#ffb347' },
  morphs: [
    // T2: броньові "щоки" біля кабіни
    { over: [...both([-5, -24.5, -10.5, -20.5, -10.5, -11.5, -5, -11], '#6a5228'), dot(-8.4, -18, '#ffd27a'), dot(8.4, -18, '#ffd27a'), dot(-8.4, -14.4, '#ffd27a'), dot(8.4, -14.4, '#ffd27a')] },
    // T3: подвійні стволи на кінцях крил і бронеклапан над кабіною з візором
    {
      under: [rect(-25, -16, 3.4, 16, '#b8bcc8'), rect(21.6, -16, 3.4, 16, '#b8bcc8'), rect(-25, -17, 3.4, 2, DARK, true), rect(21.6, -17, 3.4, 2, DARK, true)],
      over: [poly(sym([0, -24, -4.8, -21.5, -4.8, -14.5]), '#8a6a24'), rect(-3.2, -19.5, 6.4, 1.8, '#ffb347', true)],
    },
    // T4: бронеплити на крилах і щитовий емітер на носі
    {
      over: [...both([-14, 0, -26.5, 4, -26.5, 14.5, -14, 17], '#b8862a'), ...pair((s) => [dot(s * 17, 4, '#5c4a28'), dot(s * 23, 12, '#5c4a28')]), ellipse(0, -29.5, 3.2, 2.4, '#7fd8ff')],
    },
  ],
  addons: [
    // L2: бронещитки на гарматах
    [rect(-29.6, -2.5, 4.8, 4, '#5c4a28'), rect(24.8, -2.5, 4.8, 4, '#5c4a28')],
    // L3: ракетні касети під крилами
    pair((s) => [rect(s < 0 ? -21 : 16, 7, 5, 6.4, '#3a3a44'), dot(s * 17.4, 8.6, '#ff3a3a'), dot(s * 19.6, 8.6, '#ff3a3a')]),
    // L4: спинна башточка
    [ellipse(0, 10, 3.4, 3.4, '#9aa0b0'), rect(-0.9, 2.5, 1.8, 6, DARK, true)],
  ],
  morphAnim: (t, tier) => (tier >= 4 ? orbitDots(0, -29.5, 4.4, 3.4, 6, t * 3, ['#bff0ff', '#7fd8ff'], Math.floor(t * 6)) : []),
  pips: { x: -1.8, y: 22, dx: 3.6, dy: 0 },
};

// ---------- 8. Хронос: кільцеве крило ----------

const CHR = '#7a34e8';
/** Корпус хроноса поверх нових кілець (щоб кільця були позаду фюзеляжу). */
const chronosHull = (): Part[] => [poly(sym([0, -31, -2.8, -22, -4, -6, -4, 24, -2.6, 29]), '#c9cadc'), nozzle(0, 28.5, 4.6, 2.6), ...canopy(0, -16, 2.6, 6.5, '#3ae0f0')];

const chronos: Evolution = {
  palette: { primary: CHR, secondary: '#c9cadc', accent: '#3ae0f0' },
  morphs: [
    // T2: друге, внутрішнє кільце
    { over: [annulus(0, 4, 14.5, 10.8, 12, 8.6, shade(CHR, -0.25)), ...chronosHull()] },
    // T3: "годинникові" риски по зовнішньому кільцю
    {
      over: Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return dot(Math.cos(a) * 21.7, 4 + Math.sin(a) * 17.7, '#2a1060');
      }).filter((_, i) => i % 3 !== 0),
    },
    // T4: третє кільце-орбіта й пісочний годинник у центрі
    {
      under: [annulus(0, 4, 31, 27, 28.6, 24.6, shade(CHR, 0.15))],
      over: [poly([-3.4, -0.5, 3.4, -0.5, 0, 4], '#ffd24a', true), poly([0, 4, -3.4, 8.5, 3.4, 8.5], '#ffd24a', true)],
    },
  ],
  addons: [
    // L2: маятники-противаги з боків кільця
    [ellipse(-28, 4, 2.6, 3.6, '#e8e8f4'), ellipse(28, 4, 2.6, 3.6, '#e8e8f4'), dot(-28, 4, CHR), dot(28, 4, CHR)],
    // L3: кристали часу на перемичках
    [ellipse(-11, 4, 1.8, 2.8, '#3ae0f0', true), ellipse(11, 4, 1.8, 2.8, '#3ae0f0', true)],
    // L4: шестерня на верху кільця
    [ellipse(0, -17.2, 3.4, 3, '#b8bccc'), dot(0, -17.2, DARK), dot(-3.6, -17.2, '#b8bccc'), dot(3.6, -17.2, '#b8bccc')],
  ],
  morphAnim: (t, tier) => {
    const out: Part[] = [];
    // внутрішнє кільце обертається в протифазі до зовнішнього
    if (tier >= 3) out.push(...orbitDots(0, 4, 13.2, 9.7, 6, -t * 2.4, ['#c08aff', '#ffffff']));
    if (tier >= 4) {
      out.push(...orbitDots(0, 4, 29.8, 25.8, 5, t * 0.9, ['#9affff']));
      out.push(dot(0, Math.floor(t * 3) % 2 ? 1.5 : 6.5, '#fff6c8'));
    }
    return out;
  },
  addonAnim: (t, level) => (level >= 4 ? [dot(Math.cos(t * 4) * 2.2, -17.2 + Math.sin(t * 4) * 2, '#ffd24a')] : []),
  pips: { x: 0, y: 12, dx: 0, dy: 3.6 },
};

// ---------- 9. Гадюка: зелений мисливець ----------

const VG = '#3fae3a';

const viper: Evolution = {
  palette: { primary: VG, secondary: '#1d4a1b', accent: '#b8ff7a' },
  morphs: [
    // T2: ікла на носі й луска на корпусі
    {
      under: both([-2, -25, -4.6, -30, -2.8, -22], '#f0fff0', true),
      over: [dot(-2, 0, '#2a7a28'), dot(2, 3.6, '#2a7a28'), dot(-2, 7.2, '#2a7a28'), dot(2, 10.8, '#2a7a28'), dot(-2, 14.4, '#2a7a28')],
    },
    // T3: "капюшон кобри" біля кабіни з плямами-очима
    {
      under: both([-3.6, -21, -13.5, -17, -14, -7.5, -4, -6], shade(VG, -0.15)),
      over: [ellipse(-9.6, -13, 1.9, 1.9, '#b8ff7a', true), ellipse(9.6, -13, 1.9, 1.9, '#b8ff7a', true)],
    },
    // T4: хвіст-жало й світні жилки
    {
      under: [poly([0, 34.5, -2.4, 27.5, 0, 29, 2.4, 27.5], '#1d4a1b')],
      over: both([-6, 0, -22, 13.6, -22, 15.8, -6, 2.4], '#b8ff7a', true),
    },
  ],
  addons: [
    // L2: баки з отрутою під крилами
    [ellipse(-12.5, 9, 2, 4, '#b8ff7a'), ellipse(12.5, 9, 2, 4, '#b8ff7a')],
    // L3: зубчасті кромки канардів
    both([-10.5, -11.5, -13, -14.5, -12, -9], '#1d4a1b', true),
    // L4: роздвоєний язик-антена
    [rect(-0.9, -35.5, 1.8, 3, '#ff3a5a', true), dot(-1.6, -35.6, '#ff3a5a'), dot(1.6, -35.6, '#ff3a5a')],
  ],
  morphAnim: (t, tier) => (tier >= 4 ? [dot(-14, 8, blinkC(t, 0, '#eaffc8', '#b8ff7a', 5)), dot(14, 8, blinkC(t, 1, '#eaffc8', '#b8ff7a', 5)), dot(0, 33, blinkC(t, 0, '#b8ff7a', '#3fae3a', 6))] : []),
  pips: { x: 0, y: 17, dx: 0, dy: -3.6 },
};

// ---------- 10. Грім: ударна дельта ----------

const TB = '#2a62e0';
const BOLT = '#ffd23a';

const thunder: Evolution = {
  palette: { primary: TB, secondary: BOLT, accent: '#9ad8ff' },
  morphs: [
    // T2: довші блискавки — до самих кінців крил
    { over: both([-19, 21, -26.5, 23, -22.5, 18, -18.5, 17], BOLT, true) },
    // T3: реактор виступає, котушки Тесли на кінцях крил
    {
      under: [rect(-8.6, 16, 17.2, 11.5, '#6f7688')],
      over: pair((s) => [rect(s < 0 ? -29.6 : 26.6, 13, 3, 7, '#c8a040'), ellipse(s * 28.1, 12, 2.2, 2.2, '#9ad8ff')]),
    },
    // T4: відкритий реактор (дуги — в анімації)
    { over: [rect(-4.6, 16, 9.2, 9.2, '#1a2440', true), ellipse(0, 20.5, 3.2, 3.2, '#9ad8ff', true)] },
  ],
  addons: [
    // L2: громовідводи на передніх кромках
    [rect(-12.5, -7, 1.8, 4.4, '#c8e8ff', true), rect(10.7, -7, 1.8, 4.4, '#c8e8ff', true)],
    // L3: конденсатори під крилами з жовтою смугою
    pair((s) => [rect(s < 0 ? -18 : 14, 7, 4, 7, '#4a5a88'), rect(s < 0 ? -18 : 14, 9.6, 4, 1.8, BOLT, true)]),
    // L4: антени-розрядники позаду
    both([-8, 22, -11.5, 30.5, -9.4, 31, -6.4, 23], '#c8e8ff'),
  ],
  morphAnim: (t, tier) => {
    const out: Part[] = [];
    if (tier >= 3) out.push(dot(-28.1, 12, blinkC(t, 0, '#ffffff', '#9ad8ff', 16)), dot(28.1, 12, blinkC(t, 1, '#ffffff', '#9ad8ff', 16)));
    if (tier >= 4) {
      out.push(ellipse(0, 20.5, 1.8, 1.8, blinkC(t, 0, '#ffffff', '#c8f0ff', 18), true));
      // електродуги: ламана від котушки до корпусу, що щоразу інша
      const seed = Math.floor(t * 12);
      for (const s of [-1, 1]) {
        for (let i = 1; i < 6; i++) {
          const k = i / 6;
          const j = Math.sin(seed * 9.1 + i * 3.7 + s) * 2.2;
          out.push(dot(s * (28 - 22 * k), 12 + 6 * k + j, i % 2 ? '#c8f0ff' : '#ffffff'));
        }
      }
    }
    return out;
  },
  addonAnim: (t, level) => (level >= 4 && Math.floor(t * 9) % 3 === 0 ? [dot(-11, 31.4, '#ffffff'), dot(11, 31.4, '#ffffff')] : []),
  pips: { x: 0, y: -2, dx: 0, dy: 3.6 },
};

// ---------- 11. Бастіон: летюча фортеця ----------

const BST = '#7a8296';
const BOR = '#e8742a';

const bastion: Evolution = {
  palette: { primary: BST, secondary: BOR, accent: '#ffb070' },
  morphs: [
    // T2: бронеблоки на пілонах із заклепками
    { over: [rect(-33.5, -10, 7.4, 6.4, '#3a3e4a'), rect(26.1, -10, 7.4, 6.4, '#3a3e4a'), dot(-31.6, -7, '#ffb070'), dot(-28.4, -7, '#ffb070'), dot(31.6, -7, '#ffb070'), dot(28.4, -7, '#ffb070')] },
    // T3: турелі по краях крил
    { over: pair((s) => [ellipse(s * 24.5, 12, 3.6, 3.6, '#3a3e4a'), rect(s * 24.5 - 0.9, 2, 1.8, 8, DARK, true), dot(s * 24.5, 2, BOR), dot(s * 24.5, 12, BOR)]) },
    // T4: надбудова-"фортеця" з зубцями й помаранчеві смуги (світяться в анімації)
    {
      over: [rect(-5, -1, 10, 10, '#8a92a6'), dot(-4, -2.5, '#8a92a6'), dot(0, -2.5, '#8a92a6'), dot(4, -2.5, '#8a92a6'), rect(-2, 2, 4, 3, '#2a2d38', true), rect(-12, 14.4, 24, 1.8, BOR, true)],
    },
  ],
  addons: [
    // L2: помаранчеві броньовані передні кромки
    both([-12, -9.5, -28.5, -3.5, -28.5, -1.4, -12, -7], BOR, true),
    // L3: курсові гармати
    [rect(-20.5, -13, 2, 8, DARK, true), rect(18.5, -13, 2, 8, DARK, true)],
    // L4: щогла з прапором на хвості
    [rect(-0.9, 25, 1.8, 9, STEEL, true), rect(0.9, 25, 5.4, 3.6, BOR, true)],
  ],
  morphAnim: (t, tier) => (tier >= 4 ? [rect(-12, 14.4, 24, 1.8, blinkC(t, 0, '#ffb070', '#ffe0b8', 3), true), rect(-7, 8, 14, 2, blinkC(t, 1, '#ff9a3a', '#ffd0a0', 3), true)] : []),
  addonAnim: (t, level) => (level >= 4 ? [dot(6.6, 26.8, blinkC(t, 0, BOR, '#ffb070', 5))] : []),
  pips: { x: -5.4, y: -12, dx: 3.6, dy: 0 },
};

// ---------- 12. НЛО: тарілка ----------

const UG = '#3ad478';

const ufo: Evolution = {
  palette: { primary: '#a9b2c4', secondary: '#4e5568', accent: UG },
  morphs: [
    // T2: більший купол (другий ряд вогнів — в анімації)
    { over: [annulus(0, 0, 22, 22, 19.5, 19.5, '#5a6278'), ellipse(0, 0, 14, 14, UG), dot(-4, -4.5, '#ffffff'), dot(-2.4, -6.2, '#c8ffd8'), ellipse(0, 1.5, 3.2, 4, '#123018', true)] },
    // T3: тягач-випромінювач на краю днища
    { under: [poly([-5.4, 25, 5.4, 25, 0, 34.5], '#4e5568')], over: [ellipse(0, 29.5, 2, 2, '#7affb0', true)] },
    // T4: основа мікро-кільця (вогні обертаються в анімації)
    { under: [annulus(0, 0, 34, 34, 32, 32, '#4e5568')] },
  ],
  addons: [
    // L2: сенсорна антена на ободі
    [rect(-0.9, -35, 1.8, 7, '#d8dce8', true), ellipse(0, -34, 1.8, 1.8, '#ff3030', true)],
    // L3: посадкові опори
    [...both([-24, 16, -33.5, 21, -32, 24, -22.5, 19], '#4e5568'), rect(-34.4, 22, 4, 2.4, '#d8dce8', true), rect(30.4, 22, 4, 2.4, '#d8dce8', true)],
    // L4: плазмові гармати по боках
    pair((s) => [rect(s < 0 ? -34 : 28.6, -4, 5.4, 6, '#5a6070'), dot(s * 33, -1, UG)]),
  ],
  morphAnim: (t, tier) => {
    const out: Part[] = [];
    if (tier >= 2) out.push(...orbitDots(0, 0, 20.5, 20.5, 10, t * 1.6, ['#ffffff', UG], Math.floor(t * 5)));
    if (tier >= 3) for (let i = 0; i < 2; i++) out.push(dot(0, 31.5 + i * 1.8, blinkC(t, i, '#c8ffd8', UG, 10)));
    if (tier >= 4) out.push(...orbitDots(0, 0, 33, 33, 8, -t * 1.3, ['#ffd23a', '#ff4a4a', '#5af0ff']));
    return out;
  },
  addonAnim: (t, level) => (level >= 2 ? [dot(0, -34.6, blinkC(t, 0, '#ff3030', '#601010', 3))] : []),
  pips: { x: -5.4, y: -15.5, dx: 3.6, dy: 0 },
};

// ---------- 13. Нова: зоряний перехоплювач ----------

const NV = '#7a4ae8';

const nova: Evolution = {
  palette: { primary: NV, secondary: '#e8eeff', accent: '#ffd8ff' },
  morphs: [
    // T2: зоряний хрест навколо ядра
    { over: [rect(-0.9, -6, 1.8, 22, '#ff9af0', true), rect(-11, 4.1, 22, 1.8, '#ff9af0', true), dot(-11.6, 5, '#ffffff'), dot(11.6, 5, '#ffffff')] },
    // T3: крила розкриваються "пелюстками"
    {
      over: [poly(rotatePts(feather(16, 3.8), -5, 14, 2.55), '#c8a8ff', true), poly(mirror(rotatePts(feather(16, 3.8), -5, 14, 2.55)), '#c8a8ff', true)],
    },
    // T4: ядро — мініатюрна зірка (шлейф комети — в анімації)
    { over: [poly([0, -1.5, 1.6, 3.4, 6, 5, 1.6, 6.6, 0, 11.5, -1.6, 6.6, -6, 5, -1.6, 3.4], '#fff6ff', true)] },
  ],
  addons: [
    // L2: зоряні кристали на кінцях крил
    both([-28, -12, -26.2, -8.5, -28, -5, -29.8, -8.5], '#c8a8ff', true),
    // L3: кільця-стабілізатори на хвостових крилах
    pair((s) => [ellipse(s * 15, 24.8, 2.4, 2.4, '#e8eeff'), dot(s * 15, 24.8, NV)]),
    // L4: зірочки-супутники біля носа
    [ellipse(-9, -18, 1.8, 1.8, '#ffd8ff', true), ellipse(9, -18, 1.8, 1.8, '#ffd8ff', true)],
  ],
  morphAnim: (t, tier) => {
    if (tier < 4) return [];
    const out: Part[] = [];
    // шлейф-комета: пікселі, що біжать назад
    for (let i = 0; i < 4; i++) {
      const k = (t * 2 + i / 4) % 1;
      out.push(dot(Math.sin(i * 2.1 + t * 3) * 2, 30 + k * 5, k < 0.5 ? '#ffffff' : '#c8a8ff'));
    }
    out.push(dot(0, 5, blinkC(t, 0, '#ffffff', '#ffd8ff', 7)));
    return out;
  },
  addonAnim: (t, level) => (level >= 4 ? [dot(-9, -18, blinkC(t, 0, '#ffffff', '#c8a8ff', 4)), dot(9, -18, blinkC(t, 1, '#ffffff', '#c8a8ff', 4))] : []),
  pips: { x: -1.8, y: 20, dx: 3.6, dy: 0 },
};

// ---------- 14. Фенікс: вогняний птах ----------

const PHOENIX_WING_COLORS = ['#d8301a', '#e8501a', '#ff6a1f', '#ff8a1f', '#ffb24a', '#ffe27a', '#ffe27a', '#fff3b0'];
const PHOENIX_HOT = ['#ff5a1f', '#ff8a1f', '#ffb24a', '#ffe27a', '#fff3b0', '#ffffff', '#ffffff', '#ffffff'];

/** Крила фенікса: T1 — 6 пер, з T2 — 8; на T4 пера розпечені й з них летять жарини. */
function phoenixWings(t: number, tier: number): Part[] {
  const flap = Math.sin(t * 6);
  const n = tier >= 2 ? 8 : 6;
  const colors = tier >= 4 ? PHOENIX_HOT : PHOENIX_WING_COLORS;
  const pts: Part[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + 0.46 - i * (n === 8 ? 0.2 : 0.24) + flap * 0.1;
      const len = 31 - i * (n === 8 ? 2 : 2.6);
      const halfW = 3.4 - i * 0.22;
      const rotated = rotatePts(feather(len, halfW), 0, 0, a);
      const scaleX = s * (0.88 + flap * 0.12);
      const world: number[] = [];
      for (let j = 0; j < rotated.length; j += 2) world.push(rotated[j] * scaleX + 3.5 * s, rotated[j + 1] - 6);
      pts.push(poly(world, colors[Math.min(i, colors.length - 1)], true));
    }
    if (tier >= 4) {
      for (let e = 0; e < 3; e++) {
        const k = (t * 1.5 + e / 3 + (s > 0 ? 0.5 : 0)) % 1;
        pts.push(dot(s * (18 + k * 14), -10 + e * 5 - k * 8, k < 0.5 ? '#ffe27a' : '#ff5a1f'));
      }
    }
  }
  return pts;
}

const phoenix: Evolution = {
  palette: { primary: '#e8501a', secondary: '#ffd23a', accent: '#fff3b0' },
  morphs: [
    // T2: більше пер у крилах (у baseAnim) + яскраве оперення грудей
    { over: [ellipse(0, 2, 3, 6, '#ff8a1f', true)] },
    // T3: корона з трьох язиків полум'я й довший хвіст
    {
      under: [-0.16, 0.16].map((a) => poly(rotatePts(feather(25, 2.6), 0, 11, Math.PI / 2 + a), '#ffb24a', true)),
      over: [...both([-3, -19.5, -7.5, -27.5, -4.6, -18.5], '#ffd23a', true)],
    },
    // T4: вогняні крила (у baseAnim) + розпечене ядро
    { over: [ellipse(0, -2, 2.2, 3.6, '#fff3b0', true)] },
  ],
  addons: [
    // L2: золоті кігті
    [rect(-5.4, 13, 2.2, 4, '#fff3b0', true), rect(3.2, 13, 2.2, 4, '#fff3b0', true)],
    // L3: грудна пластина-сонце
    [ellipse(0, -6, 3, 3, '#ffd23a'), dot(0, -6, '#fff3b0')],
    // L4: палаючі кінчики хвоста (вогонь — в анімації)
    [ellipse(-6.4, 30.5, 1.8, 1.8, '#ff5a1f', true), ellipse(6.4, 30.5, 1.8, 1.8, '#ff5a1f', true), ellipse(0, 31.6, 1.8, 1.8, '#ff5a1f', true)],
  ],
  baseAnim: phoenixWings,
  morphAnim: (t, tier) => (tier >= 3 ? [dot(0, -29, blinkC(t, 0, '#fff3b0', '#ffd23a', 10)), dot(-6.6, -26.4, blinkC(t, 1, '#fff3b0', '#ffb24a', 10)), dot(6.6, -26.4, blinkC(t, 0, '#fff3b0', '#ffb24a', 10))] : []),
  addonAnim: (t, level) => (level >= 4 ? [dot(-6.4, 32.8, blinkC(t, 0, '#ffe27a', '#ff5a1f', 12)), dot(6.4, 32.8, blinkC(t, 1, '#ffe27a', '#ff5a1f', 12)), dot(0, 34, blinkC(t, 1, '#ffe27a', '#ff8a1f', 12))] : []),
  pips: { x: 0, y: 4, dx: 0, dy: 3.6 },
};

// ---------- 15. Затемнення: сезонний ----------

const EG = '#f0b030';
const EK = '#1c1a2a';

const eclipse: Evolution = {
  palette: { primary: EK, secondary: EG, accent: '#fff1b0' },
  morphs: [
    // T2: зубчаста корона навколо диска
    {
      over: Array.from({ length: 8 }, (_, i) => poly(rotatePts([-1.6, -7, 0, -10.6, 1.6, -7], 0, 0, (i / 8) * Math.PI * 2).map((v, j) => (j % 2 ? v + 2 : v)), EG, true)),
    },
    // T3: кільце "корони" навколо диска
    { over: [annulus(0, 2, 14, 14, 12, 12, EG)] },
    // T4: золоті промені від корпусу
    {
      under: Array.from({ length: 4 }, (_, i) => poly(rotatePts([-1.4, 12, 0, 24, 1.4, 12], 0, 0, Math.PI / 4 + (i * Math.PI) / 2).map((v, j) => (j % 2 ? v + 2 : v)), EG, true)),
    },
  ],
  addons: [
    // L2: місячні серпи на крилах
    [ellipse(-16.5, 5, 2.6, 2.6, '#fff1b0', true), ellipse(-15.6, 4.2, 2.2, 2.2, EK, true), ellipse(16.5, 5, 2.6, 2.6, '#fff1b0', true), ellipse(15.6, 4.2, 2.2, 2.2, EK, true)],
    // L3: обсидіанові шипи на хвості
    both([-5, 26, -8, 33, -3.6, 30], '#3a3450'),
    // L4: сонячні вітрила попереду
    both([-6, -12, -14, -24.5, -11, -25, -5, -14.5], EG),
  ],
  morphAnim: (t, tier) => (tier >= 4 ? orbitDots(0, 2, 16.5, 16.5, 12, t * 0.8, ['#fff1b0', EG, '#ffffff'], Math.floor(t * 4)) : []),
  pips: { x: 0, y: 12, dx: 0, dy: 3.6 },
};

export const EVOLUTION: Record<PlaneId, Evolution> = { falcon, phantom, blaze, wasp, collector, swift, titan, chronos, viper, thunder, bastion, ufo, nova, phoenix, eclipse };
