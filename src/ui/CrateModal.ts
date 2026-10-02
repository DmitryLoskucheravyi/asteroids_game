import { Sfx } from '../core/audio';
import { t, type TKey } from '../core/i18n';
import { Server, type CrateReward, type CrateType } from '../core/server';
import { Save } from '../core/storage';
import { CRATE_GLOW, crate3d } from '../game/CrateArt';
import { getItemDef } from '../game/items';
import { planeIconUrl } from '../game/PlaneArt';
import { getWeaponDef } from '../game/weapons';
import { Icons, button, coinBadge, crystalBadge, h, icon } from './dom';
import { Modal } from './Modal';
import { itemPic, weaponPic } from './screens/ItemsScreen';

const TIERS: readonly CrateType[] = ['common', 'rare', 'epic', 'mythic', 'legendary'];

/** Тривалості стадій (ms); рідкісні ящики тримають напругу довше. */
const DUR = { drop: 650, charge: [900, 1050, 1300, 1600, 2000], open: 600, card: 280 };

const wait = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));
const reducedMotion = (): boolean => !Save.data.settings.shake || matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Вибух піксельних іскор угору-вбік. */
function burst(host: HTMLElement, color: string, count: number, spread = 140): void {
  for (let i = 0; i < count; i++) {
    const angle = -90 + (Math.random() - 0.5) * spread;
    const dist = 90 + Math.random() * 160;
    const p = h('span', { class: 'crate-particle', style: `--angle:${angle}deg;--dist:${dist}px;--size:${3 + Math.floor(Math.random() * 5)}px;--c:${Math.random() < 0.3 ? '#fff' : color};--delay:${Math.random() * 120}ms` });
    host.append(p);
    setTimeout(() => p.remove(), 1500);
  }
}

/** Іскри, що втягуються в ящик під час заряду. */
function suck(host: HTMLElement, color: string, count: number, duration: number): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 360;
    const p = h('span', { class: 'crate-suck', style: `--angle:${angle}deg;--c:${color};--delay:${Math.random() * duration * 0.8}ms;--d:${300 + Math.random() * 300}ms` });
    host.append(p);
    setTimeout(() => p.remove(), duration + 800);
  }
}

/** Рідкість картки нагороди — колір рамки і сила появи. */
export function rewardTier(r: CrateReward): CrateType {
  switch (r.kind) {
    case 'plane':
      return 'legendary';
    case 'weapon':
      return 'epic';
    case 'item':
      return r.rarity;
    case 'crystals':
      return r.amount >= 20 ? 'epic' : 'rare';
    default:
      return 'common';
  }
}

