import { Assets } from '../core/assets';
import { Sfx } from '../core/audio';
import { levelName, t, type TKey } from '../core/i18n';
import { mouseSteering, type InputState } from '../core/input';
import { Vec2, angleDiff, chance, clamp, circlesOverlap, formatTime, pick, rand, randInt } from '../core/math';
import { Save } from '../core/storage';
import { ASTEROID_SIZES, Asteroid, BlackHole, BouncingAsteroid, Comet, HomingAsteroid, type AsteroidSize } from './entities/Asteroid';
import type { WorldView } from './entities/Entity';
import { BossAsteroid, LaserGate, MINE_BLAST_RADIUS, Mine } from './entities/Hazards';
import { Pickup, type PickupKind } from './entities/Pickup';
import { Player } from './entities/Player';
import { CRYSTAL_INTERVAL, SURVIVAL_BASE, getLevel, introducedHazard, type LevelConfig } from './levels';
import { CRYSTAL_COINS } from './economy';
import { applyItemPassive, getItemDef, type ActiveEffect } from './items';
import { effectivePlaneSpec, getPlane, type PlaneFeature, type PlaneId } from './planes';
import { Projectile } from './entities/Projectile';
import { canDestroy } from './weapons';
import { ParticleSystem } from './systems/Particles';
import { BOOST_MULTIPLIER, FLARE_RADIUS, SkillSystem } from './systems/SkillSystem';
import { Starfield } from './systems/Starfield';

export type GameMode = 'campaign' | 'survival';
export type GameState = 'countdown' | 'running' | 'paused' | 'dying' | 'won' | 'lost';

export interface GameResult {
  mode: GameMode;
  level: number;
  won: boolean;
  time: number;
  duration: number;
  crystals: number;
  crystalTarget: number;
  stars: number;
  /** Коінс, зібрані кристалами за цей забіг */
  coins: number;
  /** Призми — рідкісна валюта тір-апів, зібрані за цей забіг */
  prisms: number;
  /** Секунди, коли гравець справді грав (рух/дія за останні 5 с) — захист від AFK-ферми */
  activeTime: number;
}

/** Усе, що вміє жити в App.game-слоті гри: кампанія/виживання (Game) або онлайн-матч (PvpGame). */
export interface Playable {
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, vp: Viewport): void;
  resize(w: number, h: number): void;
}

export interface Viewport {
  scale: number;
  ox: number;
  oy: number;
  /** Розмір canvas у фізичних пікселях */
  cw: number;
  ch: number;
  dpr: number;
}

interface Explosion {
  x: number;
  y: number;
  t: number;
  dur: number;
  size: number;
}
interface Ring {
  x: number;
  y: number;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  color: string;
}
interface FloatText {
  x: number;
  y: number;
  text: string;
  t: number;
  dur: number;
  color: string;
}
interface Shower {
  side: number;
  warn: number;
  left: number;
  acc: number;
}
interface WallWarning {
  side: number;
  timer: number;
  gapCenter: number;
  gap: number;
}

const COUNTDOWN = 3;
const WALL_WARN_TIME = 1.5;
const SURVIVAL_REWARD_EVERY = 45;
const UNI = '"Unbounded", "Onest", sans-serif';

/**
 * Ігровий менеджер: стан гри, спавн, колізії, бонуси та ефекти.
 * Вид з DOM не знає нічого — інтерфейс читає дані через геттери.
 */
export class Game {
  readonly player: Player;
  readonly skills = new SkillSystem();
  private readonly particles = new ParticleSystem();
  private readonly starfield = new Starfield('bgGame');
  private asteroids: Asteroid[] = [];
  private pickups: Pickup[] = [];
  private explosions: Explosion[] = [];
  private rings: Ring[] = [];
  private texts: FloatText[] = [];
  private walls: WallWarning[] = [];
  private mines: Mine[] = [];
  private lasers: LaserGate[] = [];
  private shower: Shower | null = null;
  private projectiles: Projectile[] = [];

  width = 1600;
  height = 900;

  state: GameState = 'countdown';
  private stateBeforePause: GameState = 'running';
  private stateTimer = 0;
  /** Час у стані running (с) */
  elapsed = 0;
  /** Загальний час для анімацій */
  private clock = 0;
  private shake = 0;

  private spawnTimer = 0;
  private nextSpawn = 1;
  private cometTimer = 0;
  private wallTimer = 0;
  private blackHoleTimer = 0;
  private meteorTimer = 0;
  private mineTimer = 0;
  private laserTimer = 0;
  private windAngle = 0;
  private windTarget = 0;
  private windTimer = 0;
  private readonly wind = new Vec2();
  /** Додаткові життя (фенікс) */
  lives = 0;
  /** Відлік до відновлення щита (титан) */
  shieldRegenTimer = 0;
  private readonly pull = new Vec2();
  private crystalTimer = 0;
  private bonusTimer = 0;
  private rewardTimer = 0;
  /** Призма (рідкісна валюта) — перевіряємо шанс раз на 20-30с, а не за фіксованим інтервалом */
  private prismTimer = 0;

  crystals = 0;
  /** Призми, зібрані за цей забіг (зараховуються в кінці) */
  prisms = 0;
  /** Коінс, зібрані за цей забіг (зараховуються в кінці) */
  coins = 0;
  difficultyStep = 0;
  private ended = false;

  onEnd: (r: GameResult) => void = () => {};

  /** Активний предмет екіпіровки (якщо є) — ефект масштабований рідкістю. */
  private activeItem: ActiveEffect | null = null;
  /** Множник перезарядок навичок від пасиву */
  private cooldownMul = 1;
  /** EMP: стаціонарне поле заморозки в точці каста на activeItem.duration секунд. */
  private empTimer = 0;
  private readonly empPos = new Vec2();

  /** Екіпірована зброя (завжди є — за замовчуванням стартовий кулемет). */

  constructor(
    readonly mode: GameMode,
    readonly levelId: number,
    planeId: PlaneId,
    private readonly input: InputState,
  ) {
    const progress = Save.progressFor(planeId);
    const loadout = Save.loadoutFor(planeId);
    let spec = effectivePlaneSpec(getPlane(planeId), progress);

    const passiveItem = Save.itemById(loadout.passive);
    const passiveDef = passiveItem ? getItemDef(passiveItem.defId) : undefined;
    if (passiveDef) {
      spec = applyItemPassive(spec, passiveDef);
      this.cooldownMul = 1 - (passiveDef.combat?.cooldown ?? 0);
    }

    const activeItem = Save.itemById(loadout.active);
    const activeDef = activeItem ? getItemDef(activeItem.defId) : undefined;
    if (activeDef?.active) {
      this.activeItem = activeDef.active;
      this.itemCooldownMax = activeDef.active.cooldown;
    }


    this.player = new Player(spec, progress.tier, progress.level);
  }

  private itemCooldownMax = 0;
  private activeTime = 0;
  private lastInputAt = 0;

  get level(): LevelConfig {
    return this.mode === 'campaign' ? getLevel(this.levelId) : SURVIVAL_BASE;
  }

  get timeLeft(): number {
    return Math.max(0, this.level.duration - this.elapsed);
  }

  get feature(): PlaneFeature {
    return this.player.spec.feature;
  }

