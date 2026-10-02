import { t, type TKey } from '../../core/i18n';
import { Server, type CrateType } from '../../core/server';
import { Save } from '../../core/storage';
import { crate3d, CRATE_GLOW } from '../../game/CrateArt';
import { Icons, button, h, icon } from '../dom';
import { openAllCratesModal, openCrateModal } from '../CrateModal';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

const ORDER: readonly CrateType[] = ['legendary', 'mythic', 'epic', 'rare', 'common'];

/** Інвентар ящиків: стоси за рідкістю на світних постаментах; клік — відкрити один, кнопка — відкрити всі. */
export class CratesScreen extends Screen {
  private loading = true;

  onShow(): void {
    super.onShow();
    if (this.loading) void this.load();
  }

  private async load(): Promise<void> {
    try {
      const { profile } = await Server.profile();
      Save.applyProfile(profile);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private stack(type: CrateType, ids: string[]): HTMLElement {
    const inner = h(
      'span',
      { class: `crate-pedestal crate-${type}`, style: `--glow:${CRATE_GLOW[type]}` },
      h('span', { class: 'pedestal-glow' }),
      h('span', { class: 'crate-tile-3d' }, crate3d(type, 96, 'tile-crate idle')),
      h('span', { class: 'pedestal-base' }),
      h('span', { class: `crate-tile-label rarity-${type}` }, t(`crate.${type}` as TKey)),
      ids.length > 1 ? h('span', { class: 'crate-count' }, `×${ids.length}`) : null,
    );
    return button(inner, () => openCrateModal(ids[0], type, () => this.render()), 'crate-tile-btn');
  }

  protected build(): HTMLElement {
    const unopened = Save.data.crates.filter((c) => !c.openedAt);
    const groups = ORDER.map((type) => ({ type, ids: unopened.filter((c) => c.crateType === type).map((c) => c.id) })).filter((g) => g.ids.length);
    const openAll =
      unopened.length > 1
        ? button(h('span', { class: 'buy-label' }, icon(Icons.gift, 'ico'), t('crates.openAll'), h('span', { class: 'rail-badge inline' }, String(unopened.length))), () => openAllCratesModal(unopened.map((c) => ({ id: c.id, crateType: c.crateType })), () => this.render()), 'btn primary claim-all-btn')
        : null;
    return h(
      'div',
      { class: 'page crates' },
      screenHeader(t('crates.title'), () => this.onBack(), openAll ?? undefined),
      h('p', { class: 'page-sub' }, t('crates.subtitle')),
      this.loading && !unopened.length
        ? h('p', { class: 'muted' }, t('common.loading'))
        : groups.length
          ? h('div', { class: 'crate-grid' }, ...groups.map((g) => this.stack(g.type, g.ids)))
          : h('p', { class: 'muted' }, t('crates.empty')),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
