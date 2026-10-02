import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { planeIconUrl, TIER_COLORS } from '../../game/PlaneArt';
import { effectivePlaneSpec, levelUpCost, tierUpCost, MAX_TIER, MAX_LEVEL_IN_TIER, PLANES, planeStats, type PlaneSpec } from '../../game/planes';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { Modal, toast } from '../Modal';
import { Screen } from '../Screen';
import { screenHeader, starsRow } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Ангар-магазин (аналог PlaneSelectForm): літаки купуються за коінс, у кожного своя фіча. */
export class HangarScreen extends Screen {
  private refocus(i: number): void {
    this.el.querySelectorAll<HTMLElement>('.plane-card')[i]?.querySelector<HTMLElement>('.btn')?.focus();
  }

  private actionFor(p: PlaneSpec, i: number): HTMLElement {
    const coins = Save.data.coins;
    if (Save.owns(p.id)) {
      const selected = Save.data.plane === p.id;
      return button(selected ? t('planes.selected') : t('planes.select'), async () => {
        const { profile } = await Server.selectPlane(p.id);
        Save.applyProfile(profile);
        this.render();
        this.refocus(i);
      }, `btn${selected ? ' btn-on' : ''}`, selected ? { 'data-autofocus': true } : {});
    }
    const affordable = coins >= p.price;
    return h(
      'div',
      { class: 'buy-row' },
      button(
        h('span', { class: 'buy-label' }, t('planes.buy'), coinBadge(p.price, 'coin-badge small')),
        async () => {
          try {
            const { profile } = await Server.buyPlane(p.id);
            Save.applyProfile(profile);
            Sfx.powerup();
            toast(t('planes.bought'));
            this.render();
            this.refocus(i);
          } catch {
            Sfx.warning();
          }
        },
        `btn buy${affordable ? ' affordable' : ' locked'}`,
        affordable ? {} : { 'aria-disabled': 'true' },
      ),
      affordable ? null : h('span', { class: 'need' }, t('planes.notEnough', { n: p.price - coins })),
    );
  }

  /** Модалка підтвердження прокачки з порівнянням статів "до/після". */
  private confirmUpgrade(p: PlaneSpec, i: number, kind: 'level' | 'tier'): void {
    const progress = Save.progressFor(p.id);
    const before = effectivePlaneSpec(p, progress);
    const nextProgress = kind === 'level' ? { ...progress, level: progress.level + 1 } : { ...progress, tier: progress.tier + 1, level: 1 };
    const after = effectivePlaneSpec(p, nextProgress);

    const row = (label: string, b: number, a: number, fmt: (n: number) => string = (n) => Math.round(n).toString()) =>
      h('div', { class: 'stat-compare-row' }, h('span', {}, label), h('span', { class: 'muted' }, fmt(b)), icon(Icons.dash, 'ico tiny'), h('span', { class: 'stat-after' }, fmt(a)));

    const m = new Modal({
      title: t('planes.upgradeTitle'),
      body: [row(t('planes.accelStat'), before.accel, after.accel), row(t('planes.speed'), before.maxSpeed, after.maxSpeed), row(t('planes.dragStat'), before.drag, after.drag, (n) => n.toFixed(1))],
      actions: [
        button(t('common.cancel'), () => m.close(), 'btn', { 'data-autofocus': true }),
        button(t('planes.confirm'), async () => {
          try {
            if (kind === 'level') {
              const { profile } = await Server.levelUpPlane(p.id);
              Save.applyProfile(profile);
            } else {
              const { profile } = await Server.tierUpPlane(p.id);
              Save.applyProfile(profile);
            }
            Sfx.powerup();
            m.close();
            this.render();
            this.refocus(i);
          } catch {
            Sfx.warning();
            m.close();
          }
        }, 'btn primary'),
      ],
      onEscape: () => m.close(),
    }).open();
  }

