// Генератор довідника нагород і прогресії: `npm run doc -- <шлях.md>`. Усі числа беруться з коду гри.
import { writeFileSync } from 'node:fs';
import { levelReward, survivalReward, DAILY_REWARDS, xpToNext, MAX_PILOT_LEVEL, pilotLevelReward } from '../src/content/economy.js';
import { MAX_LEVEL, CRYSTAL_COINS } from '../src/content/levels.js';
import { PASS_TIERS, PREMIUM_PASS_PRICE, SEASON_DAYS, bpForLevelComplete, bpForSurvival, bpForQuestClaim, type PassReward } from '../src/content/pass.js';
import { PLANE_IDS, PLANE_PRICES, levelUpCost, tierUpCost, planeCombat, upgradeRate, MAX_TIER, MAX_LEVEL_IN_TIER } from '../src/content/planes.js';
import { QUEST_POOL, WEEKLY_QUEST_POOL } from '../src/content/quests.js';
import { RANK_IDS, DIVISIONS, RP_PER_DIVISION, RP_BY_PLACE, rankDelta, botStrength, seasonReward } from '../src/content/ranks.js';
import { CRATES, CRATE_TYPES, ITEM_RARITY_WEIGHT, openCrate } from '../src/content/crates.js';
import { duplicateCrystals } from '../src/content/compensation.js';
import { WEAPON_DEFS } from '../src/content/weapons.js';
import { matchReward, PLACE_CRATE_WEIGHTS, ROOM_SIZE, FLARE_COOLDOWN_MS, FLARE_DURATION_MS } from '../src/pvp/constants.js';
import { PLANES, PVP_PROGRESS_SCALE, effectivePlaneSpec } from '../../src/game/planes.js';
import { ITEM_DEFS } from '../../src/game/items.js';
import { BOOST_DURATION, BOOST_MULTIPLIER, FLARE_RADIUS, FREEZE_DURATION, JUMP_COOLDOWN } from '../../src/game/systems/SkillSystem.js';

const PLANE_NAME: Record<string, string> = { falcon: 'Сокіл', phantom: 'Фантом', blaze: 'Блискавка', wasp: 'Оса', collector: 'Колектор', swift: 'Стриж', titan: 'Титан', chronos: 'Хронос', thunder: 'Грім', ufo: 'НЛО', phoenix: 'Фенікс' };
const ITEM_NAME: Record<string, string> = {
  magnet_booster: 'Термонаправляючий магніт', armor_plating: 'Посилена броня', targeting_cpu: 'Бортовий обчислювач', afterburner: 'Форсажна камера', nano_coating: 'Нанопокриття',
  overclock_core: 'Розігнане ядро', phoenix_heart: 'Серце фенікса', nano_repair: 'Нанорепарація', emp_pulse: 'EMP-імпульс', decoy_flare: 'Фазовий зсув', overdrive: 'Овердрайв', missile_swarm: 'Рій ракет',
};
const WEAPON_NAME: Record<string, string> = { machine_gun: 'Кулемет', rocket_launcher: 'Ракетниця', laser: 'Імпульсний лазер', homing_salvo: 'Самонавідний залп' };
const RARITY: Record<string, string> = { common: 'Звичайний', rare: 'Рідкісний', epic: 'Епічний', mythic: 'Міфічний', legendary: 'Легендарний' };
const RANK: Record<string, string> = { bronze: 'Бронза', silver: 'Срібло', gold: 'Золото', platinum: 'Платина', diamond: 'Діамант', master: 'Майстер', galaxy: 'Галактика' };
const QUEST: Record<string, string> = {
  levelsCompleted: 'Пройти рівнів', crystalsCollected: 'Зібрати кристалів', survivalSeconds: 'Секунд у виживанні', cratesOpened: 'Відкрити ящиків', pvpMatches: 'Зіграти онлайн-матчів',
  pvpKills: 'Збити ворогів (PvP)', pvpTop3: 'Топ-3 в онлайн-матчі', pvpWins: 'Виграти онлайн-матчів', threeStarLevels: 'Рівнів на 3 зірки', planeUpgrades: 'Прокачок літака',
  coinsEarned: 'Заробити монет', itemsBought: 'Купити предметів/зброї', dailyClaimed: 'Забрати щоденну нагороду', passClaims: 'Забрати нагород пропуску', questsCompleted: 'Виконати інших завдань', survivalRuns: 'Забігів у виживанні',
};
const ACTION: Record<string, string> = {
  nanoRepair: 'PvP: лагодить корпус. Кампанія: відновлює щит',
  emp: 'PvP: урон і сповільнення ворогів (×0.6 швидкості). Кампанія: заморожує астероїди',
  phase: 'Літак стає примарним — снаряди пролітають крізь нього',
  overdrive: 'PvP: +70% скорострільності без охолодження. Кампанія: безкоштовний форсаж',
  swarm: '6 самонавідних ракет віялом',
};
const ROMAN = ['V', 'IV', 'III', 'II', 'I'];

