import type { Socket } from 'socket.io-client';
import { Assets } from '../core/assets';
import { Sfx } from '../core/audio';
import { Vec2, angleDiff, clamp } from '../core/math';
import type { InputState } from '../core/input';
import { Save } from '../core/storage';
import { drawGlow } from './fx';
import { drawPlane } from './PlaneArt';
import { effectivePlaneSpec, getPlane, planeCombat, type PlaneId } from './planes';
import { applyItemPassive, getItemDef, type ActiveEffect, type ItemDef } from './items';
import { getWeaponDef, DEFAULT_WEAPON_ID, WeaponState, type WeaponDef } from './weapons';
import { Player } from './entities/Player';
import { Projectile } from './entities/Projectile';
import { ParticleSystem } from './systems/Particles';
import { BOOST_MULTIPLIER, FLARE_RADIUS, SkillSystem } from './systems/SkillSystem';
import type { Viewport } from './Game';
import type { HitEvent, MatchInit, MatchResultEntry, Obstacle, PublicParticipant, ShotEvent, SkillEvent, SkillKind } from '../net/pvpProtocol';

const RADAR_VISIBLE_AFTER_FIRE_MS = 1300;
const SEND_EVERY = 0.05;
const HIT_RADIUS = 20;
const JUMP_DISTANCE = 210;
const SLOW_MUL = 0.45;
const MISSILE_SPEED = 560;

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
  color: string;
}

/** Теплова пастка: яскрава іскра, що падає назад від літака. */
interface Decoy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Missile {
  pos: Vec2;
  angle: number;
  life: number;
  remote: boolean;
  ownerId: string | null;
}

/** Плавне відображення чужих літаків між серверними тіками (20 Гц). */
interface Smooth {
  x: number;
  y: number;
  a: number;
}

/** PvP-матч: свій літак летить як літак (лише вперед, розворот дугою), решта — дані з сервера. */
export class PvpGame {
  width = 1600;
  height = 900;
  readonly player: Player;
  readonly skills = new SkillSystem();
  readonly gun: WeaponState;
  readonly weapon: WeaponDef;
  readonly activeDef: ItemDef | undefined;
  readonly passiveDef: ItemDef | undefined;
  participants = new Map<string, PublicParticipant>();
  obstacles: Obstacle[] = [];
  worldW = 6400;
  worldH = 3600;
  selfId: string | null = null;
  state: 'countdown' | 'active' | 'ended' = 'countdown';
  results: MatchResultEntry[] = [];
  countdownLeft = 3;
  timeLimit = 240;
  matchTime = 0;
  /** Хто збив гравця — за ним стежить камера після загибелі */
  killerId: string | null = null;
  onMatchEnd: (results: MatchResultEntry[]) => void = () => {};
  onFeed: (text: string, kind: 'kill' | 'self') => void = () => {};
  /** Спалах HUD, коли по нас влучили */
  hurtFlash = 0;

  private readonly maxHp: number;
  private readonly active: ActiveEffect | null;
  private readonly baseFireMul: number;
  private projectiles: Projectile[] = [];
  private remote: Projectile[] = [];
  private missiles: Missile[] = [];
  private decoys: Decoy[] = [];
  private rings: Ring[] = [];
  private texts: FloatText[] = [];
  private readonly particles = new ParticleSystem();
  private readonly smooth = new Map<string, Smooth>();
  private readonly listeners: [string, (...a: any[]) => void][] = [];
  private speed = 0;
  private aim = 0;
  private overdrive = 0;
  private slow = 0;
  private phase = 0;
  private sendTimer = 0;
  private clock = 0;
  private shake = 0;
  private cameraX = 0;
  private cameraY = 0;
  private lastShotSfx = 0;

  constructor(
    private readonly socket: Socket,
    private readonly input: InputState,
    planeId: PlaneId,
    init: MatchInit,
  ) {
    const progress = Save.progressFor(planeId);
    const loadout = Save.loadoutFor(planeId);
    const base = getPlane(planeId);
    this.passiveDef = getItemDef(Save.itemById(loadout.passive)?.defId ?? '');
    this.activeDef = getItemDef(Save.itemById(loadout.active)?.defId ?? '');
    const spec = applyItemPassive(effectivePlaneSpec(base, progress), this.passiveDef);
    const cooldownMul = 1 - (this.passiveDef?.combat?.cooldown ?? 0);
    this.baseFireMul = 1 + (this.passiveDef?.combat?.fireRate ?? 0);
    this.active = this.activeDef?.active ?? null;
    this.maxHp = planeCombat(base, progress).hp + (this.passiveDef?.combat?.hp ?? 0);
    this.weapon = getWeaponDef(loadout.weapon) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
    this.gun = new WeaponState(this.weapon);
    this.player = new Player(spec, progress.tier, progress.level);
    // заморозка в PvP не має сенсу — лише форсаж, ривок, пастки і предмет
    this.skills.reset({ ...spec.feature, extraFreeze: -1 }, this.active?.cooldown ?? 0, cooldownMul);

    this.selfId = socket.id ?? null;
    this.applyInit(init);

    this.on('match:start', () => {
      this.state = 'active';
      this.countdownLeft = 0;
      this.matchTime = 0;
      Sfx.countdown(true);
    });
    this.on('match:state', (data: { participants: PublicParticipant[]; t: number }) => {
      for (const p of data.participants) this.participants.set(p.id, p);
      this.matchTime = data.t / 1000;
    });
    this.on('match:shot', (s: ShotEvent) => this.onRemoteShot(s));
    this.on('match:skill', (s: SkillEvent) => this.onRemoteSkill(s));
    this.on('match:hit', (h: HitEvent) => this.onHit(h));
    this.on('match:end', (data: { results: MatchResultEntry[] }) => {
      this.state = 'ended';
      this.results = data.results;
      this.onMatchEnd(data.results);
    });
  }

