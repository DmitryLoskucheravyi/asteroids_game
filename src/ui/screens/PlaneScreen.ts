import type { App } from '../../app/App';
import { Sfx } from '../../core/audio';
import { num } from '../../core/math';
import { t, type TKey } from '../../core/i18n';
import { Server } from '../../core/server';
import { Save } from '../../core/storage';
import { ITEM_DEFS, RARITIES, applyItemPassive, getItemDef, itemStatLines, loadoutDamageBonus, type ItemDef } from '../../game/items';
import { planeIconUrl, TIER_COLORS } from '../../game/PlaneArt';
import { effectivePlaneSpec, levelUpCost, tierUpCost, MAX_TIER, MAX_LEVEL_IN_TIER, PLANES, planeCombat, type PlaneSpec } from '../../game/planes';
import { WEAPON_DEFS, getWeaponDef, DEFAULT_WEAPON_ID } from '../../game/weapons';
import { scaledItem, scaledWeapon } from '../../game/gearScale';
import { MAX_GEAR_LEVEL, itemUpgradeCost, weaponDamageMul, weaponUpgradeCost } from '../../../server/src/shared/gear';
import { JUMP_COOLDOWN, FLARE_COOLDOWN } from '../../game/systems/SkillSystem';
import { Icons, button, coinBadge, crystalBadge, h, icon } from '../dom';
import { Modal, toast } from '../Modal';
import { Screen } from '../Screen';
import { HangarScreen } from './HangarScreen';
import { StoreScreen } from './StoreScreen';
import { signatureAt } from '../../../server/src/shared/signature';
import { CRATE_ONLY_PLANES, SEASON_PLANE } from '../../../server/src/shared/store';
import { BattlePassScreen } from './BattlePassScreen';
import { ItemsScreen, itemPic, statList, weaponPic, weaponStatLines } from './ItemsScreen';
import { screenHeader, starsRow } from './LevelSelectScreen';

type Slot = 'weapon' | 'active' | 'passive';

/** Сторінка окремого літака: опис, характеристики, урон, прокачка й екіпіровка в одному місці. */
export class PlaneScreen extends Screen {
  private slot: Slot = 'weapon';
  /** Перегляд іншого тіру (лише візуалізація, нічого не купується); null — поточний */
  private previewTier: number | null = null;

  constructor(
    app: App,
    private readonly plane: PlaneSpec,
  ) {
    super(app);
  }

  private get owned(): boolean {
    return Save.owns(this.plane.id);
  }

  private async call(fn: () => Promise<{ profile: Parameters<typeof Save.applyProfile>[0] }>, sound: () => void = () => Sfx.powerup()): Promise<boolean> {
    try {
      const { profile } = await fn();
      Save.applyProfile(profile);
      this.render();
      sound();
      return true;
    } catch {
      Sfx.warning();
      return false;
    }
  }

  // ---------- верхній блок ----------