  get frozen(): boolean {
    return this.skills.isFrozen;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.player.pos.set(clamp(this.player.pos.x, 0, w), clamp(this.player.pos.y, 0, h));
  }

  start(): void {
    this.asteroids = [];
    this.pickups = [];
    this.explosions = [];
    this.rings = [];
    this.texts = [];
    this.walls = [];
    this.mines = [];
    this.lasers = [];
    this.shower = null;
    this.particles.clear();
    this.player.reset(this.width / 2, this.height * 0.62);
    this.player.invulnerable = 0;
    const feat = this.feature;
    this.skills.reset(feat, this.itemCooldownMax, this.cooldownMul);
    this.player.shield = !!feat.startShield;
    this.lives = feat.extraLives ?? 0;
    this.shieldRegenTimer = 0;
    this.elapsed = 0;
    this.activeTime = 0;
    this.lastInputAt = 0;
    this.crystals = 0;
    this.prisms = 0;
    this.coins = 0;
    this.projectiles = [];
    this.difficultyStep = 0;
    this.ended = false;
    this.shake = 0;

    const cfg = this.level;
    this.spawnTimer = 0;
    this.nextSpawn = rand(cfg.spawnMin, cfg.spawnMax);
    this.cometTimer = cfg.cometEvery * 0.6;
    this.wallTimer = cfg.wallEvery * 0.7;
    this.blackHoleTimer = cfg.blackHoleEvery * 0.5;
    this.meteorTimer = cfg.meteorEvery * 0.5;
    this.mineTimer = 0;
    this.laserTimer = cfg.laserEvery * 0.4;
    this.windAngle = this.windTarget = rand(0, Math.PI * 2);
    this.windTimer = 0;
    this.crystalTimer = 1.5;
    this.bonusTimer = rand(8, 12);
    this.prismTimer = rand(20, 30);
    this.rewardTimer = 0;
    this.setState('countdown', COUNTDOWN);
  }

  private setState(s: GameState, timer = 0): void {
    this.state = s;
    this.stateTimer = timer;
  }

  // ---------- керування ----------

  togglePause(): void {
    if (this.state === 'paused') this.resume();
    else this.pause();
  }

  pause(): void {
    if (this.state !== 'running' && this.state !== 'countdown') return;
    this.stateBeforePause = this.state;
    this.state = 'paused';
    this.input.clear();
  }

  resume(): void {
    if (this.state === 'paused') this.state = this.stateBeforePause;
  }

  useFreeze(): void {
    if (this.state !== 'running' || !this.skills.tryFreeze()) return;
    Sfx.freeze();
    this.rings.push({ x: this.player.pos.x, y: this.player.pos.y, t: 0, dur: 0.6, r0: 20, r1: Math.max(this.width, this.height), color: '160,220,255' });
  }

  useBoost(): void {
    if (this.state !== 'running' || !this.skills.tryBoost()) return;
    Sfx.boost();
    this.rings.push({ x: this.player.pos.x, y: this.player.pos.y, t: 0, dur: 0.4, r0: 10, r1: 90, color: '255,200,80' });
  }