function countUp(el: HTMLElement, total: number, prefix = '+'): void {
  const started = performance.now();
  const tick = (): void => {
    const k = Math.min(1, (performance.now() - started) / 700);
    el.textContent = `${prefix}${Math.round(total * (1 - Math.pow(1 - k, 3))).toLocaleString('uk-UA')}`;
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function rewardCard(r: CrateReward, index: number): HTMLElement {
  let pic: HTMLElement;
  let title: string;
  let sub = '';
  let amountEl: HTMLElement | null = null;
  switch (r.kind) {
    case 'coins':
    case 'crystals':
    case 'xp':
      pic = r.kind === 'xp' ? h('div', { class: 'reward-pic xp' }, h('span', {}, 'XP')) : h('div', { class: `reward-pic ${r.kind === 'coins' ? 'coin' : 'crystal'}` }, icon(r.kind === 'coins' ? Icons.coin : Icons.crystal, 'ico'));
      amountEl = h('b', { class: 'reward-amount' }, '+0');
      countUp(amountEl, r.amount);
      title = t(r.kind === 'coins' ? 'crates.coins' : r.kind === 'crystals' ? 'crates.crystals' : 'crates.xp');
      break;
    case 'item': {
      const def = getItemDef(r.defId);
      pic = itemPic(r.defId, 'item-pic reward-item');
      title = def ? t(def.nameKey) : r.defId;
      sub = t(`item.rarity.${r.rarity}` as TKey);
      break;
    }
    case 'weapon': {
      const def = getWeaponDef(r.weaponId);
      pic = weaponPic(r.weaponId, 'item-pic reward-item');
      title = def ? t(def.nameKey) : r.weaponId;
      sub = t('items.weapon');
      break;
    }
    case 'plane':
      pic = h('img', { class: 'reward-plane', src: planeIconUrl(r.planeId), alt: '' });
      title = t(`plane.${r.planeId}` as TKey);
      sub = t('crates.newPlane');
      break;
  }
  const tier = rewardTier(r);
  return h(
    'div',
    { class: `reward-card tier-${tier}`, style: `--i:${index}` },
    h(
      'div',
      { class: 'reward-card-inner' },
      h('div', { class: 'reward-back' }),
      h('div', { class: 'reward-front' }, h('span', { class: 'reward-shine' }), pic, amountEl, h('span', { class: 'reward-title' }, title), sub ? h('small', { class: `reward-sub rarity-${tier}` }, sub) : null),
    ),
  );
}

/**
 * Відкриття одного ящика:
 * падає згори з пилом → гойдається → заряд (іскри втягуються, фон темнішає, тряска наростає)
 * → кришка вибиває з ударною хвилею, промінь і обертові промені позаду → картки вилітають дугою.
 */
export function openCrateModal(crateId: string, crateType: CrateType, onApplied: () => void): void {
  const reduced = reducedMotion();
  const glow = CRATE_GLOW[crateType];
  const tier = TIERS.indexOf(crateType);

  const crate = crate3d(crateType, 150, 'modal-crate dropping');
  const rays = h('div', { class: 'crate-rays' });
  const beam = h('div', { class: 'crate-beam' });
  const shock = h('div', { class: 'crate-shock' });
  const dust = h('div', { class: 'crate-dust' });
  const particles = h('div', { class: 'crate-particles' });
  const flash = h('div', { class: 'crate-flash' });
  const stage = h('div', { class: `crate-stage tier-${tier} crate-${crateType}`, style: `--glow:${glow}` }, rays, beam, shock, crate, dust, particles, flash);
  const label = h('p', { class: `crate-label rarity-${crateType}` }, t(`crate.${crateType}` as TKey));
  const cards = h('div', { class: 'reward-row' });
  const openBtn = button(h('span', { class: 'launch-inner' }, icon(Icons.gift, 'ico'), h('b', {}, t('crates.openBtn'))), () => void run(), 'launch-btn main crate-open-btn', { 'data-autofocus': true });
  const takeBtn = button(h('span', { class: 'launch-inner' }, h('b', {}, t('crates.take'))), () => m.close(), 'launch-btn main crate-open-btn', { hidden: true });

  const m = new Modal({
    cls: `crate-modal crate-modal-${crateType}`,
    body: [label, stage, cards, openBtn, takeBtn],
    actions: [],
    onEscape: () => m.close(),
  }).open();

  // приземлення
  setTimeout(() => {
    crate.classList.remove('dropping');
    crate.classList.add('idle');
    if (!reduced) dust.classList.add('go');
    Sfx.shieldHit();
  }, reduced ? 0 : DUR.drop);

  async function run(): Promise<void> {
    openBtn.remove();
    const request = Server.openCrate(crateId);
    const chargeMs = reduced ? 150 : DUR.charge[tier];

    Sfx.crateCharge();
    crate.classList.remove('idle');
    crate.classList.add('charging');
    crate.style.setProperty('--charge', `${chargeMs}ms`);
    stage.classList.add('charging');
    if (!reduced) {
      suck(particles, glow, 14 + tier * 8, chargeMs);
      setTimeout(() => Sfx.crateShake(), chargeMs * 0.5);
    }
    await wait(chargeMs);

    let result: Awaited<typeof request>;
    try {
      result = await request;
    } catch {
      Sfx.warning();
      m.close();
      return;
    }
    Save.applyProfile(result.profile);
    onApplied();

    crate.classList.remove('charging');
    crate.classList.add('open');
    stage.classList.remove('charging');
    stage.classList.add('opened');
    Sfx.crateBurst();
    if (tier >= 3) Sfx.rareReward();
    burst(particles, glow, reduced ? 0 : 26 + tier * 10);
    if (!reduced && tier >= 3) m.el.classList.add('shake-hard');
    await wait(reduced ? 100 : DUR.open);

    // картки — від звичайних до найцінніших, найрідкісніша з паузою
    const sorted = [...result.rewards].sort((a, b) => TIERS.indexOf(rewardTier(a)) - TIERS.indexOf(rewardTier(b)));
    for (let i = 0; i < sorted.length; i++) {
      const rt = TIERS.indexOf(rewardTier(sorted[i]));
      if (!reduced && rt >= 3) await wait(350);
      cards.append(rewardCard(sorted[i], i));
      if (rt >= 3) Sfx.rareReward();
      else Sfx.pickup();
      await wait(reduced ? 40 : DUR.card);
    }
    takeBtn.hidden = false;
    takeBtn.focus();
  }
}

/** Відкрити всі: сітка ящиків розкривається каскадом, потім підсумок і рідкісні знахідки. */
export function openAllCratesModal(crates: { id: string; crateType: CrateType }[], onApplied: () => void): void {
  if (!crates.length) return;
  const reduced = reducedMotion();
  const order = [...crates].sort((a, b) => TIERS.indexOf(a.crateType) - TIERS.indexOf(b.crateType));
  const size = order.length > 24 ? 56 : order.length > 12 ? 68 : 84;
  const cells = order.map((c) => {
    const cube = crate3d(c.crateType, size, 'mini-crate idle');
    const sparks = h('div', { class: 'crate-particles' });
    const cell = h('div', { class: `all-cell crate-${c.crateType}`, style: `--glow:${CRATE_GLOW[c.crateType]}` }, cube, sparks);
    return { c, cube, cell, sparks };
  });
  const grid = h('div', { class: 'all-grid', style: `--cell:${size + 34}px` }, ...cells.map((x) => x.cell));
  const summary = h('div', { class: 'all-summary', hidden: true });
  const startBtn = button(h('span', { class: 'launch-inner' }, icon(Icons.gift, 'ico'), h('b', {}, t('crates.openAllN', { n: crates.length }))), () => void run(), 'launch-btn main crate-open-btn', { 'data-autofocus': true });
  const takeBtn = button(h('span', { class: 'launch-inner' }, h('b', {}, t('crates.take'))), () => m.close(), 'launch-btn main crate-open-btn', { hidden: true });

  const m = new Modal({ cls: 'crate-modal all-modal', title: t('crates.openAll'), body: [grid, summary, startBtn, takeBtn], actions: [], onEscape: () => m.close() }).open();

  async function run(): Promise<void> {
    startBtn.remove();
    const request = Server.openAllCrates();
    Sfx.crateCharge();
    for (const x of cells) x.cube.classList.replace('idle', 'charging');
    await wait(reduced ? 100 : 900);

    let result: Awaited<typeof request>;
    try {
      result = await request;
    } catch {
      Sfx.warning();
      m.close();
      return;
    }
    Save.applyProfile(result.profile);
    onApplied();
    const byId = new Map(result.results.map((r) => [r.crateId, r.rewards]));

    // каскад: ящики відкриваються хвилею по рядах
    const step = reduced ? 0 : Math.max(35, Math.min(110, 1800 / cells.length));
    for (const x of cells) {
      x.cube.classList.replace('charging', 'open');
      x.cell.classList.add('opened');
      const rewards = byId.get(x.c.id) ?? [];
      const best = rewards.reduce((acc, r) => Math.max(acc, TIERS.indexOf(rewardTier(r))), 0);
      if (best >= 2) x.cell.classList.add(`found-${TIERS[best]}`);
      burst(x.sparks, CRATE_GLOW[x.c.crateType], reduced ? 0 : 8, 120);
      Sfx.crateBurst();
      await wait(step);
    }

    // підсумок
    const all = result.results.flatMap((r) => r.rewards);
    const sum = (kind: 'coins' | 'crystals' | 'xp') => all.reduce((s, r) => s + (r.kind === kind ? r.amount : 0), 0);
    const specials = all.filter((r) => r.kind === 'item' || r.kind === 'weapon' || r.kind === 'plane').sort((a, b) => TIERS.indexOf(rewardTier(b)) - TIERS.indexOf(rewardTier(a)));
    summary.append(
      h('div', { class: 'all-totals' }, coinBadge(sum('coins'), 'coin-badge big'), crystalBadge(sum('crystals'), 'coin-badge big crystal-badge'), h('span', { class: 'xp-badge big' }, `+${sum('xp')} XP`)),
      specials.length ? h('div', { class: 'reward-row' }, ...specials.map((r, i) => rewardCard(r, i))) : h('p', { class: 'muted small' }, t('crates.noSpecials')),
    );
    summary.hidden = false;
    if (specials.some((r) => TIERS.indexOf(rewardTier(r)) >= 3)) Sfx.rareReward();
    else Sfx.win();
    takeBtn.hidden = false;
    takeBtn.focus();
  }
}