  private heroBlock(): HTMLElement {
    const p = this.plane;
    const progress = Save.progressFor(p.id);
    const tierColor = TIER_COLORS[progress.tier] || undefined;
    const selected = this.owned && Save.data.plane === p.id;

    let action: HTMLElement;
    if (!this.owned && p.id === SEASON_PLANE) {
      // сезонний — лише з останнього тьєру преміум-пропуску
      action = h('div', { class: 'buy-row' }, h('span', { class: 'crate-only-tag season' }, icon(Icons.star, 'ico'), t('planes.seasonOnly')), button(t('menu.pass'), () => this.app.show(new BattlePassScreen(this.app)), 'btn small'));
    } else if (!this.owned && CRATE_ONLY_PLANES.includes(p.id)) {
      // ексклюзив — не продається, лише випадає з ящиків
      action = h('div', { class: 'buy-row' }, h('span', { class: 'crate-only-tag' }, icon(Icons.gift, 'ico'), t('planes.crateOnly')), button(t('store.title'), () => this.app.show(new StoreScreen(this.app)), 'btn small'));
    } else if (!this.owned) {
      const affordable = Save.data.coins >= p.price;
      action = h(
        'div',
        { class: 'buy-row' },
        button(h('span', { class: 'buy-label' }, t('planes.buy'), coinBadge(p.price, 'coin-badge small')), () => {
          void this.call(() => Server.buyPlane(p.id)).then((ok) => ok && toast(t('planes.bought')));
        }, `btn primary${affordable ? '' : ' locked'}`, { 'data-autofocus': true }),
        affordable ? null : h('span', { class: 'need' }, t('planes.notEnough', { n: p.price - Save.data.coins })),
      );
    } else {
      action = button(selected ? t('planes.selected') : t('planes.select'), () => void this.call(() => Server.selectPlane(p.id), () => Sfx.pickup()), `btn${selected ? ' btn-on' : ' primary'}`, { 'data-autofocus': true });
    }

    return h(
      'section',
      { class: 'card plane-hero' },
      h(
        'div',
        { class: 'plane-hero-pic' },
        button(icon(Icons.back), () => this.switchPlane(-1), 'hero-arrow prev', { 'aria-label': 'prev' }),
        h('img', { src: this.previewTier ? planeIconUrl(p.id, this.previewTier, this.previewTier === progress.tier ? progress.level : 1) : planeIconUrl(p.id, progress.tier, progress.level), alt: '' }),
        button(icon(Icons.back), () => this.switchPlane(1), 'hero-arrow next', { 'aria-label': 'next' }),
        h('span', { class: 'hero-index' }, `${PLANES.indexOf(p) + 1} / ${PLANES.length}`),
      ),
      this.tierSwitch(),
      h(
        'div',
        { class: 'plane-hero-info' },
        h('h3', {}, t(`plane.${p.id}` as TKey)),
        this.owned
          ? h('div', { class: 'upgrade-head' }, h('span', { class: 'tier-chip', style: tierColor ? `color:${tierColor};border-color:${tierColor}` : undefined }, `${t('planes.tier')} ${progress.tier}`), starsRow(progress.level, MAX_LEVEL_IN_TIER, tierColor))
          : null,
        h('p', { class: 'plane-desc' }, t(`planeDesc.${p.id}` as TKey)),
        h('div', { class: 'feature' }, h('span', { class: 'feature-tag' }, t('planes.shipSkill')), t(`feat.${p.id}` as TKey)),
        action,
      ),
    );
  }

  /** Перемикач "Перегляд тіру 1–4": картинка, гармата й скіли на обраному тірі (без купівлі). */
  private tierSwitch(): HTMLElement {
    const progress = Save.progressFor(this.plane.id);
    const current = this.owned ? progress.tier : 1;
    const view = this.previewTier ?? current;
    return h(
      'div',
      { class: 'tier-switch', role: 'group', 'aria-label': t('planePage.preview') },
      h('small', { class: 'muted' }, t('planePage.preview')),
      ...[1, 2, 3, 4].map((tr) =>
        button(
          `T${tr}`,
          () => {
            this.previewTier = tr === current ? null : tr;
            this.render();
            this.el.querySelector<HTMLElement>(`.tier-switch [data-tier="${tr}"]`)?.focus();
          },
          `tier-btn${tr === view ? ' on' : ''}${tr === current ? ' current' : ''}`,
          { 'data-tier': tr, style: TIER_COLORS[tr] ? `--tc:${TIER_COLORS[tr]}` : '', 'aria-pressed': tr === view },
        ),
      ),
      this.previewTier && this.previewTier !== current ? h('small', { class: 'preview-hint' }, t('planePage.previewHint')) : null,
    );
  }