const L: string[] = [];
const p = (s = '') => L.push(s);
const table = (head: string[], rows: (string | number)[][]) => {
  p(`| ${head.join(' | ')} |`);
  p(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) p(`| ${r.join(' | ')} |`);
  p();
};
const n = (v: number) => v.toLocaleString('uk-UA');
const pct = (v: number) => `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%`;
const pc = (v?: number, sign = '+') => (v ? `${sign}${Math.round(v * 100)}%` : '—');

p('# Asteroids — довідник усіх нагород, прокачки й рейтингу');
p();
p(`Згенеровано з коду гри ${new Date().toISOString().slice(0, 10)} (\`npm run doc\` у server). Усі числа взято безпосередньо з формул і таблиць, тож вони збігаються з тим, що працює в грі. Баланс — версія 2 (після звіту про перебалансування).`);
p();
p('## Зміст');
['Кампанія', 'Виживання', 'Щоденна нагорода', 'Рівень пілота', 'Літаки: ціни, прокачка, HP і урон', 'Зброя', 'Предмети й навички', 'Ящики й дублікати', 'Онлайн PvP: нагороди за місця', 'Рейтинговий режим', 'Завдання', 'Сезонний пропуск'].forEach((s, i) => p(`${i + 1}. ${s}`));
p();

// ---------- кампанія ----------
p('## 1. Кампанія');
p();
p(`База = 20 + рівень × 5 + зірки × 15 монет. Перше проходження — ×2, повтор — ×0.5. Кожен зібраний кристал додає ${CRYSTAL_COINS} монет. XP = 15 + рівень × 2 + зірки × 5. BP = 8 + рівень + зірки × 3.`);
p();
p('Шанс ящика за рівень: 35% за перше проходження, 18% — за повторне. Рідкість такого ящика: звичайний 65%, рідкісний 23%, епічний 9%, міфічний 3%.');
p();
table(
  ['Рівень', '1★ (повтор / перше)', '2★', '3★', 'XP за 3★', 'BP за 3★'],
  Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((lv) => [lv, ...[1, 2, 3].map((st) => `${levelReward(lv, st, false)} / **${levelReward(lv, st, true)}**`), 15 + lv * 2 + 15, bpForLevelComplete(lv, 3)]),
);