  private on<T>(event: string, fn: (data: T) => void): void {
    this.socket.on(event, fn);
    this.listeners.push([event, fn as (...a: any[]) => void]);
  }

  /** Знімає підписки — інакше наступний матч отримав би дублікати подій. */
  dispose(): void {
    for (const [ev, fn] of this.listeners) this.socket.off(ev, fn);
    this.listeners.length = 0;
  }

  private applyInit(data: MatchInit): void {
    this.worldW = data.world.w;
    this.worldH = data.world.h;
    this.obstacles = data.obstacles;
    this.countdownLeft = data.countdownMs / 1000;
    this.timeLimit = data.timeLimitMs / 1000;
    for (const p of data.participants) this.participants.set(p.id, p);
    const me = this.self;
    this.player.reset(me?.pos.x ?? this.worldW / 2, me?.pos.y ?? this.worldH / 2);
    this.player.angle = me?.angle ?? -Math.PI / 2;
    this.aim = this.player.angle;
    this.cameraX = this.player.pos.x;
    this.cameraY = this.player.pos.y;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
  }

  get self(): PublicParticipant | undefined {
    return this.selfId ? this.participants.get(this.selfId) : undefined;
  }

  get selfAlive(): boolean {
    return this.self ? this.self.alive : true;
  }

  get hp(): number {
    return this.self?.hp ?? this.maxHp;
  }

  get hpMax(): number {
    return this.self?.maxHp ?? this.maxHp;
  }

  get aliveCount(): number {
    let n = 0;
    for (const p of this.participants.values()) if (p.alive) n++;
    return n;
  }

  get timeLeft(): number {
    return Math.max(0, this.timeLimit - this.matchTime);
  }

  get overdriveLeft(): number {
    return this.overdrive;
  }

  get phaseLeft(): number {
    return this.phase;
  }

  get slowed(): boolean {
    return this.slow > 0;
  }

  private get canAct(): boolean {
    return this.state === 'active' && this.selfAlive;
  }

  // ---------- навички ----------

  private emitSkill(kind: SkillKind): void {
    this.socket.emit('match:skill', { kind, x: this.player.pos.x, y: this.player.pos.y, angle: this.aim });
  }

  useBoost(): void {
    if (!this.canAct || !this.skills.tryBoost()) return;
    Sfx.boost();
    this.ring(this.player.pos.x, this.player.pos.y, 90, '255,200,80', 0.4);
  }

  useJump(): void {
    if (!this.canAct || !this.skills.tryJump()) return;
    const from = this.player.pos.clone();
    const dist = JUMP_DISTANCE * (this.player.spec.feature.jumpDistanceMul ?? 1);
    this.player.pos.add(Vec2.fromAngle(this.aim), dist);
    this.collide();
    this.speed = Math.max(this.speed, this.player.spec.maxSpeed * 0.9);
    Sfx.jump();
    this.emitSkill('jump');
    this.trail(from, this.player.pos, this.player.spec.flame);
  }

  useFlare(): void {
    if (!this.canAct || !this.skills.tryFlare()) return;
    this.emitSkill('flare');
    this.spawnDecoys(this.player.pos.x, this.player.pos.y, this.aim);
    Sfx.flares();
  }

  useItem(): void {
    if (!this.canAct || !this.active || !this.skills.tryItem()) return;
    const a = this.active;
    const { x, y } = this.player.pos;
    this.emitSkill(a.kind);
    switch (a.kind) {
      case 'nanoRepair':
        Sfx.powerup();
        this.ring(x, y, 70, '80,255,160', 0.45);
        this.particles.emit(x, y, { count: 24, speed: [40, 120], life: [0.4, 0.8], size: [2, 4], colors: ['#c8ffd8', '#4fe08a'] });
        break;
      case 'emp':
        Sfx.freeze();
        this.ring(x, y, a.radius ?? 250, '160,220,255', 0.55);
        break;
      case 'phase':
        this.phase = a.duration ?? 2;
        Sfx.powerup();
        this.ring(x, y, 70, '201,167,255', 0.4);
        break;
      case 'overdrive':
        this.overdrive = a.duration ?? 4;
        this.gun.reset();
        Sfx.boost();
        this.ring(x, y, 80, '255,90,58', 0.4);
        break;
      case 'swarm':
        Sfx.boost();
        for (let i = 0; i < 6; i++) {
          const ang = this.aim + (i - 2.5) * 0.28;
          const pos = this.nose();
          this.missiles.push({ pos, angle: ang, life: 2.6, remote: false, ownerId: this.selfId });
          this.socket.emit('match:shot', { x: pos.x, y: pos.y, angle: ang, kind: 'missile' });
        }
        break;
    }
  }

