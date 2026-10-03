import { Sfx } from '../../core/audio';
import { t } from '../../core/i18n';
import { Server, type PassRewardView, type PassTierView } from '../../core/server';
import { crate3d } from '../../game/CrateArt';
import { getItemDef } from '../../game/items';
import { planeIconUrl } from '../../game/PlaneArt';
import { getWeaponDef } from '../../game/weapons';
import { toast } from '../Modal';
import { itemPic, weaponPic } from './ItemsScreen';
import { type TKey } from '../../core/i18n';
import { Save } from '../../core/storage';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { focusFirst } from '../nav';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

type Track = 'free' | 'premium';

/** Сезонний пропуск: два ряди тьєрів (платний зверху, безкоштовний знизу), що відкриваються BP. */
export class BattlePassScreen extends Screen {
  private tiers: PassTierView[] = [];
  private premiumPrice = 0;
  private seasonEndsAt = '';
  private loading = true;

  onShow(): void {
    super.onShow();
    if (this.loading) void this.load();
    else this.scrollToCurrent();
  }

  private async load(): Promise<void> {
    try {
      const { season, bpPoints, premium, claimedFree, claimedPremium } = await Server.pass();
      this.tiers = season.tiers;
      this.premiumPrice = season.premiumPrice;
      this.seasonEndsAt = season.endsAt;
      Save.data.pass = { seasonId: season.id, bpPoints, premium, claimedFree, claimedPremium, claimable: this.countClaimable(season.tiers, bpPoints, premium, claimedFree, claimedPremium) };
      Save.save();
    } finally {
      this.loading = false;
      this.render();
      focusFirst(this.el);
      this.scrollToCurrent();
    }
  }

  private countClaimable(tiers: PassTierView[], bp: number, premium: boolean, free: number[], prem: number[]): number {
    let n = 0;
    for (const d of tiers) {
      if (bp < d.bpRequired) break;
      if (!free.includes(d.tier)) n++;
      if (premium && !prem.includes(d.tier)) n++;
    }
    return n;
  }

