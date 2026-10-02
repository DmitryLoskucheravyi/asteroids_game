import { Sfx } from '../core/audio';
import { t, type TKey } from '../core/i18n';
import { Server, type CrateReward, type CrateType } from '../core/server';
import { Save } from '../core/storage';
import { planeIconUrl } from '../game/PlaneArt';
import { Icons, button, h, icon } from './dom';
import { Modal } from './Modal';

/** Тривалості стадій (ms) — єдине джерело правди, передається в CSS через inline-змінні. */
const DUR = { charge: 950, shake: 700, burst: 550 };
const TYPE_LABEL: Record<CrateType, TKey> = { common: 'crate.common', rare: 'crate.rare', legendary: 'crate.legendary' };
const TYPE_COLOR: Record<CrateType, string> = { common: '#bfd4e6', rare: '#4fb4ff', legendary: '#ffd24f' };

const wait = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

function burstParticles(host: HTMLElement, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (360 / count) * i + (Math.random() * 24 - 12);
    const dist = 60 + Math.random() * 70;
    const size = 4 + Math.random() * 5;
    const p = h('span', {
      class: 'crate-particle',
      style: `--angle:${angle}deg;--dist:${dist}px;--size:${size}px;--c:${color}`,
    });
    host.append(p);
    setTimeout(() => p.remove(), 1000);
  }
}

function ringSvg(color: string): HTMLElement {
  return h('div', {
    class: 'crate-ring',
    html: `<svg viewBox="0 0 100 100"><circle class="ring-bg" cx="50" cy="50" r="44"/><circle class="ring-fill" cx="50" cy="50" r="44" style="stroke:${color}"/></svg>`,
  });
}

/** Повна послідовність відкриття ящика: idle → charge → shake → burst → reveal. Викликач отримує оновлений профіль. */
export function openCrateModal(crateId: string, crateType: CrateType, onApplied: () => void): void {
  const reduced = !Save.data.settings.shake || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const color = TYPE_COLOR[crateType];

  const box = h('div', { class: `crate-box crate-${crateType}` }, icon(Icons.gift, 'ico crate-icon'));
  const particleHost = h('div', { class: 'crate-particles' });
  const flash = h('div', { class: 'crate-flash' });
  const stage = h('div', { class: 'crate-stage' }, flash, particleHost, box);
  const ring = ringSvg(color);
  const label = h('p', { class: 'crate-label' }, t(TYPE_LABEL[crateType]));
  const revealHost = h('div', { class: 'crate-reveal' });
  const openBtn = button(t('crates.openBtn'), () => void run(), 'btn primary crate-open-btn', { 'data-autofocus': true });

  const m = new Modal({
    cls: 'crate-modal',
    body: [label, h('div', { class: 'crate-wrap' }, stage, ring), revealHost, openBtn],
    actions: [button(t('common.close'), () => m.close(), 'btn', { tabindex: -1 })],
    onEscape: () => m.close(),
  }).open();

  async function run(): Promise<void> {
    openBtn.remove();

    // 1) заряджання — кільце заповнюється, запит на сервер летить паралельно
    Sfx.crateCharge();
    const rewardPromise = Server.openCrate(crateId);
    ring.classList.add('charging');
    ring.style.setProperty('--dur', `${DUR.charge}ms`);
    await wait(reduced ? 150 : DUR.charge);

    // 2) трясіння
    if (!reduced) {
      Sfx.crateShake();
      box.classList.add('shaking');
      await wait(DUR.shake);
      box.classList.remove('shaking');
    }

    // 3) вибух
    box.classList.add('bursting');
    flash.classList.add('go');
    Sfx.crateBurst();
    burstParticles(particleHost, color, reduced ? 0 : 22);
    await wait(reduced ? 120 : DUR.burst);

    const { profile, reward } = await rewardPromise;
    Save.applyProfile(profile);
    onApplied();

    stage.classList.add('done');
    ring.classList.remove('charging');
    ring.classList.add('done');
    revealHost.append(renderReward(reward, crateType));
    if (crateType === 'legendary' || reward.kind === 'plane') Sfx.rareReward();
    else Sfx.win();
  }
}

function renderReward(reward: CrateReward, crateType: CrateType): HTMLElement {
  if (reward.kind === 'plane') {
    return h(
      'div',
      { class: 'crate-reward-card plane-reward' },
      h('span', { class: 'new-badge' }, t('crates.newPlane')),
      h('img', { class: 'reward-plane-img', src: planeIconUrl(reward.planeId) }),
      h('p', {}, t(`plane.${reward.planeId}` as TKey)),
    );
  }
  if (reward.kind === 'xp') {
    return h('div', { class: 'crate-reward-card' }, h('span', { class: 'xp-badge big' }, `+${reward.amount} XP`));
  }
  const totalEl = h('span', { class: 'coin-amount' }, '0');
  const card = h('div', { class: 'crate-reward-card' }, h('span', { class: 'coin-badge big' }, icon(Icons.coin, 'ico coin'), totalEl));
  const started = performance.now();
  const tick = (): void => {
    const k = Math.min(1, (performance.now() - started) / 700);
    totalEl.textContent = `+${Math.round(reward.amount * (1 - Math.pow(1 - k, 3)))}`;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  void crateType;
  return card;
}
