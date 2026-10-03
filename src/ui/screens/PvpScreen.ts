import type { GameLink } from '../../net/gameLink';
import type { App } from '../../app/App';
import { t, type TKey } from '../../core/i18n';
import { displayKey, primaryKeyFor, type Action, type BindAction } from '../../core/input';
import { formatTime } from '../../core/math';
import { Save } from '../../core/storage';
import { itemSvg, weaponSvg } from '../../game/ItemArt';
import { planeIconUrl } from '../../game/PlaneArt';
import type { PlaneId } from '../../game/planes';
import { rankEmblem, rankInfo, type RankMode } from '../../game/ranks';

/** Кольори команд (смужка на картці, імена тіммейтів у бою — завжди зелені). */
const TEAM_COLORS = ['#58d2ff', '#ff6a6a', '#ffd24a', '#b77bff', '#4fe08a'];
import { PvpGame } from '../../game/PvpGame';
import { signatureFor } from '../../../server/src/shared/signature';

/** Іконка фірмової гармати — за видом пострілу */
const SIG_ART: Record<string, string> = { bullet: 'machine_gun', rocket: 'rocket_launcher', laser: 'laser', missile: 'homing_salvo', pellet: 'scatter_gun', plasma: 'plasma_cannon', rail: 'railgun' };
import { ARENA_EVENT_INFO } from '../../game/arenaEvents';
import { windAt } from '../../../server/src/shared/hazards';
import { BOOST_DURATION, FLARE_DURATION } from '../../game/systems/SkillSystem';
import type { MatchInit, MatchResultEntry } from '../../net/pvpProtocol';
import { Icons, button, h, icon } from '../dom';
import { Modal } from '../Modal';
import { Screen } from '../Screen';
import { MainMenuScreen } from './MainMenuScreen';
import { MatchResultScreen } from './MatchResultScreen';

const RADAR_W = 224;
const RADAR_H = 126;

interface Slot {
  el: HTMLElement;
  count: HTMLElement;
}

/** Бойовий екран онлайн-матчу: HP, таймер, панель навичок, радар, фід фрагів. */
export class PvpScreen extends Screen {
  readonly menuBackdrop = false;
  private game!: PvpGame;
  private raf = 0;
  private cleanup: (() => void)[] = [];
  private hpFill!: HTMLElement;
  private hpText!: HTMLElement;
  private timer!: HTMLElement;
  private alive!: HTMLElement;
  private kills!: HTMLElement;
  private lootCoins!: HTMLElement;
  private lootCrystals!: HTMLElement;
  private radarCanvas!: HTMLCanvasElement;
  private scanTag!: HTMLElement;
  /** Стрілка напряму сонячного вітру (лише в цьому івенті) */
  private windArrow: HTMLElement | null = null;
  private feed!: HTMLElement;
  private dead!: HTMLElement;
  private slots!: Record<'weapon' | 'sig' | 'boost' | 'jump' | 'flare' | 'item' | 'scan', Slot>;
  private weaponBar!: HTMLElement;
  private leftViaResult = false;
  private loading: HTMLElement | null = null;
  private cache = new Map<HTMLElement, string>();

  constructor(
    app: App,
    private readonly socket: GameLink,
    private readonly initData: MatchInit,
  ) {
    super(app);
  }

  private slot(key: string, art: string, bind: BindAction | null, labelKey: TKey, cls = '', keyText?: string): Slot {
    const count = h('span', { class: 'sk-count' });
    const keyLabel = keyText ?? (bind ? displayKey(primaryKeyFor(bind)) : null);
    const el = h(
      'div',
      { class: `skill sk-${key} ${cls}` },
      h('span', { class: 'sk-inner' }, icon(art), count, keyLabel ? h('span', { class: 'sk-key' }, keyLabel) : null, h('span', { class: 'sk-label' }, t(labelKey))),
    );
    return { el, count };
  }