  // ---------- мережа ----------

  private onRemoteShot(s: ShotEvent): void {
    if (s.ownerId === this.selfId) return;
    const pos = new Vec2(s.x, s.y);
    if (s.kind === 'missile') {
      this.missiles.push({ pos, angle: s.angle, life: 2.6, remote: true, ownerId: s.ownerId });
      return;
    }
    this.remote.push(new Projectile(s.kind, pos, s.angle, s.speed, 0, 0, true, s.ownerId));
    this.muzzle(s.x, s.y, s.angle, s.kind === 'rocket');
    const d = Vec2.dist(pos, this.player.pos);
    if (d < 900 && this.clock - this.lastShotSfx > 0.07) {
      this.lastShotSfx = this.clock;
      if (s.kind === 'rocket') Sfx.bossShot();
      else Sfx.shot();
    }
  }

  private onRemoteSkill(s: SkillEvent): void {
    switch (s.kind) {
      case 'flare':
        this.spawnDecoys(s.x, s.y, s.angle);
        break;
      case 'jump':
        this.particles.emit(s.x, s.y, { count: 16, speed: [20, 90], life: [0.2, 0.5], size: [3, 5], colors: ['#ffffff', '#9fe3ff'] });
        break;
      case 'nanoRepair':
        this.ring(s.x, s.y, 70, '80,255,160', 0.45);
        break;
      case 'phase':
        this.ring(s.x, s.y, 70, '201,167,255', 0.4);
        break;
      case 'emp': {
        const r = s.radius ?? 250;
        this.ring(s.x, s.y, r, '160,220,255', 0.55);
        if (this.selfAlive && Math.hypot(this.player.pos.x - s.x, this.player.pos.y - s.y) < r) {
          this.slow = s.duration ?? 2.5;
          Sfx.freeze();
        }
        break;
      }
      default:
        break;
    }
  }

  private onHit(h: HitEvent): void {
    const target = this.participants.get(h.targetId);
    const attacker = this.participants.get(h.attackerId);
    if (target) {
      target.hp = h.hp;
      if (h.died) target.alive = false;
    }
    const isSelf = h.targetId === this.selfId;
    const pos = isSelf ? this.player.pos : this.renderPos(h.targetId);
    if (pos) {
      this.particles.emit(pos.x, pos.y, { count: 6, speed: [60, 200], life: [0.15, 0.35], size: [2, 3], colors: ['#ffffff', '#ffd27a', '#ff8a3a'] });
      if (isSelf || h.attackerId === this.selfId) {
        this.texts.push({ x: pos.x + (Math.random() - 0.5) * 20, y: pos.y - 30, text: `-${Math.round(h.damage)}`, t: 0, color: isSelf ? '#ff6a6a' : '#ffd24a' });
      }
    }
    if (isSelf) {
      this.hurtFlash = 1;
      this.addShake(h.died ? 14 : 4);
      Sfx.shieldHit();
    } else if (h.attackerId === this.selfId) {
      Sfx.hitMark();
    }
    if (h.died) {
      if (pos) this.explosion(pos.x, pos.y);
      Sfx.explode();
      if (isSelf) this.killerId = h.attackerId;
      this.onFeed(`${attacker?.nickname ?? '?'}  ✕  ${target?.nickname ?? '?'}`, isSelf || h.attackerId === this.selfId ? 'self' : 'kill');
    }
  }

  // ---------- оновлення ----------

