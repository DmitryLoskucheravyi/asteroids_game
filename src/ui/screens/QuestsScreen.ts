import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { Server, type QuestView } from '../../core/server';
import { Save } from '../../core/storage';
import { Icons, button, coinBadge, h, icon } from '../dom';
import { focusFirst } from '../nav';
import { Screen } from '../Screen';
import { screenHeader } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

const QUEST_ICON: Record<QuestView['kind'], string> = {
  levelsCompleted: Icons.trophy,
  crystalsCollected: Icons.crystal,
  survivalSeconds: Icons.clock,
  cratesOpened: Icons.gift,
  pvpMatches: Icons.homing,
  pvpKills: Icons.boss,
  pvpTop3: Icons.trophy,
  pvpWins: Icons.star,
  threeStarLevels: Icons.star,
  planeUpgrades: Icons.bolt,
  coinsEarned: Icons.coin,
  itemsBought: Icons.shield,
  dailyClaimed: Icons.gift,
  passClaims: Icons.trophy,
  questsCompleted: Icons.star,
  survivalRuns: Icons.clock,
};

/** Завдання: щоденні й тижневі, з прогресом, що тягнеться з профілю (сервер — єдине джерело правди). */
export class QuestsScreen extends Screen {
  private loading = true;

  onShow(): void {
    super.onShow();
    if (this.loading) void this.load();
  }

  private async load(): Promise<void> {
    try {
      const { profile } = await Server.quests();
      Save.applyProfile(profile);
    } finally {
      this.loading = false;
      this.render();
      focusFirst(this.el);
    }
  }

  private async claim(q: QuestView, btn: HTMLButtonElement): Promise<void> {
    btn.setAttribute('aria-disabled', 'true');
    try {
      const { profile } = await Server.claimQuest(q.questId, q.periodKey);
      Save.applyProfile(profile);
      Sfx.win();
      this.render();
    } catch {
      Sfx.warning();
      btn.removeAttribute('aria-disabled');
    }
  }

  private questCard(q: QuestView): HTMLElement {
    const pct = Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100));
    const done = q.progress >= q.target;
    const claimBtn = done && !q.claimed ? button(t('quests.claim'), () => void this.claim(q, claimBtn!), 'btn primary small') : null;
    return h(
      'div',
      { class: `quest-card${q.claimed ? ' claimed' : ''}${done && !q.claimed ? ' ready' : ''}` },
      h('span', { class: `quest-period ${q.period}` }, t(`quests.${q.period}`)),
      icon(QUEST_ICON[q.kind] ?? Icons.star, 'ico quest-ico'),
      h('div', { class: 'quest-body' },
        h('p', { class: 'quest-desc' }, t(`quest.${q.kind}` as TKey, { n: q.target })),
        h('div', { class: 'quest-bar' }, h('i', { style: `width:${pct}%` })),
        h('span', { class: 'quest-progress' }, `${Math.min(q.progress, q.target)} / ${q.target}`),
      ),
      h('div', { class: 'quest-reward' },
        coinBadge(q.reward.coins, 'coin-badge small'),
        h('span', { class: 'xp-badge small' }, `+${q.reward.xp} XP`),
        q.reward.crate ? icon(Icons.gift, `ico crate-${q.reward.crate}`) : null,
      ),
      q.claimed ? h('span', { class: 'quest-done' }, icon(Icons.star)) : claimBtn,
    );
  }

  protected build(): HTMLElement {
    const quests = Save.data.quests;
    // зверху — готові до отримання, далі — у процесі (ближчі до завершення першими), внизу — вже забрані
    const rank = (q: QuestView): number => (q.claimed ? 2 : q.progress >= q.target ? 0 : 1);
    const byState = (a: QuestView, b: QuestView): number => rank(a) - rank(b) || b.progress / Math.max(1, b.target) - a.progress / Math.max(1, a.target);
    const daily = quests.filter((q) => q.period === 'daily').sort(byState);
    const weekly = quests.filter((q) => q.period === 'weekly').sort(byState);
    return h(
      'div',
      { class: 'page quests' },
      screenHeader(t('quests.title'), () => this.onBack()),
      h('p', { class: 'page-sub' }, t('quests.subtitle')),
      this.loading && !quests.length
        ? h('p', { class: 'muted' }, t('common.loading'))
        : h(
            'div',
            { class: 'quest-list' },
            daily.length ? h('h3', { class: 'quest-group-title' }, t('quests.daily')) : null,
            ...daily.map((q) => this.questCard(q)),
            weekly.length ? h('h3', { class: 'quest-group-title' }, t('quests.weekly')) : null,
            ...weekly.map((q) => this.questCard(q)),
          ),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