// ---------- виживання ----------
p('## 2. Виживання');
p();
p(`Монети = активні секунди ÷ 2.5 (+${CRYSTAL_COINS} за кристал). XP = активні сек ÷ 4. BP = активні сек ÷ 10. Шанс ящика = 10% + 1% за кожні 10 секунд (максимум 50% на 400 с). «Активні» — секунди, коли гравець рухався протягом останніх 5 с (захист від AFK); рекорд рахується за повним часом.`);
p();
table(
  ['Час', 'Монети', 'XP', 'BP', 'Шанс ящика'],
  [30, 60, 120, 180, 300, 400, 600, 900].map((s) => [`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, survivalReward(s), Math.floor(s / 4), bpForSurvival(s), pct(Math.min(0.5, 0.1 + s / 1000))]),
);

// ---------- щоденна ----------
p('## 3. Щоденна нагорода');
p();
p('Серія з 7 днів; пропуск дня скидає серію на 1-й день. XP = монети ÷ 3.');
p();
table(['День', ...DAILY_REWARDS.map((_, i) => String(i + 1))], [['Монети', ...DAILY_REWARDS.map(String)], ['XP', ...DAILY_REWARDS.map((c) => String(Math.round(c / 3)))]]);

// ---------- рівень пілота ----------
p('## 4. Рівень пілота');
p();
p(`XP до наступного рівня = 80 + (рівень − 1) × 45. Максимум — ${MAX_PILOT_LEVEL}. Кожен новий рівень: монети = 50 + рівень × 10; кожні 5 рівнів — ящик; кожні 10 — кристали (20 + рівень).`);
p();
const xpRows: (string | number)[][] = [];
let total = 0;
for (let lv = 1; lv <= MAX_PILOT_LEVEL; lv++) {
  const r = pilotLevelReward(lv);
  xpRows.push([lv, lv === 1 ? '—' : [`${r.coins} 🪙`, r.crystals ? `${r.crystals} 💎` : '', r.crate ? `ящик: ${RARITY[r.crate]}` : ''].filter(Boolean).join(', '), lv < MAX_PILOT_LEVEL ? xpToNext(lv) : '—', n(total)]);
  total += xpToNext(lv);
}
table(['Рівень', 'Нагорода за досягнення', 'XP до наступного', 'XP усього з 1-го'], xpRows);

// ---------- літаки ----------
p('## 5. Літаки: ціни, прокачка, HP і урон');
p();
p(`У кожного літака ${MAX_TIER} тіри по ${MAX_LEVEL_IN_TIER} рівні (15 кроків; тір = 4 кроки). За крок: HP +4% від бази, урон +2%, плюс швидкість і прискорення. **У PvP усі бонуси прокачки діють наполовину** (коефіцієнт ${PVP_PROGRESS_SCALE}): максимум HP ×1.30, урон +15%. HP і урон у таблицях — PvP-значення.`);
p();
p('Вартість рівня l (1..3) у тірі t = f × t × l монет. Тір-ап із тіру t = 24 × f × t монет + кристали 30 / 80 / 160. Повна прокачка = 204 × f.');
p();
table(
  ['Літак', 'Ціна', 'Ставка f', 'Повна прокачка', 'Базове HP', 'Базовий урон', 'Хітбокс', 'Швидкість', 'Прискорення'],
  PLANES.map((pl) => [PLANE_NAME[pl.id], pl.price ? n(pl.price) : 'стартовий', upgradeRate(pl.price), n(204 * upgradeRate(pl.price)), pl.combat.hp, `×${pl.combat.damage.toFixed(2)}`, pl.radius, pl.maxSpeed, pl.accel]),
);
for (const id of PLANE_IDS) {
  const base = PLANES.find((x) => x.id === id)!;
  p(`### ${PLANE_NAME[id]}`);
  p();
  const rows: (string | number)[][] = [];
  for (let tier = 1; tier <= MAX_TIER; tier++) {
    for (let level = 1; level <= MAX_LEVEL_IN_TIER; level++) {
      const c = planeCombat(id, tier, level);
      const spec = effectivePlaneSpec(base, { planeId: id, tier, level }, PVP_PROGRESS_SCALE);
      let cost = '—';
      if (level < MAX_LEVEL_IN_TIER) cost = `${n(levelUpCost(PLANE_PRICES[id], tier, level))} 🪙`;
      else if (tier < MAX_TIER) {
        const tc = tierUpCost(PLANE_PRICES[id], tier);
        cost = `тір: ${n(tc.coins)} 🪙 + ${tc.crystals} 💎`;
      }
      rows.push([`T${tier} · L${level}`, c.hp, `×${c.damageMul.toFixed(3)}`, Math.round(spec.maxSpeed), Math.round(spec.accel), cost]);
    }
  }
  table(['Тір · рівень', 'HP (PvP)', 'Урон (PvP)', 'Швидкість (PvP)', 'Прискорення (PvP)', 'Наступне підвищення'], rows);
}

// ---------- зброя ----------
p('## 6. Зброя');
p();
p('Урон — за одне влучання в PvP; множиться на урон літака й бонуси предметів. **Одне влучання не знімає більше 50% максимального HP цілі.** Кампанія — без стрільби.');
p();
table(
  ['Зброя', 'Ціна', 'Урон', 'Пострілів/с', 'Урон/с (усі влучання)', 'Черга / магазин', 'Особливе'],
  WEAPON_DEFS.map((w) => [
    WEAPON_NAME[w.id],
    w.price ? n(w.price) : 'стартова',
    w.damage,
    w.fireRate,
    Math.round(w.damage * w.fireRate * (w.salvo ?? 1)),
    w.burst ? `черга ${w.burst.shots}, охолодження ${w.burst.cooldown} с` : w.ammo ? `${w.ammo} шт., перезарядка ${w.reloadTime} с` : '∞',
    [w.splashRadius ? `вибух ${w.splashRadius}` : '', w.range ? `промінь ${w.range}` : '', w.salvo ? `${w.salvo} самонавідні ракети` : ''].filter(Boolean).join(', ') || '—',
  ]),
);

// ---------- предмети й навички ----------
p('## 7. Предмети й навички');
p();
p('Бонус урону дають обидва екіпіровані предмети (актив + пасив), разом не більше +27%. Сумарний бонус скорострільності — не більше +80%. Інші бойові бонуси — лише від пасиву.');
p();
p('### Пасивні предмети');
p();
table(
  ['Предмет', 'Рідкість', 'Ціна', 'Бонус урону', 'HP (PvP)', 'Швидкість', 'Скорострільність', 'Перезарядки навичок', 'Кампанія'],
  ITEM_DEFS.filter((d) => d.slot === 'passive').map((d) => {
    const c = d.combat ?? {};
    const f = d.feature ?? {};
    const camp = [f.magnetRadius ? `магніт +${f.magnetRadius}` : '', f.extraLives ? `+${f.extraLives} життя` : '', f.extraBoost ? `+${f.extraBoost} форсаж` : '', f.startShield ? 'щит на старті' : '', f.shieldRegen ? `щит відновлюється на ${-f.shieldRegen} с швидше` : '', f.jumpCooldownMul ? `ривок ×${f.jumpCooldownMul}` : ''].filter(Boolean).join(', ') || '—';
    return [ITEM_NAME[d.id], RARITY[d.rarity], n(d.price), pc(c.damage), c.hp ? `+${c.hp}` : '—', pc(c.speed), pc(c.fireRate), pc(c.cooldown, '−'), camp];
  }),
);
p('### Активні предмети');
p();
table(
  ['Предмет', 'Рідкість', 'Ціна', 'КД', 'Тривалість', 'Радіус', 'Урон / ремонт', 'Бонус урону зброї', 'Що робить'],
  ITEM_DEFS.filter((d) => d.slot === 'active').map((d) => {
    const a = d.active!;
    const power = a.power ? (a.kind === 'nanoRepair' ? `ремонт +${a.power} HP` : a.kind === 'swarm' ? `6 × ${a.power}` : `${a.power}`) : '—';
    return [ITEM_NAME[d.id], RARITY[d.rarity], n(d.price), `${a.cooldown} с`, a.duration ? `${a.duration} с` : '—', a.radius ?? '—', power, pc(d.combat?.damage), ACTION[a.kind]];
  }),
);
p('### Базові навички (усі літаки)');
p();
table(
  ['Навичка', 'КД / заряди', 'Тривалість', 'Ефект'],
  [
    ['Теплові пастки', `${FLARE_COOLDOWN_MS / 1000} с`, `${FLARE_DURATION_MS / 1000} с`, `збивають кулі, ракети й лазер у радіусі ${FLARE_RADIUS}`],
    ['Ривок', `${JUMP_COOLDOWN} с на заряд`, 'миттєво', 'стрибок уперед на 190 (PvP — 210)'],
    ['Форсаж', '2 заряди на старт', `${BOOST_DURATION} с`, `швидкість ×${BOOST_MULTIPLIER}`],
    ['Заморозка (кампанія)', '1 заряд на старт', `${FREEZE_DURATION} с`, 'зупиняє всі астероїди'],
  ],
);
p('### Навички за літаками (базовий тір)');
p();
table(
  ['Літак', 'Ривок КД', 'Заряди ривка', 'Дальність ривка', 'Форсаж: заряди / тривалість', 'Заморозка: заряди / тривалість', 'Особливе'],
  PLANES.map((pl) => {
    const f = pl.feature;
    const extra = [f.ramOnBoost ? 'таран під форсажем' : '', f.magnetRadius ? `магніт ${f.magnetRadius}` : '', f.startShield ? 'щит на старті' : '', f.shieldRegen ? `реген щита ${f.shieldRegen} с` : '', f.dashShockwave ? `ударна хвиля ${f.dashShockwave}` : '', f.gravityImmune ? 'імунітет до гравітації' : '', f.noRotate ? 'без інерції' : '', f.extraLives ? `+${f.extraLives} життя` : ''].filter(Boolean).join(', ') || '—';
    return [PLANE_NAME[pl.id], `${(JUMP_COOLDOWN * (f.jumpCooldownMul ?? 1)).toFixed(1)} с`, f.jumpCharges ?? 1, `×${(f.jumpDistanceMul ?? 1).toFixed(2)}`, `${2 + (f.extraBoost ?? 0)} / ${(BOOST_DURATION * (f.boostDurationMul ?? 1)).toFixed(2)} с`, `${1 + (f.extraFreeze ?? 0)} / ${(FREEZE_DURATION * (f.freezeDurationMul ?? 1)).toFixed(1)} с`, extra];
  }),
);

// ---------- ящики ----------
p('## 8. Ящики й дублікати');
p();
p('Кожне відкриття дає кілька нагород. Тип кожної нагороди розігрується за вагами; предмети, зброя й літаки, які вже є, не повторюються.');
p();
table(
  ['Ящик', 'Нагород', 'Джекпот 1-ї нагороди', 'Монети', 'XP', 'Кристали', 'Рідкості предметів'],
  CRATE_TYPES.map((t) => {
    const c = CRATES[t];
    return [RARITY[t], c.rolls, c.jackpotChance ? pct(c.jackpotChance) : '—', `${c.coins[0]}–${c.coins[1]}`, `${c.xp[0]}–${c.xp[1]}`, `${c.crystals[0]}–${c.crystals[1]}`, c.itemRarities.map((r) => RARITY[r]).join(', ')];
  }),
);
p('Ваги типів нагород (на одну нагороду):');
p();
table(
  ['Ящик', 'Монети', 'XP', 'Кристали', 'Предмет', 'Зброя', 'Літак'],
  CRATE_TYPES.map((t) => {
    const w = CRATES[t].weights;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    return [RARITY[t], ...(['coins', 'xp', 'crystals', 'item', 'weapon', 'plane'] as const).map((k) => pct(w[k] / sum))];
  }),
);
p('Шанс отримати хоча б одну рідкісну річ за відкриття (симуляція 20 000 відкриттів новим гравцем):');
p();
table(
  ['Ящик', 'Предмет', 'Зброя', 'Літак'],
  CRATE_TYPES.map((t) => {
    let item = 0;
    let weapon = 0;
    let plane = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const r = openCrate(t, { planes: ['falcon'], items: [], weapons: ['machine_gun'] });
      if (r.some((x) => x.kind === 'item')) item++;
      if (r.some((x) => x.kind === 'weapon')) weapon++;
      if (r.some((x) => x.kind === 'plane')) plane++;
    }
    return [RARITY[t], pct(item / N), pct(weapon / N), pct(plane / N)];
  }),
);
p(`Серед доступних предметів дешевші рідкості частіші (ваги: ${Object.entries(ITEM_RARITY_WEIGHT).map(([r, w]) => `${RARITY[r]} ${w}`).join(', ')}). Дорогі літаки випадають рідше (вага ∝ 1 / ціна).`);
p();
p('**Компенсація дублікатів** (пропуск і нагороди): 1 💎 ≈ 45 монет.');
p();
table(
  ['Що', 'Кристали'],
  [
    ...ITEM_DEFS.map((d) => [`${ITEM_NAME[d.id]} (${RARITY[d.rarity]})`, duplicateCrystals('item', d.id)]),
    ...WEAPON_DEFS.filter((w) => w.price).map((w) => [WEAPON_NAME[w.id], duplicateCrystals('weapon', w.id)]),
    ...PLANE_IDS.filter((id) => PLANE_PRICES[id]).map((id) => [`літак ${PLANE_NAME[id]}`, duplicateCrystals('plane', id)]),
  ],
);

// ---------- PvP ----------
p('## 9. Онлайн PvP: нагороди за місця');
p();
p(`Матч на ${ROOM_SIZE} пілотів (вільні місця займають боти), 4 хвилини. Переможець також забирає весь лут (монети й кристали з поля), що лишився на борту живих. Гравець, який за матч не вистрілив і майже не рухався, отримує монети ×0.5 і RP як за останнє місце.`);
p();
table(
  ['Місце', 'Монети (звичайний)', 'Монети (рейтинговий)', 'BP', 'XP пілота'],
  Array.from({ length: ROOM_SIZE }, (_, i) => i + 1).map((place) => [place, matchReward(place, 0).coins, matchReward(place, 0, true).coins, matchReward(place, 0).bpXp, 30 + Math.max(0, ROOM_SIZE + 1 - place) * 6]),
);
p('За кожен фраг: +20 монет (у рейтинговому +25), +12 BP і +8 XP.');
p();
p('Ящик за призове місце (випадкова рідкість):');
p();
table(
  ['Місце', ...CRATE_TYPES.map((t) => RARITY[t])],
  [1, 2, 3].map((pl) => {
    const w = PLACE_CRATE_WEIGHTS[pl];
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    return [pl, ...CRATE_TYPES.map((t) => pct(w[t] / sum))];
  }),
);

// ---------- рейтинг ----------
p('## 10. Рейтинговий режим');
p();
p(`${RANK_IDS.length} рангів по ${DIVISIONS} підрівнів, ${RP_PER_DIVISION} RP на підрівень. Сезон триває ${SEASON_DAYS} днів. Наприкінці сезону — ящик за досягнутий ранг і кристали (5 × номер підрівня), потім рейтинг множиться на 0.8.`);
p();
p('### Сітка рангів');
p();
const gridRows: (string | number)[][] = [];
RANK_IDS.forEach((id, r) => {
  ROMAN.forEach((rom, s) => {
    const idx = r * DIVISIONS + s;
    const bot = botStrength(idx * RP_PER_DIVISION);
    const sr = seasonReward(idx * RP_PER_DIVISION);
    gridRows.push([`${RANK[id]} ${rom}`, n(idx * RP_PER_DIVISION), idx === RANK_IDS.length * DIVISIONS - 1 ? '∞' : n((idx + 1) * RP_PER_DIVISION - 1), `T${bot.tier} · L${bot.level}`, `${RARITY[sr.crate]} + ${sr.crystals} 💎`]);
  });
});
table(['Ранг', 'Від RP', 'До RP', 'Сила ботів', 'Нагорода за сезон'], gridRows);
p('### Зміна рейтингу за матч');
p();
p(`Базова таблиця (сума = 0): ${RP_BY_PLACE.map((v, i) => `${i + 1} → ${v > 0 ? '+' : ''}${v}`).join(', ')}. Фраги: +2 RP за кожен, максимум +8. На Бронзі й Сріблі втрати вдвічі менші, на Майстрі й Галактиці виграш ×0.85. Вихід із матчу посеред бою = 10-те місце.`);
p();
table(
  ['Місце', 'Золото, 0 фрагів', 'Золото, 2 фраги', 'Золото, 4+ фрагів', 'Бронза, 0 фрагів', 'Майстер, 0 фрагів'],
  Array.from({ length: ROOM_SIZE }, (_, i) => i + 1).map((place) => [place, ...[0, 2, 4].map((k) => rankDelta(place, k, 1200)), rankDelta(place, 0, 300), rankDelta(place, 0, 2600)]),
);

// ---------- завдання ----------
p('## 11. Завдання');
p();
p(`Щодня видається 8 випадкових денних завдань, щотижня — 5 тижневих. За кожне забране завдання ще +${bpForQuestClaim()} BP.`);
p();
const qRow = (q: (typeof QUEST_POOL)[number]) => [QUEST[q.kind], n(q.target), n(q.reward.coins), q.reward.xp, q.reward.crate ? RARITY[q.reward.crate] : '—'];
p('### Денні');
p();
table(['Завдання', 'Ціль', 'Монети', 'XP', 'Ящик'], QUEST_POOL.map(qRow));
p('### Тижневі');
p();
table(['Завдання', 'Ціль', 'Монети', 'XP', 'Ящик'], WEEKLY_QUEST_POOL.map(qRow));

// ---------- пропуск ----------
p('## 12. Сезонний пропуск');
p();
p(`${PASS_TIERS.length} тьєрів, сезон ${SEASON_DAYS} днів. Преміум коштує ${n(PREMIUM_PASS_PRICE)} монет на сезон. BP: рівні кампанії, виживання, завдання, PvP. У пропуску лише половина каталогу; предмет/зброя/літак, які вже є, компенсуються кристалами (таблиця в розділі 8).`);
p();
const rw = (r: PassReward) =>
  [`${n(r.coins)} 🪙`, `${r.xp} XP`, r.crystals ? `${r.crystals} 💎` : '', r.crate ? `ящик: ${RARITY[r.crate]}` : '', r.item ? `**${ITEM_NAME[r.item]}**` : '', r.weapon ? `**${WEAPON_NAME[r.weapon]}**` : '', r.plane ? `**літак ${PLANE_NAME[r.plane]}**` : '']
    .filter(Boolean)
    .join(', ');
table(['Тьєр', 'BP усього', 'Безкоштовно', 'Преміум'], PASS_TIERS.map((t) => [t.tier, n(t.bpRequired), rw(t.reward), rw(t.premiumReward)]));

const out = process.argv[2] ?? 'rewards.md';
writeFileSync(out, L.join('\n'), 'utf-8');
console.log('ok', out, L.length, 'lines');
