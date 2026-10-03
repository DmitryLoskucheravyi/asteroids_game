import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { formatTime } from '../../core/math';
import { Save, type PlayMode } from '../../core/storage';
import { dailyState } from '../../game/economy';
import { getItemDef, loadoutDamageBonus } from '../../game/items';
import { MAX_LEVEL } from '../../game/levels';
import { planeIconUrl, TIER_COLORS } from '../../game/PlaneArt';
import { getPlane, MAX_LEVEL_IN_TIER, PLANES, planeCombat } from '../../game/planes';
import { xpToNext } from '../../game/progression';
import { rankEmblem, rankInfo } from '../../game/ranks';
import { toggleFullscreen } from '../../app/App';
import { APP_VERSION } from '../../core/version';
import { openDailyModal } from '../DailyModal';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { Screen } from '../Screen';
import { Modal } from '../Modal';
import { BattlePassScreen } from './BattlePassScreen';
import { CratesScreen } from './CratesScreen';
import { GameScreen } from './GameScreen';
import { HangarScreen } from './HangarScreen';
import { HowToScreen } from './HowToScreen';
import { LeaderboardScreen } from './LeaderboardScreen';
import { FriendsScreen } from './FriendsScreen';
import { ItemsScreen } from './ItemsScreen';
import { gearSlots } from '../GearSlots';
import { LevelSelectScreen, starsRow } from './LevelSelectScreen';
import { OnlineScreen } from './OnlineScreen';
import { PlaneScreen } from './PlaneScreen';
import { ProfileScreen } from './ProfileScreen';
import { SettingsScreen } from './SettingsScreen';
import { StoreScreen } from './StoreScreen';
import { QuestsScreen } from './QuestsScreen';

/** Щоденну нагороду пропонуємо автоматично лише раз за сесію. */
let dailyOffered = false;

/** Режими, які запускає кнопка "Грати". */
const MODES: Record<PlayMode, { name: TKey; desc: TKey; icon: string }> = {
  campaign: { name: 'menu.campaign', desc: 'mode.campaignDesc', icon: Icons.star },
  survival: { name: 'menu.survival', desc: 'mode.survivalDesc', icon: Icons.clock },
  casual: { name: 'online.casual', desc: 'mode.casualDesc', icon: Icons.homing },
  solo: { name: 'mode.solo', desc: 'mode.soloDesc', icon: Icons.trophy },
  duo: { name: 'mode.duo', desc: 'mode.duoDesc', icon: Icons.trophy },
  trio: { name: 'mode.trio', desc: 'mode.trioDesc', icon: Icons.trophy },
  squad: { name: 'mode.squad', desc: 'mode.squadDesc', icon: Icons.trophy },
};

/**
 * Головне меню — ігрове лобі на весь екран:
 * ліворуч усе про літак і спорядження, праворуч завдання й нагороди,
 * по центру обраний літак, унизу праворуч — запуск гри.
 */
/**
 * Посадковий майданчик ангара під літаком: шестикутна платформа в перспективі з боковою гранню,
 * кільце кольору тіру, зовнішнє пунктирне кільце, що повільно обертається, шкала й посадкові вогні.
 * Колір задає CSS-змінна --pad (колір тіру).
 */
