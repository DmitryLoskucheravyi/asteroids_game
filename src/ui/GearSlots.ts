import { Sfx } from '../core/audio';
import { t, type TKey } from '../core/i18n';
import { Server } from '../core/server';
import { Save } from '../core/storage';
import { ITEM_DEFS, RARITIES, getItemDef, itemStatLines, type ItemDef } from '../game/items';
import { itemSvg, weaponSvg } from '../game/ItemArt';
import type { PlaneId } from '../game/planes';
import { DEFAULT_WEAPON_ID, WEAPON_DEFS, getWeaponDef } from '../game/weapons';
import { Icons, button, h, icon } from './dom';
import { Modal, toast } from './Modal';
import { itemPic, statList, weaponPic, weaponStatLines } from './screens/ItemsScreen';

type Slot = 'weapon' | 'active' | 'passive';

/**
 * Три слоти спорядження (зброя, актив, пасив) — клікабельні: відкривають вибір із того, що є
 * в гравця, і одразу екіпірують. Використовується в лобі й на екрані пошуку матчу.
 */
export function gearSlots(planeId: PlaneId, onChange: () => void, openShop?: () => void): HTMLElement {
  const l = Save.loadoutFor(planeId);
  const weapon = getWeaponDef(l.weapon) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
  const active = getItemDef(Save.itemById(l.active)?.defId ?? '');
  const passive = getItemDef(Save.itemById(l.passive)?.defId ?? '');
  const lv = (n: number) => (n > 1 ? h('span', { class: 'gear-slot-lv' }, String(n)) : null);
  const slot = (s: Slot, svg: string | null, name: string, rarity?: string, level = 1) =>
    button(
      h('span', { class: 'gear-slot-art', html: svg ?? '' }, lv(level)),
      () => openGearPicker(planeId, s, onChange, openShop),
      `stage-gear gear-slot${svg ? '' : ' empty'} rarity-frame-${rarity ?? 'weapon'}`,
      { title: name, 'aria-label': `${t(s === 'weapon' ? 'items.slotWeapon' : s === 'active' ? 'items.slotActive' : 'items.slotPassive')}: ${name}` },
    );
  return h(
    'span',
    { class: 'stage-gears' },
    slot('weapon', weaponSvg(weapon.id), t(weapon.nameKey), undefined, Save.weaponLevel(weapon.id)),
    slot('active', active ? itemSvg(active.id) : null, active ? t(active.nameKey) : t('items.slotActive'), active?.rarity, Save.itemById(l.active)?.level),
    slot('passive', passive ? itemSvg(passive.id) : null, passive ? t(passive.nameKey) : t('items.slotPassive'), passive?.rarity, Save.itemById(l.passive)?.level),
  );
}

/** Вікно вибору для слота: плитки з тим, що є, поточне позначене; клік — екіпірувати / зняти. */
export function openGearPicker(planeId: PlaneId, slot: Slot, onChange: () => void, openShop?: () => void): void {
  const l = Save.loadoutFor(planeId);
  const equip = async (value: string | null): Promise<void> => {
    const next = { active: l.active, passive: l.passive, weapon: l.weapon, [slot]: value };
    try {
      const { profile } = await Server.setLoadout(planeId, next.active, next.passive, next.weapon);
      Save.applyProfile(profile);
      Sfx.pickup();
      m.close();
      onChange();
    } catch {
      Sfx.warning();
      toast(t('friends.error'));
    }
  };

  const tiles: HTMLElement[] = [];
  if (slot === 'weapon') {
    for (const w of WEAPON_DEFS) {
      if (!Save.ownsWeapon(w.id)) continue;
      const on = (l.weapon ?? DEFAULT_WEAPON_ID) === w.id;
      tiles.push(
        button(
          h('span', { class: 'inv-inner' }, weaponPic(w.id), h('b', {}, t(w.nameKey)), statList(weaponStatLines(w)), h('span', { class: 'inv-state' }, on ? t('items.equipped') : t('items.equip'))),
          () => (on ? m.close() : void equip(w.id)),
          `inv-tile${on ? ' on' : ''}`,
        ),
      );
    }
  } else {
    const seen = new Set<string>();
    const owned = Save.data.items
      .filter((it) => getItemDef(it.defId)?.slot === slot && !seen.has(it.defId) && seen.add(it.defId))
      .map((it) => ({ it, def: getItemDef(it.defId) as ItemDef }))
      .sort((a, b) => RARITIES.indexOf(b.def.rarity) - RARITIES.indexOf(a.def.rarity));
    const current = Save.itemById(l[slot]);
    for (const { it, def } of owned) {
      const on = current?.defId === def.id;
      tiles.push(
        button(
          h(
            'span',
            { class: 'inv-inner' },
            itemPic(def.id),
            h('b', {}, t(def.nameKey)),
            h('small', { class: `rarity-${def.rarity}` }, t(`item.rarity.${def.rarity}` as TKey)),
            statList(itemStatLines(def)),
            h('span', { class: 'inv-state' }, on ? t('items.unequip') : t('items.equip')),
          ),
          () => void equip(on ? null : it.id),
          `inv-tile rarity-card-${def.rarity}${on ? ' on' : ''}`,
        ),
      );
    }
    if (!owned.length) tiles.push(h('p', { class: 'muted gear-none' }, t('gear.none')));
    const missing = ITEM_DEFS.filter((d) => d.slot === slot && !seen.has(d.id)).length;
    if (missing > 0 && openShop) {
      tiles.push(
        button(
          h('span', { class: 'inv-inner' }, h('div', { class: 'item-pic empty' }, '+'), h('b', {}, t('planePage.toShop')), h('small', { class: 'muted' }, t('planePage.moreItems', { n: missing }))),
          () => {
            m.close();
            openShop();
          },
          'inv-tile shop',
        ),
      );
    }
  }

  const title = t(slot === 'weapon' ? 'items.slotWeapon' : slot === 'active' ? 'items.slotActive' : 'items.slotPassive');
  const m = new Modal({
    cls: 'gear-modal',
    title,
    body: [h('div', { class: 'inv-grid' }, ...tiles)],
    actions: [button(h('span', {}, icon(Icons.close, 'ico'), t('common.close')), () => m.close(), 'btn')],
    onEscape: () => m.close(),
  }).open();
}