  /** Еволюція по тірах: що відкриває кожен тір у бортовому скілі й фірмовій гарматі. */
  private evolutionBlock(): HTMLElement {
    const p = this.plane;
    const current = this.owned ? Save.progressFor(p.id).tier : 0;
    const view = this.previewTier ?? (current || 1);
    const g = signatureAt(p.id, 1);
    const rows = [1, 2, 3, 4].map((tr) => {
      const state = tr === current ? 'current' : tr < current ? 'open' : 'locked';
      const color = TIER_COLORS[tr] || '#d8dce8';
      return h(
        'li',
        { class: `evo-row ${state}${tr === view ? ' viewing' : ''}`, style: `--tc:${color}` },
        h('span', { class: 'evo-tier' }, `T${tr}`, h('small', {}, tr === 1 ? t('planePage.tierBase') : t(state === 'current' ? 'planePage.tierCurrent' : state === 'open' ? 'planePage.tierOpen' : 'planePage.tierLocked'))),
        h(
          'span',
          { class: 'evo-lines' },
          h('span', { class: 'evo-line skill' }, icon(Icons.bolt, 'ico tiny'), tr === 1 ? t(`feat.${p.id}` as TKey) : t(`skillTier.${p.id}.${tr}` as TKey)),
          h('span', { class: 'evo-line gun', style: `--sig:${g.color}` }, icon(Icons.star, 'ico tiny'), tr === 1 ? t(`sig.${g.id}` as TKey) : t(`sigTier.${p.id}.${tr}` as TKey)),
        ),
      );
    });
    return h('section', { class: 'card plane-evo' }, h('h3', {}, icon(Icons.star, 'ico gold'), t('planePage.tiersTitle')), h('ol', { class: 'evo-list' }, ...rows));
  }

  /** Стрілки на героїчному блоці — гортання літаків без повернення в ангар. */
  private switchPlane(dir: number): void {
    const i = PLANES.indexOf(this.plane);
    const next = PLANES[(i + dir + PLANES.length) % PLANES.length];
    this.app.show(new PlaneScreen(this.app, next));
  }

  // ---------- характеристики ----------