  private async claimAll(btn: HTMLButtonElement): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    try {
      const { profile, total } = await Server.claimAllPass();
      Save.applyProfile(profile);
      Sfx.rareReward();
      toast(t('pass.claimedAll', { n: total.tiers, coins: total.coins, crystals: total.crystals, crates: total.crates }));
      this.render();
      this.scrollToCurrent();
    } catch {
      Sfx.warning();
      btn.removeAttribute('aria-disabled');
    }
  }

  /** Головна картинка нагороди — найцінніше, що є в тьєрі. */
  private rewardVisual(r: PassRewardView): HTMLElement {
    if (r.plane) return h('img', { class: 'tier-plane', src: planeIconUrl(r.plane), alt: t(`plane.${r.plane}` as TKey), title: t(`plane.${r.plane}` as TKey) });
    if (r.weapon) return weaponPic(r.weapon, 'item-pic small');
    if (r.item) return itemPic(r.item, 'item-pic small');
    if (r.crate) return crate3d(r.crate, 34, 'tile-crate');
    if (r.crystals) return icon(Icons.crystal, 'ico tier-big crystal');
    return icon(Icons.coin, 'ico tier-big coin');
  }

  private rewardName(r: PassRewardView): string | null {
    if (r.plane) return t(`plane.${r.plane}` as TKey);
    if (r.weapon) return t(getWeaponDef(r.weapon)?.nameKey ?? 'items.weapon');
    if (r.item) {
      const d = getItemDef(r.item);
      return d ? t(d.nameKey) : null;
    }
    if (r.crate) return t(`crate.${r.crate}` as TKey);
    return null;
  }

  private scrollToCurrent(smooth = false): void {
    requestAnimationFrame(() => {
      const scroller = this.el.querySelector<HTMLElement>('.bp-scroll');
      const col = this.el.querySelector<HTMLElement>('.bp-col.current');
      if (!scroller || !col) return;
      scroller.scrollTo({ left: col.offsetLeft - scroller.clientWidth / 2 + col.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  private scrollBy(dir: 1 | -1): void {
    const scroller = this.el.querySelector<HTMLElement>('.bp-scroll');
    scroller?.scrollBy({ left: dir * scroller.clientWidth * 0.7, behavior: 'smooth' });
  }

  private async buyPremium(btn: HTMLButtonElement): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    try {
      const { profile } = await Server.buyPremiumPass();
      Save.applyProfile(profile);
      Sfx.win();
      this.render();
    } catch {
      Sfx.warning();
      toast(t('pass.needGems'));
      btn.removeAttribute('aria-disabled');
    }
  }

  private async claim(tier: number, track: Track, btn: HTMLButtonElement): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    try {
      const { profile } = await Server.claimTier(tier, track);
      Save.applyProfile(profile);
      Sfx.win();
      this.render();
      this.scrollToCurrent();
    } catch {
      Sfx.warning();
      btn.removeAttribute('aria-disabled');
    }
  }

  private rewardCell(def: PassTierView, track: Track, bp: number, premiumOwned: boolean, claimed: number[]): HTMLElement {
    const reward = track === 'premium' ? def.premiumReward : def.reward;
    const bpUnlocked = bp >= def.bpRequired;
    const trackUnlocked = track === 'free' || premiumOwned;
    const done = claimed.includes(def.tier);
    const ready = bpUnlocked && trackUnlocked && !done;
    const special = !!(reward.plane || reward.weapon || reward.item);

    // низ картки: кнопка, «отримано» або що потрібно, щоб відкрити
    let foot: HTMLElement;
    if (done) foot = h('span', { class: 'bp-state done' }, icon(Icons.check, 'ico'), t('pass.claimed'));
    else if (ready) {
      const btn: HTMLButtonElement = button(t('pass.claim'), () => void this.claim(def.tier, track, btn), 'btn primary tiny bp-claim');
      foot = btn;
    } else if (!trackUnlocked) foot = h('span', { class: 'bp-state premium' }, icon(Icons.lock, 'ico'), t('pass.premium'));
    else foot = h('span', { class: 'bp-state' }, icon(Icons.lock, 'ico'), `${def.bpRequired} BP`);

    return h(
      'div',
      { class: `bp-cell ${track}${done ? ' done' : ''}${ready ? ' ready' : ''}${!bpUnlocked || !trackUnlocked ? ' locked' : ''}${special ? ' special' : ''}` },
      h('span', { class: 'bp-visual' }, this.rewardVisual(reward)),
      h('span', { class: 'bp-name' }, this.rewardName(reward) ?? (reward.crystals ? t('pass.crystalsReward') : t('pass.coinsReward'))),
      h(
        'span',
        { class: 'bp-amounts' },
        coinBadge(reward.coins, 'coin-badge small'),
        reward.crystals ? crystalBadge(reward.crystals, 'coin-badge small crystal-badge') : null,
        h('span', { class: 'bp-xp' }, `+${reward.xp} XP`),
      ),
      foot,
    );
  }

  /** Стовпчик тьєра: преміум зверху, вузол доріжки з номером, безкоштовна знизу. */
  private tierColumn(def: PassTierView, index: number, bp: number, premiumOwned: boolean, claimedFree: number[], claimedPremium: number[], currentTier: number): HTMLElement {
    const prevReq = this.tiers[index - 1]?.bpRequired ?? 0;
    // заповнення доріжки в цьому стовпчику — від попереднього тьєра до цього
    const fill = bp >= def.bpRequired ? 1 : bp <= prevReq ? 0 : (bp - prevReq) / Math.max(1, def.bpRequired - prevReq);
    return h(
      'div',
      { class: `bp-col${def.tier === currentTier ? ' current' : ''}${bp >= def.bpRequired ? ' reached' : ''}` },
      this.rewardCell(def, 'premium', bp, premiumOwned, claimedPremium),
      h('div', { class: 'bp-rail' }, h('i', { class: 'bp-rail-fill', style: `width:${Math.round(fill * 100)}%` }), h('span', { class: 'bp-node' }, String(def.tier))),
      this.rewardCell(def, 'free', bp, premiumOwned, claimedFree),
    );
  }

  /** Шапка: досягнутий тьєр, прогрес до наступного, кінець сезону, преміум і «Зібрати все». */
  private hero(bp: number, premium: boolean): HTMLElement {
    const next = this.tiers.find((d) => bp < d.bpRequired);
    const idx = next ? this.tiers.indexOf(next) : this.tiers.length;
    const prevReq = this.tiers[idx - 1]?.bpRequired ?? 0;
    const pct = next ? Math.min(100, ((bp - prevReq) / Math.max(1, next.bpRequired - prevReq)) * 100) : 100;
    const days = this.seasonEndsAt ? Math.max(0, Math.ceil((new Date(this.seasonEndsAt).getTime() - Date.now()) / 86_400_000)) : null;

    const claimable = Save.data.pass.claimable ?? 0;
    const claimAllBtn: HTMLButtonElement | null = claimable > 0 ? button(h('span', { class: 'buy-label' }, icon(Icons.gift, 'ico'), t('pass.claimAll'), h('span', { class: 'rail-badge inline' }, String(claimable))), () => void this.claimAll(claimAllBtn!), 'btn primary claim-all-btn', { 'data-autofocus': true }) : null;

    const specials = this.tiers.filter((d) => d.premiumReward.plane || d.premiumReward.weapon || d.premiumReward.item).length;
    let premiumCard: HTMLElement;
    if (premium) premiumCard = h('div', { class: 'bp-premium owned' }, icon(Icons.star, 'ico'), h('div', {}, h('b', {}, t('pass.premiumOwned')), h('small', {}, t('pass.premiumOwnedSub'))));
    else {
      const buyBtn: HTMLButtonElement = button(h('span', { class: 'buy-label' }, crystalBadge(this.premiumPrice, 'coin-badge small crystal-badge')), () => void this.buyPremium(buyBtn), 'btn primary');
      premiumCard = h('div', { class: 'bp-premium' }, icon(Icons.star, 'ico'), h('div', {}, h('b', {}, t('pass.buyPremium')), h('small', {}, t('pass.premiumPitch', { n: this.tiers.length, s: specials }))), buyBtn);
    }

    return h(
      'section',
      { class: 'bp-hero' },
      h(
        'div',
        { class: 'bp-level' },
        h('small', {}, days !== null ? t('pass.endsIn', { d: days }) : t('pass.title')),
        h('div', { class: 'bp-level-row' }, h('b', { class: 'bp-tier-big' }, String(idx)), h('span', {}, t('pass.tierOf', { n: this.tiers.length }))),
        h('div', { class: 'bp-progress' }, h('i', { style: `width:${pct}%` })),
        h('small', { class: 'muted' }, next ? t('pass.toNext', { bp, need: next.bpRequired, left: next.bpRequired - bp, tier: next.tier }) : t('pass.maxed')),
      ),
      h('div', { class: 'bp-side' }, premiumCard, claimAllBtn),
    );
  }

  protected build(): HTMLElement {
    const pass = Save.data.pass;
    const bp = pass.bpPoints;
    const next = this.tiers.find((d) => bp < d.bpRequired);
    const currentTier = next ? next.tier : this.tiers.length;
    const ready = !this.loading || this.tiers.length > 0;

    let board: HTMLElement | null = null;
    if (ready) {
      const scroller = h(
        'div',
        { class: 'bp-scroll' },
        h('div', { class: 'bp-grid' }, ...this.tiers.map((d, i) => this.tierColumn(d, i, bp, pass.premium, pass.claimedFree, pass.claimedPremium, currentTier))),
      );
      // колесо миші гортає доріжку вбік
      scroller.addEventListener(
        'wheel',
        (e) => {
          if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
          e.preventDefault();
          scroller.scrollLeft += e.deltaY;
        },
        { passive: false },
      );
      board = h(
        'section',
        { class: 'bp-board' },
        h(
          'div',
          { class: 'bp-labels' },
          h('div', { class: `bp-label premium${pass.premium ? '' : ' locked'}` }, icon(pass.premium ? Icons.star : Icons.lock, 'ico'), h('b', {}, t('pass.premium'))),
          h('div', { class: 'bp-label rail' }, icon(Icons.bolt, 'ico'), h('b', {}, t('pass.tierShort'))),
          h('div', { class: 'bp-label free' }, icon(Icons.gift, 'ico'), h('b', {}, t('pass.free'))),
        ),
        h('div', { class: 'bp-scroll-wrap' }, scroller, button(icon(Icons.chevronLeft), () => this.scrollBy(-1), 'bp-arrow left', { 'aria-label': t('pass.scrollLeft') }), button(icon(Icons.chevronRight), () => this.scrollBy(1), 'bp-arrow right', { 'aria-label': t('pass.scrollRight') })),
      );
    }

    return h(
      'div',
      { class: 'page battlepass' },
      screenHeader(t('pass.title'), () => this.onBack(), h('div', { class: 'bp-head-right' }, button(t('pass.toCurrent'), () => this.scrollToCurrent(true), 'btn small'), h('span', { class: 'bp-badge' }, icon(Icons.bolt, 'ico'), `${bp} BP`))),
      h('p', { class: 'page-sub' }, t('pass.subtitle')),
      ready ? this.hero(bp, pass.premium) : h('p', { class: 'muted' }, t('common.loading')),
      board,
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
