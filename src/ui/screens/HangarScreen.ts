import type { App } from '../../app/App';
import { t, type TKey } from '../../core/i18n';
import { Save } from '../../core/storage';
import { getItemDef, loadoutDamageBonus } from '../../game/items';
import { planeIconUrl, TIER_COLORS } from '../../game/PlaneArt';
import { MAX_LEVEL_IN_TIER, PLANES, planeCombat, type PlaneId } from '../../game/planes';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { Screen } from '../Screen';
import { CRATE_ONLY_PLANES } from '../../../server/src/shared/store';
import { itemPic } from './ItemsScreen';
import { screenHeader, starsRow } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';
import { PlaneScreen } from './PlaneScreen';

/** Ангар: сітка літаків; кожен відкриває власну сторінку з характеристиками, прокачкою й екіпіровкою. */
export class HangarScreen extends Screen {
  constructor(
    app: App,
    private readonly focusId?: PlaneId,
  ) {
    super(app);
  }

  protected build(): HTMLElement {
    const cards = PLANES.map((p) => {
      const owned = Save.owns(p.id);
      const selected = owned && Save.data.plane === p.id;
      const progress = Save.progressFor(p.id);
      const tierColor = TIER_COLORS[progress.tier] || undefined;
      const combat = planeCombat(p, progress);
      const loadout = Save.loadoutFor(p.id);
      const equippedDefs = [loadout.active, loadout.passive].map((id) => getItemDef(Save.itemById(id)?.defId ?? ''));
      const damageMul = combat.damageMul * (1 + loadoutDamageBonus(...equippedDefs));
      const equipped = [loadout.active, loadout.passive]
        .map((id) => Save.itemById(id))
        .filter((it) => it && getItemDef(it.defId))
        .map((it) => itemPic(it!.defId, 'item-pic tiny'));
      const autofocus = this.focusId ? this.focusId === p.id : selected;

      return button(
        h(
          'span',
          { class: 'hangar-card-inner' },
          h('span', { class: 'plane-pic' }, h('img', { src: planeIconUrl(p.id, progress.tier, progress.level), alt: '' }), owned ? null : h('span', { class: 'price-tag' }, icon(Icons.lock))),
          h('span', { class: 'hangar-name' }, t(`plane.${p.id}` as TKey)),
          owned
            ? h('span', { class: 'upgrade-head' }, h('span', { class: 'tier-chip', style: tierColor ? `color:${tierColor};border-color:${tierColor}` : undefined }, `${t('planes.tier')} ${progress.tier}`), starsRow(progress.level, MAX_LEVEL_IN_TIER, tierColor))
            : CRATE_ONLY_PLANES.includes(p.id)
              ? h('span', { class: 'crate-only-tag' }, icon(Icons.gift, 'ico'), t('planes.crateOnly'))
              : coinBadge(p.price, 'coin-badge small'),
          h('span', { class: 'hangar-feat' }, t(`feat.${p.id}` as TKey)),
          h('span', { class: 'hangar-meta' }, h('span', {}, icon(Icons.heart, 'ico'), String(combat.hp)), h('span', {}, icon(Icons.bolt, 'ico'), `×${damageMul.toFixed(2)}`), equipped.length ? h('span', { class: 'hangar-items' }, ...equipped) : null),
          selected ? h('span', { class: 'hangar-selected' }, t('planes.selected')) : null,
        ),
        () => this.app.show(new PlaneScreen(this.app, p)),
        `plane-card hangar-card${selected ? ' selected' : ''}${owned ? '' : ' locked'}`,
        autofocus ? { 'data-autofocus': true } : {},
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
