// Перевірка інваріантів балансу (розділ 5 звіту): запуск `npm run check:balance`.
import { RP_BY_PLACE, botStrength, MAX_DIVISION_INDEX, RP_PER_DIVISION } from '../src/content/ranks.js';
import { PLANE_IDS, PLANE_PRICES, levelUpCost, tierUpCost, upgradeRate, MAX_TIER, MAX_LEVEL_IN_TIER, planeCombat } from '../src/content/planes.js';
import { ITEM_DEFS } from '../src/content/items.js';
import { WEAPON_DEFS } from '../src/content/weapons.js';
import { MAX_GEAR_LEVEL, itemHpMul, weaponDamageMul } from '../src/shared/gear.js';
import { PASS_TIERS } from '../src/content/pass.js';

let failed = 0;
const check = (name: string, ok: boolean, info = ''): void => {
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ` — ${info}` : ''}`);
  if (!ok) failed++;
};

// рейтинг
check('Сума RP по місцях = 0', RP_BY_PLACE.reduce((a, b) => a + b, 0) === 0, String(RP_BY_PLACE.reduce((a, b) => a + b, 0)));
const steps = Array.from({ length: MAX_DIVISION_INDEX + 1 }, (_, i) => {
  const b = botStrength(i * RP_PER_DIVISION);
  return (b.tier - 1) * 4 + (b.level - 1);
});
check('Сила ботів неспадна', steps.every((s, i) => i === 0 || s >= steps[i - 1]));
check('Сусідні ранги відрізняються ≤ 1 щабель', steps.every((s, i) => i === 0 || s - steps[i - 1] <= 1));

// прокачка
for (const id of PLANE_IDS) {
  const price = PLANE_PRICES[id];
  let total = 0;
  let prev = 0;
  let mono = true;
  for (let t = 1; t <= MAX_TIER; t++) {
    for (let l = 1; l < MAX_LEVEL_IN_TIER; l++) {
      const c = levelUpCost(price, t, l);
      if (l > 1 && c < prev) mono = false;
      prev = c;
      total += c;
    }
    if (t < MAX_TIER) total += tierUpCost(price, t).coins;
  }
  check(`${id}: вартість прокачки зростає`, mono);
  check(`${id}: повна прокачка = 204 × f`, total === 204 * upgradeRate(price), `${total}`);
}

// розкид сили свіжих і прокачаних літаків (PI = HP × урон)
const pi = (id: string, tier: number, level: number) => {
  const c = planeCombat(id, tier, level);
  return c.hp * c.damageMul;
};
// EPI зі звіту: HP × урон ÷ (хітбокс / 15) — малий хітбокс теж є живучістю
const HITBOX: Record<string, number> = { falcon: 15, phantom: 13, blaze: 16, wasp: 11, collector: 16, swift: 14, titan: 17, chronos: 14, viper: 13, thunder: 15, bastion: 17, ufo: 15, nova: 14, phoenix: 14 };
const fresh = PLANE_IDS.map((id) => pi(id, 1, 1) / (HITBOX[id] / 15));
check('Розкид свіжих літаків (EPI) ≤ 1.3×', Math.max(...fresh) / Math.min(...fresh) <= 1.3, (Math.max(...fresh) / Math.min(...fresh)).toFixed(2));

// предмети
const passives = ITEM_DEFS.filter((d) => d.slot === 'passive');
const actives = ITEM_DEFS.filter((d) => d.slot === 'active');
const maxDmg = Math.max(...passives.map((p) => p.combat?.damage ?? 0)) + Math.max(...actives.map((a) => a.combat?.damage ?? 0));
check('Сумарний бонус урону предметів ≤ +27%', maxDmg <= 0.27 + 1e-9, `${Math.round(maxDmg * 100)}%`);
const maxFire = Math.max(...passives.map((p) => p.combat?.fireRate ?? 0)) + 0.7;
check('Сумарна скорострільність ≤ +80%', maxFire <= 0.8 + 1e-9, `${Math.round(maxFire * 100)}%`);

// розрив новачок / повна збірка в PvP
const maxPlane = planeCombat('phoenix', 4, 4);
// повна збірка: прокачані на максимум зброя (урон) і пасив (HP)
const maxItemHp = Math.max(...passives.map((p) => p.combat?.hp ?? 0)) * itemHpMul(MAX_GEAR_LEVEL);
const fullPi = (maxPlane.hp + maxItemHp) * maxPlane.damageMul * (1 + maxDmg) * weaponDamageMul(MAX_GEAR_LEVEL);
check('Розрив новачок/максимум ≤ 3×', fullPi / pi('falcon', 1, 1) <= 3, (fullPi / pi('falcon', 1, 1)).toFixed(2));

// зброя: одне влучання ≤ 50% HP найслабшого літака забезпечує кап на сервері; перевіряємо, що без капу ракета не перевищує 100%
const maxHit = Math.max(...WEAPON_DEFS.map((w) => w.damage)) * maxPlane.damageMul * (1 + maxDmg) * weaponDamageMul(MAX_GEAR_LEVEL);
check('Найсильніше влучання < найменшого HP (до капу 50%)', maxHit < Math.min(...PLANE_IDS.map((id) => planeCombat(id, 1, 1).hp)), maxHit.toFixed(1));

// пропуск
check('BP пропуску зростає', PASS_TIERS.every((t, i) => i === 0 || t.bpRequired > PASS_TIERS[i - 1].bpRequired));
const passCatalog = PASS_TIERS.flatMap((t) => [t.reward, t.premiumReward]).filter((r) => r.item || r.weapon || r.plane);
const ids = passCatalog.map((r) => r.item ?? r.weapon ?? r.plane);
check('У пропуску немає дублікатів', new Set(ids).size === ids.length);
check('У пропуску ≤ половини предметів', passCatalog.filter((r) => r.item).length <= ITEM_DEFS.length / 2);

console.log(failed ? `\n${failed} перевірок не пройдено` : '\nУсі інваріанти виконуються');
process.exit(failed ? 1 : 0);