  private upgradeBlock(p: PlaneSpec, i: number): HTMLElement {
    const progress = Save.progressFor(p.id);
    const tierColor = TIER_COLORS[progress.tier] || undefined;
    const maxed = progress.tier >= MAX_TIER && progress.level >= MAX_LEVEL_IN_TIER;
    const canLevelUp = progress.level < MAX_LEVEL_IN_TIER;
    const canTierUp = progress.tier < MAX_TIER && progress.level >= MAX_LEVEL_IN_TIER;
    const lvlCost = levelUpCost(p.price, progress.tier, progress.level);
    const tCost = tierUpCost(p.price, progress.tier);

    const levelBtn = canLevelUp
      ? button(
          h('span', { class: 'buy-label' }, t('planes.levelUp'), coinBadge(lvlCost, 'coin-badge small')),
          () => this.confirmUpgrade(p, i, 'level'),
          `btn small${Save.data.coins >= lvlCost ? '' : ' locked'}`,
        )
      : null;
    const tierBtn = canTierUp
      ? button(
          h('span', { class: 'buy-label' }, t('planes.tierUp'), coinBadge(tCost.coins, 'coin-badge small'), crystalBadge(tCost.crystals, 'coin-badge small crystal-badge')),
          () => this.confirmUpgrade(p, i, 'tier'),
          `btn small${Save.data.coins >= tCost.coins && Save.data.crystals >= tCost.crystals ? '' : ' locked'}`,
        )
      : null;

    return h(
      'div',
      { class: 'upgrade-block' },
      h('div', { class: 'upgrade-head' }, h('span', { class: 'tier-chip', style: tierColor ? `color:${tierColor};border-color:${tierColor}` : undefined }, `${t('planes.tier')} ${progress.tier}`), starsRow(progress.level, MAX_LEVEL_IN_TIER, tierColor)),
      maxed ? h('span', { class: 'muted' }, t('planes.maxTier')) : h('div', { class: 'upgrade-actions' }, levelBtn, tierBtn),
    );
  }

  protected build(): HTMLElement {
    const bar = (label: string, v: number) =>
      h('div', { class: 'stat-bar' }, h('span', {}, label), h('div', { class: 'bar' }, h('i', { style: `width:${Math.round(Math.max(0.1, Math.min(1, v)) * 100)}%` })));

    const cards = PLANES.map((p, i) => {
      const owned = Save.owns(p.id);
      const selected = owned && Save.data.plane === p.id;
      const progress = Save.progressFor(p.id);
      const st = planeStats(p);
      return h(
        'div',
        { class: `plane-card${selected ? ' selected' : ''}${owned ? '' : ' locked'}` },
        h('div', { class: 'plane-pic' }, h('img', { src: planeIconUrl(p.id, progress.tier, progress.level), alt: '' }), owned ? null : h('span', { class: 'price-tag' }, icon(Icons.lock))),
        h('h3', {}, t(`plane.${p.id}` as TKey)),
        h('p', { class: 'plane-desc' }, t(`planeDesc.${p.id}` as TKey)),
        h('div', { class: 'feature' }, h('span', { class: 'feature-tag' }, t('planes.shipSkill')), t(`feat.${p.id}` as TKey)),
        bar(t('planes.speed'), st.speed),
        bar(t('planes.agility'), st.agility),
        bar(t('planes.size'), st.size),
        this.actionFor(p, i),
        owned ? this.upgradeBlock(p, i) : null,
      );
    });

    return h(
      'div',
      { class: 'page hangar' },
      screenHeader(t('planes.title'), () => this.onBack(), h('div', { class: 'head-coins' }, coinBadge(Save.data.coins, 'coin-badge big'), crystalBadge(Save.data.crystals, 'coin-badge big crystal-badge'))),
      h('p', { class: 'page-sub' }, t('planes.subtitle')),
      h('div', { class: 'plane-grid' }, ...cards),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
