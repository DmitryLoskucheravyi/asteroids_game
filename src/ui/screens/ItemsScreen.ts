import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { ITEM_DEFS, RARITIES, itemStatLines, type ItemDef } from '../../game/items';
import { itemSvg, weaponSvg } from '../../game/ItemArt';
import { WEAPON_DEFS, type WeaponDef } from '../../game/weapons';
import { button, coinBadge, h } from '../dom';
import { toast } from '../Modal';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Картинка предмета в рамці кольору рідкості. */
export function itemPic(defId: string, cls = 'item-pic'): HTMLElement {
  const def = ITEM_DEFS.find((d) => d.id === defId);
  return h('div', { class: `${cls} rarity-frame-${def?.rarity ?? 'common'}`, html: itemSvg(defId) });
}

export function weaponPic(id: string, cls = 'item-pic'): HTMLElement {
  return h('div', { class: `${cls} rarity-frame-weapon`, html: weaponSvg(id) });
}

export function statList(lines: { key: TKey; value: string }[]): HTMLElement {
  return h('div', { class: 'item-stats' }, ...lines.map((l) => h('div', { class: 'item-stat' }, h('span', {}, t(l.key)), h('b', {}, l.value))));
}

export function weaponStatLines(def: WeaponDef, damageMul = 1): { key: TKey; value: string }[] {
  const dmg = def.damage * damageMul;
  const out: { key: TKey; value: string }[] = [
    { key: 'stat.damage', value: dmg.toFixed(dmg < 10 ? 1 : 0) },
    { key: 'stat.fireRate', value: `${def.fireRate}/s` },
    { key: 'stat.dps', value: Math.round(dmg * def.fireRate).toString() },
  ];
  if (def.burst) out.push({ key: 'stat.burst', value: `${def.burst.shots} / ${def.burst.cooldown}s` });
  if (typeof def.ammo === 'number') out.push({ key: 'stat.ammo', value: `${def.ammo} / ${def.reloadTime}s` });
  if (def.splashRadius) out.push({ key: 'stat.radius', value: String(def.splashRadius) });
  return out;
}

/** Магазин: кожен предмет має свою рідкість і купується один раз; екіпірування — на сторінці літака. */
export class ItemsScreen extends Screen {
  private async run(btn: HTMLButtonElement, call: () => Promise<{ profile: Parameters<typeof Save.applyProfile>[0] }>): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    try {
      const { profile } = await call();
      Save.applyProfile(profile);
      Sfx.powerup();
      toast(t('planes.bought'));
      this.render();
    } catch {
      Sfx.warning();
      btn.removeAttribute('aria-disabled');
    }
  }

  private priceAction(owned: boolean, price: number, buy: (btn: HTMLButtonElement) => void): HTMLElement {
    if (owned) return h('span', { class: 'owned-tag' }, t('items.ownedTag'));
    const affordable = Save.data.coins >= price;
    const btn: HTMLButtonElement = button(h('span', { class: 'buy-label' }, t('items.buy'), coinBadge(price, 'coin-badge small')), () => buy(btn), `btn small${affordable ? '' : ' locked'}`);
    return btn;
  }

  private weaponCard(def: WeaponDef): HTMLElement {
    const owned = Save.ownsWeapon(def.id);
    return h(
      'section',
      { class: `card item-card${owned ? ' owned' : ''}` },
      h('div', { class: 'item-head' }, weaponPic(def.id), h('div', {}, h('h3', {}, t(def.nameKey)), h('span', { class: 'item-kind' }, t('items.weapon')))),
      h('p', { class: 'plane-desc' }, t(def.descKey)),
      statList(weaponStatLines(def)),
      this.priceAction(owned, def.price, (btn) => void this.run(btn, () => Server.buyWeapon(def.id))),
    );
  }

  private itemCard(def: ItemDef): HTMLElement {
    const owned = Save.data.items.some((i) => i.defId === def.id);
    return h(
      'section',
      { class: `card item-card rarity-card-${def.rarity}${owned ? ' owned' : ''}` },
      h(
        'div',
        { class: 'item-head' },
        itemPic(def.id),
        h('div', {}, h('h3', {}, t(def.nameKey)), h('span', { class: `item-kind rarity-${def.rarity}` }, `${t(`item.rarity.${def.rarity}` as TKey)} · ${t(def.slot === 'active' ? 'items.slotActive' : 'items.slotPassive')}`)),
      ),
      h('p', { class: 'plane-desc' }, t(def.descKey)),
      statList(itemStatLines(def)),
      this.priceAction(owned, def.price, (btn) => void this.run(btn, () => Server.buyItem(def.id))),
    );
  }

  protected build(): HTMLElement {
    const byRarity = (a: ItemDef, b: ItemDef) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity);
    const actives = ITEM_DEFS.filter((d) => d.slot === 'active').sort(byRarity);
    const passives = ITEM_DEFS.filter((d) => d.slot === 'passive').sort(byRarity);
    return h(
      'div',
      { class: 'page items' },
      screenHeader(t('items.title'), () => this.onBack(), coinBadge(Save.data.coins, 'coin-badge big')),
      h('p', { class: 'page-sub' }, t('items.subtitle')),
      h('h3', { class: 'quest-group-title' }, t('items.weapon')),
      h('div', { class: 'item-grid' }, ...WEAPON_DEFS.map((w) => this.weaponCard(w))),
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
