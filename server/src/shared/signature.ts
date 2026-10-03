/**
 * Фірмові гармати літаків — спільні для сервера й клієнта (без залежностей).
 *
 * Кожен літак, окрім основної зброї (ЛКМ), має власну гармату — активний скіл на X:
 * один залп (кілька пострілів з інтервалом), потім перезарядка. Фізика — ті самі види, що й у зброї
 * (кулі, ракети, промені, самонавідні), тож сервер симулює їх тим самим кодом і сам рахує влучання.
 */

export interface SignatureGun {
  id: string;
  kind: 'bullet' | 'rocket' | 'laser' | 'missile';
  /** Вигляд пострілу для інших (дріб, плазма, рейка) */
  visual?: 'pellet' | 'plasma' | 'rail';
  /** Пострілів у залпі та інтервал між ними, мс */
  shots: number;
  interval: number;
  /** Урон одного снаряда / променя */
  damage: number;
  speed: number;
  /** Розкид, рад */
  spread?: number;
  /** Скільки снарядів за один постріл (дріб) */
  pellets?: number;
  /** Кільце: снаряди рівномірно на всі боки */
  ring?: boolean;
  range?: number;
  splash?: number;
  /** Самонавідні: скільки ракет за постріл */
  salvo?: number;
  /** Перезарядка після залпу, с */
  cooldown: number;
  /** Колір у HUD / на сторінці літака */
  color: string;
}

export const SIGNATURE_GUNS: Record<string, SignatureGun> = {
  falcon: { id: 'twin_cannon', kind: 'bullet', shots: 12, interval: 60, damage: 4, speed: 1250, spread: 0.05, cooldown: 7, color: '#58d2ff' },
  phantom: { id: 'phase_lance', kind: 'laser', shots: 1, interval: 0, damage: 18, speed: 0, range: 700, cooldown: 6, color: '#ff5ad0' },
  blaze: { id: 'flamethrower', kind: 'bullet', visual: 'pellet', shots: 6, interval: 120, damage: 2.4, speed: 700, spread: 0.35, pellets: 5, range: 320, cooldown: 8, color: '#ff7a2a' },
  wasp: { id: 'stinger', kind: 'laser', visual: 'rail', shots: 3, interval: 150, damage: 9, speed: 0, range: 900, cooldown: 7, color: '#ffd24a' },
  collector: { id: 'magnet_missiles', kind: 'missile', shots: 1, interval: 0, damage: 14, speed: 520, salvo: 2, cooldown: 8, color: '#18c8b0' },
  swift: { id: 'needle_burst', kind: 'bullet', shots: 20, interval: 35, damage: 2.6, speed: 1400, spread: 0.08, cooldown: 8, color: '#28c8f0' },
  titan: { id: 'heavy_shell', kind: 'rocket', shots: 1, interval: 0, damage: 38, speed: 650, splash: 160, cooldown: 8, color: '#ffb020' },
  chronos: { id: 'chrono_ray', kind: 'laser', shots: 4, interval: 200, damage: 7, speed: 0, range: 800, cooldown: 8, color: '#8a3cff' },
  viper: { id: 'venom_spread', kind: 'bullet', visual: 'pellet', shots: 2, interval: 250, damage: 3, speed: 950, spread: 0.22, pellets: 7, range: 480, cooldown: 7, color: '#6adc2a' },
  thunder: { id: 'lightning', kind: 'laser', visual: 'rail', shots: 1, interval: 0, damage: 30, speed: 0, range: 1000, cooldown: 9, color: '#9fd0ff' },
  bastion: { id: 'mortar', kind: 'rocket', shots: 3, interval: 220, damage: 20, speed: 560, splash: 120, spread: 0.1, cooldown: 9, color: '#ff7a2a' },
  ufo: { id: 'tractor_beam', kind: 'laser', shots: 6, interval: 120, damage: 5, speed: 0, range: 600, cooldown: 8, color: '#3adc78' },
  nova: { id: 'star_salvo', kind: 'missile', shots: 1, interval: 0, damage: 10, speed: 520, salvo: 4, cooldown: 9, color: '#a06aff' },
  phoenix: { id: 'fire_storm', kind: 'rocket', visual: 'plasma', shots: 5, interval: 100, damage: 12, speed: 700, splash: 70, spread: 0.15, cooldown: 9, color: '#ff5a1f' },
  eclipse: { id: 'corona_burst', kind: 'bullet', shots: 1, interval: 0, damage: 5, speed: 900, pellets: 16, ring: true, range: 520, cooldown: 9, color: '#ffb020' },
};