  private statsBlock(): HTMLElement {
    const p = this.plane;
    const progress = Save.progressFor(p.id);
    const loadout = Save.loadoutFor(p.id);
    const passive = Save.itemById(loadout.passive);
    const passiveDef = passive ? scaledItem(getItemDef(passive.defId), passive.level) : undefined;
    const spec = applyItemPassive(effectivePlaneSpec(p, progress), passiveDef);
    const combat = planeCombat(p, progress);
    const hp = combat.hp + (passiveDef?.combat?.hp ?? 0);
    const activeDef = getItemDef(Save.itemById(loadout.active)?.defId ?? '');
    const damageMul = combat.damageMul * (1 + loadoutDamageBonus(passiveDef, activeDef));
    const fireMul = 1 + (passiveDef?.combat?.fireRate ?? 0);
    const baseWeapon = getWeaponDef(loadout.weapon) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
    const weapon = scaledWeapon(baseWeapon, Save.weaponLevel(baseWeapon.id));
    const dmg = weapon.damage * damageMul;

    // смуга з квадратних сегментів свого кольору; останній сегмент заповнюється частково
    const SEGS = 12;
    const bar = (label: string, value: string, v: number, color: string) => {
      const fill = Math.max(0.04, Math.min(1, v)) * SEGS;
      const cells = Array.from({ length: SEGS }, (_, i) => h('i', { style: `--f:${Math.max(0, Math.min(1, fill - i))}` }));
      return h('div', { class: 'stat-line' }, h('span', { class: 'stat-name' }, label), h('div', { class: 'segbar', style: `--c:${color}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round((fill / SEGS) * 100), 'aria-label': label }, ...cells), h('b', {}, value));
    };

    const cdMul = 1 - (passiveDef?.combat?.cooldown ?? 0);
    return h(
      'section',
      { class: 'card plane-stats' },
      h('h3', {}, icon(Icons.bolt, 'ico'), t('planePage.stats')),
      bar(t('stat.hp'), String(hp), hp / 220, '#4fe08a'),
      bar(t('stat.damage'), `×${damageMul.toFixed(2)}`, (damageMul - 0.6) / 1.2, '#ff4a5a'),
      bar(t('planes.speed'), String(Math.round(spec.maxSpeed)), (spec.maxSpeed - 300) / 320, '#58d2ff'),
      bar(t('planes.accelStat'), String(Math.round(spec.accel)), spec.accel / 5000, '#ffd24a'),
      bar(t('stat.handling'), spec.drag.toFixed(1), spec.drag / 10, '#b77bff'),
      bar(t('stat.hitbox'), String(spec.radius), 1 - (spec.radius - 8) / 12, '#ff9a3a'),
      h('h4', { class: 'sub-title' }, t('planePage.firepower'), ' · ', t(weapon.nameKey)),
      statList([
        { key: 'stat.damage', value: weapon.pellets ? `${weapon.pellets} × ${num(dmg)}` : num(dmg) },
        { key: 'stat.dps', value: Math.round(dmg * weapon.fireRate * fireMul * (weapon.salvo ?? 1) * (weapon.pellets ?? 1)).toString() },
        ...weaponStatLines(weapon, damageMul).slice(3),
      ]),
      (() => {
        // фірмова гармата літака (X) — на поточному або переглянутому тірі
        const g = signatureAt(p.id, this.previewTier ?? progress.tier);
        const per = (g.pellets ?? 1) * (g.salvo ?? 1);
        return h(
          'div',
          { class: 'sig-block', style: `--sig:${g.color}` },
          h('h4', { class: 'sub-title' }, t('planePage.signature'), ' · ', t(`sig.${g.id}` as TKey), g.tier > 1 ? h('span', { class: 'sig-tier', style: `--tc:${TIER_COLORS[g.tier]}` }, `T${g.tier}`) : null),
          h('p', { class: 'muted small' }, t(`sigDesc.${g.id}` as TKey)),
          ...[2, 3, 4].filter((tr) => tr <= g.tier).map((tr) => h('p', { class: 'sig-evo small', style: `--tc:${TIER_COLORS[tr]}` }, `T${tr} · `, t(`sigTier.${p.id}.${tr}` as TKey))),
          statList([
            { key: 'stat.damage', value: `${g.shots * per > 1 ? `${g.shots * per} × ` : ''}${num(g.damage * damageMul)}` },
            { key: 'stat.itemCooldown', value: `${num(g.cooldown)} s` },
            ...(g.range ? [{ key: 'stat.range' as TKey, value: String(g.range) }] : []),
            ...(g.splash ? [{ key: 'stat.radius' as TKey, value: String(g.splash) }] : []),
          ]),
        );
      })(),
      h('h4', { class: 'sub-title' }, t('planePage.skills')),
      statList([
        { key: 'control.jump', value: `${(JUMP_COOLDOWN * (spec.feature.jumpCooldownMul ?? 1) * cdMul).toFixed(1)} s` },
        { key: 'control.flare', value: `${(FLARE_COOLDOWN * cdMul).toFixed(1)} s` },
      ]),
    );
  }

  // ---------- прокачка ----------

  private confirmUpgrade(kind: 'level' | 'tier'): void {
    const p = this.plane;
    const progress = Save.progressFor(p.id);
    const nextProgress = kind === 'level' ? { ...progress, level: progress.level + 1 } : { ...progress, tier: progress.tier + 1, level: 1 };
    const before = effectivePlaneSpec(p, progress);
    const after = effectivePlaneSpec(p, nextProgress);
    const cb = planeCombat(p, progress);
    const ca = planeCombat(p, nextProgress);

    const row = (label: string, b: number, a: number, fmt: (n: number) => string = (n) => Math.round(n).toString()) =>
      h('div', { class: 'stat-compare-row' }, h('span', {}, label), h('span', { class: 'muted' }, fmt(b)), icon(Icons.dash, 'ico tiny'), h('span', { class: 'stat-after' }, fmt(a)));

    // прев'ю: зараз → після (новий силует тіру або новий обвіс рівня)
    const preview = h(
      'div',
      { class: 'upgrade-preview' },
      h('figure', {}, h('img', { src: planeIconUrl(p.id, progress.tier, progress.level), alt: '' }), h('figcaption', {}, t('planes.now'))),
      icon(Icons.dash, 'ico'),
      h('figure', { class: 'after' }, h('img', { src: planeIconUrl(p.id, nextProgress.tier, nextProgress.level), alt: '' }), h('figcaption', {}, t('planes.after'))),
    );
    const news =
      kind === 'tier'
        ? h(
            'div',
            { class: 'upgrade-news', style: `--tc:${TIER_COLORS[nextProgress.tier]}` },
            h('p', {}, h('b', {}, t('planes.newSkill'), ': '), t(`skillTier.${p.id}.${nextProgress.tier}` as TKey)),
            h('p', {}, h('b', {}, t('planes.newGun'), ': '), t(`sigTier.${p.id}.${nextProgress.tier}` as TKey)),
          )
        : h('div', { class: 'upgrade-news' }, h('p', {}, h('b', {}, t('planes.newLook'))));
    const m = new Modal({
      title: t('planes.upgradeTitle'),
      body: [
        preview,
        news,
        row(t('stat.hp'), cb.hp, ca.hp),
        row(t('stat.damage'), cb.damageMul, ca.damageMul, (n) => `×${n.toFixed(2)}`),
        row(t('planes.accelStat'), before.accel, after.accel),
        row(t('planes.speed'), before.maxSpeed, after.maxSpeed),
        row(t('planes.dragStat'), before.drag, after.drag, (n) => n.toFixed(1)),
      ],
      actions: [
        button(t('common.cancel'), () => m.close(), 'btn', { 'data-autofocus': true }),
        button(t('planes.confirm'), () => {
          m.close();
          void this.call(() => (kind === 'level' ? Server.levelUpPlane(p.id) : Server.tierUpPlane(p.id)));
        }, 'btn primary'),
      ],
      onEscape: () => m.close(),
    }).open();
  }

  private upgradeBlock(): HTMLElement | null {
    if (!this.owned) return null;
    const p = this.plane;
    const progress = Save.progressFor(p.id);
    const maxed = progress.tier >= MAX_TIER && progress.level >= MAX_LEVEL_IN_TIER;
    const canLevelUp = progress.level < MAX_LEVEL_IN_TIER;
    const canTierUp = progress.tier < MAX_TIER && progress.level >= MAX_LEVEL_IN_TIER;
    const lvlCost = levelUpCost(p.price, progress.tier, progress.level);
    const tCost = tierUpCost(p.price, progress.tier);
    return h(
      'section',
      { class: 'card plane-upgrade' },
      h('h3', {}, icon(Icons.star, 'ico gold'), t('planePage.upgrade')),
      h('p', { class: 'muted small' }, t('planePage.upgradeHint')),
      maxed
        ? h('span', { class: 'muted' }, t('planes.maxTier'))
        : h(
            'div',
            { class: 'upgrade-actions' },
            canLevelUp
              ? button(h('span', { class: 'buy-label' }, t('planes.levelUp'), coinBadge(lvlCost, 'coin-badge small')), () => this.confirmUpgrade('level'), `btn small${Save.data.coins >= lvlCost ? '' : ' locked'}`)
              : null,
            canTierUp
              ? button(
                  h('span', { class: 'buy-label' }, t('planes.tierUp'), coinBadge(tCost.coins, 'coin-badge small'), crystalBadge(tCost.crystals, 'coin-badge small crystal-badge')),
                  () => this.confirmUpgrade('tier'),
                  `btn small${Save.data.coins >= tCost.coins && Save.data.crystals >= tCost.crystals ? '' : ' locked'}`,
                )
              : null,
          ),
    );
  }

  // ---------- екіпіровка ----------

  private async equip(value: string | null): Promise<void> {
    const p = this.plane;
    const l = Save.loadoutFor(p.id);
    const next = { active: l.active, passive: l.passive, weapon: l.weapon, [this.slot]: value };
    await this.call(() => Server.setLoadout(p.id, next.active, next.passive, next.weapon), () => Sfx.pickup());
  }

  private slotButton(slot: Slot): HTMLElement {
    const l = Save.loadoutFor(this.plane.id);
    let pic: HTMLElement;
    let name: string;
    let sub: string;
    if (slot === 'weapon') {
      const w = getWeaponDef(l.weapon) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
      pic = weaponPic(w.id, 'item-pic small');
      name = t(w.nameKey);
      sub = t('items.slotWeapon');
    } else {
      const owned = Save.itemById(l[slot]);
      const def = owned ? getItemDef(owned.defId) : undefined;
      pic = def ? itemPic(def.id, 'item-pic small') : h('div', { class: 'item-pic small empty' }, '+');
      name = def ? t(def.nameKey) : t('items.empty');
      sub = t(slot === 'active' ? 'items.slotActive' : 'items.slotPassive');
    }
    return button(
      h('span', { class: 'slot-inner' }, pic, h('span', { class: 'slot-text' }, h('small', {}, sub), h('b', {}, name))),
      () => {
        this.slot = slot;
        this.render();
        this.el.querySelector<HTMLElement>(`.slot-btn[data-slot="${slot}"]`)?.focus();
      },
      `slot-btn${this.slot === slot ? ' on' : ''}`,
      { 'data-slot': slot },
    );
  }

  /**
   * Прокачка того, що стоїть у вибраному слоті: рівень (1..5), що дасть наступний рівень, ціна й кнопка.
   * Сервер знову перевіряє ціну й рівень — тут лише показ.
   */
  private upgradeCard(): HTMLElement | null {
    const l = Save.loadoutFor(this.plane.id);
    let kind: 'weapon' | 'item';
    let id: string;
    let level: number;
    let cost: { coins: number; crystals: number };
    let name: string;
    let gains: string[];
    if (this.slot === 'weapon') {
      const w = getWeaponDef(l.weapon) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
      kind = 'weapon';
      id = w.id;
      level = Save.weaponLevel(w.id);
      cost = weaponUpgradeCost(w.price, level);
      name = t(w.nameKey);
      gains = [`+${Math.round((weaponDamageMul(level + 1) - weaponDamageMul(level)) * 1000) / 10}% ${t('gear.bonus.damage')}`, `+8% ${t('gear.bonus.capacity')}`, `−5% ${t('gear.bonus.reload')}`];
    } else {
      const owned = Save.itemById(l[this.slot]);
      const def = owned ? getItemDef(owned.defId) : undefined;
      if (!owned || !def) return null;
      kind = 'item';
      id = owned.id;
      level = owned.level ?? 1;
      cost = itemUpgradeCost(def.price, def.rarity, level);
      name = t(def.nameKey);
      gains = def.slot === 'active' ? [`+10% ${t('gear.bonus.power')}`, `−4% ${t('gear.bonus.cooldown')}`] : [def.combat?.hp ? `+5% ${t('gear.bonus.hp')}` : '', `+6% ${t('gear.bonus.bonus')}`].filter(Boolean);
    }
    const maxed = level >= MAX_GEAR_LEVEL;
    const afford = Save.data.coins >= cost.coins && Save.data.crystals >= cost.crystals;
    const pips = h('span', { class: 'gear-pips' }, ...Array.from({ length: MAX_GEAR_LEVEL }, (_, i) => h('i', { class: i < level ? 'on' : '' })));
    const price = h('span', { class: 'buy-label' }, coinBadge(cost.coins, 'coin-badge small'), cost.crystals ? crystalBadge(cost.crystals, 'coin-badge small crystal-badge') : null);
    return h(
      'div',
      { class: `gear-upgrade${maxed ? ' maxed' : ''}` },
      h('div', { class: 'gear-upgrade-head' }, h('b', {}, name), h('span', { class: 'gear-lvl' }, t('gear.level', { n: level })), pips),
      maxed
        ? h('p', { class: 'muted small' }, t('gear.maxed'))
        : h(
            'div',
            { class: 'gear-upgrade-row' },
            h('div', { class: 'gear-gains' }, h('small', {}, t('gear.next')), ...gains.map((g) => h('span', { class: 'gear-gain' }, g))),
            button(h('span', { class: 'buy-label' }, icon(Icons.bolt, 'ico'), t('gear.upgrade'), price), async () => {
              if (!afford) {
                Sfx.warning();
                toast(t('gear.noMoney'));
                return;
              }
              if (await this.call(() => Server.upgradeGear(kind, id), () => Sfx.rareReward())) toast(t('gear.upgraded', { n: level + 1 }));
            }, `btn ${afford ? 'primary' : ''} small gear-up-btn`),
          ),
    );
  }

  private inventory(): HTMLElement {
    const l = Save.loadoutFor(this.plane.id);
    const tiles: HTMLElement[] = [];
    if (this.slot === 'weapon') {
      for (const w of WEAPON_DEFS) {
        if (!Save.ownsWeapon(w.id)) continue;
        const on = (l.weapon ?? DEFAULT_WEAPON_ID) === w.id;
        tiles.push(
          button(
            h('span', { class: 'inv-inner' }, weaponPic(w.id), h('span', { class: 'inv-level' }, t('gear.level', { n: Save.weaponLevel(w.id) })), h('b', {}, t(w.nameKey)), statList(weaponStatLines(scaledWeapon(w, Save.weaponLevel(w.id)))), h('span', { class: 'inv-state' }, on ? t('items.equipped') : t('items.equip'))),
            () => void this.equip(w.id),
            `inv-tile${on ? ' on' : ''}`,
          ),
        );
      }
    } else {
      // один предмет — одна плитка (старі дублікати не показуємо)
      const seen = new Set<string>();
      const owned = Save.data.items
        .filter((it) => getItemDef(it.defId)?.slot === this.slot && !seen.has(it.defId) && seen.add(it.defId))
        .map((it) => ({ it, def: getItemDef(it.defId) as ItemDef }))
        .sort((a, b) => RARITIES.indexOf(a.def.rarity) - RARITIES.indexOf(b.def.rarity));
      const current = Save.itemById(l[this.slot]);
      for (const { it, def } of owned) {
        const on = current?.defId === def.id;
        tiles.push(
          button(
            h(
              'span',
              { class: 'inv-inner' },
              itemPic(def.id),
              h('span', { class: 'inv-level' }, t('gear.level', { n: it.level ?? 1 })),
              h('b', {}, t(def.nameKey)),
              h('small', { class: `rarity-${def.rarity}` }, t(`item.rarity.${def.rarity}` as TKey)),
              h('span', { class: 'inv-desc' }, t(def.descKey)),
              statList(itemStatLines(scaledItem(def, it.level) ?? def)),
              h('span', { class: 'inv-state' }, on ? t('items.unequip') : t('items.equip')),
            ),
            () => void this.equip(on ? null : it.id),
            `inv-tile rarity-card-${def.rarity}${on ? ' on' : ''}`,
          ),
        );
      }
      const missing = ITEM_DEFS.filter((d) => d.slot === this.slot && !seen.has(d.id)).length;
      if (missing > 0) {
        tiles.push(button(h('span', { class: 'inv-inner' }, h('div', { class: 'item-pic empty' }, '+'), h('b', {}, t('planePage.toShop')), h('small', { class: 'muted' }, t('planePage.moreItems', { n: missing }))), () => this.app.show(new ItemsScreen(this.app)), 'inv-tile shop'));
      }
    }
    return h('div', { class: 'inv-grid' }, ...tiles);
  }

  private loadoutBlock(): HTMLElement | null {
    if (!this.owned) return null;
    return h(
      'section',
      { class: 'card plane-loadout' },
      h('h3', {}, icon(Icons.shield, 'ico'), t('items.loadout')),
      h('div', { class: 'slot-row' }, this.slotButton('weapon'), this.slotButton('active'), this.slotButton('passive')),
      this.upgradeCard(),
      this.inventory(),
    );
  }

  protected build(): HTMLElement {
    return h(
      'div',
      { class: 'page plane-page' },
      screenHeader(t(`plane.${this.plane.id}` as TKey), () => this.onBack(), h('div', { class: 'head-coins' }, coinBadge(Save.data.coins, 'coin-badge big'), crystalBadge(Save.data.crystals, 'coin-badge big crystal-badge'))),
      h(
        'div',
        { class: 'plane-layout' },
        h('div', { class: 'plane-col col-stats' }, this.statsBlock()),
        h('div', { class: 'plane-col col-hero' }, this.heroBlock(), this.upgradeBlock(), this.evolutionBlock()),
        h('div', { class: 'plane-col col-gear' }, this.loadoutBlock() ?? h('section', { class: 'card plane-loadout locked-gear' }, h('h3', {}, icon(Icons.lock, 'ico'), t('items.loadout')), h('p', { class: 'muted small' }, t('planePage.buyFirst')))),
      ),
    );
  }

  onBack(): void {
    this.app.show(new HangarScreen(this.app, this.plane.id));
  }
}