  protected build(): HTMLElement {
    const plane = Save.owns(Save.data.plane) ? Save.data.plane : 'falcon';
    const progress = Save.progressFor(plane);
    const loadout = Save.loadoutFor(plane);
    this.hpText = h('span', { class: 'hp-num' }, '');
    this.hpFill = h('i');
    this.timer = h('div', { class: 'pvp-timer' }, '4:00');
    this.alive = h('span', {}, '10');
    this.kills = h('span', {}, '0');
    this.lootCoins = h('span', {}, '0');
    this.lootCrystals = h('span', {}, '0');
    this.radarCanvas = h('canvas', { width: RADAR_W * 2, height: RADAR_H * 2, class: 'radar-canvas', style: `width:${RADAR_W}px;height:${RADAR_H}px` }) as HTMLCanvasElement;
    this.feed = h('div', { class: 'frag-feed' });
    this.dead = h('div', { class: 'pvp-dead', hidden: true }, h('b', {}, t('pvp.downed')), h('span', {}, t('pvp.spectating')));

    const weaponId = loadout.weapon ?? 'machine_gun';
    const activeItem = Save.itemById(loadout.active);
    const passiveItem = Save.itemById(loadout.passive);
    this.weaponBar = h('i');
    this.slots = {
      // основна зброя — ЛКМ; фірмова гармата літака — X
      weapon: this.slot('weapon', weaponSvg(weaponId), 'fire', 'hud.weapon', 'sk-art sk-wide', t('hud.lmb')),
      sig: this.slot('sig', weaponSvg(SIG_ART[signatureFor(plane).visual ?? signatureFor(plane).kind]), 'signature', 'hud.signature', 'sk-art sk-sig'),
      boost: this.slot('boost', Icons.bolt, 'boost', 'hud.boost'),
      jump: this.slot('jump', Icons.dash, 'jump', 'hud.jump'),
      flare: this.slot('flare', Icons.flare, 'flare', 'hud.flare'),
      scan: this.slot('scan', Icons.radar, 'scan', 'hud.scan'),
      item: activeItem ? this.slot('item', itemSvg(activeItem.defId), 'item', 'hud.item', `sk-art rarity-frame-${activeItem.rarity}`) : this.slot('item', Icons.lock, 'item', 'hud.item', 'sk-none'),
    };
    this.slots.weapon.el.append(h('span', { class: 'sk-ammo' }, this.weaponBar));
    const passive = passiveItem
      ? h('div', { class: `skill sk-passive sk-art rarity-frame-${passiveItem.rarity}` }, h('span', { class: 'sk-inner' }, icon(itemSvg(passiveItem.defId)), h('span', { class: 'sk-label' }, t('hud.passive'))))
      : h('div', { class: 'skill sk-passive sk-none' }, h('span', { class: 'sk-inner' }, icon(Icons.shield), h('span', { class: 'sk-label' }, t('hud.passive'))));

    const leaveBtn = button(icon(Icons.close), () => this.confirmLeave(), 'icon-btn', { 'aria-label': t('pvp.leave'), tabindex: -1 });
    leaveBtn.removeAttribute('data-nav');

    return h(
      'div',
      { class: 'game pvp' },
      // лівий верхній кут: радар, під ним — свій літак і HP
      h(
        'div',
        { class: 'pvp-tl' },
        h('div', { class: 'radar-box' }, h('div', { class: 'radar-label' }, t('pvp.radar'), (this.scanTag = h('span', { class: 'radar-scan-tag', hidden: true }, t('pvp.scanned')))), this.radarCanvas),
        h(
          'div',
          { class: 'hud-tl pvp-self' },
          h('img', { class: 'pvp-avatar', src: planeIconUrl(plane, progress.tier, progress.level), alt: '' }),
          h('div', { class: 'pvp-self-info' }, h('div', { class: 'pvp-nick' }, Save.data.nickname || t(`plane.${plane}` as TKey)), h('div', { class: 'hp-bar' }, h('div', { class: 'hp-track' }, this.hpFill), this.hpText)),
        ),
      ),
      h('div', { class: 'pvp-top' }, this.timer, h('div', { class: 'pvp-counters' }, h('span', { class: 'pvp-chip', title: t((this.initData.teamSize ?? 1) > 1 ? 'pvp.teamsAlive' : 'pvp.alive') }, icon(Icons.heart, 'ico'), this.alive)), h('div', { class: 'pvp-loot', title: t('pvp.lootHint') }, h('span', { class: 'pvp-chip loot-coin' }, icon(Icons.coin, 'ico'), this.lootCoins), h('span', { class: 'pvp-chip loot-crystal' }, icon(Icons.crystal, 'ico'), this.lootCrystals))),
      this.eventChip(),
      h('div', { class: 'pvp-kills', title: t('matchresult.kills') }, h('span', { class: 'pvp-kills-ico', html: Icons.boss }), this.kills, h('small', {}, t('pvp.killsLabel'))),
      h('div', { class: 'hud-tr' }, leaveBtn),
      this.feed,
      this.dead,
      h('div', { class: 'hud-skills pvp-skills' }, this.slots.weapon.el, this.slots.sig.el, this.slots.boost.el, this.slots.jump.el, this.slots.flare.el, this.slots.scan.el, this.slots.item.el, passive),
      (this.loading = this.loadingScreen()),
    );
  }

