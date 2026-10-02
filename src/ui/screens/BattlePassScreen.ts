import { Sfx } from '../../core/audio';
import { t } from '../../core/i18n';
import { Server, type PassTierView } from '../../core/server';
import { Save } from '../../core/storage';
import { Icons, button, coinBadge, h, icon } from '../dom';
import { focusFirst } from '../nav';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Сезонний пропуск: горизонтальна стрічка тьєрів, що відкриваються очками пропуску (BP). */
export class BattlePassScreen extends Screen {
  private tiers: PassTierView[] = [];
  private loading = true;

  onShow(): void {
    super.onShow();
    if (this.loading) void this.load();
    else this.scrollToCurrent();
  }

  private async load(): Promise<void> {
    try {
      const { season, bpPoints, claimedTiers } = await Server.pass();
      this.tiers = season.tiers;
      Save.data.pass = { seasonId: season.id, bpPoints, claimedTiers };
      Save.save();
    } finally {
      this.loading = false;
      this.render();
      focusFirst(this.el);
      this.scrollToCurrent();
    }
  }

  private scrollToCurrent(): void {
    requestAnimationFrame(() => this.el.querySelector('.tier.current')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }

  private async claim(tier: number, btn: HTMLButtonElement): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    try {
      const { profile } = await Server.claimTier(tier);
      Save.applyProfile(profile);
      Sfx.win();
      this.render();
      this.scrollToCurrent();
    } catch {
      Sfx.warning();
      btn.removeAttribute('aria-disabled');
    }
  }

  private tierNode(def: PassTierView, bp: number, claimed: number[]): HTMLElement {
    const unlocked = bp >= def.bpRequired;
    const done = claimed.includes(def.tier);
    const current = unlocked && !done && bp < (this.tiers.find((x) => x.tier === def.tier + 1)?.bpRequired ?? Infinity);
    const claimBtn = unlocked && !done ? button(t('pass.claim'), () => void this.claim(def.tier, claimBtn!), 'btn primary small') : null;
    return h(
      'div',
      { class: `tier${unlocked ? ' unlocked' : ' locked'}${done ? ' done' : ''}${current ? ' current' : ''}` },
      h('span', { class: 'tier-n' }, String(def.tier)),
      h('div', { class: `tier-reward${def.reward.crate ? ` crate-${def.reward.crate}` : ''}` },
        def.reward.crate ? icon(Icons.gift, 'ico') : icon(Icons.coin, 'ico coin'),
        coinBadge(def.reward.coins, 'coin-badge tiny'),
        h('span', { class: 'xp-badge tiny' }, `+${def.reward.xp}`),
      ),
      unlocked ? (done ? icon(Icons.star, 'ico tier-done') : claimBtn) : icon(Icons.lock, 'ico tier-lock'),
    );
  }

  protected build(): HTMLElement {
    const pass = Save.data.pass;
    const bp = pass.bpPoints;
    const next = this.tiers.find((tdef) => bp < tdef.bpRequired);
    const prevReq = this.tiers[this.tiers.indexOf(next!) - 1]?.bpRequired ?? 0;
    const pct = next ? Math.min(100, Math.round(((bp - prevReq) / Math.max(1, next.bpRequired - prevReq)) * 100)) : 100;

    return h(
      'div',
      { class: 'page battlepass' },
      screenHeader(t('pass.title'), () => this.onBack(), h('span', { class: 'bp-badge' }, icon(Icons.bolt, 'ico'), `${bp} BP`)),
      h('p', { class: 'page-sub' }, t('pass.subtitle')),
      next ? h('div', { class: 'pass-progress' }, h('div', { class: 'quest-bar' }, h('i', { style: `width:${pct}%` })), h('span', {}, `${bp} / ${next.bpRequired} BP`)) : h('p', { class: 'muted' }, t('pass.maxed')),
      this.loading && !this.tiers.length
        ? h('p', { class: 'muted' }, t('common.loading'))
        : h('div', { class: 'tier-track' }, ...this.tiers.map((d) => this.tierNode(d, bp, pass.claimedTiers))),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
