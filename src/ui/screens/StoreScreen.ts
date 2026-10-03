import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { crate3d } from '../../game/CrateArt';
import { planeIconUrl } from '../../game/PlaneArt';
import type { PlaneId } from '../../game/planes';
import { CRATE_ONLY_MIN, CRATE_ONLY_PLANES, CRATE_PRICES, GEM_PACKS, type StoreCrate } from '../../../server/src/shared/store';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { toast } from '../Modal';
import { Screen } from '../Screen';
import { CratesScreen } from './CratesScreen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

const CRATES: StoreCrate[] = ['common', 'rare', 'epic', 'mythic', 'legendary'];

/** Магазин: ящики (звичайний за монети, решта за геми) і набори гемів за монети. */
export class StoreScreen extends Screen {
  private async buy(btn: HTMLButtonElement, call: () => ReturnType<typeof Server.buyCrate>, ok: string): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    try {
      const { profile } = await call();
      Save.applyProfile(profile);
      Sfx.powerup();
      toast(ok);
      this.render();
    } catch {
      Sfx.warning();
      toast(t('store.notEnough'));
      btn.removeAttribute('aria-disabled');
    }
  }

  private crateCard(type: StoreCrate): HTMLElement {
    const price = CRATE_PRICES[type];
    const afford = (price.coins ?? 0) <= Save.data.coins && (price.gems ?? 0) <= Save.data.crystals;
    const exclusive = CRATE_ONLY_MIN.includes(type);
    const btn: HTMLButtonElement = button(
      h('span', { class: 'buy-label' }, t('store.buy'), price.coins ? coinBadge(price.coins, 'coin-badge small') : crystalBadge(price.gems ?? 0, 'coin-badge small crystal-badge')),
      () => void this.buy(btn, () => Server.buyCrate(type), t('store.crateBought', { name: t(`crate.${type}` as TKey) })),
      `btn ${afford ? 'primary' : 'locked'}`,
    );
    return h(
      'article',
      { class: `store-card crate-card rarity-card-${type}` },
      h('div', { class: 'store-art' }, crate3d(type, 70, 'store-crate')),
      h('b', {}, t(`crate.${type}` as TKey)),
      h('small', { class: 'muted' }, t(`store.crateDesc.${type}` as TKey)),
      exclusive
        ? h(
            'div',
            { class: 'store-exclusive' },
            h('small', {}, t('store.exclusivePlanes')),
            h('span', { class: 'store-planes' }, ...CRATE_ONLY_PLANES.map((id) => h('img', { src: planeIconUrl(id as PlaneId), alt: t(`plane.${id}` as TKey), title: t(`plane.${id}` as TKey) }))),
          )
        : null,
      btn,
    );
  }

  private gemCard(i: number): HTMLElement {
    const pack = GEM_PACKS[i];
    const afford = pack.coins <= Save.data.coins;
    const btn: HTMLButtonElement = button(
      h('span', { class: 'buy-label' }, t('store.buy'), coinBadge(pack.coins, 'coin-badge small')),
      () => void this.buy(btn, () => Server.buyGems(pack.id), t('store.gemsBought', { n: pack.gems })),
      `btn ${afford ? 'primary' : 'locked'}`,
    );
    return h(
      'article',
      { class: `store-card gem-card${pack.best ? ' best' : ''}` },
      pack.best ? h('span', { class: 'store-best' }, t('store.best')) : null,
      h('div', { class: 'store-art gems', style: `--n:${i + 1}` }, ...Array.from({ length: i + 2 }, () => icon(Icons.crystal, 'ico'))),
      h('b', { class: 'gem-amount' }, crystalBadge(pack.gems, 'coin-badge big crystal-badge')),
      h('small', { class: 'muted' }, t('store.gemRate', { n: Math.round(pack.coins / pack.gems) })),
      btn,
    );
  }

  protected build(): HTMLElement {
    return h(
      'div',
      { class: 'page store' },
      screenHeader(t('store.title'), () => this.onBack(), h('div', { class: 'head-coins' }, coinBadge(Save.data.coins, 'coin-badge big'), crystalBadge(Save.data.crystals, 'coin-badge big crystal-badge'))),
      h('p', { class: 'page-sub' }, t('store.subtitle')),
      h('section', { class: 'store-section' }, h('h3', {}, icon(Icons.gift, 'ico'), t('store.crates'), button(t('store.toCrates'), () => this.app.show(new CratesScreen(this.app)), 'btn small')), h('div', { class: 'store-grid five' }, ...CRATES.map((c) => this.crateCard(c)))),
      h('section', { class: 'store-section' }, h('h3', {}, icon(Icons.crystal, 'ico'), t('store.gems')), h('p', { class: 'muted small' }, t('store.gemsHint')), h('div', { class: 'store-grid three' }, ...GEM_PACKS.map((_, i) => this.gemCard(i)))),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