  onShow(): void {
    const app = this.app;
    this.game = new PvpGame(this.socket, app.input, Save.owns(Save.data.plane) ? Save.data.plane : 'falcon', this.initData);
    this.game.onMatchEnd = (results: MatchResultEntry[]) => {
      this.leftViaResult = true;
      this.app.show(new MatchResultScreen(this.app, results, this.socket));
    };
    this.game.onFeed = (text, kind) => this.pushFeed(text, kind);
    app.game = this.game;

    this.cleanup.push(app.input.onAction((a) => this.action(a)));
    const blockDefaults = (e: KeyboardEvent): void => {
      if (!Modal.top() && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', blockDefaults);
    this.cleanup.push(() => window.removeEventListener('keydown', blockDefaults));
    (document.activeElement as HTMLElement | null)?.blur?.();

    const loop = (): void => {
      this.updateHud();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  onHide(): void {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.app.input.clear();
    this.game?.dispose();
    if (this.app.game === this.game) this.app.game = null;
    // будь-який вихід з екрана бою (крім переходу до результатів) — вихід з матчу
    if (!this.leftViaResult) this.socket.close();
  }

  private action(a: Action): void {
    if (Modal.top()) {
      if (a === 'pause') Modal.escape();
      return;
    }
    switch (a) {
      case 'boost':
        this.game.useBoost();
        break;
      case 'jump':
        this.game.useJump();
        break;
      case 'flare':
        this.game.useFlare();
        break;
      case 'scan':
        this.game.useScan();
        break;
      case 'signature':
        this.game.useSignature();
        break;
      case 'item':
        this.game.useItem();
        break;
      case 'pause':
        this.confirmLeave();
        break;
      default:
        break;
    }
  }

  /** Івент арени під таймером; для вітру — стрілка, що показує, куди дме. */
  private eventChip(): HTMLElement | null {
    const kind = this.initData.event;
    if (!kind) return null;
    const ev = ARENA_EVENT_INFO[kind];
    this.windArrow = kind === 'wind' ? h('span', { class: 'wind-arrow' }, '➜') : null;
    return h('div', { class: 'pvp-event', style: `--ev:${ev.color}`, title: t(ev.descKey) }, icon(ev.icon, 'ico'), h('span', {}, t(ev.nameKey)), this.windArrow);
  }

  private pushFeed(text: string, kind: 'kill' | 'self'): void {
    const row = h('div', { class: `frag-row${kind === 'self' ? ' mine' : ''}` }, text);
    this.feed.prepend(row);
    setTimeout(() => row.remove(), 5000);
    while (this.feed.children.length > 5) this.feed.lastElementChild?.remove();
  }

  private confirmLeave(): void {
    if (Modal.top()) return;
    const m = new Modal({
      title: t('pvp.leave'),
      body: [h('p', {}, t('pvp.leaveConfirm'))],
      actions: [
        button(t('common.cancel'), () => m.close(), 'btn', { 'data-autofocus': true }),
        button(t('pvp.leave'), () => {
          m.close();
          this.leftViaResult = true;
          this.socket.close();
          this.app.show(new MainMenuScreen(this.app));
        }, 'btn danger'),
      ],
      onEscape: () => m.close(),
    }).open();
  }

  private set(el: HTMLElement, value: string): void {
    if (this.cache.get(el) === value) return;
    this.cache.set(el, value);
    el.textContent = value;
  }

  private cd(slot: Slot, ready: boolean, left: number, max: number, active = false, activeP = 0): void {
    this.set(slot.count, ready ? '' : left >= 10 ? String(Math.ceil(left)) : left.toFixed(1));
    slot.el.classList.toggle('empty', !ready && !active);
    slot.el.classList.toggle('active', active);
    slot.el.style.setProperty('--p', String(active ? activeP : ready ? 0 : left / Math.max(0.01, max)));
  }

  /**
   * Екран завантаження поверх бою на час відліку: режим, картки всіх пілотів (по черзі),
   * смуга підготовки й порада. Зникає, щойно сервер стартує матч.
   */
  private loadingScreen(): HTMLElement {
    const init = this.initData;
    const ranked = !!init.mode && init.mode !== 'casual';
    const teamSize = init.teamSize ?? 1;
    const myTeam = init.participants.find((p) => p.id === this.socket.id)?.team ?? -1;
    // у командних режимах — картки згруповані за командами, моя команда першою
    const list = teamSize > 1 ? [...init.participants].sort((a, b) => (a.team === myTeam ? -1 : 0) - (b.team === myTeam ? -1 : 0) || (a.team ?? 0) - (b.team ?? 0)) : init.participants;
    const selfId = this.socket.id;
    const tips: TKey[] = ['pvp.tip1', 'pvp.tip2', 'pvp.tip3', 'pvp.tip4', 'pvp.tip5'];
    const cards = list.map((p, i) => {
      const rk = ranked ? rankInfo(p.rankPoints ?? 0) : null;
      return h(
        'div',
        { class: `load-card${p.id === selfId ? ' self' : ''}${teamSize > 1 && p.team === myTeam ? ' ally' : ''}`, style: `--i:${i};--team:${TEAM_COLORS[(p.team ?? 0) % TEAM_COLORS.length]}` },
        teamSize > 1 ? h('span', { class: 'load-team' }, p.team === myTeam ? t('pvp.yourTeam') : t('pvp.team', { n: (p.team ?? 0) + 1 })) : null,
        h('img', { class: 'load-plane', src: planeIconUrl(p.planeId as PlaneId, p.tier ?? 1, p.level ?? 1), alt: '' }),
        h('b', { class: 'load-nick' }, p.nickname),
        h('span', { class: 'load-meta' }, rk ? h('span', { class: 'load-rank', html: rankEmblem(rk.id, rk.roman, init.mode as RankMode), title: `${t(rk.nameKey)} ${rk.roman}` }) : null, h('span', { class: 'tier-chip' }, `${t('planes.tier')} ${p.tier ?? 1}`)),
      );
    });
    return h(
      'div',
      { class: `pvp-loading${ranked ? ' ranked' : ''}`, style: `--count:${init.countdownMs}ms` },
      h(
        'div',
        { class: 'load-head' },
        h('small', {}, ranked ? `${t('online.ranked')} · ${t(`mode.${init.mode}` as TKey)}` : t('online.casual')),
        h('h2', {}, t('pvp.matchFound')),
        init.event ? h('span', { class: 'load-event', style: `--ev:${ARENA_EVENT_INFO[init.event].color}` }, icon(ARENA_EVENT_INFO[init.event].icon, 'ico'), `${t('event.label')}: ${t(ARENA_EVENT_INFO[init.event].nameKey)}`) : null,
      ),
      h('div', { class: `load-grid${teamSize > 1 ? ` teams t${teamSize}` : ''}` }, ...cards),
      h('div', { class: 'load-foot' }, h('div', { class: 'load-bar' }, h('i')), h('span', { class: 'load-status' }, t('pvp.preparing')), h('p', { class: 'load-tip' }, t(tips[Math.floor(Math.random() * tips.length)]))),
    );
  }

  private updateHud(): void {
    if (this.loading && this.game.state !== 'countdown') {
      const el = this.loading;
      this.loading = null;
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 600);
    }
    const g = this.game;
    const sk = g.skills;
    const pct = Math.max(0, g.hp / g.hpMax);
    this.hpFill.style.width = `${pct * 100}%`;
    this.hpFill.className = pct > 0.4 ? '' : 'low';
    this.set(this.hpText, `${Math.ceil(g.hp)} / ${g.hpMax}`);
    this.set(this.timer, g.state === 'countdown' ? t('pvp.countdown') : formatTime(Math.ceil(g.timeLeft)));
    this.timer.classList.toggle('urgent', g.state === 'active' && g.timeLeft < 30);
    this.set(this.alive, String(g.aliveCount));
    const kills = String(g.self?.kills ?? 0);
    if (this.cache.has(this.kills) && this.cache.get(this.kills) !== kills) {
      // коротка анімація, коли збив когось
      const box = this.kills.parentElement!;
      box.classList.remove('bump');
      void box.offsetWidth;
      box.classList.add('bump');
    }
    this.set(this.kills, kills);
    this.set(this.lootCoins, String(g.lootCoins));
    this.set(this.lootCrystals, String(g.lootCrystals));
    this.dead.hidden = g.selfAlive || g.state === 'ended';

    const gun = g.gun;
    this.weaponBar.style.width = `${Math.round(gun.fill * 100)}%`;
    this.slots.weapon.el.classList.toggle('reloading', gun.cooldown > 0);
    this.set(this.slots.weapon.count, gun.cooldown > 0 ? gun.cooldown.toFixed(1) : g.overdriveLeft > 0 ? '+70%' : String(Math.floor(gun.rounds)));
    this.slots.weapon.el.classList.toggle('active', g.overdriveLeft > 0);

    const bs = this.slots.boost;
    this.set(bs.count, String(sk.boostCharges));
    bs.el.classList.toggle('empty', sk.boostCharges === 0 && !sk.isBoosted);
    bs.el.classList.toggle('active', sk.isBoosted);
    bs.el.style.setProperty('--p', String(sk.isBoosted ? sk.boostLeft / BOOST_DURATION : 0));

    const jp = this.slots.jump;
    if (sk.jumpChargesMax > 1) {
      this.set(jp.count, `${sk.jumpCharges}/${sk.jumpChargesMax}`);
      jp.el.classList.toggle('empty', sk.jumpCharges === 0);
      jp.el.style.setProperty('--p', String(sk.jumpCharges < sk.jumpChargesMax ? sk.jumpCooldown / sk.jumpCooldownMax : 0));
    } else this.cd(jp, sk.jumpCharges > 0, sk.jumpCooldown, sk.jumpCooldownMax);

    this.cd(this.slots.flare, sk.flareCooldown <= 0, sk.flareCooldown, sk.flareCooldownMax, sk.isFlaring, sk.flareLeft / FLARE_DURATION);
    if (sk.itemEquipped()) this.cd(this.slots.item, sk.itemCooldown <= 0, sk.itemCooldown, sk.itemCooldownMax, g.phaseLeft > 0);

    const sg = g.signature;
    this.cd(this.slots.sig, g.sigCooldown <= 0 && g.sigLeft === 0, g.sigCooldown, sg.cooldown, g.sigLeft > 0);
    this.cd(this.slots.scan, g.scanCooldown <= 0, g.scanCooldown, PvpGame.SCAN_COOLDOWN, g.scanBlips.length > 0);
    this.scanTag.hidden = !g.scanBlips.length;

    if (this.windArrow) this.windArrow.style.transform = `rotate(${Math.atan2(windAt(g.hazardTime).y, windAt(g.hazardTime).x)}rad)`;

    this.renderRadar();
  }

  private renderRadar(): void {
    const g = this.game;
    const ctx = this.radarCanvas.getContext('2d')!;
    const W = this.radarCanvas.width;
    const H = this.radarCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(10,9,24,0.85)';
    ctx.fillRect(0, 0, W, H);
    const sx = W / g.worldW;
    const sy = H / g.worldH;
    ctx.strokeStyle = 'rgba(120,140,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((W / 4) * i, 0);
      ctx.lineTo((W / 4) * i, H);
      ctx.moveTo(0, (H / 4) * i);
      ctx.lineTo(W, (H / 4) * i);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(160,150,190,0.3)';
    for (const o of g.obstacles) {
      ctx.beginPath();
      ctx.arc(o.x * sx, o.y * sy, Math.max(1.5, o.r * sx), 0, Math.PI * 2);
      ctx.fill();
    }
    // видима область камери
    ctx.strokeStyle = 'rgba(88,210,255,0.35)';
    ctx.strokeRect((g.player.pos.x - g.width / 2) * sx, (g.player.pos.y - g.height / 2) * sy, g.width * sx, g.height * sy);
    const pulse = 0.6 + Math.sin(performance.now() / 120) * 0.4;
    // купи луту збитих літаків видно на радарі завжди
    ctx.fillStyle = '#ffd24a';
    for (const pk of g.pickups.values()) {
      if (pk.kind !== 'pile') continue;
      ctx.fillRect(pk.x * sx - 3, pk.y * sy - 3, 6, 6);
    }
    // сканер: хвиля від свого літака, потім приблизні позиції (коло = зона похибки ±5%)
    if (g.scanAge < 1.2) {
      const r = (g.scanAge / 1.2) * Math.hypot(W, H);
      ctx.strokeStyle = `rgba(88,210,255,${0.6 * (1 - g.scanAge / 1.2)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.player.pos.x * sx, g.player.pos.y * sy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (g.scanBlips.length) {
      const fade = Math.max(0, 1 - g.scanAge / PvpGame.SCAN_SHOW);
      const er = W * 0.05;
      for (const b of g.scanBlips) {
        const x = b.x * sx;
        const y = b.y * sy;
        ctx.fillStyle = b.ally ? `rgba(79,224,138,${0.18 * fade})` : `rgba(255,154,58,${0.22 * fade})`;
        ctx.beginPath();
        ctx.arc(x, y, er, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = b.ally ? `rgba(79,224,138,${0.7 * fade})` : `rgba(255,154,58,${0.85 * fade})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    for (const c of g.radarContacts()) {
      ctx.fillStyle = c.isSelf ? '#58d2ff' : c.ally ? '#4fe08a' : `rgba(255,74,90,${pulse})`;
      ctx.beginPath();
      ctx.arc(c.x * sx, c.y * sy, c.isSelf || c.ally ? 4 : 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