const PAD_SVG = `<svg viewBox="0 0 400 150" aria-hidden="true">
  <defs>
    <radialGradient id="padGlow" cx="50%" cy="50%" r="50%"><stop offset="0" style="stop-color:var(--pad);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--pad);stop-opacity:0"/></radialGradient>
    <linearGradient id="padTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2850"/><stop offset="1" stop-color="#141330"/></linearGradient>
    <linearGradient id="padSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0c22"/><stop offset="1" stop-color="#06050f"/></linearGradient>
  </defs>
  <ellipse cx="200" cy="72" rx="196" ry="66" fill="url(#padGlow)"/>
  <ellipse class="pad-ring" cx="200" cy="72" rx="186" ry="60" fill="none" stroke="var(--pad)" stroke-opacity=".55" stroke-width="2" stroke-dasharray="10 14"/>
  <ellipse cx="200" cy="72" rx="166" ry="52" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="7" stroke-dasharray="2 13"/>
  <polygon points="70,72 135,112 265,112 330,72 330,84 265,124 135,124 70,84" fill="url(#padSide)" stroke="var(--pad)" stroke-opacity=".35"/>
  <polygon points="70,72 135,32 265,32 330,72 265,112 135,112" fill="url(#padTop)" stroke="var(--pad)" stroke-opacity=".7" stroke-width="2"/>
  <polygon points="112,72 156,46 244,46 288,72 244,98 156,98" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1.5"/>
  <ellipse class="pad-core" cx="200" cy="72" rx="62" ry="19" fill="none" stroke="var(--pad)" stroke-width="3"/>
  <ellipse cx="200" cy="72" rx="34" ry="10" fill="var(--pad)" fill-opacity=".18"/>
  <g class="pad-lights" fill="var(--pad)"><circle cx="70" cy="72" r="3.5"/><circle cx="330" cy="72" r="3.5"/><circle cx="135" cy="32" r="3"/><circle cx="265" cy="32" r="3"/><circle cx="135" cy="112" r="3.5"/><circle cx="265" cy="112" r="3.5"/></g>
</svg>`;

export class MainMenuScreen extends Screen {
  onShow(): void {
    super.onShow();
    if (!dailyOffered && dailyState().available) {
      dailyOffered = true;
      setTimeout(() => this.openDaily(), 450);
    }
  }

  private openDaily(): void {
    openDailyModal(() => this.render());
  }

  /** Кнопка бокової панелі: іконка, назва, короткий стан і бейдж-лічильник. */
  private railBtn(ic: string, label: string, sub: string | null, onClick: () => void, badge = 0, cls = ''): HTMLElement {
    return button(
      h(
        'span',
        { class: 'rail-inner' },
        h('span', { class: 'rail-ico' }, icon(ic)),
        h('span', { class: 'rail-text' }, h('b', {}, label), sub ? h('small', {}, sub) : null),
        badge > 0 ? h('span', { class: 'rail-badge' }, String(badge)) : null,
      ),
      onClick,
      `rail-btn ${cls}`,
    );
  }

  private pilotChip(): HTMLElement {
    const need = xpToNext(Save.data.level);
    const pct = Math.min(100, Math.round((Save.data.xp / Math.max(1, need)) * 100));
    return button(
      h(
        'span',
        { class: 'pilot-inner' },
        h('span', { class: 'pilot-level' }, String(Save.data.level)),
        (() => {
          const rk = rankInfo(Save.data.ranked.points);
          return h('span', { class: 'pilot-rank', title: `${t(rk.nameKey)} ${rk.roman}`, html: rankEmblem(rk.id, rk.roman) });
        })(),
        h('span', { class: 'pilot-text' }, h('b', {}, Save.data.nickname || '—'), h('span', { class: 'pilot-xp' }, h('i', { style: `width:${pct}%` })), h('small', {}, `${Save.data.xp} / ${need} XP`)),
      ),
      () => this.app.show(new ProfileScreen(this.app)),
      'pilot-chip',
      { 'aria-label': t('menu.profile') },
    );
  }

