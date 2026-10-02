import { Sfx } from '../../core/audio';
import { t, type TKey } from '../../core/i18n';
import { formatTime } from '../../core/math';
import { Save } from '../../core/storage';
import { dailyState } from '../../game/economy';
import { getItemDef, loadoutDamageBonus } from '../../game/items';
import { itemSvg, weaponSvg } from '../../game/ItemArt';
import { MAX_LEVEL } from '../../game/levels';
import { planeIconUrl, TIER_COLORS } from '../../game/PlaneArt';
import { getPlane, MAX_LEVEL_IN_TIER, PLANES, planeCombat } from '../../game/planes';
import { xpToNext } from '../../game/progression';
import { getWeaponDef, DEFAULT_WEAPON_ID } from '../../game/weapons';
import { toggleFullscreen } from '../../app/App';
import { APP_VERSION } from '../../core/version';
import { openDailyModal } from '../DailyModal';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { Screen } from '../Screen';
import { BattlePassScreen } from './BattlePassScreen';
import { CratesScreen } from './CratesScreen';
import { GameScreen } from './GameScreen';
import { HangarScreen } from './HangarScreen';
import { HowToScreen } from './HowToScreen';
import { ItemsScreen } from './ItemsScreen';
import { LevelSelectScreen, starsRow } from './LevelSelectScreen';
import { OnlineScreen } from './OnlineScreen';
import { PlaneScreen } from './PlaneScreen';
import { ProfileScreen } from './ProfileScreen';
import { QuestsScreen } from './QuestsScreen';

/** Щоденну нагороду пропонуємо автоматично лише раз за сесію. */
let dailyOffered = false;

/**
 * Головне меню — ігрове лобі на весь екран:
 * ліворуч усе про літак і спорядження, праворуч завдання й нагороди,
 * по центру обраний літак, унизу праворуч — запуск гри.
 */
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
    const weapon = getWeaponDef(loadout.weapon) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
    const combat = planeCombat(plane, progress);
    const tierColor = TIER_COLORS[progress.tier] || undefined;
    const openPlane = () => this.app.show(new PlaneScreen(this.app, plane));

    const gear = (svg: string | null, title: string, rarity?: string) =>
      h('span', { class: `stage-gear${svg ? '' : ' empty'}${rarity ? ` rarity-frame-${rarity}` : ' rarity-frame-weapon'}`, title, html: svg ?? '' });

    return h(
      'div',
      { class: 'lobby-stage' },
      button(h('span', { class: 'stage-pad' }, h('img', { class: 'stage-plane', src: planeIconUrl(plane.id, progress.tier, progress.level), alt: t(`plane.${plane.id}` as TKey) })), openPlane, 'stage-pic', { 'aria-label': t(`plane.${plane.id}` as TKey) }),
      h('div', { class: 'stage-name' }, h('h2', {}, t(`plane.${plane.id}` as TKey)), h('span', { class: 'tier-chip', style: tierColor ? `color:${tierColor};border-color:${tierColor}` : undefined }, `${t('planes.tier')} ${progress.tier}`), starsRow(progress.level, MAX_LEVEL_IN_TIER, tierColor)),
      h(
        'div',
        { class: 'stage-meta' },
        h('span', { class: 'stage-stat' }, icon(Icons.heart, 'ico'), String(combat.hp + (passiveDef?.combat?.hp ?? 0))),
        h('span', { class: 'stage-stat' }, icon(Icons.bolt, 'ico'), `×${(combat.damageMul * (1 + loadoutDamageBonus(activeDef, passiveDef))).toFixed(2)}`),
        h('span', { class: 'stage-gears' }, gear(weaponSvg(weapon.id), t(weapon.nameKey)), gear(activeDef ? itemSvg(activeDef.id) : null, activeDef ? t(activeDef.nameKey) : t('items.slotActive'), activeDef?.rarity), gear(passiveDef ? itemSvg(passiveDef.id) : null, passiveDef ? t(passiveDef.nameKey) : t('items.slotPassive'), passiveDef?.rarity)),
      ),
      button(t('menu.setup'), openPlane, 'btn small stage-setup'),
    );
  }

  protected build(): HTMLElement {
    const go = (s: () => Screen) => () => this.app.show(s());
    const daily = dailyState();
    const unopened = Save.data.crates.filter((c) => !c.openedAt).length;
    const questsReady = Save.data.quests.filter((q) => !q.claimed && q.progress >= q.target).length;
    const questsDone = Save.data.quests.filter((q) => q.claimed).length;
    const passReady = Save.data.pass.claimable ?? 0;

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
        this.railBtn(Icons.gift, t('menu.crates'), unopened ? t('menu.cratesWaiting', { n: unopened }) : null, go(() => new CratesScreen(this.app)), unopened),
        this.railBtn(Icons.homing, t('menu.howto'), null, go(() => new HowToScreen(this.app))),
      ),
      this.stage(),
      h(
        'nav',
        { class: 'lobby-rail rail-right', 'aria-label': t('menu.quests') },
        this.railBtn(Icons.trophy, t('menu.quests'), Save.data.quests.length ? `${questsDone} / ${Save.data.quests.length}` : null, go(() => new QuestsScreen(this.app)), questsReady),
        this.railBtn(Icons.star, t('menu.pass'), passReady ? t('menu.passReady', { n: passReady }) : `${Save.data.pass.bpPoints} BP`, go(() => new BattlePassScreen(this.app)), passReady, passReady ? 'ready' : ''),
        this.railBtn(Icons.coin, t('menu.daily'), daily.available ? t('menu.dailyReady') : t('menu.dailyDay', { n: daily.day }), () => this.openDaily(), daily.available ? 1 : 0, daily.available ? 'ready' : ''),
        this.railBtn(Icons.gear, t('menu.profile'), t('menu.settings'), go(() => new ProfileScreen(this.app))),
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
          button(h('span', { class: 'launch-inner' }, icon(Icons.clock), h('b', {}, t('menu.survival'))), go(() => new GameScreen(this.app, 'survival', 0)), 'launch-btn'),
          button(h('span', { class: 'launch-inner' }, icon(Icons.homing), h('b', {}, t('menu.online'))), go(() => new OnlineScreen(this.app)), 'launch-btn pvp'),
          button(h('span', { class: 'launch-inner' }, icon(Icons.play), h('b', {}, t('menu.play')), h('small', {}, t('menu.campaign'))), go(() => new LevelSelectScreen(this.app)), 'launch-btn main', { 'data-autofocus': true }),
        ),
      ),
    );
  }
}
