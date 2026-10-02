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

  private scrollToCurrent(): void {
    requestAnimationFrame(() => this.el.querySelector('.tier-col.current')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
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
    const unlocked = bpUnlocked && trackUnlocked;
    const done = claimed.includes(def.tier);
    const claimBtn = unlocked && !done ? button(t('pass.claim'), () => void this.claim(def.tier, track, claimBtn!), 'btn primary tiny') : null;

    let status: HTMLElement;
    if (done) status = icon(Icons.star, 'ico tier-done');
    else if (!trackUnlocked) status = icon(Icons.lock, 'ico tier-lock premium-lock');
    else if (!bpUnlocked) status = icon(Icons.lock, 'ico tier-lock');
    else status = claimBtn!;

    const special = reward.plane || reward.weapon || reward.item;
    const name = this.rewardName(reward);
    return h(
      'div',
      { class: `tier-cell ${track}${unlocked ? ' unlocked' : ' locked'}${done ? ' done' : ''}${unlocked && !done ? ' ready' : ''}${special ? ' special' : ''}` },
      h(
        'div',
        { class: 'tier-reward' },
        h('span', { class: 'tier-visual' }, this.rewardVisual(reward)),
        name ? h('span', { class: 'tier-name' }, name) : null,
        h(
          'span',
          { class: 'tier-amounts' },
          coinBadge(reward.coins, 'coin-badge small'),
          reward.crystals ? crystalBadge(reward.crystals, 'coin-badge small crystal-badge') : null,
          h('span', { class: 'xp-badge small' }, `+${reward.xp}`),
        ),
      ),
      status,
    );
  }

  private tierColumn(def: PassTierView, bp: number, premiumOwned: boolean, claimedFree: number[], claimedPremium: number[], currentTier: number): HTMLElement {
    return h(
      'div',
      { class: `tier-col${def.tier === currentTier ? ' current' : ''}` },
      this.rewardCell(def, 'premium', bp, premiumOwned, claimedPremium),
      h('span', { class: 'tier-n' }, String(def.tier)),
      this.rewardCell(def, 'free', bp, premiumOwned, claimedFree),
    );
  }

  protected build(): HTMLElement {
    const pass = Save.data.pass;
    const bp = pass.bpPoints;
    const next = this.tiers.find((tdef) => bp < tdef.bpRequired);
    const prevReq = next ? (this.tiers[this.tiers.indexOf(next) - 1]?.bpRequired ?? 0) : 0;
    const pct = next ? Math.min(100, Math.round(((bp - prevReq) / Math.max(1, next.bpRequired - prevReq)) * 100)) : 100;
    const currentTier = next ? next.tier : this.tiers.length;

    const claimable = Save.data.pass.claimable ?? 0;
    const claimAllBtn: HTMLButtonElement | null = claimable > 0 ? button(h('span', { class: 'buy-label' }, icon(Icons.gift, 'ico'), t('pass.claimAll'), h('span', { class: 'rail-badge inline' }, String(claimable))), () => void this.claimAll(claimAllBtn!), 'btn primary claim-all-btn', { 'data-autofocus': true }) : null;
    let premiumBanner: HTMLElement;
    if (pass.premium) {
      premiumBanner = h('div', { class: 'premium-banner owned' }, icon(Icons.star, 'ico gold'), t('pass.premiumOwned'));
    } else {
      const buyBtn = button(h('span', { class: 'buy-label' }, coinBadge(this.premiumPrice, 'coin-badge small')), () => void this.buyPremium(buyBtn), 'btn primary small');
      premiumBanner = h('div', { class: 'premium-banner' }, icon(Icons.star, 'ico'), h('span', {}, t('pass.buyPremium')), buyBtn);
    }

    return h(
      'div',
      { class: 'page battlepass' },
      screenHeader(t('pass.title'), () => this.onBack(), h('span', { class: 'bp-badge' }, icon(Icons.bolt, 'ico'), `${bp} BP`)),
      h('p', { class: 'page-sub' }, t('pass.subtitle')),
      this.loading && !this.tiers.length ? null : h('div', { class: 'pass-actions' }, premiumBanner, claimAllBtn),
      next ? h('div', { class: 'pass-progress' }, h('div', { class: 'quest-bar' }, h('i', { style: `width:${pct}%` })), h('span', {}, `${bp} / ${next.bpRequired} BP`)) : h('p', { class: 'muted' }, t('pass.maxed')),
      this.loading && !this.tiers.length
        ? h('p', { class: 'muted' }, t('common.loading'))
        : h(
            'div',
            { class: 'tier-track-wrap' },
            h('div', { class: 'tier-track' }, ...this.tiers.map((d) => this.tierColumn(d, bp, pass.premium, pass.claimedFree, pass.claimedPremium, currentTier))),
          ),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