  private stage(): HTMLElement {
    const plane = getPlane(Save.owns(Save.data.plane) ? Save.data.plane : 'falcon');
    const progress = Save.progressFor(plane.id);
    const loadout = Save.loadoutFor(plane.id);
    const activeDef = getItemDef(Save.itemById(loadout.active)?.defId ?? '');
    const passiveDef = getItemDef(Save.itemById(loadout.passive)?.defId ?? '');
    const combat = planeCombat(plane, progress);
    const tierColor = TIER_COLORS[progress.tier] || undefined;
    const openPlane = () => this.app.show(new PlaneScreen(this.app, plane));

    const padColor = tierColor ?? '#58d2ff';
    return h(
      'div',
      { class: 'lobby-stage', style: `--pad:${padColor}` },
      button(
        h('span', { class: 'stage-pad' }, h('span', { class: 'stage-beam' }), h('span', { class: 'stage-base', html: PAD_SVG }), h('img', { class: 'stage-plane', src: planeIconUrl(plane.id, progress.tier, progress.level), alt: t(`plane.${plane.id}` as TKey) })),
        openPlane,
        'stage-pic',
        { 'aria-label': t(`plane.${plane.id}` as TKey) },
      ),
      h(
        'div',
        { class: 'stage-panel' },
        h('div', { class: 'stage-name' }, h('h2', {}, t(`plane.${plane.id}` as TKey)), h('span', { class: 'tier-chip', style: tierColor ? `color:${tierColor};border-color:${tierColor}` : undefined }, `${t('planes.tier')} ${progress.tier}`), starsRow(progress.level, MAX_LEVEL_IN_TIER, tierColor)),
        h(
          'div',
          { class: 'stage-meta' },
          h('span', { class: 'stage-stat', title: t('stat.hp') }, icon(Icons.heart, 'ico'), String(combat.hp + (passiveDef?.combat?.hp ?? 0))),
          h('span', { class: 'stage-stat', title: t('stat.damage') }, icon(Icons.bolt, 'ico'), `×${(combat.damageMul * (1 + loadoutDamageBonus(activeDef, passiveDef))).toFixed(2)}`),
          h('span', { class: 'stage-sep' }),
          // слоти клікабельні: вибір зброї й предметів прямо з лобі
          gearSlots(plane.id, () => this.render(), () => this.app.show(new ItemsScreen(this.app))),
        ),
        button(t('menu.setup'), openPlane, 'btn small stage-setup'),
      ),
    );
  }

  private modeIcon(mode: PlayMode): HTMLElement {
    if (mode === 'solo' || mode === 'duo' || mode === 'trio' || mode === 'squad') {
      const rk = rankInfo(Save.rank(mode).points);
      return h('span', { class: 'mode-ico rank', html: rankEmblem(rk.id, rk.roman, mode) });
    }
    return icon(MODES[mode].icon, `ico mode-ico ${mode}`);
  }

  private launch(mode: PlayMode): void {
    if (mode === 'campaign') this.app.show(new LevelSelectScreen(this.app));
    else if (mode === 'survival') this.app.show(new GameScreen(this.app, 'survival', 0));
    else this.app.show(new OnlineScreen(this.app, mode));
  }

  /** Вибір режиму: картки з описом; вибір запамʼятовується, кнопка "Грати" запускає його. */
  private pickMode(): void {
    const current = Save.data.settings.playMode;
    const choose = (mode: PlayMode) => {
      Save.data.settings.playMode = mode;
      Save.save();
      Sfx.pickup();
      m.close();
      this.render();
      this.el.querySelector<HTMLElement>('.launch-btn.main')?.focus();
    };
    const cards = (Object.keys(MODES) as PlayMode[]).map((mode) =>
      button(
        h('span', { class: 'mode-card-inner' }, this.modeIcon(mode), h('b', {}, t(MODES[mode].name)), h('small', {}, t(MODES[mode].desc))),
        () => choose(mode),
        `mode-card ${mode}${mode === current ? ' on' : ''}`,
        mode === current ? { 'data-autofocus': true } : {},
      ),
    );
    const m = new Modal({ title: t('menu.chooseMode'), cls: 'mode-modal', body: [h('div', { class: 'mode-grid' }, ...cards)], actions: [], onEscape: () => m.close() }).open();
  }