export const signatureFor = (planeId: string): SignatureGun => SIGNATURE_GUNS[planeId] ?? SIGNATURE_GUNS.falcon;

// ---------- еволюція гармати по тірах ----------

/**
 * Ефекти фірмової гармати, що відкриваються з тіром. Усе рахує сервер (урон, DoT, ланцюги, зони),
 * клієнт лише показує: власні снаряди симулює так само, а вторинні ефекти отримує подіями match:fx.
 * Обмеження для PvP: DoT — зі стелею стаків, оглушення — коротке сповільнення, кожне влучання — не більше 50% HP.
 */
export interface SigEffects {
  /** Снаряд/промінь проходить крізь стільки додаткових цілей */
  pierce?: number;
  /** Відскоків від меж арени й скель */
  ricochet?: number;
  /** На межі дальності розвертається до стрільця й летить назад (б'є ще раз) */
  boomerang?: boolean;
  /** Кожен N-й постріл залпу — самонавідна ракета */
  homingEvery?: number;
  homingDamage?: number;
  /** Промінь сам доводиться на ворога в такому куті (рад) */
  aimAssist?: number;
  /** Підпал/отрута: урон за секунду, тривалість, стеля стаків; spread — перекидається на ворогів поруч */
  dot?: { kind: 'burn' | 'poison'; dps: number; dur: number; stacks: number; spread?: number };
  /** Сповільнення влученого, с */
  slow?: number;
  /** Оглушення (сильне сповільнення), с */
  stun?: number;
  /** Ланцюг: на скільки ще ворогів перескакує, радіус і частка урону */
  chain?: { n: number; range: number; mul: number };
  /** При влучанні/вибуху розлітається на осколки */
  split?: { n: number; mul: number; kind: 'bullet' | 'rocket'; speed: number; range: number; splash?: number; arc: number };
  /** Промені-відгалуження від точки влучання (для променевих гармат) */
  forks?: { n: number; mul: number; range: number; arc: number };
  /** Повторний промінь тим самим курсом через delay мс */
  echo?: { delay: number; mul: number };
  /** Зона на місці влучання/вибуху: урон за секунду, тривалість, притягання (px/с) */
  zone?: { r: number; dps: number; dur: number; kind: 'fire' | 'acid' | 'void'; pull?: number };
  /** Миттєве притягання ворогів до точки вибуху */
  pull?: { r: number; force: number };
  /** Притягує влученого до стрільця (px) */
  tow?: number;
  /** Ударне кільце, що розходиться після вибуху */
  shockRing?: { r: number; mul: number; delay: number };
  /** Удари блискавок навколо влученого */
  storm?: { n: number; r: number; area: number; dmg: number; every: number };
  /** Пульсація навколо стрільця на початку залпу */
  pulse?: { r: number; dmg: number; n: number; every: number };
  /** Частка урону гармати, що лікує стрільця */
  lifesteal?: number;
  /** Скільки пострілів летить назад наприкінці залпу */
  back?: number;
  /** Паралельних променів (зсув упоперек, px) і частка урону кожного */
  parallel?: { n: number; gap: number; mul: number };
  /** Ширина променя ×k */
  wide?: number;
  /** Отруєний цим стрільцем вибухає при загибелі */
  deathBlast?: { r: number; dmg: number };
  /** Швидкість повороту самонавідних ракет ×k */
  turnMul?: number;
}

export interface SigTier {
  /** Зміни параметрів гармати (патерн: кількість, розкид, урон…) */
  gun?: Partial<Omit<SignatureGun, 'id' | 'color'>>;
  fx?: SigEffects;
}

