import { Assets } from '../core/assets';
import { Sfx } from '../core/audio';
import { levelName, t, type TKey } from '../core/i18n';
import type { InputState } from '../core/input';
import { Vec2, chance, clamp, circlesOverlap, formatTime, pick, rand, randInt } from '../core/math';
import { Save } from '../core/storage';
import { ASTEROID_SIZES, Asteroid, BouncingAsteroid, Comet, HomingAsteroid, type AsteroidSize } from './entities/Asteroid';
import type { WorldView } from './entities/Entity';
import { Pickup, type PickupKind } from './entities/Pickup';
import { Player } from './entities/Player';
import { CRYSTAL_INTERVAL, SURVIVAL_BASE, getLevel, introducedHazard, type LevelConfig } from './levels';
import { getPlane, type PlaneId } from './planes';
import { ParticleSystem } from './systems/Particles';
import { BOOST_MULTIPLIER, SkillSystem } from './systems/SkillSystem';
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
  private crystalTimer = 0;
  private bonusTimer = 0;
  private rewardTimer = 0;

  crystals = 0;
  difficultyStep = 0;
  private ended = false;

  onEnd: (r: GameResult) => void = () => {};

  constructor(
    readonly mode: GameMode,
    readonly levelId: number,
    planeId: PlaneId,
    private readonly input: InputState,
  ) {
    this.player = new Player(getPlane(planeId));
  }

  get level(): LevelConfig {
    return this.mode === 'campaign' ? getLevel(this.levelId) : SURVIVAL_BASE;
  }

  get timeLeft(): number {
    return Math.max(0, this.level.duration - this.elapsed);
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
    this.particles.clear();
    this.player.reset(this.width / 2, this.height * 0.62);
    this.player.invulnerable = 0;
    this.skills.reset(1, 2);
    this.elapsed = 0;
    this.crystals = 0;
    this.difficultyStep = 0;
    this.ended = false;
    this.shake = 0;

    const cfg = this.level;
    this.spawnTimer = 0;
    this.nextSpawn = rand(cfg.spawnMin, cfg.spawnMax);
    this.cometTimer = cfg.cometEvery * 0.6;
    this.wallTimer = cfg.wallEvery * 0.7;
    this.crystalTimer = 1.5;
    this.bonusTimer = rand(8, 12);
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
      this.texts.push({ x: this.width / 2, y: this.height / 2, text: t('game.go'), t: 0, dur: 0.9, color: '#ffd24a' });
    }
  }

  private updatePlayer(dt: number): void {
    this.player.speedMultiplier = this.skills.isBoosted ? BOOST_MULTIPLIER : 1;
    this.player.update(dt, this.input.axis(), this.width, this.height);

    const ex = this.player.exhaust();
    const [inner, outer] = this.player.spec.flame;
    const back = this.player.angle + Math.PI;
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
    this.updateHazards(dt, true);
    this.updatePickups(dt);
    if (!this.frozen) this.updateSpawning(dt);
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

  private worldView(): WorldView {
    return { width: this.width, height: this.height, playerPos: this.player.pos, time: this.clock };
  }

  private updateHazards(dt: number, collide: boolean): void {
    const frozen = this.frozen && this.state === 'running';
    const world = this.worldView();
    for (const a of this.asteroids) {
      a.frozen = frozen;
      if (!frozen) a.update(dt, world);
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

    if (!frozen) {
      for (const w of this.walls) {
        const before = w.timer;
        w.timer -= dt;
        if (before > 0 && w.timer <= 0) this.spawnWall(w);
      }
      this.walls = this.walls.filter((w) => w.timer > 0);
    }
  }

  private onPlayerHit(a: Asteroid): void {
    const p = this.player;
    if (p.invulnerable > 0) return;
    if (p.shield) {
      p.shield = false;
      p.invulnerable = 1.2;
      a.kill();
      this.burst(a.pos.x, a.pos.y, a.visual, false);
      this.rings.push({ x: p.pos.x, y: p.pos.y, t: 0, dur: 0.5, r0: 30, r1: 140, color: '120,210,255' });
      this.addShake(10);
      Sfx.shieldHit();
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
    for (const pk of this.pickups) {
      pk.update(dt, world);
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
      shield: ['#9fe3ff', '#3fa9ff', '#ffffff'],
      freeze: ['#e6fbff', '#8fdcff'],
      boost: ['#ffe27a', '#ffb020'],
    };
    this.particles.emit(at.x, at.y, { count: 22, speed: [60, 220], life: [0.3, 0.7], size: [2, 4], colors: colors[kind] });
    this.rings.push({ x: at.x, y: at.y, t: 0, dur: 0.35, r0: 10, r1: 60, color: kind === 'crystal' ? '255,120,230' : '150,220,255' });
    switch (kind) {
      case 'crystal':
        this.crystals++;
        Sfx.pickup();
        this.floatText(at.x, at.y - 24, `+1`, '#ff9cf0');
        return;
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
      duration: cfg.duration,
      crystals: this.crystals,
      crystalTarget: cfg.crystalTarget,
      stars,
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
    };
  }

  private updateSpawning(dt: number): void {
    const cfg = this.tuning();

    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawn / cfg.spawnMul) {
      this.spawnTimer = 0;
      this.nextSpawn = Math.max(0.1, rand(cfg.spawnMin, cfg.spawnMax));
      const regular = this.asteroids.filter((a) => !(a instanceof Comet)).length;
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

    if (this.mode === 'campaign') {
      this.crystalTimer -= dt;
      if (this.crystalTimer <= 0) {
        this.crystalTimer = rand(CRYSTAL_INTERVAL - 1, CRYSTAL_INTERVAL + 1);
        this.spawnPickup('crystal');
      }
    }

    this.bonusTimer -= dt;
    if (this.bonusTimer <= 0) {
      this.bonusTimer = this.mode === 'campaign' ? rand(13, 19) : rand(10, 15);
      const options: PickupKind[] = ['freeze', 'boost'];
      if (!this.player.shield) options.push('shield', 'shield');
      this.spawnPickup(pick(options));
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

    this.renderWalls(ctx);
    for (const pk of this.pickups) pk.render(ctx, this.clock);
    this.particles.render(ctx);
    if (this.state !== 'dying' && this.state !== 'lost') this.player.render(ctx, boosted);
    for (const a of this.asteroids) a.render(ctx, this.clock);
    this.renderEffects(ctx);

    if (this.frozen && this.state === 'running') {
      const k = Math.min(1, this.skills.freezeLeft * 2);
      ctx.fillStyle = `rgba(80,160,255,${0.12 * k})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

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
