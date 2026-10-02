import { t, type TKey } from '../../core/i18n';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { Icons, button, h, icon } from '../dom';
import { openCrateModal } from '../CrateModal';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Інвентар ящиків: клік відкриває модалку з повною анімацією розіграшу нагороди. */
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

  private crateCard(crate: (typeof Save.data.crates)[number]): HTMLElement {
    const inner = h(
      'span',
      { class: `crate-tile crate-${crate.crateType}` },
      h('span', { class: 'crate-tile-ico bob' }, icon(Icons.gift, 'ico')),
      h('span', { class: 'crate-tile-label' }, t(`crate.${crate.crateType}` as TKey)),
    );
    return button(inner, () => openCrateModal(crate.id, crate.crateType, () => this.render()), 'crate-tile-btn');
  }

  protected build(): HTMLElement {
    const crates = Save.data.crates.filter((c) => !c.openedAt);
    return h(
      'div',
      { class: 'page crates' },
      screenHeader(t('crates.title'), () => this.onBack()),
      h('p', { class: 'page-sub' }, t('crates.subtitle')),
      this.loading && !crates.length
        ? h('p', { class: 'muted' }, t('common.loading'))
        : crates.length
          ? h('div', { class: 'crate-grid' }, ...crates.map((c) => this.crateCard(c)))
          : h('p', { class: 'muted' }, t('crates.empty')),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