/** Еволюція гармат: T2, T3, T4 — накопичуються (T4 = T1 + зміни T2 + T3 + T4). */
export const SIGNATURE_TIERS: Record<string, [SigTier, SigTier, SigTier]> = {
  // Спарена гармата: три стволи → бронебійні кулі → кожен 4-й постріл — самонавідна ракета
  falcon: [{ gun: { pellets: 3, spread: 0.07, damage: 1.5 } }, { fx: { pierce: 1 } }, { fx: { homingEvery: 4, homingDamage: 4.5 } }],
  // Фазовий спис: пробиває кількох → розколюється від влучання → повертається відлунням
  phantom: [{ fx: { pierce: 2 } }, { fx: { forks: { n: 2, mul: 0.3, range: 320, arc: 0.45 } } }, { fx: { echo: { delay: 450, mul: 0.35 } } }],
  // Вогнемет: ширший конус → підпал → вогонь перекидається на сусідів
  blaze: [{ gun: { pellets: 6, spread: 0.5, damage: 2.2 } }, { fx: { dot: { kind: 'burn', dps: 3, dur: 2, stacks: 1 } } }, { fx: { dot: { kind: 'burn', dps: 3, dur: 2, stacks: 1, spread: 140 } } }],
  // Жало: отрута → доводка на ціль → рій з 6 самонавідних мікро-жал
  wasp: [{ gun: { damage: 7.5 }, fx: { dot: { kind: 'poison', dps: 1.2, dur: 3, stacks: 3 } } }, { fx: { aimAssist: 0.07 } }, { gun: { kind: 'missile', visual: undefined, shots: 1, salvo: 6, damage: 4.2, speed: 520 } }],
  // Магнітні ракети: притягують ворогів → ланцюг на другу ціль → мікро-«чорна діра»
  collector: [{ fx: { pull: { r: 150, force: 260 } } }, { fx: { chain: { n: 1, range: 240, mul: 0.5 } } }, { fx: { zone: { r: 120, dps: 3, dur: 1.5, kind: 'void', pull: 180 } } }],
  // Голкова злива: рикошет → ширше віяло → другий залп назад
  swift: [{ fx: { ricochet: 1 } }, { gun: { shots: 24, spread: 0.14, damage: 2.4 } }, { fx: { back: 8 } }],
  // Важкий снаряд: більший вибух → 3 осколки → ударне кільце
  titan: [{ gun: { splash: 200 } }, { fx: { split: { n: 3, mul: 0.18, kind: 'bullet', speed: 900, range: 260, arc: Math.PI * 2 } } }, { fx: { shockRing: { r: 260, mul: 0.18, delay: 250 } } }],
  // Хронопромінь: сповільнює → подвійний промінь → безперервний промінь 1.5 с
  chronos: [{ fx: { slow: 0.8 } }, { fx: { parallel: { n: 2, gap: 9, mul: 0.6 } } }, { gun: { shots: 10, interval: 150, damage: 3.2 } }],
  // Отруйне віяло: отрута стакається → калюжі кислоти → отруєні вибухають при загибелі
  viper: [{ gun: { damage: 2.6 }, fx: { dot: { kind: 'poison', dps: 1, dur: 3, stacks: 4 } } }, { fx: { zone: { r: 55, dps: 3, dur: 2, kind: 'acid' } } }, { fx: { deathBlast: { r: 130, dmg: 15 } } }],
  // Блискавка: ланцюг на 2 цілі → на 3 + оглушення → грозовий шторм
  thunder: [{ fx: { chain: { n: 1, range: 260, mul: 0.4 } } }, { fx: { chain: { n: 2, range: 260, mul: 0.35 }, stun: 0.6 } }, { gun: { damage: 26 }, fx: { storm: { n: 3, r: 140, area: 55, dmg: 4.5, every: 200 } } }],
  // Мортира: касетні снаряди → палаюча зона → залп з 5 по дузі
  bastion: [{ fx: { split: { n: 3, mul: 0.25, kind: 'rocket', speed: 500, range: 160, splash: 50, arc: Math.PI * 2 } } }, { fx: { zone: { r: 90, dps: 3, dur: 2.5, kind: 'fire' } } }, { gun: { shots: 5, spread: 0.32, damage: 14 } }],
  // Промінь-тягач: підтягує ціль → вдвічі ширший → «викрадення» HP
  ufo: [{ fx: { tow: 180 } }, { fx: { wide: 2 } }, { fx: { lifesteal: 0.35 } }],
  // Зоряний залп: ширше віяло з 5 → зорі розлітаються на осколки → сузір'я з 6 спритних ракет
  nova: [{ gun: { salvo: 5, damage: 8.5 } }, { fx: { split: { n: 3, mul: 0.3, kind: 'bullet', speed: 800, range: 220, arc: Math.PI * 2 } } }, { gun: { salvo: 6, damage: 7.5 }, fx: { turnMul: 1.6 } }],
  // Вогняний шквал: підпал → відскок → куля-фенікс повертається
  phoenix: [{ fx: { dot: { kind: 'burn', dps: 2, dur: 2, stacks: 1 } } }, { fx: { ricochet: 1 } }, { fx: { boomerang: true } }],
  // Корона: довший радіус → подвійне кільце → пульсація навколо літака
  eclipse: [{ gun: { range: 680 } }, { gun: { shots: 2, interval: 160, damage: 3 } }, { fx: { pulse: { r: 170, dmg: 5, n: 2, every: 300 } } }],
};

