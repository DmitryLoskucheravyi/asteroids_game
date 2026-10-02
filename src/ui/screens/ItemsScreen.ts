import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { ITEM_DEFS, RARITIES, itemPrice, type ItemRarity } from '../../game/items';
import { Icons, button, coinBadge, h, icon } from '../dom';
import { toast } from '../Modal';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Магазин предметів: активи й пасиви п'яти рідкостей; дешевша — слабша, дорожча — сильніша. */
export class ItemsScreen extends Screen {
  private async buy(defId: string, rarity: ItemRarity, btn: HTMLButtonElement): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    try {
      const { profile } = await Server.buyItem(defId, rarity);
      Save.applyProfile(profile);
      Sfx.powerup();
      toast(t('planes.bought'));
      this.render();
    } catch {
      Sfx.warning();
      btn.removeAttribute('aria-disabled');
    }
  }

  private itemCard(def: (typeof ITEM_DEFS)[number]): HTMLElement {
    const owned = Save.data.items.filter((i) => i.defId === def.id);
    const rarityRow = RARITIES.map((r) => {
      const price = itemPrice(def, r);
      const affordable = Save.data.coins >= price;
      const count = owned.filter((i) => i.rarity === r).length;
      const btn = button(
        h('span', { class: `rarity-chip rarity-${r}` }, t(`item.rarity.${r}` as TKey), coinBadge(price, 'coin-badge tiny')),
        () => this.buy(def.id, r, btn),
        `btn small${affordable ? '' : ' locked'}`,
      );
      return h('div', { class: 'rarity-row' }, btn, count > 0 ? h('span', { class: 'owned-count' }, `×${count}`) : null);
    });

    return h(
      'section',
      { class: 'card item-card' },
      h('h3', {}, icon(def.slot === 'active' ? Icons.bolt : Icons.shield, `ico ${def.slot}`), t(def.nameKey), h('small', {}, t(def.slot === 'active' ? 'items.slotActive' : 'items.slotPassive'))),
      h('p', { class: 'plane-desc' }, t(def.descKey)),
      h('div', { class: 'rarity-list' }, ...rarityRow),
    );
  }

  protected build(): HTMLElement {
    const actives = ITEM_DEFS.filter((d) => d.slot === 'active');
    const passives = ITEM_DEFS.filter((d) => d.slot === 'passive');
    return h(
      'div',
      { class: 'page items' },
      screenHeader(t('items.title'), () => this.onBack(), coinBadge(Save.data.coins, 'coin-badge big')),
      h('p', { class: 'page-sub' }, t('items.subtitle')),
      h('h3', { class: 'quest-group-title' }, t('items.slotActive')),
      h('div', { class: 'item-grid' }, ...actives.map((d) => this.itemCard(d))),
      h('h3', { class: 'quest-group-title' }, t('items.slotPassive')),
      h('div', { class: 'item-grid' }, ...passives.map((d) => this.itemCard(d))),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