  protected build(): HTMLElement {
    const go = (s: () => Screen) => () => this.app.show(s());
    const daily = dailyState();
    const unopened = Save.data.crates.filter((c) => !c.openedAt).length;
    const questsReady = Save.data.quests.filter((q) => !q.claimed && q.progress >= q.target).length;
    const questsDone = Save.data.quests.filter((q) => q.claimed).length;
    const passReady = Save.data.pass.claimable ?? 0;
    const mode: PlayMode = MODES[Save.data.settings.playMode] ? Save.data.settings.playMode : 'campaign';

    const soundBtn = button(icon(Save.data.settings.volume > 0 ? Icons.sound : Icons.mute), () => {
      const s = Save.data.settings;
      s.volume = s.volume > 0 ? 0 : 0.7;
      Save.save();
      Sfx.applyVolume();
      this.render();
      this.el.querySelector<HTMLElement>('.sound-btn')?.focus();
    }, 'icon-btn sound-btn', { 'aria-label': 'sound' });

    return h(
      'div',
      { class: 'lobby' },
      h(
        'header',
        { class: 'lobby-top' },
        this.pilotChip(),
        h('div', { class: 'lobby-title' }, h('h1', { class: 'logo lobby-logo' }, 'ASTEROIDS'), h('span', { class: 'lobby-version' }, `v${APP_VERSION}`)),
        h('div', { class: 'lobby-wallet' }, coinBadge(Save.data.coins, 'coin-badge big'), crystalBadge(Save.data.crystals, 'coin-badge big crystal-badge'), soundBtn, button(icon(Icons.fullscreen), toggleFullscreen, 'icon-btn', { 'aria-label': 'fullscreen' })),
      ),
      h(
        'nav',
        { class: 'lobby-rail rail-left', 'aria-label': t('menu.planes') },
        this.railBtn(Icons.dash, t('menu.planes'), `${Save.data.owned.length} / ${PLANES.length}`, go(() => new HangarScreen(this.app))),
        this.railBtn(Icons.shield, t('menu.items'), `${new Set(Save.data.items.map((i) => i.defId)).size}`, go(() => new ItemsScreen(this.app))),
        this.railBtn(Icons.crystal, t('store.title'), t('store.railSub'), go(() => new StoreScreen(this.app)), 0, 'store'),
        this.railBtn(Icons.gift, t('menu.crates'), unopened ? t('menu.cratesWaiting', { n: unopened }) : null, go(() => new CratesScreen(this.app)), unopened),
        this.railBtn(Icons.trophy, t('lb.title'), t('lb.railSub'), go(() => new LeaderboardScreen(this.app))),
        this.railBtn(Icons.homing, t('menu.howto'), null, go(() => new HowToScreen(this.app))),
      ),
      this.stage(),
      h(
        'nav',
        { class: 'lobby-rail rail-right', 'aria-label': t('menu.quests') },
        this.railBtn(Icons.trophy, t('menu.quests'), Save.data.quests.length ? `${questsDone} / ${Save.data.quests.length}` : null, go(() => new QuestsScreen(this.app)), questsReady),
        this.railBtn(Icons.star, t('menu.pass'), passReady ? t('menu.passReady', { n: passReady }) : `${Save.data.pass.bpPoints} BP`, go(() => new BattlePassScreen(this.app)), passReady, passReady ? 'ready' : ''),
        this.railBtn(Icons.coin, t('menu.daily'), daily.available ? t('menu.dailyReady') : t('menu.dailyDay', { n: daily.day }), () => this.openDaily(), daily.available ? 1 : 0, daily.available ? 'ready' : ''),
        this.railBtn(Icons.heart, t('friends.title'), Save.data.friendRequests ? t('friends.requestsN', { n: Save.data.friendRequests }) : Save.data.publicId, go(() => new FriendsScreen(this.app)), Save.data.friendRequests, Save.data.friendRequests ? 'ready' : ''),
        this.railBtn(Icons.user, t('menu.profile'), Save.data.nickname || null, go(() => new ProfileScreen(this.app))),
        this.railBtn(Icons.gear, t('menu.settings'), null, go(() => new SettingsScreen(this.app))),
      ),
      h(
        'footer',
        { class: 'lobby-bottom' },
        h(
          'div',
          { class: 'lobby-records' },
          h('span', { class: 'record' }, icon(Icons.star, 'ico gold'), h('b', {}, `${Save.totalStars} / ${MAX_LEVEL * 3}`), h('small', {}, t('menu.stars'))),
          h('span', { class: 'record' }, icon(Icons.clock, 'ico cyan'), h('b', {}, formatTime(Save.bestSurvival)), h('small', {}, t('menu.best'))),
        ),
        h(
          'div',
          { class: 'launch' },
          button(
            h('span', { class: 'launch-inner mode-pick' }, this.modeIcon(mode), h('span', { class: 'mode-pick-text' }, h('small', {}, t('menu.mode')), h('b', {}, t(MODES[mode].name)))),
            () => this.pickMode(),
            'launch-btn mode-btn',
          ),
          button(h('span', { class: 'launch-inner' }, icon(Icons.play), h('b', {}, t('menu.play')), h('small', {}, t(MODES[mode].name))), () => this.launch(mode), 'launch-btn main', { 'data-autofocus': true }),
        ),
      ),
    );
  }
}
