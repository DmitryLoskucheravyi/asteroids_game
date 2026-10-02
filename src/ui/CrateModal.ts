import { Sfx } from '../core/audio';
import { t, type TKey } from '../core/i18n';
import { Server, type CrateReward, type CrateType } from '../core/server';
import { Save } from '../core/storage';
import { CRATE_GLOW, crate3d } from '../game/CrateArt';
import { getItemDef } from '../game/items';
import { planeIconUrl } from '../game/PlaneArt';
import { getWeaponDef } from '../game/weapons';
import { Icons, button, h, icon } from './dom';
import { Modal } from './Modal';
import { itemPic, weaponPic } from './screens/ItemsScreen';

/** Тривалості стадій (ms) — збігаються з CSS-анімаціями ящика. */
const DUR = { charge: 1100, open: 520, card: 260 };

const wait = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

function burst(host: HTMLElement, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = -90 + (Math.random() - 0.5) * 140;
    const dist = 90 + Math.random() * 140;
    const p = h('span', { class: 'crate-particle', style: `--angle:${angle}deg;--dist:${dist}px;--size:${3 + Math.floor(Math.random() * 4)}px;--c:${color};--delay:${Math.random() * 120}ms` });
    host.append(p);
    setTimeout(() => p.remove(), 1400);
  }
}

/** Рідкість картки нагороди — визначає колір рамки і силу ефекту появи. */
function rewardTier(r: CrateReward): CrateType {
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

function rewardCard(r: CrateReward, index: number): HTMLElement {
  let pic: HTMLElement;
  let title: string;
  let sub = '';
  let amountEl: HTMLElement | null = null;
  switch (r.kind) {
    case 'coins':
      pic = h('div', { class: 'reward-pic coin' }, icon(Icons.coin, 'ico'));
      amountEl = h('b', { class: 'reward-amount' }, '+0');
      countUp(amountEl, r.amount);
      title = t('crates.coins');
      break;
    case 'crystals':
      pic = h('div', { class: 'reward-pic crystal' }, icon(Icons.crystal, 'ico'));
      amountEl = h('b', { class: 'reward-amount' }, '+0');
      countUp(amountEl, r.amount);
      title = t('crates.crystals');
      break;
    case 'xp':
      pic = h('div', { class: 'reward-pic xp' }, h('span', {}, 'XP'));
      amountEl = h('b', { class: 'reward-amount' }, '+0');
      countUp(amountEl, r.amount);
      title = t('crates.xp');
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
    h('div', { class: 'reward-card-inner' }, h('div', { class: 'reward-back' }), h('div', { class: 'reward-front' }, pic, amountEl, h('span', { class: 'reward-title' }, title), sub ? h('small', { class: `reward-sub rarity-${tier}` }, sub) : null)),
  );
}

/** Відкриття: ящик крутиться → трясеться й світиться → кришка злітає, б'є промінь → картки нагород вилітають по черзі. */
export function openCrateModal(crateId: string, crateType: CrateType, onApplied: () => void): void {
  const reduced = !Save.data.settings.shake || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const glow = CRATE_GLOW[crateType];

  const crate = crate3d(crateType, 150, 'modal-crate idle');
  const beam = h('div', { class: 'crate-beam' });
  const particles = h('div', { class: 'crate-particles' });
  const flash = h('div', { class: 'crate-flash' });
  const stage = h('div', { class: `crate-stage crate-${crateType}`, style: `--glow:${glow}` }, beam, crate, particles, flash);
  const label = h('p', { class: `crate-label rarity-${crateType}` }, t(`crate.${crateType}` as TKey));
  const cards = h('div', { class: 'reward-row' });
  const openBtn = button(t('crates.openBtn'), () => void run(), 'btn primary crate-open-btn', { 'data-autofocus': true });
  const takeBtn = button(t('crates.take'), () => m.close(), 'btn primary crate-open-btn', { hidden: true });

  const m = new Modal({
    cls: 'crate-modal',
    body: [label, stage, cards, openBtn, takeBtn],
    actions: [],
    onEscape: () => m.close(),
  }).open();

  async function run(): Promise<void> {
    openBtn.remove();
    const request = Server.openCrate(crateId);

    // 1) заряд: ящик розвертається до гравця, труситься дедалі сильніше, з щілин б'є світло
    Sfx.crateCharge();
    crate.classList.remove('idle');
    crate.classList.add('charging');
    if (!reduced) {
      setTimeout(() => Sfx.crateShake(), DUR.charge * 0.45);
      await wait(DUR.charge);
    } else await wait(150);

    let result: Awaited<typeof request>;
    try {
      result = await request;
    } catch {
      Sfx.warning();
      crate.classList.remove('charging');
      crate.classList.add('idle');
      m.close();
      return;
    }
    Save.applyProfile(result.profile);
    onApplied();

    // 2) кришка злітає, промінь і спалах
    crate.classList.remove('charging');
    crate.classList.add('open');
    stage.classList.add('opened');
    Sfx.crateBurst();
    burst(particles, glow, reduced ? 0 : 34);
    await wait(reduced ? 100 : DUR.open);

    // 3) картки по одній — від звичайних до найцінніших
    const order = ['common', 'rare', 'epic', 'mythic', 'legendary'];
    const sorted = [...result.rewards].sort((a, b) => order.indexOf(rewardTier(a)) - order.indexOf(rewardTier(b)));
    for (let i = 0; i < sorted.length; i++) {
      const card = rewardCard(sorted[i], i);
      cards.append(card);
      const tier = rewardTier(sorted[i]);
      if (tier === 'legendary' || tier === 'mythic') Sfx.rareReward();
      else Sfx.pickup();
      await wait(reduced ? 40 : DUR.card);
    }
    takeBtn.hidden = false;
    takeBtn.focus();
  }
}
