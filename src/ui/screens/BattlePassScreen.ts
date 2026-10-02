import { Sfx } from '../../core/audio';
import { t } from '../../core/i18n';
import { Server, type PassTierView } from '../../core/server';
import { Save } from '../../core/storage';
import { Icons, button, coinBadge, h, icon } from '../dom';
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
      Save.data.pass = { seasonId: season.id, bpPoints, premium, claimedFree, claimedPremium };
      Save.save();
    } finally {
      this.loading = false;
      this.render();
      focusFirst(this.el);
      this.scrollToCurrent();
    }
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

    return h(
      'div',
      { class: `tier-cell ${track}${unlocked ? ' unlocked' : ' locked'}${done ? ' done' : ''}` },
      h(
        'div',
        { class: `tier-reward${reward.crate ? ` crate-${reward.crate}` : ''}` },
        reward.crate ? icon(Icons.gift, 'ico') : icon(Icons.coin, 'ico coin'),
        coinBadge(reward.coins, 'coin-badge small'),
        h('span', { class: 'xp-badge small' }, `+${reward.xp}`),
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
      this.loading && !this.tiers.length ? null : premiumBanner,
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
