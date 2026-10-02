import { levelName, t, type TKey } from '../../core/i18n';
import { formatTime } from '../../core/math';
import { Save } from '../../core/storage';
import { MAX_PILOT_LEVEL, pilotLevelReward, xpToNext } from '../../game/progression';
import { LEVELS, MAX_LEVEL } from '../../game/levels';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { Screen } from '../Screen';
import { screenHeader, starsRow } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';
import { SettingsScreen } from './SettingsScreen';

/** Профіль: пілот (рівень/XP), статистика й рекорди. Налаштування — окремий екран. */
export class ProfileScreen extends Screen {
  private recordsCard(): HTMLElement {
    const top = Save.data.survivalTop;
    const medals = ['gold', 'silver', 'bronze', '', ''];
    const survival = top.length
      ? h('ol', { class: 'rec-list' }, ...top.map((r, i) => h('li', { class: medals[i] }, h('span', { class: 'rec-pos' }, `#${i + 1}`), h('span', { class: 'rec-time' }, formatTime(r.time)), h('span', { class: 'rec-date' }, r.date))))
      : h('p', { class: 'muted' }, t('records.empty'));

    const done = LEVELS.filter((l) => Save.starsFor(l.id) > 0).length;
    const campaign = h(
      'div',
      { class: 'rec-levels' },
      ...LEVELS.map((l) => h('div', { class: `rec-lv${l.id > Save.data.unlocked ? ' locked' : ''}` }, h('span', { class: 'rec-lv-num' }, String(l.id)), h('span', { class: 'rec-lv-name' }, levelName(l.id)), starsRow(Save.starsFor(l.id)))),
    );

    return h(
      'section',
      { class: 'card' },
      h('h3', {}, icon(Icons.trophy, 'ico gold'), t('records.survival')),
      survival,
      h('h3', { class: 'rec-sub-title' }, icon(Icons.star, 'ico gold'), t('records.campaign'), h('small', {}, ` ${Save.totalStars}/${MAX_LEVEL * 3} · ${t('records.levelsDone')}: ${done}/${MAX_LEVEL}`)),
      campaign,
    );
  }

  /** Особиста статистика: PvP, прогрес, економіка. */
  private statsCard(): HTMLElement | null {
    const s = Save.data.stats;
    if (!s) return null;
    const kd = s.pvpKills / Math.max(1, s.pvpDeaths);
    const wr = s.pvpMatches ? (s.pvpWins / s.pvpMatches) * 100 : 0;
    const cell = (label: TKey, value: string) => h('div', { class: 'stat-cell' }, h('b', {}, value), h('small', {}, t(label)));
    const n = (v: number) => v.toLocaleString('uk-UA');
    return h(
      'section',
      { class: 'card stats-card' },
      h('h3', {}, icon(Icons.trophy, 'ico gold'), t('profile.stats')),
      h(
        'div',
        { class: 'stat-grid' },
        cell('lb.matches', n(s.pvpMatches)),
        cell('lb.wins', n(s.pvpWins)),
        cell('lb.winrate', `${wr.toFixed(1)}%`),
        cell('lb.top3', n(s.pvpTop3)),
        cell('lb.kills', n(s.pvpKills)),
        cell('profile.deaths', n(s.pvpDeaths)),
        cell('lb.kd', kd.toFixed(2)),
        cell('lb.bestKills', n(s.bestKills)),
        cell('lb.damage', n(s.pvpDamage)),
        cell('lb.stars', n(s.stars)),
        cell('profile.levelsDone', n(s.levelsCompleted)),
        cell('lb.survival', formatTime(s.survivalBest)),
        cell('lb.coins', n(s.coinsEarned)),
        cell('lb.crates', n(s.cratesOpened)),
      ),
    );
  }

  /** Найближчі нагороди за рівні пілота. */
  private levelRewards(): HTMLElement | null {
    const from = Save.data.level + 1;
    if (from > MAX_PILOT_LEVEL) return null;
    const rows = [];
    for (let l = from; l <= Math.min(MAX_PILOT_LEVEL, from + 4); l++) {
      const r = pilotLevelReward(l);
      rows.push(
        h(
          'div',
          { class: `lvl-reward${r.crate ? ' big' : ''}` },
          h('span', { class: 'level-badge small' }, String(l)),
          coinBadge(r.coins, 'coin-badge small'),
          r.crystals ? crystalBadge(r.crystals, 'coin-badge small crystal-badge') : null,
          r.crate ? h('span', { class: `lvl-crate rarity-${r.crate}` }, icon(Icons.gift, 'ico'), t(`crate.${r.crate}` as TKey)) : null,
        ),
      );
    }
    return h('div', { class: 'lvl-rewards' }, h('small', { class: 'muted' }, t('profile.levelRewards', { n: MAX_PILOT_LEVEL })), ...rows);
  }

  protected build(): HTMLElement {
    const xpNeed = xpToNext(Save.data.level);
    const xpPct = Math.min(100, Math.round((Save.data.xp / xpNeed) * 100));

    const pilotCard = h(
      'section',
      { class: 'card profile-head' },
      h('div', { class: 'profile-id' }, h('span', { class: 'pilot-nick big' }, Save.data.nickname), h('span', { class: 'level-badge' }, t('menu.level', { n: Save.data.level })), Save.data.publicId ? h('span', { class: 'profile-pid', title: t('friends.myId') }, Save.data.publicId) : null),
      h('div', { class: 'xp-bar' }, h('i', { style: `width:${xpPct}%` })),
      h('small', { class: 'xp-label' }, Save.data.level >= MAX_PILOT_LEVEL ? t('profile.maxLevel') : `${Save.data.xp} / ${xpNeed} XP`),
      this.levelRewards(),
    );

    return h(
      'div',
      { class: 'page profile' },
      screenHeader(t('profile.title'), () => this.onBack(), button(h('span', {}, icon(Icons.gear, 'ico'), t('menu.settings')), () => this.app.show(new SettingsScreen(this.app, () => new ProfileScreen(this.app))), 'btn small')),
      pilotCard,
      this.statsCard(),
      this.recordsCard(),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
