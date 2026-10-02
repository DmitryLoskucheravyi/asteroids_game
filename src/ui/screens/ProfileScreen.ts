import { Sfx } from '../../core/audio';
import { AuthStore } from '../../core/auth';
import { levelName, t, type Lang, type TKey } from '../../core/i18n';
import { BINDABLE_ACTIONS, DEFAULT_KEYBINDS, displayKey, primaryKeyFor, type BindAction } from '../../core/input';
import { formatTime } from '../../core/math';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { MAX_PILOT_LEVEL, pilotLevelReward, xpToNext } from '../../game/progression';
import { LEVELS, MAX_LEVEL } from '../../game/levels';
import { toggleFullscreen } from '../../app/App';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { Modal, toast } from '../Modal';
import { Screen } from '../Screen';
import { AuthScreen } from './AuthScreen';
import { screenHeader, starsRow } from './LevelSelectScreen';
import { MainMenuScreen } from './MainMenuScreen';

/** Чи зайнятий код клавіші іншою (ніж except) дією — щоб не прив'язати одну клавішу двічі. */
function keyTakenBy(code: string, except: BindAction): BindAction | null {
  for (const action of BINDABLE_ACTIONS) {
    if (action === except) continue;
    const custom = Save.data.keybinds[action];
    const codes = custom ? [custom] : DEFAULT_KEYBINDS[action];
    if (codes.includes(code)) return action;
  }
  return null;
}

/** Профіль: пілот (рівень/XP), рекорди, кастомне керування й налаштування. */
export class ProfileScreen extends Screen {
  private listeningFor: BindAction | null = null;

  private async saveKeybinds(): Promise<void> {
    try {
      const { profile } = await Server.setKeybinds(Save.data.keybinds);
      Save.applyProfile(profile);
    } catch {
      // лишається в локальному кеші — спробуємо синхронізувати наступного разу
    }
  }

  private startListening(action: BindAction, btn: HTMLButtonElement): void {
    if (this.listeningFor) return;
    this.listeningFor = action;
    btn.textContent = t('controls.listening');
    btn.classList.add('listening');

    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      window.removeEventListener('keydown', onKey, true);
      this.listeningFor = null;
      if (e.code === 'Escape') {
        this.render();
        return;
      }
      const conflict = keyTakenBy(e.code, action);
      if (conflict) {
        Sfx.warning();
        toast(t('controls.conflict'));
        this.render();
        return;
      }
      Save.data.keybinds = { ...Save.data.keybinds, [action]: e.code };
      Save.save();
      Sfx.pickup();
      void this.saveKeybinds();
      this.render();
    };
    window.addEventListener('keydown', onKey, true);
  }

  private controlsCard(): HTMLElement {
    const rows = BINDABLE_ACTIONS.map((action) => {
      const btn = button(displayKey(primaryKeyFor(action)), () => this.startListening(action, btn), 'btn key-btn');
      return h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, t(`control.${action}` as TKey)), btn);
    });
    const resetBtn = button(t('controls.reset'), () => {
      Save.data.keybinds = {};
      Save.save();
      void this.saveKeybinds();
      this.render();
    }, 'btn');
    return h('section', { class: 'card' }, h('h3', {}, icon(Icons.gear, 'ico cyan'), t('profile.controls')), ...rows, h('div', { class: 'set-row' }, h('span'), resetBtn));
  }

  private settingsCard(): HTMLElement {
    const s = Save.data.settings;
    const seg = <T extends string | boolean>(options: [T, string][], value: T, set: (v: T) => void) =>
      h('div', { class: 'seg' }, ...options.map(([v, label]) => button(label, () => {
        set(v);
        Save.save();
        this.render();
      }, `seg-btn${v === value ? ' on' : ''}`)));

    const volume = h('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(s.volume * 100), 'data-nav': true, 'aria-label': t('settings.volume') }) as HTMLInputElement;
    const volLabel = h('span', { class: 'vol-val' }, `${Math.round(s.volume * 100)}%`);
    volume.addEventListener('input', () => {
      s.volume = Number(volume.value) / 100;
      volLabel.textContent = `${volume.value}%`;
      Sfx.applyVolume();
    });
    volume.addEventListener('change', () => {
      Save.save();
      Sfx.pickup();
    });

    const row = (label: string, control: HTMLElement) => h('div', { class: 'set-row' }, h('span', { class: 'set-label' }, label), control);

    return h(
      'section',
      { class: 'card' },
      h('h3', {}, icon(Icons.gear, 'ico'), t('profile.settings')),
      row(t('settings.lang'), seg<Lang>([['uk', 'Українська'], ['en', 'English']], s.lang, (v) => {
        s.lang = v;
        this.app.refresh();
      })),
      row(t('settings.volume'), h('div', { class: 'vol' }, volume, volLabel)),
      row(t('settings.shake'), seg<boolean>([[true, t('settings.on')], [false, t('settings.off')]], s.shake, (v) => (s.shake = v))),
      row(t('settings.fullscreen'), button('⛶', toggleFullscreen, 'seg-btn')),
      row('', button(t('settings.reset'), () => {
        const m = new Modal({
          title: t('settings.reset'),
          body: [h('p', {}, t('settings.resetConfirm'))],
          actions: [
            button(t('common.cancel'), () => m.close(), 'btn', { 'data-autofocus': true }),
            button(t('settings.reset'), async () => {
              const { profile } = await Server.resetProgress();
              Save.applyProfile(profile);
              m.close();
              toast(t('settings.resetDone'));
              this.render();
            }, 'btn danger'),
          ],
          onEscape: () => m.close(),
        }).open();
      }, 'btn danger')),
      row('', button(t('settings.logout'), () => {
        AuthStore.logout();
        this.app.show(new AuthScreen(this.app));
      }, 'btn danger')),
    );
  }

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
      screenHeader(t('profile.title'), () => this.onBack()),
      pilotCard,
      this.statsCard(),
      this.recordsCard(),
      this.controlsCard(),
      this.settingsCard(),
    );
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }
}