  update(dt: number): void {
    this.clock += dt;
    this.player.tick(dt);
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdownLeft);
      this.countdownLeft = Math.max(0, this.countdownLeft - dt);
      if (Math.ceil(this.countdownLeft) !== before && this.countdownLeft > 0) Sfx.countdown();
    } else if (this.state === 'active') {
      this.matchTime += dt;
    }

    this.skills.update(dt);
    this.overdrive = Math.max(0, this.overdrive - dt);
    this.slow = Math.max(0, this.slow - dt);
    this.phase = Math.max(0, this.phase - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.shake = Math.max(0, this.shake - dt * 30);

    if (this.canAct) {
      this.fly(dt);
      this.updateGun(dt);
      this.sendTimer -= dt;
      if (this.sendTimer <= 0) {
        this.sendTimer = SEND_EVERY;
        this.socket.emit('match:move', { pos: { x: this.player.pos.x, y: this.player.pos.y }, angle: this.aim, firing: this.input.firing() });
      }
    }

    this.updateSmooth(dt);
    this.updateProjectiles(dt);
    this.updateMissiles(dt);
    this.updateFx(dt);
    this.updateCamera(dt);
  }

  /** Літак летить лише вперед: напрям керування задає курс, ніс розвертається дугою. */
  private fly(dt: number): void {
    const p = this.player;
    const spec = p.spec;
    const axis = this.input.axis();
    const mag = Math.hypot(axis.x, axis.y);
    const boost = this.skills.isBoosted ? BOOST_MULTIPLIER : 1;
    const slow = this.slow > 0 ? SLOW_MUL : 1;

    if (spec.feature.noRotate) {
      // тарілка — без інерції і може рухатись у будь-який бік
      p.speedMultiplier = boost * slow;
      p.update(dt, axis, this.worldW, this.worldH);
      if (p.vel.length() > 40) this.aim += angleDiff(this.aim, p.vel.angle()) * Math.min(1, dt * 10);
    } else {
      const turnRate = 2.4 + spec.accel / 2600;
      let want: number | null = mag > 0.2 ? Math.atan2(axis.y, axis.x) : null;
      // біля межі арени літак сам відвертає (інакше впирався б у край і "залипав")
      const margin = 170;
      const ex = p.pos.x < margin ? 1 : p.pos.x > this.worldW - margin ? -1 : 0;
      const ey = p.pos.y < margin ? 1 : p.pos.y > this.worldH - margin ? -1 : 0;
      const hx = Math.cos(p.angle);
      const hy = Math.sin(p.angle);
      if ((ex !== 0 && hx * ex < 0.2) || (ey !== 0 && hy * ey < 0.2)) {
        const away = Math.atan2(ey !== 0 ? ey : hy, ex !== 0 ? ex : hx);
        if (want === null || Math.abs(angleDiff(away, want)) > Math.PI / 2) want = away;
      }
      if (want !== null) p.angle += clamp(angleDiff(p.angle, want), -turnRate * dt, turnRate * dt);
      const max = spec.maxSpeed * boost * slow;
      const target = mag > 0.2 ? max : max * 0.55;
      const accel = spec.accel * 0.3;
      this.speed += clamp(target - this.speed, -accel * dt, accel * dt);
      p.vel.set(Math.cos(p.angle) * this.speed, Math.sin(p.angle) * this.speed);
      p.pos.add(p.vel, dt);
      this.aim = p.angle;
    }
    this.collide();

    const ex = p.exhaust();
    const [inner, outer] = spec.flame;
    const boosted = this.skills.isBoosted;
    this.particles.emit(ex.x, ex.y, {
      count: boosted ? 3 : 1,
      speed: [boosted ? 160 : 90, boosted ? 260 : 150],
      angle: p.exhaustAngle,
      spread: 0.25,
      life: [0.15, boosted ? 0.4 : 0.28],
      size: [boosted ? 5 : 3.5, boosted ? 7 : 5],
      colors: boosted ? ['#fff3b0', '#ffb020', inner] : [inner, outer],
      inherit: { x: p.vel.x * 0.3, y: p.vel.y * 0.3 },
      drag: 3,
    });
  }

  /** Межі світу й астероїди-перешкоди: виштовхуємо і гасимо швидкість. */
  private collide(): void {
    const p = this.player;
    const r = p.radius;
    p.pos.set(clamp(p.pos.x, r, this.worldW - r), clamp(p.pos.y, r, this.worldH - r));
    for (const o of this.obstacles) {
      const dx = p.pos.x - o.x;
      const dy = p.pos.y - o.y;
      const d = Math.hypot(dx, dy);
      const min = o.r + r;
      if (d < min) {
        p.pos.set(o.x + (dx / (d || 1)) * min, o.y + (dy / (d || 1)) * min);
        this.speed *= 0.92;
      }
    }
  }

  private nose(): Vec2 {
    return new Vec2(this.player.pos.x + Math.cos(this.aim) * 24, this.player.pos.y + Math.sin(this.aim) * 24);
  }

  private updateGun(dt: number): void {
    this.gun.fireRateMul = this.baseFireMul * (this.overdrive > 0 ? 2 : 1);
    if (this.overdrive > 0 && this.gun.cooldown > 0) this.gun.reset();
    const shots = this.gun.update(dt, this.input.firing());
    if (!shots) return;
    const pos = this.nose();
    const angle = this.aim + (Math.random() - 0.5) * 2 * (this.weapon.spread ?? 0);
    this.projectiles.push(new Projectile(this.weapon.kind, pos, angle, this.weapon.projectileSpeed, this.weapon.damage, this.weapon.splashRadius ?? 0, false, this.selfId));
    this.socket.emit('match:shot', { x: pos.x, y: pos.y, angle, kind: this.weapon.kind });
    this.muzzle(pos.x, pos.y, angle, this.weapon.kind === 'rocket');
    if (this.weapon.kind === 'rocket') Sfx.bossShot();
    else if (this.clock - this.lastShotSfx > 0.06) {
      this.lastShotSfx = this.clock;
      Sfx.shot();
    }
  }

  private updateSmooth(dt: number): void {
    const k = Math.min(1, dt * 14);
    for (const [id, p] of this.participants) {
      if (id === this.selfId) continue;
      let s = this.smooth.get(id);
      if (!s) {
        s = { x: p.pos.x, y: p.pos.y, a: p.angle };
        this.smooth.set(id, s);
      }
      // далекий стрибок (ривок) — одразу, без "ковзання"
      if (Math.hypot(p.pos.x - s.x, p.pos.y - s.y) > 300) {
        s.x = p.pos.x;
        s.y = p.pos.y;
      } else {
        s.x += (p.pos.x - s.x) * k;
        s.y += (p.pos.y - s.y) * k;
      }
      s.a += angleDiff(s.a, p.angle) * k;
      if (p.alive && this.clock % 0.03 < dt) {
        const spec = getPlane(p.planeId as PlaneId);
        this.particles.emit(s.x - Math.cos(s.a) * 24, s.y - Math.sin(s.a) * 24, { count: 1, speed: [80, 140], angle: s.a + Math.PI, spread: 0.25, life: [0.15, 0.28], size: [3, 5], colors: spec.flame, drag: 3 });
      }
    }
  }

  private renderPos(id: string): { x: number; y: number } | null {
    if (id === this.selfId) return this.player.pos;
    return this.smooth.get(id) ?? this.participants.get(id)?.pos ?? null;
  }

  /** Перевірка "снаряд проти перешкод" — гасить снаряд з іскрами. */
  private hitsObstacle(pos: Vec2, r: number): boolean {
    for (const o of this.obstacles) {
      if (Math.hypot(pos.x - o.x, pos.y - o.y) < o.r + r) {
        this.particles.emit(pos.x, pos.y, { count: 4, speed: [40, 140], life: [0.15, 0.3], size: [1.5, 3], colors: ['#d8d0e8', '#ffd27a'] });
        return true;
      }
    }
    return false;
  }

  /** Чи збиває пастка ціль снаряд, що підлетів. */
  private intercepted(pos: Vec2, id: string): boolean {
    const flaring = id === this.selfId ? this.skills.isFlaring : !!this.participants.get(id)?.flare;
    if (!flaring) return false;
    const p = this.renderPos(id);
    if (!p || Math.hypot(pos.x - p.x, pos.y - p.y) > FLARE_RADIUS) return false;
    this.particles.emit(pos.x, pos.y, { count: 8, speed: [60, 180], life: [0.2, 0.45], size: [2, 4], colors: ['#ffffff', '#fff1a8', '#ff9a3a'] });
    return true;
  }

  private updateProjectiles(dt: number): void {
    const world = { width: this.worldW, height: this.worldH, playerPos: this.player.pos, time: this.clock };
    for (const pr of this.projectiles) {
      pr.update(dt, world);
      if (!pr.alive) continue;
      if (this.hitsObstacle(pr.pos, pr.radius)) {
        this.impact(pr);
        pr.kill();
        continue;
      }
      for (const [id, p] of this.participants) {
        if (id === this.selfId || !p.alive) continue;
        if (this.intercepted(pr.pos, id)) {
          pr.kill();
          break;
        }
        if (p.phase) continue;
        const rp = this.renderPos(id)!;
        if (Math.hypot(pr.pos.x - rp.x, pr.pos.y - rp.y) < HIT_RADIUS + pr.radius) {
          pr.kill();
          this.socket.emit('match:fire-hit', { targetId: id, source: 'weapon' });
          this.impact(pr, id);
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.alive);

    // чужі снаряди — лише візуал (урон рахує сервер / клієнт стрільця)
    for (const pr of this.remote) {
      pr.update(dt, world);
      if (!pr.alive) continue;
      if (this.hitsObstacle(pr.pos, pr.radius)) {
        pr.kill();
        continue;
      }
      const ids = [...this.participants.keys()];
      if (this.selfId && !ids.includes(this.selfId)) ids.push(this.selfId);
      for (const id of ids) {
        if (id === pr.ownerId) continue;
        const p = id === this.selfId ? null : this.participants.get(id);
        const alive = id === this.selfId ? this.selfAlive : !!p?.alive;
        if (!alive) continue;
        if (this.intercepted(pr.pos, id)) {
          pr.kill();
          break;
        }
        const phase = id === this.selfId ? this.phase > 0 : !!p?.phase;
        if (phase) continue;
        const rp = this.renderPos(id);
        if (rp && Math.hypot(pr.pos.x - rp.x, pr.pos.y - rp.y) < HIT_RADIUS + pr.radius) {
          pr.kill();
          if (pr.kind === 'rocket') this.explosion(pr.pos.x, pr.pos.y, 0.6);
          break;
        }
      }
    }
    this.remote = this.remote.filter((pr) => pr.alive);
  }

  /** Вибух ракети: ефект + сплеш-урон по сусідах. */
  private impact(pr: Projectile, directId?: string): void {
    if (pr.kind !== 'rocket') return;
    this.explosion(pr.pos.x, pr.pos.y, 0.7);
    this.ring(pr.pos.x, pr.pos.y, pr.splashRadius, '255,140,80', 0.35);
    for (const [id, p] of this.participants) {
      if (id === this.selfId || id === directId || !p.alive || p.phase) continue;
      const rp = this.renderPos(id)!;
      if (Math.hypot(pr.pos.x - rp.x, pr.pos.y - rp.y) < pr.splashRadius) this.socket.emit('match:fire-hit', { targetId: id, source: 'splash' });
    }
  }

  private updateMissiles(dt: number): void {
    for (const m of this.missiles) {
      m.life -= dt;
      // самонаведення на найближчого ворога в передньому секторі
      let best: { x: number; y: number } | null = null;
      let bestD = 900;
      for (const [id, p] of this.participants) {
        if (id === m.ownerId || !p.alive) continue;
        const rp = id === this.selfId ? this.player.pos : this.renderPos(id)!;
        const d = Math.hypot(rp.x - m.pos.x, rp.y - m.pos.y);
        if (d < bestD && Math.abs(angleDiff(m.angle, Math.atan2(rp.y - m.pos.y, rp.x - m.pos.x))) < 1.6) {
          bestD = d;
          best = rp;
        }
      }
      if (best && m.life < 2.4) {
        const want = Math.atan2(best.y - m.pos.y, best.x - m.pos.x);
        m.angle += clamp(angleDiff(m.angle, want), -4 * dt, 4 * dt);
      }
      m.pos.add(Vec2.fromAngle(m.angle), MISSILE_SPEED * dt);
      this.particles.emit(m.pos.x, m.pos.y, { count: 1, speed: [10, 40], angle: m.angle + Math.PI, spread: 0.4, life: [0.2, 0.4], size: [2, 4], colors: ['#fff1a8', '#ff8a3a', '#9a9aa8'], drag: 2 });
      if (this.hitsObstacle(m.pos, 4)) {
        m.life = 0;
        this.explosion(m.pos.x, m.pos.y, 0.4);
        continue;
      }
      for (const [id, p] of this.participants) {
        if (id === m.ownerId || !p.alive) continue;
        if (this.intercepted(m.pos, id)) {
          m.life = 0;
          break;
        }
        if (p.phase) continue;
        const rp = id === this.selfId ? this.player.pos : this.renderPos(id)!;
        if (Math.hypot(rp.x - m.pos.x, rp.y - m.pos.y) < HIT_RADIUS + 4) {
          m.life = 0;
          this.explosion(m.pos.x, m.pos.y, 0.4);
          if (!m.remote) this.socket.emit('match:fire-hit', { targetId: id, source: 'swarm' });
          break;
        }
      }
    }
    this.missiles = this.missiles.filter((m) => m.life > 0);
  }

  private updateFx(dt: number): void {
    this.particles.update(dt);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const t of this.texts) {
      t.t += dt;
      t.y -= 40 * dt;
    }
    this.texts = this.texts.filter((t) => t.t < 0.9);
    for (const d of this.decoys) {
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= Math.exp(-1.6 * dt);
      d.vy *= Math.exp(-1.6 * dt);
      if (Math.random() < 0.6) this.particles.emit(d.x, d.y, { count: 1, speed: [5, 30], life: [0.3, 0.6], size: [2, 4], colors: ['#fff1a8', '#ff9a3a', '#c8c0d8'], drag: 1 });
    }
    this.decoys = this.decoys.filter((d) => d.life > 0);
  }

  private updateCamera(dt: number): void {
    let tx = this.player.pos.x;
    let ty = this.player.pos.y;
    if (!this.selfAlive) {
      // після загибелі камера переходить на того, хто збив (або на будь-кого живого)
      const watch = (this.killerId && this.participants.get(this.killerId)?.alive ? this.killerId : [...this.participants.values()].find((p) => p.alive)?.id) ?? null;
      const rp = watch ? this.renderPos(watch) : null;
      if (rp) {
        tx = rp.x;
        ty = rp.y;
      }
    } else {
      // трохи вперед за курсом — більше видно, куди летиш
      tx += Math.cos(this.aim) * Math.min(160, this.speed * 0.3);
      ty += Math.sin(this.aim) * Math.min(160, this.speed * 0.3);
    }
    const k = Math.min(1, dt * 6);
    this.cameraX += (tx - this.cameraX) * k;
    this.cameraY += (ty - this.cameraY) * k;
  }

  // ---------- ефекти ----------

  private addShake(v: number): void {
    if (Save.data.settings.shake) this.shake = Math.min(18, this.shake + v);
  }

  private ring(x: number, y: number, r1: number, color: string, dur: number): void {
    this.rings.push({ x, y, t: 0, dur, r0: 10, r1, color });
  }

  private muzzle(x: number, y: number, angle: number, big: boolean): void {
    this.particles.emit(x, y, { count: big ? 8 : 2, speed: [60, big ? 220 : 160], angle, spread: big ? 0.6 : 0.3, life: [0.05, big ? 0.25 : 0.1], size: [2, big ? 5 : 3], colors: ['#ffffff', '#ffe27a', '#ff9a3a'], drag: 6 });
  }

  private explosion(x: number, y: number, scale = 1): void {
    this.particles.emit(x, y, { count: Math.round(40 * scale), speed: [60, 340 * scale], life: [0.3, 0.9], size: [3, 7 * scale], colors: ['#ffffff', '#fff1a8', '#ffb020', '#ff5a1f', '#8a8aa0'], drag: 2.5 });
    this.ring(x, y, 90 * scale, '255,170,80', 0.4);
    if (scale >= 1) this.addShake(6);
  }

  private trail(from: Vec2, to: Vec2, colors: readonly string[]): void {
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      this.particles.emit(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k, { count: 3, speed: [10, 60], life: [0.25, 0.5], size: [3, 6], colors: [...colors, '#ffffff'] });
    }
  }

  /** Віяло теплових пасток назад і вбік від курсу. */
  private spawnDecoys(x: number, y: number, angle: number): void {
    const back = angle + Math.PI;
    for (let i = 0; i < 8; i++) {
      const a = back + (i - 3.5) * 0.32 + (Math.random() - 0.5) * 0.15;
      const sp = 180 + Math.random() * 120;
      this.decoys.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1 + Math.random() * 0.5 });
    }
    this.ring(x, y, FLARE_RADIUS, '255,190,90', 0.35);
  }

  /** Мітки на радарі: чужі кораблі видно лише поки стріляють (і трохи після). */
  radarContacts(): { id: string; x: number; y: number; isSelf: boolean }[] {
    const now = Date.now();
    const out: { id: string; x: number; y: number; isSelf: boolean }[] = [];
    if (this.selfId && this.selfAlive) out.push({ id: this.selfId, x: this.player.pos.x, y: this.player.pos.y, isSelf: true });
    for (const [id, p] of this.participants) {
      if (id === this.selfId || !p.alive) continue;
      if (p.firing || now - p.lastFiredAt < RADAR_VISIBLE_AFTER_FIRE_MS) out.push({ id, x: p.pos.x, y: p.pos.y, isSelf: false });
    }
    return out;
  }

  // ---------- рендер ----------

  render(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const w = vp.cw / vp.dpr;
    const h = vp.ch / vp.dpr;
    this.width = w;
    this.height = h;
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.fillStyle = '#04030b';
    ctx.fillRect(0, 0, w, h);

    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.renderStars(ctx, w, h);

    const ox = Math.round(w / 2 - this.cameraX + sx);
    const oy = Math.round(h / 2 - this.cameraY + sy);
    ctx.save();
    ctx.translate(ox, oy);

    this.renderWorldBounds(ctx, w, h);
    this.renderObstacles(ctx);

    for (const d of this.decoys) drawGlow(ctx, d.x, d.y, 'rgba(255,200,110,1)', 16 * Math.min(1, d.life), 0.9);
    this.particles.render(ctx);

    for (const [id, p] of this.participants) {
      if (id === this.selfId || !p.alive) continue;
      const s = this.smooth.get(id) ?? { x: p.pos.x, y: p.pos.y, a: p.angle };
      this.renderShip(ctx, s.x, s.y, s.a, p, false);
    }

    if (this.selfAlive) {
      ctx.globalAlpha = this.phase > 0 ? 0.4 + Math.sin(this.clock * 20) * 0.1 : 1;
      if (this.player.spec.feature.noRotate) this.player.render(ctx, this.skills.isBoosted);
      else {
        const [inner, outer] = this.player.spec.flame;
        const ex = this.player.exhaust();
        drawGlow(ctx, ex.x, ex.y, this.skills.isBoosted ? 'rgba(255,200,80,1)' : hexToRgba(outer), this.skills.isBoosted ? 34 : 22, 0.8);
        drawGlow(ctx, ex.x, ex.y, hexToRgba(inner), 10, 0.9);
        ctx.save();
        ctx.translate(this.player.pos.x, this.player.pos.y);
        ctx.rotate(this.player.angle + Math.PI / 2);
        drawPlane(ctx, this.player.spec.id, 60, this.clock, this.player.tier, this.player.level);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (this.skills.isFlaring) this.renderFlareShield(ctx, this.player.pos.x, this.player.pos.y);
      if (this.slow > 0) this.renderSlow(ctx, this.player.pos.x, this.player.pos.y);
    }

    for (const pr of this.projectiles) pr.render(ctx, this.clock);
    for (const pr of this.remote) pr.render(ctx, this.clock);
    for (const m of this.missiles) this.renderMissile(ctx, m);

    for (const r of this.rings) {
      const k = r.t / r.dur;
      ctx.strokeStyle = `rgba(${r.color},${(1 - k) * 0.8})`;
      ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3)), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.font = '700 15px Bungee, sans-serif';
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = 1 - t.t / 0.9;
      ctx.fillStyle = '#0a0918';
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    if (this.state === 'countdown' && this.countdownLeft > 0) {
      ctx.font = '800 96px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const n = Math.ceil(this.countdownLeft);
      const k = this.countdownLeft % 1;
      ctx.globalAlpha = 0.4 + k * 0.6;
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(String(n), w / 2, h / 2 - 80);
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
    }
    if (this.hurtFlash > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${0.35 * this.hurtFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** Два шари зірок із паралаксом — видно, що літак рухається. */
  private renderStars(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const layers: [number, number, number, number][] = [
      [0.25, 220, 1.2, 0.35],
      [0.55, 260, 1.8, 0.6],
    ];
    for (const [par, cell, size, alpha] of layers) {
      const camX = this.cameraX * par;
      const camY = this.cameraY * par;
      const x0 = Math.floor((camX - w / 2) / cell);
      const y0 = Math.floor((camY - h / 2) / cell);
      const x1 = Math.ceil((camX + w / 2) / cell);
      const y1 = Math.ceil((camY + h / 2) / cell);
      ctx.fillStyle = `rgba(220,225,255,${alpha})`;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          let seed = (cx * 73856093) ^ (cy * 19349663) ^ (par * 1000);
          for (let i = 0; i < 3; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            const fx = (seed % 1000) / 1000;
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            const fy = (seed % 1000) / 1000;
            const x = cx * cell + fx * cell - camX + w / 2;
            const y = cy * cell + fy * cell - camY + h / 2;
            ctx.fillRect(x, y, size, size);
          }
        }
      }
    }
  }

  private renderWorldBounds(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // тонка сітка всередині арени
    const step = 400;
    const left = Math.max(0, this.cameraX - w / 2 - step);
    const right = Math.min(this.worldW, this.cameraX + w / 2 + step);
    const top = Math.max(0, this.cameraY - h / 2 - step);
    const bottom = Math.min(this.worldH, this.cameraY + h / 2 + step);
    ctx.strokeStyle = 'rgba(120,140,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = Math.ceil(top / step) * step; y <= bottom; y += step) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();

    // за межами арени — темна смуга з червоною межею
    const pad = 3000;
    ctx.fillStyle = 'rgba(2,1,6,0.75)';
    ctx.fillRect(-pad, -pad, this.worldW + pad * 2, pad);
    ctx.fillRect(-pad, this.worldH, this.worldW + pad * 2, pad);
    ctx.fillRect(-pad, 0, pad, this.worldH);
    ctx.fillRect(this.worldW, 0, pad, this.worldH);
    ctx.strokeStyle = 'rgba(255,80,110,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 12]);
    ctx.strokeRect(0, 0, this.worldW, this.worldH);
    ctx.setLineDash([]);
  }

  private renderObstacles(ctx: CanvasRenderingContext2D): void {
    const img = Assets.ready ? Assets.get('astLarge') : null;
    const viewL = this.cameraX - this.width / 2 - 120;
    const viewR = this.cameraX + this.width / 2 + 120;
    const viewT = this.cameraY - this.height / 2 - 120;
    const viewB = this.cameraY + this.height / 2 + 120;
    this.obstacles.forEach((o, i) => {
      if (o.x + o.r < viewL || o.x - o.r > viewR || o.y + o.r < viewT || o.y - o.r > viewB) return;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(i * 1.7 + this.clock * 0.05 * (i % 2 ? 1 : -1));
      if (img && img.complete && img.naturalWidth) {
        const d = o.r * 2.3;
        ctx.drawImage(img, -d / 2, -d / 2, d, d);
      } else {
        ctx.fillStyle = '#5a5470';
        ctx.beginPath();
        ctx.arc(0, 0, o.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  private renderShip(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, p: PublicParticipant, _self: boolean): void {
    const spec = getPlane(p.planeId as PlaneId);
    drawGlow(ctx, x - Math.cos(a) * 26, y - Math.sin(a) * 26, hexToRgba(spec.flame[1]), 20, 0.7);
    ctx.globalAlpha = p.phase ? 0.35 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    drawPlane(ctx, spec.id, 60, this.clock, p.tier ?? 1, p.level ?? 1);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (p.flare) this.renderFlareShield(ctx, x, y);
    if (p.slowed) this.renderSlow(ctx, x, y);

    // ім'я і смужка HP над ворогом
    const pct = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = 'rgba(10,9,24,0.8)';
    ctx.fillRect(x - 26, y - 44, 52, 6);
    ctx.fillStyle = pct > 0.4 ? '#ff6a6a' : '#ff2a4a';
    ctx.fillRect(x - 25, y - 43, 50 * pct, 4);
    ctx.font = '600 12px Bungee, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,9,24,0.9)';
    ctx.fillText(p.nickname, x + 1, y - 50);
    ctx.fillStyle = '#ffb3b3';
    ctx.fillText(p.nickname, x, y - 51);
  }

  private renderFlareShield(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.strokeStyle = `rgba(255,190,90,${0.35 + Math.sin(this.clock * 30) * 0.15})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(x, y, FLARE_RADIUS * 0.7, this.clock * 3, this.clock * 3 + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private renderSlow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    drawGlow(ctx, x, y, 'rgba(120,200,255,1)', 46, 0.35);
  }

  private renderMissile(ctx: CanvasRenderingContext2D, m: Missile): void {
    ctx.save();
    ctx.translate(m.pos.x, m.pos.y);
    ctx.rotate(m.angle + Math.PI / 2);
    ctx.fillStyle = '#e6e9f0';
    ctx.fillRect(-1.6, -5, 3.2, 10);
    ctx.fillStyle = m.remote ? '#ff2a6a' : '#ffd24a';
    ctx.fillRect(-1.6, -7, 3.2, 3);
    ctx.restore();
    drawGlow(ctx, m.pos.x - Math.cos(m.angle) * 6, m.pos.y - Math.sin(m.angle) * 6, 'rgba(255,170,60,1)', 10, 0.8);
  }
}

function hexToRgba(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`;
}