  useJump(): void {
    if (this.state !== 'running' || !this.skills.tryJump()) return;
    const from = this.player.jump(this.width, this.height);
    Sfx.jump();
    const to = this.player.pos;
    if (this.feature.dashShockwave) this.shockwave(to, this.feature.dashShockwave, '120,190,255');
    const [inner, outer] = this.player.spec.flame;
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      this.particles.emit(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, {
        count: 3,
        speed: [10, 60],
        life: [0.25, 0.5],
        size: [3, 6],
        colors: [inner, outer, '#ffffff'],
      });
    }
  }

  useItem(): void {
    if (this.state !== 'running' || !this.activeItem || !this.skills.tryItem()) return;
    const item = this.activeItem;
    const { x, y } = this.player.pos;
    switch (item.kind) {
      case 'emp':
        this.empTimer = item.duration ?? 2;
        this.empPos.set(x, y);
        Sfx.freeze();
        this.rings.push({ x, y, t: 0, dur: 0.5, r0: 10, r1: item.radius ?? 200, color: '160,220,255' });
        break;
      case 'phase':
        this.player.invulnerable = Math.max(this.player.invulnerable, item.duration ?? 2);
        Sfx.powerup();
        this.rings.push({ x, y, t: 0, dur: 0.4, r0: 10, r1: 70, color: '201,167,255' });
        this.particles.emit(x, y, { count: 20, speed: [40, 140], life: [0.3, 0.6], size: [2, 4], colors: ['#efe4ff', '#c9a7ff'] });
        break;
      case 'nanoRepair':
        this.player.shield = true;
        Sfx.powerup();
        this.rings.push({ x, y, t: 0, dur: 0.4, r0: 10, r1: 60, color: '80,255,160' });
        break;
      case 'overdrive':
        // у кампанії стрільби немає — овердрайв дає безкоштовний форсаж
        this.skills.boostLeft = Math.max(this.skills.boostLeft, item.duration ?? 4);
        Sfx.boost();
        this.rings.push({ x, y, t: 0, dur: 0.4, r0: 10, r1: 80, color: '255,90,58' });
        break;
      case 'swarm': {
        Sfx.boost();
        const base = this.player.spec.feature.noRotate ? -Math.PI / 2 : this.player.angle;
        for (let i = 0; i < 6; i++) {
          const a = base + (i - 2.5) * 0.22;
          this.projectiles.push(new Projectile('rocket', this.player.nose(), a, 560, item.power ?? 9, 70));
        }
        break;
      }
    }
  }

  /** Теплові пастки: збивають самонавідні астероїди й дрібні уламки поруч. */
  useFlare(): void {
    if (this.state !== 'running' || !this.skills.tryFlare()) return;
    const { x, y } = this.player.pos;
    Sfx.jump();
    this.rings.push({ x, y, t: 0, dur: 0.45, r0: 10, r1: FLARE_RADIUS * 2.2, color: '255,190,90' });
    const back = this.player.exhaustAngle;
    for (let i = 0; i < 8; i++) {
      this.particles.emit(x, y, { count: 4, speed: [120, 260], angle: back + (i - 3.5) * 0.3, spread: 0.15, life: [0.6, 1.1], size: [3, 6], colors: ['#ffffff', '#fff1a8', '#ff9a3a'], drag: 1.5 });
    }
    for (const a of this.asteroids) {
      if (!a.alive || !this.destructible(a)) continue;
      const d = Vec2.dist(a.pos, this.player.pos);
      if ((a instanceof HomingAsteroid && d < FLARE_RADIUS * 3) || (a.size === 'small' && d < FLARE_RADIUS * 1.6)) {
        a.kill();
        this.burst(a.pos.x, a.pos.y, a.visual, false);
      }
    }
  }

  // ---------- оновлення ----------

  update(dt: number): void {
    this.clock += dt;
    if (this.state === 'paused') return;

    const boosted = this.skills.isBoosted && this.state === 'running';
    this.starfield.update(dt, boosted ? 3 : 1);
    this.particles.update(dt);
    this.updateEffects(dt);
    this.shake = Math.max(0, this.shake - dt * 30);

    switch (this.state) {
      case 'countdown':
        this.updateCountdown(dt);
        return;
      case 'running':
        this.updateRunning(dt);
        return;
      case 'dying':
        this.updateHazards(dt, false);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.setState('lost');
          this.finish(false);
        }
        return;
      case 'won':
        this.stateTimer -= dt;
        this.updatePlayer(dt);
        if (this.stateTimer <= 0 && !this.ended) this.finish(true);
        return;
      default:
        return;
    }
  }

  private updateCountdown(dt: number): void {
    const before = Math.ceil(this.stateTimer);
    this.stateTimer -= dt;
    const after = Math.ceil(this.stateTimer);
    if (after !== before && after > 0) Sfx.countdown();
    this.updatePlayer(dt);
    if (this.stateTimer <= 0) {
      Sfx.countdown(true);
      this.setState('running');
      if (this.level.boss > 0) this.spawnBoss(this.level.boss);
      this.texts.push({ x: this.width / 2, y: this.height / 2, text: t('game.go'), t: 0, dur: 0.9, color: '#ffd24a' });
    }
  }

  private updatePlayer(dt: number): void {
    this.player.speedMultiplier = this.skills.isBoosted ? BOOST_MULTIPLIER : 1;
    let axis = this.input.axis();
    // схема «миша»: літак летить до курсора (у кампанії світ = видима область)
    if (mouseSteering()) {
      const c = this.input.pointerView();
      if (c) {
        const dx = c.x - this.player.pos.x;
        const dy = c.y - this.player.pos.y;
        const d = Math.hypot(dx, dy);
        axis = d > 18 && this.input.thrust() ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
      }
    }
    if (axis.x !== 0 || axis.y !== 0) this.lastInputAt = this.elapsed;
    if (this.elapsed - this.lastInputAt <= 5) this.activeTime += dt;
    this.player.update(dt, axis, this.width, this.height);

    const ex = this.player.exhaust();
    const [inner, outer] = this.player.spec.flame;
    const back = this.player.exhaustAngle;
    const boosted = this.skills.isBoosted;
    this.particles.emit(ex.x, ex.y, {
      count: boosted ? 3 : 1,
      speed: [boosted ? 160 : 90, boosted ? 260 : 150],
      angle: back,
      spread: 0.25,
      life: [0.15, boosted ? 0.4 : 0.28],
      size: [boosted ? 5 : 3.5, boosted ? 7 : 5],
      colors: boosted ? ['#fff3b0', '#ffb020', inner] : [inner, outer],
      inherit: { x: this.player.vel.x * 0.3, y: this.player.vel.y * 0.3 },
      drag: 3,
    });
  }

  private updateRunning(dt: number): void {
    this.elapsed += dt;
    this.skills.update(dt);

    if (this.mode === 'campaign' && this.elapsed >= this.level.duration) {
      this.win();
      return;
    }
    if (this.mode === 'survival') this.updateSurvivalProgress(dt);

    this.updatePlayer(dt);
    if (!this.frozen) {
      this.applyGravity(dt);
      this.applyWind(dt);
    }
    this.updateShieldRegen(dt);
    this.updateHazards(dt, true);
    this.updatePickups(dt);
    this.updateProjectiles(dt);
    if (!this.frozen) this.updateSpawning(dt);
  }

  private destroyByWeapon(a: Asteroid, splashRadius: number): void {
    a.kill();
    this.burst(a.pos.x, a.pos.y, a.visual, a.size === 'large');
    this.coins += a.size === 'medium' ? 4 : 2;
    if (splashRadius > 0) {
      for (const n of this.asteroids) {
        if (n === a || !n.alive || !this.destructible(n) || !canDestroy('rocket', n.size)) continue;
        if (Vec2.dist(n.pos, a.pos) < splashRadius + n.radius) {
          n.kill();
          this.burst(n.pos.x, n.pos.y, n.visual, true);
          this.coins += n.size === 'medium' ? 4 : 2;
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const world = this.worldView();
    for (const pr of this.projectiles) {
      pr.update(dt, world);
      if (!pr.alive) continue;
      for (const a of this.asteroids) {
        if (!a.alive || !this.destructible(a) || !canDestroy(pr.kind, a.size)) continue;
        if (circlesOverlap(pr.pos, pr.radius, a.pos, a.radius)) {
          pr.kill();
          if (pr.kind === 'rocket') {
            this.rings.push({ x: a.pos.x, y: a.pos.y, t: 0, dur: 0.35, r0: 10, r1: pr.splashRadius, color: '255,140,80' });
            this.addShake(5);
          }
          this.destroyByWeapon(a, pr.splashRadius);
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.alive);
  }

  private updateSurvivalProgress(dt: number): void {
    const step = Math.floor(this.elapsed / 10);
    if (step > this.difficultyStep) this.difficultyStep = step;
    this.rewardTimer += dt;
    if (this.rewardTimer >= SURVIVAL_REWARD_EVERY) {
      this.rewardTimer -= SURVIVAL_REWARD_EVERY;
      this.skills.addFreeze();
      this.skills.addBoost();
      Sfx.powerup();
      this.floatText(this.player.pos.x, this.player.pos.y - 40, t('game.newSkill'), '#9fe3ff');
    }
  }

  private updateShieldRegen(dt: number): void {
    const regen = this.feature.shieldRegen;
    if (!regen || this.player.shield) return;
    this.shieldRegenTimer += dt;
    if (this.shieldRegenTimer >= regen) {
      this.shieldRegenTimer = 0;
      this.player.shield = true;
      Sfx.powerup();
      this.floatText(this.player.pos.x, this.player.pos.y - 40, t('hud.shield'), '#9fe3ff');
    }
  }

  /** Сонячний вітер: плавно змінює напрям і зносить літак. */
  private applyWind(dt: number): void {
    const strength = this.tuning().wind;
    if (strength <= 0) return;
    this.windTimer -= dt;
    if (this.windTimer <= 0) {
      this.windTimer = rand(7, 11);
      this.windTarget = rand(0, Math.PI * 2);
    }
    this.windAngle += angleDiff(this.windAngle, this.windTarget) * Math.min(1, dt * 0.8);
    this.wind.copy(Vec2.fromAngle(this.windAngle, strength));
    const p = this.player;
    if (!this.feature.gravityImmune) {
      p.pos.add(this.wind, dt);
      p.pos.set(clamp(p.pos.x, p.radius, this.width - p.radius), clamp(p.pos.y, p.radius, this.height - p.radius));
    }
    if (Math.random() < 0.6) {
      this.particles.emit(rand(0, this.width), rand(0, this.height), {
        count: 1,
        speed: [strength * 4, strength * 6],
        angle: this.windAngle,
        spread: 0.05,
        life: [0.3, 0.6],
        size: [1, 1.6],
        colors: ['rgba(200,230,255,0.5)', 'rgba(255,255,255,0.35)'],
        drag: 0,
        additive: false,
      });
    }
  }

  private worldView(): WorldView {
    return { width: this.width, height: this.height, playerPos: this.player.pos, time: this.clock };
  }

  private updateHazards(dt: number, collide: boolean): void {
    const frozen = this.frozen && this.state === 'running';
    this.empTimer = Math.max(0, this.empTimer - dt);
    const empActive = this.empTimer > 0 && this.activeItem?.kind === 'emp';
    const world = this.worldView();
    for (const a of this.asteroids) {
      const empHit = empActive && circlesOverlap(a.pos, a.radius, this.empPos, this.activeItem!.radius ?? 200);
      a.frozen = frozen || empHit;
      if (!frozen && !empHit) a.update(dt, world);
      if (a instanceof Comet && !a.warning && !frozen) {
        this.particles.emit(a.pos.x, a.pos.y, { count: 2, speed: [20, 80], life: [0.2, 0.45], size: [3, 6], colors: ['#ffd27a', '#ff7a2a', '#ff4a1a'], drag: 4 });
      }
      if (a.isOutside(this.width, this.height, a.visual + 260)) a.kill();
      if (collide && a.alive && a.collidable && circlesOverlap(this.player.pos, this.player.radius, a.pos, a.radius)) {
        this.onPlayerHit(a);
        if (this.state !== 'running') break;
      }
    }
    this.asteroids = this.asteroids.filter((a) => a.alive);

    for (const boss of this.asteroids) {
      if (boss instanceof BossAsteroid && boss.pendingBurst) {
        boss.pendingBurst = false;
        this.bossBurst(boss);
      }
    }

    if (!frozen) {
      for (const m of this.mines) {
        m.update(dt, world);
        if (m.detonate) this.detonate(m, collide);
      }
      this.mines = this.mines.filter((m) => m.alive);
      for (const l of this.lasers) {
        l.update(dt, world);
        if (l.justFired()) {
          Sfx.laser();
          this.addShake(4);
        }
      }
      this.lasers = this.lasers.filter((l) => l.alive);
    }
    for (const l of this.lasers) {
      if (!l.active) continue;
      // промінь спалює дрібні астероїди
      for (const a of this.asteroids) {
        if (a.alive && a.size !== 'large' && this.destructible(a) && l.distanceTo(a.pos) < a.radius) {
          a.kill();
          this.burst(a.pos.x, a.pos.y, a.visual, true);
        }
      }
      if (collide && this.state === 'running' && l.distanceTo(this.player.pos) < this.player.radius + 4) this.onPlayerHit(null);
    }

    if (!frozen && this.shower) this.updateShower(dt);

    if (!frozen) {
      for (const w of this.walls) {
        const before = w.timer;
        w.timer -= dt;
        if (before > 0 && w.timer <= 0) this.spawnWall(w);
      }
      this.walls = this.walls.filter((w) => w.timer > 0);
    }
  }

  /** Чорні діри тягнуть літак і астероїди; астероїди, що впали в ядро, зникають. */
  private applyGravity(dt: number): void {
    const holes = this.asteroids.filter((a): a is BlackHole => a instanceof BlackHole);
    if (!holes.length) return;
    const p = this.player;
    for (const hole of holes) {
      if (!this.feature.gravityImmune) {
        // тягнемо напряму позицію: інакше обмеження максимальної швидкості "з'їдало" б притягання
        hole.pullAt(p.pos, this.pull);
        p.pos.add(this.pull, dt * 0.3);
        p.pos.set(clamp(p.pos.x, p.radius, this.width - p.radius), clamp(p.pos.y, p.radius, this.height - p.radius));
      }
      for (const a of this.asteroids) {
        if (a === hole || a instanceof BlackHole || a instanceof Comet || a instanceof BossAsteroid || !a.alive) continue;
        a.vel.add(hole.pullAt(a.pos, this.pull), dt * 0.6);
        if (circlesOverlap(a.pos, a.radius * 0.5, hole.pos, hole.radius)) {
          a.kill();
          this.particles.emit(a.pos.x, a.pos.y, { count: 10, speed: [20, 90], life: [0.3, 0.6], size: [2, 4], colors: ['#ffb36b', '#b06bff'] });
        }
      }
    }
  }

  /** Чи може цей астероїд бути знищений тараном/вибухом/хвилею. */
  private destructible(a: Asteroid): boolean {
    return !(a instanceof BlackHole) && !(a instanceof BossAsteroid);
  }

  /** Удар по гравцю. a — астероїд, що влучив (null — лазер чи вибух міни). */
  private onPlayerHit(a: Asteroid | null): void {
    const p = this.player;
    if (p.invulnerable > 0) return;
    // таран під форсажем
    if (a && this.feature.ramOnBoost && this.skills.isBoosted && a.size !== 'large' && this.destructible(a)) {
      a.kill();
      this.burst(a.pos.x, a.pos.y, a.visual, false);
      this.addShake(6);
      Sfx.shieldHit();
      return;
    }
    if (p.shield) {
      p.shield = false;
      p.invulnerable = 1.2;
      this.shieldRegenTimer = 0;
      if (a && this.destructible(a)) {
        a.kill();
        this.burst(a.pos.x, a.pos.y, a.visual, false);
      }
      this.rings.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.5, r0: 30, r1: 140, color: '120,210,255' });
      this.addShake(10);
      Sfx.shieldHit();
      return;
    }
    if (this.lives > 0) {
      // друге життя: вибух розчищає простір навколо
      this.lives--;
      p.invulnerable = 2.5;
      this.explosions.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.7, size: 120 });
      this.shockwave(p.pos, 230, '255,170,80');
      this.floatText(p.pos.x, p.pos.y - 50, t('game.revive'), '#ffb020');
      this.addShake(18);
      Sfx.explode();
      return;
    }
    // смерть
    this.setState('dying', 1.6);
    this.explosions.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.9, size: 150 });
    this.rings.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.7, r0: 20, r1: 260, color: '255,170,80' });
    this.particles.emit(p.pos.x, p.pos.y, { count: 60, speed: [80, 420], life: [0.5, 1.3], size: [3, 7], colors: ['#fff1a8', '#ffb020', '#ff5a1f', '#ff2a2a'], drag: 2.2 });
    this.particles.emit(p.pos.x, p.pos.y, { count: 24, speed: [60, 260], life: [0.8, 1.6], size: [3, 5], colors: ['#8b8fa3', '#5b5f70', '#c9ccd8'], additive: false, square: true, drag: 1.5 });
    this.addShake(26);
    Sfx.explode();
  }

  private updatePickups(dt: number): void {
    const world = this.worldView();
    const p = this.player;
    const magnet = this.feature.magnetRadius ?? 0;
    for (const pk of this.pickups) {
      pk.update(dt, world);
      if (magnet && Vec2.dist(pk.pos, p.pos) < magnet) {
        const dir = new Vec2(p.pos.x - pk.pos.x, p.pos.y - pk.pos.y).normalize();
        pk.pos.add(dir, 520 * dt);
      }
      if (pk.alive && circlesOverlap(p.pos, p.radius + 6, pk.pos, pk.radius)) {
        pk.kill();
        this.collect(pk.kind, pk.pos);
      }
    }
    this.pickups = this.pickups.filter((pk) => pk.alive);
  }

  private collect(kind: PickupKind, at: Vec2): void {
    const colors: Record<PickupKind, string[]> = {
      crystal: ['#ff9cf0', '#ff4fd8', '#ffffff'],
      prism: ['#fff6c8', '#ffe27a', '#ffffff'],
      shield: ['#9fe3ff', '#3fa9ff', '#ffffff'],
      freeze: ['#e6fbff', '#8fdcff'],
      boost: ['#ffe27a', '#ffb020'],
    };
    this.particles.emit(at.x, at.y, { count: kind === 'prism' ? 34 : 22, speed: [60, 220], life: [0.3, 0.7], size: [2, 4], colors: colors[kind] });
    this.rings.push({ x: at.x, y: at.y, t: 0, dur: 0.35, r0: 10, r1: 60, color: kind === 'crystal' ? '255,120,230' : kind === 'prism' ? '255,226,122' : '150,220,255' });
    switch (kind) {
      case 'crystal':
        this.crystals++;
        this.coins += CRYSTAL_COINS;
        Sfx.pickup();
        this.floatText(at.x, at.y - 24, `+${CRYSTAL_COINS}`, '#ffd24a');
        return;
      case 'prism': {
        const amount = chance(0.15) ? randInt(2, 3) : 1;
        this.prisms += amount;
        Sfx.powerup();
        this.floatText(at.x, at.y - 24, `+${amount} ◆`, '#ffe27a');
        return;
      }
      case 'shield':
        this.player.shield = true;
        Sfx.powerup();
        this.floatText(at.x, at.y - 24, t('hud.shield'), '#9fe3ff');
        return;
      case 'freeze':
        this.skills.addFreeze();
        Sfx.powerup();
        this.floatText(at.x, at.y - 24, `+1 ${t('hud.freeze')}`, '#c8f2ff');
        return;
      case 'boost':
        this.skills.addBoost();
        Sfx.powerup();
        this.floatText(at.x, at.y - 24, `+1 ${t('hud.boost')}`, '#ffe27a');
        return;
    }
  }

  private win(): void {
    this.setState('won', 1.8);
    this.walls = [];
    this.lasers = [];
    this.shower = null;
    this.mines.forEach((m) => this.burst(m.pos.x, m.pos.y, 16, true));
    this.mines = [];
    // всі астероїди розлітаються на шматки — винагорода для гравця
    this.asteroids.forEach((a, i) => {
      if (i < 40) this.burst(a.pos.x, a.pos.y, a.visual, true);
    });
    this.asteroids = [];
    this.pickups = [];
    Sfx.win();
  }

  private finish(won: boolean): void {
    if (this.ended) return;
    this.ended = true;
    const cfg = this.level;
    let stars = 0;
    if (won) stars = 1 + (this.crystals >= Math.ceil(cfg.crystalTarget / 2) ? 1 : 0) + (this.crystals >= cfg.crystalTarget ? 1 : 0);
    if (!won) Sfx.lose();
    this.onEnd({
      mode: this.mode,
      level: this.levelId,
      won,
      time: this.elapsed,
      activeTime: this.activeTime,
      duration: cfg.duration,
      crystals: this.crystals,
      crystalTarget: cfg.crystalTarget,
      stars,
      coins: this.coins,
      prisms: this.prisms,
    });
  }

  // ---------- спавн ----------

  /** Поточні параметри з урахуванням зростання складності у виживанні. */
  private tuning(): LevelConfig & { spawnMul: number; pSmallAdd: number } {
    const base = this.level;
    if (this.mode === 'campaign') return { ...base, spawnMul: 1, pSmallAdd: 0 };
    const s = this.difficultyStep;
    const tm = this.elapsed;
    return {
      ...base,
      spawnMul: 1 + s * 0.09,
      pSmallAdd: Math.min(0.3, s * 0.02),
      maxAsteroids: base.maxAsteroids + Math.min(30, s * 2),
      speedMul: Math.min(2.5, 1 + s * 0.05),
      cometEvery: tm >= 30 ? Math.max(3.5, 11 - s * 0.35) : 0,
      homing: tm >= 60 ? Math.min(0.25, 0.08 + (s - 6) * 0.01) : 0,
      bouncer: tm >= 90 ? Math.min(0.25, 0.08 + (s - 9) * 0.01) : 0,
      wallEvery: tm >= 120 ? Math.max(7, 16 - (s - 12) * 0.4) : 0,
      wallGap: Math.max(170, 240 - s * 2),
      blackHoleEvery: tm >= 150 ? Math.max(9, 20 - (s - 15) * 0.4) : 0,
      meteorEvery: tm >= 180 ? Math.max(10, 22 - (s - 18) * 0.4) : 0,
      mineEvery: tm >= 210 ? Math.max(3, 7 - (s - 21) * 0.15) : 0,
      laserEvery: tm >= 240 ? Math.max(4, 9 - (s - 24) * 0.2) : 0,
      wind: tm >= 300 ? 90 : 0,
    };
  }

  private updateSpawning(dt: number): void {
    const cfg = this.tuning();

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawn / cfg.spawnMul) {
      this.spawnTimer = 0;
      this.nextSpawn = Math.max(0.1, rand(cfg.spawnMin, cfg.spawnMax));
      const regular = this.asteroids.filter((a) => !(a instanceof Comet) && !(a instanceof BlackHole) && !(a instanceof BossAsteroid)).length;
      if (regular < cfg.maxAsteroids) this.asteroids.push(this.spawnAsteroid(cfg));
    }

    if (cfg.cometEvery > 0) {
      this.cometTimer += dt;
      if (this.cometTimer >= cfg.cometEvery) {
        this.cometTimer = rand(-1, 1);
        this.spawnComet(cfg);
      }
    }

    if (cfg.wallEvery > 0) {
      this.wallTimer += dt;
      if (this.wallTimer >= cfg.wallEvery && this.walls.length === 0) {
        this.wallTimer = 0;
        this.queueWall(cfg);
      }
    }

    if (cfg.blackHoleEvery > 0) {
      this.blackHoleTimer += dt;
      const holes = this.asteroids.filter((a) => a instanceof BlackHole).length;
      if (this.blackHoleTimer >= cfg.blackHoleEvery && holes < 2) {
        this.blackHoleTimer = 0;
        this.spawnBlackHole(cfg);
      }
    }

    if (cfg.meteorEvery > 0 && !this.shower) {
      this.meteorTimer += dt;
      if (this.meteorTimer >= cfg.meteorEvery) {
        this.meteorTimer = 0;
        this.shower = { side: chance(0.6) ? 0 : randInt(1, 3), warn: 1.6, left: 3.5, acc: 0 };
        Sfx.warning();
      }
    }

    if (cfg.mineEvery > 0) {
      this.mineTimer += dt;
      if (this.mineTimer >= cfg.mineEvery && this.mines.length < 7) {
        this.mineTimer = 0;
        this.spawnMine();
      }
    }

    if (cfg.laserEvery > 0) {
      this.laserTimer += dt;
      if (this.laserTimer >= cfg.laserEvery && this.lasers.length < 2) {
        this.laserTimer = rand(-0.5, 0.5);
        this.spawnLaser();
      }
    }

    // кристали є в обох режимах: у кампанії дають зірки, а скрізь — коінс
    this.crystalTimer -= dt;
    if (this.crystalTimer <= 0) {
      this.crystalTimer = rand(CRYSTAL_INTERVAL - 1, CRYSTAL_INTERVAL + 1);
      this.spawnPickup('crystal');
    }

    this.bonusTimer -= dt;
    if (this.bonusTimer <= 0) {
      this.bonusTimer = this.mode === 'campaign' ? rand(13, 19) : rand(10, 15);
      const options: PickupKind[] = ['freeze', 'boost'];
      if (!this.player.shield) options.push('shield', 'shield');
      this.spawnPickup(pick(options));
    }

    // призма — дуже рідкісний дроп рідкісної валюти: шанс перевіряється раз на 20-30с, а не гарантовано
    this.prismTimer -= dt;
    if (this.prismTimer <= 0) {
      this.prismTimer = rand(20, 30);
      if (chance(0.1)) this.spawnPickup('prism');
    }
  }

  private rollSize(cfg: LevelConfig, pSmallAdd: number): AsteroidSize {
    let pL = cfg.pLarge - pSmallAdd * 0.6;
    let pM = cfg.pMedium - pSmallAdd * 0.4;
    let pS = 1 - cfg.pLarge - cfg.pMedium + pSmallAdd;
    pL = Math.max(0.05, pL);
    pM = Math.max(0.1, pM);
    pS = Math.max(0.05, pS);
    const r = Math.random() * (pL + pM + pS);
    if (r < pL) return 'large';
    if (r < pL + pM) return 'medium';
    return 'small';
  }

  /** Точка на краю (за межами екрана) для заданої сторони. 0 — верх, 1 — право, 2 — низ, 3 — ліво. */
  private edgePoint(side: number, margin: number): Vec2 {
    switch (side) {
      case 0:
        return new Vec2(rand(0, this.width), -margin);
      case 1:
        return new Vec2(this.width + margin, rand(0, this.height));
      case 2:
        return new Vec2(rand(0, this.width), this.height + margin);
      default:
        return new Vec2(-margin, rand(0, this.height));
    }
  }

  private spawnAsteroid(cfg: LevelConfig & { pSmallAdd: number }): Asteroid {
    const size = this.rollSize(cfg, cfg.pSmallAdd);
    const spec = ASTEROID_SIZES[size];
    const margin = spec.visual + 20;

    // не спавнимо прямо біля гравця, якщо він притиснувся до краю
    let pos = this.edgePoint(randInt(0, 3), margin);
    for (let i = 0; i < 5 && Vec2.dist(pos, this.player.pos) < 300; i++) pos = this.edgePoint(randInt(0, 3), margin);

    const target = chance(0.3)
      ? this.player.pos.clone().add(new Vec2(rand(-120, 120), rand(-120, 120)))
      : new Vec2(rand(this.width * 0.15, this.width * 0.85), rand(this.height * 0.15, this.height * 0.85));
    const speed = spec.speed * cfg.speedMul * rand(0.85, 1.15);
    const vel = new Vec2(target.x - pos.x, target.y - pos.y).normalize().scale(speed);

    if (chance(cfg.homing)) return new HomingAsteroid(size, pos, vel.scale(0.8));
    if (chance(cfg.bouncer)) return new BouncingAsteroid(size === 'large' ? 'medium' : size, pos, vel);
    return new Asteroid(size, pos, vel);
  }

  private spawnComet(cfg: LevelConfig): void {
    const side = randInt(0, 3);
    const pos = this.edgePoint(side, 30);
    const target = this.player.pos.clone().add(new Vec2(rand(-60, 60), rand(-60, 60)));
    const dir = new Vec2(target.x - pos.x, target.y - pos.y);
    this.asteroids.push(new Comet(pos, dir, 850 * Math.min(1.45, Math.sqrt(cfg.speedMul))));
    Sfx.warning();
  }

  private spawnBoss(burstEvery: number): void {
    const pos = new Vec2(this.width / 2, -140);
    const vel = Vec2.fromAngle(rand(Math.PI * 0.3, Math.PI * 0.7), 95);
    this.asteroids.push(new BossAsteroid(pos, vel, burstEvery));
    Sfx.warning();
    this.floatText(this.width / 2, 120, t('game.bossWarn'), '#ff6a4a');
  }

  /** Бос випускає кільце уламків з проміжком у бік гравця, щоб було куди втекти. */
  private bossBurst(boss: BossAsteroid): void {
    const n = 12;
    const toPlayer = Math.atan2(this.player.pos.y - boss.pos.y, this.player.pos.x - boss.pos.x);
    const offset = rand(0, Math.PI * 2);
    const speed = 210 * Math.sqrt(this.level.speedMul);
    for (let i = 0; i < n; i++) {
      const a = offset + (i / n) * Math.PI * 2;
      if (Math.abs(angleDiff(a, toPlayer)) < 0.32) continue;
      const pos = boss.pos.clone().add(Vec2.fromAngle(a, boss.visual * 0.8));
      this.asteroids.push(new Asteroid(chance(0.5) ? 'small' : 'medium', pos, Vec2.fromAngle(a, speed)));
    }
    this.rings.push({ x: boss.pos.x, y: boss.pos.y, t: 0, dur: 0.5, r0: boss.visual, r1: boss.visual * 1.8, color: '255,120,60' });
    this.addShake(8);
    Sfx.bossShot();
  }

  private spawnMine(): void {
    const m = 110;
    let pos = new Vec2(rand(m, this.width - m), rand(m, this.height - m));
    for (let i = 0; i < 8 && Vec2.dist(pos, this.player.pos) < 260; i++) pos = new Vec2(rand(m, this.width - m), rand(m, this.height - m));
    this.mines.push(new Mine(pos));
  }

  private detonate(m: Mine, hurtPlayer: boolean): void {
    m.kill();
    m.detonate = false;
    this.explosions.push({ x: m.pos.x, y: m.pos.y, t: 0, dur: 0.6, size: MINE_BLAST_RADIUS * 1.6 });
    this.rings.push({ x: m.pos.x, y: m.pos.y, t: 0, dur: 0.45, r0: 20, r1: MINE_BLAST_RADIUS, color: '255,120,60' });
    this.particles.emit(m.pos.x, m.pos.y, { count: 30, speed: [80, 320], life: [0.3, 0.8], size: [2, 5], colors: ['#fff1a8', '#ffb020', '#ff5a1f'] });
    this.addShake(10);
    Sfx.mine();
    for (const a of this.asteroids) {
      if (a.alive && this.destructible(a) && Vec2.dist(a.pos, m.pos) < MINE_BLAST_RADIUS + a.radius) {
        a.kill();
        this.burst(a.pos.x, a.pos.y, a.visual, true);
      }
    }
    // ланцюгова реакція
    for (const other of this.mines) if (other !== m && other.alive && Vec2.dist(other.pos, m.pos) < MINE_BLAST_RADIUS) other.trigger();
    if (hurtPlayer && this.state === 'running' && Vec2.dist(this.player.pos, m.pos) < MINE_BLAST_RADIUS + this.player.radius) this.onPlayerHit(null);
  }

  private spawnLaser(): void {
    const center = new Vec2(rand(this.width * 0.15, this.width * 0.85), rand(this.height * 0.15, this.height * 0.85));
    const angle = pick([0, Math.PI / 2, rand(0, Math.PI)]);
    this.lasers.push(new LaserGate(center, angle));
    Sfx.warning();
  }

  private updateShower(dt: number): void {
    const sh = this.shower!;
    if (sh.warn > 0) {
      sh.warn -= dt;
      return;
    }
    sh.left -= dt;
    sh.acc += dt;
    const speed = 380 * Math.sqrt(this.level.speedMul);
    while (sh.acc >= 0.12) {
      sh.acc -= 0.12;
      const inward = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][sh.side] + rand(-0.25, 0.25);
      const pos = this.edgePoint(sh.side, 30);
      this.asteroids.push(new Asteroid('small', pos, Vec2.fromAngle(inward, speed * rand(0.9, 1.15))));
    }
    if (sh.left <= 0) this.shower = null;
  }

  /** Ударна хвиля: знищує руйнівні астероїди в радіусі. */
  private shockwave(at: Vec2, radius: number, color: string): void {
    this.rings.push({ x: at.x, y: at.y, t: 0, dur: 0.45, r0: 20, r1: radius, color });
    for (const a of this.asteroids) {
      if (a.alive && this.destructible(a) && Vec2.dist(a.pos, at) < radius + a.radius) {
        a.kill();
        this.burst(a.pos.x, a.pos.y, a.visual, true);
      }
    }
    this.addShake(8);
  }

  /** Стан унікальної фічі літака для HUD (null — нічого не показувати). */
  featureStatus(): { icon: 'shield' | 'heart'; text: string } | null {
    if (this.feature.shieldRegen && !this.player.shield) return { icon: 'shield', text: `${Math.ceil(this.feature.shieldRegen - this.shieldRegenTimer)}s` };
    if (this.feature.extraLives) return { icon: 'heart', text: `×${this.lives}` };
    return null;
  }

  private spawnBlackHole(cfg: LevelConfig): void {
    const pos = this.edgePoint(randInt(0, 3), 60);
    const target = new Vec2(rand(this.width * 0.3, this.width * 0.7), rand(this.height * 0.3, this.height * 0.7));
    const vel = new Vec2(target.x - pos.x, target.y - pos.y).normalize().scale(rand(45, 65));
    this.asteroids.push(new BlackHole(pos, vel, 900 + (cfg.speedMul - 1) * 250));
    Sfx.warning();
  }

  private queueWall(cfg: LevelConfig): void {
    const side = randInt(0, 3);
    const length = side % 2 === 0 ? this.width : this.height;
    const gap = cfg.wallGap;
    const gapCenter = rand(gap / 2 + 60, length - gap / 2 - 60);
    this.walls.push({ side, timer: WALL_WARN_TIME, gapCenter, gap });
    Sfx.warning();
  }

  private spawnWall(w: WallWarning): void {
    const cfg = this.tuning();
    const horizontal = w.side % 2 === 0; // стіна тягнеться вздовж горизонтального краю
    const length = horizontal ? this.width : this.height;
    const spacing = 62;
    const speed = 200 * Math.sqrt(cfg.speedMul);
    const margin = ASTEROID_SIZES.medium.visual + 10;
    for (let s = spacing / 2; s < length; s += spacing) {
      if (Math.abs(s - w.gapCenter) < w.gap / 2) continue;
      let pos: Vec2;
      let vel: Vec2;
      switch (w.side) {
        case 0:
          pos = new Vec2(s, -margin);
          vel = new Vec2(0, speed);
          break;
        case 1:
          pos = new Vec2(this.width + margin, s);
          vel = new Vec2(-speed, 0);
          break;
        case 2:
          pos = new Vec2(s, this.height + margin);
          vel = new Vec2(0, -speed);
          break;
        default:
          pos = new Vec2(-margin, s);
          vel = new Vec2(speed, 0);
      }
      this.asteroids.push(new Asteroid(chance(0.3) ? 'small' : 'medium', pos, vel));
    }
  }

  private spawnPickup(kind: PickupKind): void {
    const m = 90;
    let pos = new Vec2(rand(m, this.width - m), rand(m, this.height - m));
    for (let i = 0; i < 6 && Vec2.dist(pos, this.player.pos) < 160; i++) pos = new Vec2(rand(m, this.width - m), rand(m, this.height - m));
    this.pickups.push(new Pickup(kind, pos));
  }

  // ---------- ефекти ----------

  private burst(x: number, y: number, size: number, quiet: boolean): void {
    this.particles.emit(x, y, { count: quiet ? 8 : 18, speed: [40, 200], life: [0.4, 0.9], size: [2, 5], colors: ['#ffb36b', '#ff6a2a', '#8b8fa3'], drag: 2 });
    this.particles.emit(x, y, { count: quiet ? 4 : 8, speed: [30, 140], life: [0.6, 1.1], size: [3, 6], colors: ['#6e7385', '#9aa0b4'], additive: false, square: true, drag: 1.5 });
    if (!quiet) this.explosions.push({ x, y, t: 0, dur: 0.5, size: size * 2.6 });
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    this.texts.push({ x, y, text, t: 0, dur: 1.1, color });
  }

  private addShake(v: number): void {
    if (Save.data.settings.shake) this.shake = Math.max(this.shake, v);
  }

  private updateEffects(dt: number): void {
    for (const e of this.explosions) e.t += dt;
    for (const r of this.rings) r.t += dt;
    for (const tx of this.texts) tx.t += dt;
    this.explosions = this.explosions.filter((e) => e.t < e.dur);
    this.rings = this.rings.filter((r) => r.t < r.dur);
    this.texts = this.texts.filter((tx) => tx.t < tx.dur);
  }

  // ---------- рендер ----------

  render(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const boosted = this.skills.isBoosted && this.state === 'running';

    // фон малюється на весь canvas (включно з полями) у CSS-пікселях
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    this.starfield.resize(vp.cw / vp.dpr, vp.ch / vp.dpr);
    this.starfield.render(ctx, boosted ? 3 : 1);

    const sx = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    ctx.setTransform(vp.scale, 0, 0, vp.scale, vp.ox + sx * vp.scale, vp.oy + sy * vp.scale);

    for (const a of this.asteroids) if (a instanceof BlackHole) a.render(ctx, this.clock);
    for (const m of this.mines) m.render(ctx, this.clock);
    for (const pk of this.pickups) pk.render(ctx, this.clock);
    this.particles.render(ctx);
    if (this.state !== 'dying' && this.state !== 'lost') this.player.render(ctx, boosted);
    for (const a of this.asteroids) if (!(a instanceof BlackHole)) a.render(ctx, this.clock);
    for (const l of this.lasers) l.render(ctx, this.clock);
    for (const pr of this.projectiles) pr.render(ctx, this.clock);
    this.renderEffects(ctx);

    if (this.frozen && this.state === 'running') {
      const k = Math.min(1, this.skills.freezeLeft * 2);
      ctx.fillStyle = `rgba(80,160,255,${0.12 * k})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    const fog = this.tuning().fog;
    if (fog > 0 && (this.state === 'running' || this.state === 'countdown')) {
      this.renderFog(ctx, fog);
      // попередження мають бути видні крізь туман — інакше це нечесно
      for (const a of this.asteroids) if (a instanceof Comet && a.warning) a.render(ctx, this.clock);
      for (const l of this.lasers) l.render(ctx, this.clock);
      for (const m of this.mines) m.renderSignal(ctx, this.clock);
    }
    this.renderWalls(ctx);
    this.renderShowerWarning(ctx);
    this.renderWindIndicator(ctx);

    if (this.state === 'countdown') this.renderCountdown(ctx);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private renderWalls(ctx: CanvasRenderingContext2D): void {
    for (const w of this.walls) {
      const a = 0.35 + 0.35 * Math.abs(Math.sin(this.clock * 10));
      const depth = 70;
      const horizontal = w.side % 2 === 0;
      const length = horizontal ? this.width : this.height;
      ctx.save();
      // поворот системи координат: стіна завжди "зверху"
      switch (w.side) {
        case 1:
          ctx.translate(this.width, 0);
          ctx.rotate(Math.PI / 2);
          break;
        case 2:
          ctx.translate(this.width, this.height);
          ctx.rotate(Math.PI);
          break;
        case 3:
          ctx.translate(0, this.height);
          ctx.rotate(-Math.PI / 2);
          break;
      }
      // для сторін 2 і 3 локальна вісь вздовж краю протилежна світовій — дзеркалимо центр проходу
      const gc = w.side === 2 || w.side === 3 ? length - w.gapCenter : w.gapCenter;
      const g = ctx.createLinearGradient(0, 0, 0, depth);
      g.addColorStop(0, `rgba(255,60,50,${a})`);
      g.addColorStop(1, 'rgba(255,60,50,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, gc - w.gap / 2, depth);
      ctx.fillRect(gc + w.gap / 2, 0, length - gc - w.gap / 2, depth);
      ctx.fillStyle = `rgba(80,255,150,${0.5 + a * 0.5})`;
      ctx.fillRect(gc - w.gap / 2, 0, w.gap, 5);
      ctx.fillStyle = '#fff';
      ctx.font = `700 22px ${UNI}`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = a + 0.3;
      ctx.fillText(t('game.wallWarn'), gc - w.gap / 2 - 160 > 80 ? gc - w.gap / 2 - 160 : gc + w.gap / 2 + 160, 44);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  private renderFog(ctx: CanvasRenderingContext2D, radius: number): void {
    const { x, y } = this.player.pos;
    const g = ctx.createRadialGradient(x, y, radius * 0.55, x, y, radius);
    g.addColorStop(0, 'rgba(6,4,16,0)');
    g.addColorStop(1, 'rgba(6,4,16,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(-50, -50, this.width + 100, this.height + 100);
  }

  /** Червона смуга вздовж краю, звідки посиплеться метеоритний дощ. */
  private renderShowerWarning(ctx: CanvasRenderingContext2D): void {
    const sh = this.shower;
    if (!sh) return;
    const a = sh.warn > 0 ? 0.35 + 0.35 * Math.abs(Math.sin(this.clock * 10)) : 0.25;
    const horizontal = sh.side % 2 === 0;
    const depth = 90;
    let g: CanvasGradient;
    switch (sh.side) {
      case 0:
        g = ctx.createLinearGradient(0, 0, 0, depth);
        break;
      case 1:
        g = ctx.createLinearGradient(this.width, 0, this.width - depth, 0);
        break;
      case 2:
        g = ctx.createLinearGradient(0, this.height, 0, this.height - depth);
        break;
      default:
        g = ctx.createLinearGradient(0, 0, depth, 0);
    }
    g.addColorStop(0, `rgba(255,120,40,${a})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    if (horizontal) ctx.fillRect(0, sh.side === 0 ? 0 : this.height - depth, this.width, depth);
    else ctx.fillRect(sh.side === 3 ? 0 : this.width - depth, 0, depth, this.height);
    if (sh.warn > 0) {
      ctx.font = `800 30px ${UNI}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,190,120,${a + 0.3})`;
      ctx.fillText(t('game.meteorWarn'), this.width / 2, this.height / 2 - 160);
    }
  }

  /** Стрілка напряму вітру під HUD. */
  private renderWindIndicator(ctx: CanvasRenderingContext2D): void {
    if (this.tuning().wind <= 0 || this.state !== 'running') return;
    const x = this.width / 2;
    const y = 96;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(10,9,24,0.6)';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(this.windAngle);
    ctx.strokeStyle = '#bfe6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.lineTo(11, 0);
    ctx.moveTo(4, -6);
    ctx.lineTo(11, 0);
    ctx.lineTo(4, 6);
    ctx.stroke();
    ctx.restore();
  }

  private renderEffects(ctx: CanvasRenderingContext2D): void {
    const img = Assets.get('explosion');
    for (const e of this.explosions) {
      const k = e.t / e.dur;
      const s = e.size * (0.5 + k * 0.7);
      ctx.globalAlpha = 1 - k * k;
      ctx.drawImage(img, e.x - s / 2, e.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const k = r.t / r.dur;
      const ease = 1 - (1 - k) * (1 - k);
      ctx.strokeStyle = `rgba(${r.color},${1 - k})`;
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * ease, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    for (const tx of this.texts) {
      const k = tx.t / tx.dur;
      const big = tx.text === t('game.go');
      ctx.globalAlpha = 1 - k * k;
      ctx.font = `800 ${big ? 96 + k * 40 : 20}px ${UNI}`;
      ctx.fillStyle = tx.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = big ? 6 : 4;
      const y = tx.y - (big ? 0 : k * 40);
      ctx.strokeText(tx.text, tx.x, y);
      ctx.fillText(tx.text, tx.x, y);
    }
    ctx.globalAlpha = 1;
  }

  private renderCountdown(ctx: CanvasRenderingContext2D): void {
    const n = Math.ceil(this.stateTimer);
    const frac = this.stateTimer - Math.floor(this.stateTimer);
    const cx = this.width / 2;
    const cy = this.height / 2;
    ctx.fillStyle = 'rgba(4,3,12,0.35)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `600 20px ${UNI}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const header = this.mode === 'campaign' ? `${t('levels.level')} ${this.levelId}` : t('menu.survival');
    ctx.fillText(header.toUpperCase(), cx, cy - 170);

    ctx.font = `800 46px ${UNI}`;
    ctx.fillStyle = '#fff';
    const title = this.mode === 'campaign' ? levelName(this.levelId) : t('levels.survivalCard');
    ctx.font = this.mode === 'campaign' ? `800 46px ${UNI}` : `600 24px ${UNI}`;
    ctx.fillText(title, cx, cy - 120, this.width - 80);

    if (this.mode === 'campaign') {
      ctx.font = `500 22px ${UNI}`;
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(t('game.survive', { t: formatTime(this.level.duration) }), cx, cy - 72);
      const h = introducedHazard(this.level);
      if (h) {
        ctx.font = `500 20px ${UNI}`;
        ctx.fillStyle = '#ff8a7a';
        ctx.fillText(t(`hazardInfo.${h}` as TKey), cx, cy + 120, this.width - 80);
      }
    }

    ctx.font = `800 ${110 + frac * 40}px ${UNI}`;
    ctx.globalAlpha = 0.4 + frac * 0.6;
    ctx.fillStyle = '#fff';
    ctx.fillText(String(n), cx, cy + 20);
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }
}