export interface SignatureAt extends SignatureGun {
  tier: number;
  fx: SigEffects;
}

/** Гармата літака на тірі (1..4): база + зміни всіх тірів до поточного включно. */
export function signatureAt(planeId: string, tier: number): SignatureAt {
  const base = signatureFor(planeId);
  const steps = SIGNATURE_TIERS[planeId] ?? SIGNATURE_TIERS.falcon;
  const t = Math.max(1, Math.min(4, Math.floor(tier) || 1));
  const out: SignatureAt = { ...base, tier: t, fx: {} };
  for (const step of steps.slice(0, t - 1)) {
    Object.assign(out, step.gun ?? {});
    Object.assign(out.fx, step.fx ?? {});
  }
  return out;
}

/** Скільки снарядів максимум за один залп (для перевірки темпу на сервері). */
export const signatureVolley = (g: SignatureGun & { fx?: SigEffects }): number =>
  g.shots * (g.pellets ?? 1) * (g.salvo ?? 1) + (g.fx?.back ?? 0) + (g.fx?.parallel ? g.shots * (g.fx.parallel.n - 1) : 0);

/** Очікуваний урон залпу (для перевірки балансу): прямі влучання + оцінка ефектів. */
export function signatureVolleyDamage(g: SignatureAt): number {
  const fx = g.fx;
  const per = (g.pellets ?? 1) * (g.salvo ?? 1);
  const shots = g.shots * per;
  let dmg = g.damage;
  if (fx.homingEvery) {
    const homing = Math.floor(g.shots / fx.homingEvery);
    return (g.shots - homing) * per * g.damage + homing * (fx.homingDamage ?? g.damage) + signatureExtra(g, g.damage);
  }
  if (fx.parallel) dmg *= fx.parallel.mul * fx.parallel.n;
  return shots * dmg + signatureExtra(g, g.damage);
}

/** Додатковий урон від ефектів на одне "основне" влучання (грубо, для звіту балансу). */
function signatureExtra(g: SignatureAt, hit: number): number {
  const fx = g.fx;
  let extra = 0;
  if (fx.dot) extra += fx.dot.dps * fx.dot.dur * fx.dot.stacks;
  if (fx.chain) extra += hit * fx.chain.mul * fx.chain.n * 0.5;
  if (fx.zone) extra += fx.zone.dps * fx.zone.dur * 0.5;
  if (fx.split) extra += hit * fx.split.mul * fx.split.n * 0.4;
  if (fx.forks) extra += hit * fx.forks.mul * fx.forks.n * 0.3;
  if (fx.echo) extra += hit * fx.echo.mul * 0.5;
  if (fx.shockRing) extra += hit * fx.shockRing.mul;
  if (fx.storm) extra += fx.storm.dmg * fx.storm.n * 0.4;
  if (fx.pulse) extra += fx.pulse.dmg * fx.pulse.n * 0.5;
  if (fx.pierce) extra += hit * 0.1 * g.shots * (g.pellets ?? 1);
  if (fx.back) extra += hit * fx.back * 0.15;
  return extra;
}
