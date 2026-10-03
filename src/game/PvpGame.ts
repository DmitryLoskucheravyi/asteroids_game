import type { GameLink } from '../net/gameLink';
import { drawAsteroid } from './AsteroidArt';
import { Sfx } from '../core/audio';
import { Vec2, angleDiff, clamp } from '../core/math';
import { mouseSteering, type InputState } from '../core/input';
import { Save } from '../core/storage';
import { drawGlow } from './fx';
import { drawCrosshair } from './crosshair';
import { drawPlane } from './PlaneArt';
import { PVP_PROGRESS_SCALE, effectivePlaneSpec, getPlane, planeCombat, type PlaneId } from './planes';
import { applyItemPassive, getItemDef, type ActiveEffect, type ItemDef } from './items';
import { decodeShot, decodeState, encodeFire, encodeMove, type ShotKind, type StatePatch } from '../../server/src/shared/netcodec';
import { INTERP_DELAY_MS, ServerClock, SnapshotBuffer } from '../net/interp';
import { getWeaponDef, DEFAULT_WEAPON_ID, WeaponState, type WeaponDef } from './weapons';
import { Player } from './entities/Player';
import { Projectile } from './entities/Projectile';
import { ParticleSystem } from './systems/Particles';
import { BOOST_MULTIPLIER, SkillSystem } from './systems/SkillSystem';
import { DECOY_COUNT, FLARE_ACTIVE_MS, FLARE_FADE_MS, decoyPos, hitsDecoy, nearestDecoy, rayDecoy, type FlareBurst } from '../../server/src/shared/flares';
import type { Viewport } from './Game';
import type { HitEvent, MatchInit, MatchResultEntry, Obstacle, PickupTaken, PickupView, PublicParticipant, ShotEvent, SkillEvent, SkillKind } from '../net/pvpProtocol';

const RADAR_VISIBLE_AFTER_FIRE_MS = 1300;
/** Свій стан шлемо з частотою тіку сервера (30 Гц) */
const SEND_EVERY = 1 / 30;
const HIT_RADIUS = 20;
const JUMP_DISTANCE = 210;
const SLOW_MUL = 0.6;
const MISSILE_SPEED = 520;
/** Поворот ракети, рад/с — помірний, щоб від неї можна було ухилитись маневром */
const MISSILE_TURN = 2.2;

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


interface Missile {
  pos: Vec2;
  angle: number;
  life: number;
  remote: boolean;
  ownerId: string | null;
  /** 'weapon' — залп зі зброї, 'swarm' — предмет "Рій ракет" (сервер рахує урон по-різному) */
  source: 'weapon' | 'swarm';
}

/** Слід лазерного променя — живе кілька кадрів. */
interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  hostile: boolean;
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
  /** Монети, кристали й купи луту збитих літаків на полі */
  pickups = new Map<number, PickupView>();
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
  private beams: Beam[] = [];
  /** Пастки на полі (свої й чужі) — іскри рахуються спільною формулою, як на сервері */
  private flares: FlareBurst[] = [];
  private rings: Ring[] = [];
  private texts: FloatText[] = [];
  private readonly particles = new ParticleSystem();
  private readonly smooth = new Map<string, Smooth>();
  /** Буфери знімків сервера для чужих літаків + оцінка годинника сервера */
  private readonly buffers = new Map<string, SnapshotBuffer>();
  private readonly serverClock = new ServerClock();
  private delayed: { at: number; fn: () => void }[] = [];
  /** Порядок учасників з match:init — у бінарних пакетах учасник = індекс */
  private order: string[] = [];
  private gotKeyframe = false;
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
    private readonly socket: GameLink,
    private readonly input: InputState,
    planeId: PlaneId,
    init: MatchInit,
  ) {
    const progress = Save.progressFor(planeId);
    const loadout = Save.loadoutFor(planeId);
    const base = getPlane(planeId);
    this.passiveDef = getItemDef(Save.itemById(loadout.passive)?.defId ?? '');
    this.activeDef = getItemDef(Save.itemById(loadout.active)?.defId ?? '');
    const spec = applyItemPassive(effectivePlaneSpec(base, progress, PVP_PROGRESS_SCALE), this.passiveDef);
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
    this.on('match:state', (data: ArrayBuffer) => this.onState(decodeState(data)));
    // чужі постріли й навички показуємо з тією ж затримкою, що й самі літаки, — інакше куля вилітає попереду носа
    this.on('match:shot', (data: ArrayBuffer) => {
      const n = decodeShot(data);
      const s: ShotEvent = { ownerId: this.order[n.owner] ?? '', x: n.x, y: n.y, angle: n.angle, kind: n.kind, speed: n.speed };
      this.later(() => this.onRemoteShot(s), s.ownerId);
    });
    this.on('match:skill', (s: SkillEvent) => this.later(() => this.onRemoteSkill(s), s.id));
    this.on('match:hit', (h: HitEvent) => this.onHit(h));
    this.on('match:pickup-spawn', (pk: PickupView) => {
      this.pickups.set(pk.id, pk);
      if (pk.kind === 'pile') this.ring(pk.x, pk.y, 70, '255,210,74', 0.5);
    });
    this.on('match:pickup-taken', (e: PickupTaken) => this.onPickupTaken(e));
    this.on('match:scan', (data: { blips: { x: number; y: number; ally: boolean }[] }) => {
      this.scanBlips = data.blips;
      this.scanAge = 0;
    });
    this.on('match:end', (data: { results: MatchResultEntry[] }) => {
      this.state = 'ended';
      this.results = data.results;
      this.onMatchEnd(data.results);
    });
  }

  /** Свій постріл → сервер (бінарно, з моментом, який бачив гравець, — для компенсації лагу). */
  private fire(x: number, y: number, angle: number, kind: ShotKind): void {
    this.socket.emit('match:shot', encodeFire({ x, y, angle, kind, viewT: this.serverClock.now() - INTERP_DELAY_MS }));
  }

  /** Пакет стану (ключовий кадр або дельта) → учасники + буфери інтерполяції. */
  private onState(st: StatePatch): void {
    if (st.key) this.gotKeyframe = true;
    if (!this.gotKeyframe) return; // дельта без бази — чекаємо ключовий кадр
    this.serverClock.sample(st.t);
    for (const { index, patch } of st.entries) {
      const p = this.participants.get(this.order[index]);
      if (!p) continue;
      if (patch.x !== undefined && patch.y !== undefined) p.pos = { x: patch.x, y: patch.y };
      if (patch.angle !== undefined) p.angle = patch.angle;
      if (patch.hp !== undefined) p.hp = patch.hp;
      if (patch.maxHp !== undefined) p.maxHp = patch.maxHp;
      if (patch.alive !== undefined) {
        p.alive = patch.alive;
        p.firing = !!patch.firing;
        p.flare = !!patch.flare;
        p.phase = !!patch.phase;
        p.slowed = !!patch.slowed;
      }
      if (patch.kills !== undefined) p.kills = patch.kills;
      if (patch.lootCoins !== undefined) {
        p.lootCoins = patch.lootCoins;
        p.lootCrystals = patch.lootCrystals ?? p.lootCrystals;
      }
      if (patch.lastFiredAt !== undefined) p.lastFiredAt = patch.lastFiredAt;
    }
    // у буфер інтерполяції — кожен чужий літак на кожен тік (незмінний теж: це "стоїть на місці")
    for (const id of this.order) {
      if (id === this.selfId) continue;
      const p = this.participants.get(id);
      if (!p) continue;
      let buf = this.buffers.get(id);
      if (!buf) this.buffers.set(id, (buf = new SnapshotBuffer()));
      buf.push({ t: st.t, x: p.pos.x, y: p.pos.y, a: p.angle });
    }
    this.matchTime = st.t / 1000;
  }

  /** Подія чужого літака — відкладаємо до моменту, коли він сам буде показаний у цій точці. */
  private later(fn: () => void, ownerId: string): void {
    if (ownerId === this.selfId) fn();
    else this.delayed.push({ at: this.clock + INTERP_DELAY_MS / 1000, fn });
  }

  private flushDelayed(): void {
    if (!this.delayed.length || this.delayed[0].at > this.clock) return;
    const due = this.delayed.filter((d) => d.at <= this.clock);
    this.delayed = this.delayed.filter((d) => d.at > this.clock);
    for (const d of due) d.fn();
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
    this.teamSize = data.teamSize ?? 1;
    this.worldW = data.world.w;
    this.worldH = data.world.h;
    this.obstacles = data.obstacles;
    this.countdownLeft = data.countdownMs / 1000;
    this.timeLimit = data.timeLimitMs / 1000;
    for (const p of data.participants) this.participants.set(p.id, p);
    this.order = data.participants.map((p) => p.id);
    for (const pk of data.pickups ?? []) this.pickups.set(pk.id, pk);
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

  /** Живих пілотів (соло) або живих команд (командні режими). */
  get aliveCount(): number {
    if (this.teamSize > 1) return new Set([...this.participants.values()].filter((p) => p.alive).map((p) => p.team)).size;
    let n = 0;
    for (const p of this.participants.values()) if (p.alive) n++;
    return n;
  }

  /** Розмір команди в цьому матчі (1 — кожен сам за себе). */
  teamSize = 1;

  get myTeam(): number | undefined {
    return this.self?.team;
  }

  /** Тіммейт — не ціль для своїх снарядів і завжди видно на радарі. */
  isAlly(id: string | null | undefined): boolean {
    if (!id || this.teamSize <= 1 || id === this.selfId) return false;
    const p = this.participants.get(id);
    return !!p && p.team === this.myTeam;
  }

  /** Чи одна команда в двох учасників (для снарядів, що летять від інших). */
  private sameTeam(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b || this.teamSize <= 1) return false;
    const pa = this.participants.get(a);
    const pb = this.participants.get(b);
    return !!pa && !!pb && pa.team === pb.team;
  }

  get timeLeft(): number {
    return Math.max(0, this.timeLimit - this.matchTime);
  }

  /** Що зараз на борту — переживе матч лише у переможця */
  get lootCoins(): number {
    return this.self?.lootCoins ?? 0;
  }

  get lootCrystals(): number {
    return this.self?.lootCrystals ?? 0;
  }

  private onPickupTaken(e: PickupTaken): void {
    const pk = this.pickups.get(e.id);
    this.pickups.delete(e.id);
    if (!pk) return;
    const color = pk.crystals > 0 && pk.coins === 0 ? ['#e2c2ff', '#b24fff'] : ['#fff1a8', '#ffd24a'];
    this.particles.emit(pk.x, pk.y, { count: pk.kind === 'pile' ? 30 : 8, speed: [40, 160], life: [0.2, 0.5], size: [2, 4], colors: [...color, '#ffffff'] });
    // зібране одразу видно в HUD, не чекаючи наступного стану з сервера
    const who = this.participants.get(e.by);
    if (who) {
      who.lootCoins += e.coins;
      who.lootCrystals += e.crystals;
    }
    if (e.by === this.selfId) {
      const parts = [e.coins ? `+${e.coins}` : '', e.crystals ? `+${e.crystals}◆` : ''].filter(Boolean).join(' ');
      this.texts.push({ x: pk.x, y: pk.y - 20, text: parts, t: 0, color: e.crystals && !e.coins ? '#d9a8ff' : '#ffd24a' });
      Sfx.pickup();
    }
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

  // ---------- сканер ----------

  /** Перезарядка сканера — однакова для всіх літаків (сервер перевіряє так само) */
  static readonly SCAN_COOLDOWN = 90;
  /** Скільки секунд позначки сканера лишаються на радарі */
  static readonly SCAN_SHOW = 8;
  scanCooldown = 0;
  /** Приблизні позиції інших гравців з останнього сканування (±5% карти) */
  scanBlips: { x: number; y: number; ally: boolean }[] = [];
  /** Скільки секунд тому було сканування (для анімації радара) */
  scanAge = Infinity;

  useScan(): void {
    if (!this.canAct || this.scanCooldown > 0) return;
    this.scanCooldown = PvpGame.SCAN_COOLDOWN;
    this.emitSkill('scan');
    Sfx.powerup();
  }

  useFlare(): void {
    if (!this.canAct || !this.skills.tryFlare()) return;
    this.emitSkill('flare');
    this.spawnFlares(this.selfId ?? '', this.player.pos.x, this.player.pos.y, this.aim);
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
          this.missiles.push({ pos, angle: ang, life: 2.2, remote: false, ownerId: this.selfId, source: 'swarm' });
        }
        break;
    }
  }

  // ---------- мережа ----------

  private onRemoteShot(s: ShotEvent): void {
    if (s.ownerId === this.selfId) return;
    const pos = new Vec2(s.x, s.y);
    if (s.kind === 'missile') {
      this.missiles.push({ pos, angle: s.angle, life: 2.2, remote: true, ownerId: s.ownerId, source: 'weapon' });
      return;
    }
    if (s.kind === 'laser') {
      const ray = this.raycast(s.x, s.y, s.angle, 760, s.ownerId);
      this.beams.push({ x1: s.x, y1: s.y, x2: s.x + Math.cos(s.angle) * ray.dist, y2: s.y + Math.sin(s.angle) * ray.dist, t: 0, hostile: true });
      if (Vec2.dist(pos, this.player.pos) < 900 && this.clock - this.lastShotSfx > 0.08) {
        this.lastShotSfx = this.clock;
        Sfx.laserZap();
      }
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
        this.spawnFlares(s.id, s.x, s.y, s.angle);
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
    this.scanCooldown = Math.max(0, this.scanCooldown - dt);
    this.scanAge += dt;
    if (this.scanAge > PvpGame.SCAN_SHOW) this.scanBlips = [];
    this.shake = Math.max(0, this.shake - dt * 30);

    if (this.canAct) {
      this.fly(dt);
      this.updateGun(dt);
      this.sendTimer -= dt;
      if (this.sendTimer <= 0) {
        this.sendTimer = SEND_EVERY;
        this.socket.emit('match:move', encodeMove({ x: this.player.pos.x, y: this.player.pos.y, angle: this.aim, firing: this.input.firing() }));
      }
    }

    this.flushDelayed();
    this.updateSmooth(dt);
    this.updateProjectiles(dt);
    this.updateMissiles(dt);
    this.updateFx(dt);
    this.updateCamera(dt);
  }

  /** Літак летить лише вперед: напрям керування задає курс, ніс розвертається дугою. */
  /** Курсор миші у координатах світу (камера по центру екрана). */
  private cursorWorld(): { x: number; y: number } | null {
    const v = this.input.pointerView();
    if (!v) return null;
    return { x: v.x - this.width / 2 + this.cameraX, y: v.y - this.height / 2 + this.cameraY };
  }

  private fly(dt: number): void {
    const p = this.player;
    const spec = p.spec;
    const axis = this.input.axis();
    const mag = Math.hypot(axis.x, axis.y);
    const boost = this.skills.isBoosted ? BOOST_MULTIPLIER : 1;
    const slow = this.slow > 0 ? SLOW_MUL : 1;

    // схема «миша»: курс — на курсор, літак весь час летить уперед
    const cursor = mouseSteering() ? this.cursorWorld() : null;
    if (spec.feature.noRotate) {
      // тарілка — без інерції і може рухатись у будь-який бік
      p.speedMultiplier = boost * slow;
      let move = axis;
      if (cursor) {
        const dx = cursor.x - p.pos.x;
        const dy = cursor.y - p.pos.y;
        const d = Math.hypot(dx, dy);
        move = d > 30 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
      }
      p.update(dt, move, this.worldW, this.worldH);
      if (p.vel.length() > 40) this.aim += angleDiff(this.aim, p.vel.angle()) * Math.min(1, dt * 10);
    } else {
      const turnRate = 2.4 + spec.accel / 2600;
      let want: number | null = cursor ? (Math.hypot(cursor.x - p.pos.x, cursor.y - p.pos.y) > 24 ? Math.atan2(cursor.y - p.pos.y, cursor.x - p.pos.x) : null) : mag > 0.2 ? Math.atan2(axis.y, axis.x) : null;
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
      const target = cursor || mag > 0.2 ? max : max * 0.55;
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
    // сумарний бонус скорострільності від предметів обмежено +80%
    this.gun.fireRateMul = Math.min(1.8, this.baseFireMul + (this.overdrive > 0 ? 0.7 : 0));
    if (this.overdrive > 0 && this.gun.cooldown > 0) this.gun.reset();
    const shots = this.gun.update(dt, this.input.firing());
    if (!shots) return;
    const pos = this.nose();
    const angle = this.aim + (Math.random() - 0.5) * 2 * (this.weapon.spread ?? 0);
    if (this.weapon.kind === 'laser') {
      this.fireLaser(pos, angle);
      return;
    }
    if (this.weapon.kind === 'missile') {
      const n = this.weapon.salvo ?? 3;
      for (let i = 0; i < n; i++) {
        const a = angle + (i - (n - 1) / 2) * 0.32;
        this.missiles.push({ pos: pos.clone(), angle: a, life: 2.2, remote: false, ownerId: this.selfId, source: 'weapon' });
        this.fire(pos.x, pos.y, a, 'missile');
      }
      this.muzzle(pos.x, pos.y, angle, true);
      Sfx.boost();
      return;
    }
    this.projectiles.push(new Projectile(this.weapon.kind as 'bullet' | 'rocket', pos, angle, this.weapon.projectileSpeed, this.weapon.damage, this.weapon.splashRadius ?? 0, false, this.selfId));
    this.fire(pos.x, pos.y, angle, this.weapon.kind);
    this.muzzle(pos.x, pos.y, angle, this.weapon.kind === 'rocket');
    if (this.weapon.kind === 'rocket') Sfx.bossShot();
    else if (this.clock - this.lastShotSfx > 0.06) {
      this.lastShotSfx = this.clock;
      Sfx.shot();
    }
  }

  /** Чужі літаки — інтерполяція між знімками сервера на момент "зараз − INTERP_DELAY_MS". */
  private updateSmooth(dt: number): void {
    const renderT = this.serverClock.now() - INTERP_DELAY_MS;
    for (const [id, p] of this.participants) {
      if (id === this.selfId) continue;
      let s = this.smooth.get(id);
      if (!s) {
        s = { x: p.pos.x, y: p.pos.y, a: p.angle };
        this.smooth.set(id, s);
      }
      const at = this.serverClock.ready ? this.buffers.get(id)?.at(renderT) : null;
      if (at) {
        s.x = at.x;
        s.y = at.y;
        s.a = at.a;
      } else {
        s.x = p.pos.x;
        s.y = p.pos.y;
        s.a = p.angle;
      }
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

  /** Час для пасток (мс, годинник клієнта) */
  private get flareNow(): number {
    return this.clock * 1000;
  }

  /** Пастки, що збивають снаряди цього власника (усіх, крім своїх і союзних). */
  private enemyFlares(ownerId: string | null): FlareBurst[] {
    return this.flares.filter((f) => f.ownerId !== ownerId && !this.sameTeam(f.ownerId, ownerId));
  }

  /** Снаряд (крок від a до b) влучив в іскру ворожої пастки — згорає з іскрами. */
  private intercepted(ownerId: string | null, ax: number, ay: number, bx: number, by: number): boolean {
    for (const f of this.enemyFlares(ownerId)) {
      const hit = hitsDecoy(f, this.flareNow, ax, ay, bx, by);
      if (!hit) continue;
      this.particles.emit(hit.x, hit.y, { count: 10, speed: [60, 200], life: [0.2, 0.45], size: [2, 4], colors: ['#ffffff', '#fff1a8', '#ff9a3a'] });
      return true;
    }
    return false;
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
      if (this.intercepted(this.selfId, pr.pos.x - pr.vel.x * dt, pr.pos.y - pr.vel.y * dt, pr.pos.x, pr.pos.y)) {
        pr.kill();
        continue;
      }
      for (const [id, p] of this.participants) {
        if (id === this.selfId || !p.alive || this.isAlly(id)) continue;
        if (p.phase) continue;
        const rp = this.renderPos(id)!;
        if (Math.hypot(pr.pos.x - rp.x, pr.pos.y - rp.y) < HIT_RADIUS + pr.radius) {
          pr.kill();
          this.impact(pr);
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.alive);

    // чужі снаряди — лише візуал (влучання й урон рахує сервер)
    for (const pr of this.remote) {
      pr.update(dt, world);
      if (!pr.alive) continue;
      if (this.hitsObstacle(pr.pos, pr.radius)) {
        pr.kill();
        continue;
      }
      if (this.intercepted(pr.ownerId, pr.pos.x - pr.vel.x * dt, pr.pos.y - pr.vel.y * dt, pr.pos.x, pr.pos.y)) {
        pr.kill();
        continue;
      }
      const ids = [...this.participants.keys()];
      if (this.selfId && !ids.includes(this.selfId)) ids.push(this.selfId);
      for (const id of ids) {
        if (id === pr.ownerId || this.sameTeam(id, pr.ownerId)) continue;
        const p = id === this.selfId ? null : this.participants.get(id);
        const alive = id === this.selfId ? this.selfAlive : !!p?.alive;
        if (!alive) continue;
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

  /** Вибух ракети — лише ефект (сплеш-урон рахує сервер). */
  private impact(pr: Projectile): void {
    if (pr.kind !== 'rocket') return;
    this.explosion(pr.pos.x, pr.pos.y, 0.7);
    this.ring(pr.pos.x, pr.pos.y, pr.splashRadius, '255,140,80', 0.35);
  }

  private updateMissiles(dt: number): void {
    for (const m of this.missiles) {
      m.life -= dt;
      // самонаведення на найближчого ворога в передньому секторі
      let best: { x: number; y: number } | null = null;
      let bestD = 900;
      for (const [id, p] of this.participants) {
        if (id === m.ownerId || !p.alive || this.sameTeam(id, m.ownerId)) continue;
        const rp = id === this.selfId ? this.player.pos : this.renderPos(id)!;
        const d = Math.hypot(rp.x - m.pos.x, rp.y - m.pos.y);
        if (d < bestD && Math.abs(angleDiff(m.angle, Math.atan2(rp.y - m.pos.y, rp.x - m.pos.x))) < 1.6) {
          bestD = d;
          best = rp;
        }
      }
      // теплові пастки: іскри приваблюють ракету сильніше за літак
      for (const f of this.enemyFlares(m.ownerId)) {
        const dec = nearestDecoy(f, this.flareNow, m.pos.x, m.pos.y);
        if (dec && dec.d * 0.6 < bestD && Math.abs(angleDiff(m.angle, Math.atan2(dec.y - m.pos.y, dec.x - m.pos.x))) < 1.6) {
          bestD = dec.d * 0.6;
          best = dec;
        }
      }
      if (best && m.life < 2.2) {
        const want = Math.atan2(best.y - m.pos.y, best.x - m.pos.x);
        m.angle += clamp(angleDiff(m.angle, want), -MISSILE_TURN * dt, MISSILE_TURN * dt);
      }
      const mx = m.pos.x;
      const my = m.pos.y;
      m.pos.add(Vec2.fromAngle(m.angle), MISSILE_SPEED * dt);
      if (this.intercepted(m.ownerId, mx, my, m.pos.x, m.pos.y)) {
        m.life = 0;
        this.explosion(m.pos.x, m.pos.y, 0.3);
        continue;
      }
      this.particles.emit(m.pos.x, m.pos.y, { count: 1, speed: [10, 40], angle: m.angle + Math.PI, spread: 0.4, life: [0.2, 0.4], size: [2, 4], colors: ['#fff1a8', '#ff8a3a', '#9a9aa8'], drag: 2 });
      if (this.hitsObstacle(m.pos, 4)) {
        m.life = 0;
        this.explosion(m.pos.x, m.pos.y, 0.4);
        continue;
      }
      for (const [id, p] of this.participants) {
        if (id === m.ownerId || !p.alive || this.sameTeam(id, m.ownerId)) continue;
        if (p.phase) continue;
        const rp = id === this.selfId ? this.player.pos : this.renderPos(id)!;
        if (Math.hypot(rp.x - m.pos.x, rp.y - m.pos.y) < HIT_RADIUS + 4) {
          m.life = 0;
          this.explosion(m.pos.x, m.pos.y, 0.4);
          break;
        }
      }
    }
    this.missiles = this.missiles.filter((m) => m.life > 0);
  }

  /**
   * Промінь до першої перешкоди або літака (з урахуванням пасток і фазового зсуву).
   * Повертає відстань і id цілі (якщо влучив у літак).
   */
  private raycast(x: number, y: number, angle: number, range: number, ownerId: string | null): { dist: number; targetId: string | null; blocked: boolean } {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hitAt = (cx: number, cy: number, r: number): number | null => {
      const fx = cx - x;
      const fy = cy - y;
      const along = fx * dx + fy * dy;
      if (along < 0) return null;
      const perp2 = fx * fx + fy * fy - along * along;
      if (perp2 > r * r) return null;
      return along - Math.sqrt(r * r - perp2);
    };
    let best = range;
    let targetId: string | null = null;
    let blocked = false;
    for (const o of this.obstacles) {
      const d = hitAt(o.x, o.y, o.r);
      if (d !== null && d < best) best = d;
    }
    const ids = new Set([...this.participants.keys()]);
    if (this.selfId) ids.add(this.selfId);
    for (const id of ids) {
      if (id === ownerId || this.sameTeam(id, ownerId)) continue;
      const self = id === this.selfId;
      const p = self ? null : this.participants.get(id);
      if (self ? !this.selfAlive : !p?.alive) continue;
      if (self ? this.phase > 0 : p?.phase) continue;
      const rp = this.renderPos(id);
      if (!rp) continue;
      const d = hitAt(rp.x, rp.y, HIT_RADIUS);
      if (d !== null && d < best) {
        best = d;
        targetId = id;
        blocked = false;
      }
    }
    for (const f of this.enemyFlares(ownerId)) {
      const d = rayDecoy(f, this.flareNow, x, y, dx, dy);
      if (d !== null && d < best) {
        best = d;
        targetId = null;
        blocked = true;
      }
    }
    return { dist: Math.max(0, best), targetId, blocked };
  }

  private fireLaser(from: Vec2, angle: number): void {
    const ray = this.raycast(from.x, from.y, angle, this.weapon.range ?? 760, this.selfId);
    const x2 = from.x + Math.cos(angle) * ray.dist;
    const y2 = from.y + Math.sin(angle) * ray.dist;
    this.beams.push({ x1: from.x, y1: from.y, x2, y2, t: 0, hostile: false });
    this.fire(from.x, from.y, angle, 'laser');
    this.particles.emit(x2, y2, { count: ray.blocked ? 4 : 2, speed: [30, 120], life: [0.1, 0.25], size: [2, 3], colors: ray.blocked ? ['#fff1a8', '#ff9a3a'] : ['#ffffff', '#ff5ad0', '#c070ff'] });
    if (this.clock - this.lastShotSfx > 0.08) {
      this.lastShotSfx = this.clock;
      Sfx.laserZap();
    }
  }

  private updateFx(dt: number): void {
    this.particles.update(dt);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < 0.09);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const t of this.texts) {
      t.t += dt;
      t.y -= 40 * dt;
    }
    this.texts = this.texts.filter((t) => t.t < 0.9);
    // шлейф диму за кожною іскрою, поки горить
    const fnow = this.flareNow;
    for (const f of this.flares) {
      const age = fnow - f.t0;
      if (age > FLARE_ACTIVE_MS + FLARE_FADE_MS) continue;
      for (let i = 0; i < DECOY_COUNT; i++) {
        if (Math.random() > 0.55) continue;
        const pos = decoyPos(f, i, age);
        this.particles.emit(pos.x, pos.y, { count: 1, speed: [5, 25], life: [0.3, 0.6], size: [2, 3.5], colors: age < FLARE_ACTIVE_MS ? ['#fff1a8', '#ff9a3a', '#c8c0d8'] : ['#8a8496', '#5a5468'], drag: 1 });
      }
    }
    this.flares = this.flares.filter((f) => fnow - f.t0 < FLARE_ACTIVE_MS + FLARE_FADE_MS);
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

  /** Пастки: віяло іскор назад від літака (та сама формула, що й на сервері). */
  private spawnFlares(ownerId: string, x: number, y: number, angle: number): void {
    this.flares.push({ ownerId, x, y, angle, t0: this.flareNow });
    this.particles.emit(x - Math.cos(angle) * 18, y - Math.sin(angle) * 18, { count: 14, speed: [60, 180], angle: angle + Math.PI, spread: 1.4, life: [0.15, 0.35], size: [2, 4], colors: ['#ffffff', '#fff1a8', '#ffb050'] });
  }

  /** Мітки на радарі: чужі кораблі видно лише поки стріляють (і трохи після). */
  radarContacts(): { id: string; x: number; y: number; isSelf: boolean; ally?: boolean }[] {
    // lastFiredAt — у мс від старту матчу, як і годинник сервера
    const now = this.serverClock.now();
    const out: { id: string; x: number; y: number; isSelf: boolean; ally?: boolean }[] = [];
    if (this.selfId && this.selfAlive) out.push({ id: this.selfId, x: this.player.pos.x, y: this.player.pos.y, isSelf: true });
    for (const [id, p] of this.participants) {
      if (id === this.selfId || !p.alive) continue;
      if (this.isAlly(id)) out.push({ id, x: p.pos.x, y: p.pos.y, isSelf: false, ally: true });
      else if (p.firing || now - p.lastFiredAt < RADAR_VISIBLE_AFTER_FIRE_MS) out.push({ id, x: p.pos.x, y: p.pos.y, isSelf: false });
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
    this.renderPickups(ctx);

    for (const f of this.flares) {
      const age = this.flareNow - f.t0;
      const k = age < FLARE_ACTIVE_MS ? 1 : Math.max(0, 1 - (age - FLARE_ACTIVE_MS) / FLARE_FADE_MS);
      if (k <= 0) continue;
      for (let i = 0; i < DECOY_COUNT; i++) {
        const pos = decoyPos(f, i, age);
        const flicker = 0.8 + Math.sin(this.clock * 40 + i * 1.7) * 0.2;
        drawGlow(ctx, pos.x, pos.y, 'rgba(255,190,90,1)', 18 * k * flicker, 0.85 * k);
        ctx.fillStyle = `rgba(255,250,225,${k})`;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 2.6 * k + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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
      if (this.slow > 0) this.renderSlow(ctx, this.player.pos.x, this.player.pos.y);
      const me = this.self;
      if (me) this.renderNick(ctx, me.nickname, this.player.pos.x, this.player.pos.y - 40, '220,235,255');
      // приціл — туди, куди полетять кулі
      const ch = Save.data.settings.crosshair;
      if (ch.enabled && this.state !== 'ended') drawCrosshair(ctx, this.player.pos.x + Math.cos(this.aim) * ch.distance, this.player.pos.y + Math.sin(this.aim) * ch.distance, this.aim, ch);
    }

    for (const pr of this.projectiles) pr.render(ctx, this.clock);
    for (const pr of this.remote) pr.render(ctx, this.clock);
    for (const m of this.missiles) this.renderMissile(ctx, m);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      const k = 1 - b.t / 0.09;
      ctx.strokeStyle = b.hostile ? `rgba(255,70,90,${0.45 * k})` : `rgba(200,90,255,${0.45 * k})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

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

  private renderPickups(ctx: CanvasRenderingContext2D): void {
    const l = this.cameraX - this.width / 2 - 60;
    const r = this.cameraX + this.width / 2 + 60;
    const t = this.cameraY - this.height / 2 - 60;
    const b = this.cameraY + this.height / 2 + 60;
    for (const pk of this.pickups.values()) {
      if (pk.x < l || pk.x > r || pk.y < t || pk.y > b) continue;
      const bob = Math.sin(this.clock * 3 + pk.id) * 3;
      const x = pk.x;
      const y = pk.y + bob;
      if (pk.kind === 'coin') {
        drawGlow(ctx, x, y, 'rgba(255,210,74,1)', 20, 0.5);
        const sx = Math.abs(Math.cos(this.clock * 3 + pk.id));
        ctx.fillStyle = '#ffd24a';
        ctx.strokeStyle = '#a8740a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, 9 * Math.max(0.25, sx), 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (pk.kind === 'crystal') {
        drawGlow(ctx, x, y, 'rgba(178,79,255,1)', 24, 0.6);
        ctx.fillStyle = '#b77bff';
        ctx.strokeStyle = '#3a145a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.lineTo(x + 8, y - 2);
        ctx.lineTo(x, y + 12);
        ctx.lineTo(x - 8, y - 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(x - 2, y - 7, 3, 6);
      } else {
        // купа луту збитого літака — велика, пульсує, з підписом суми
        const pulse = 1 + Math.sin(this.clock * 5) * 0.08;
        drawGlow(ctx, x, y, 'rgba(255,200,80,1)', 46 * pulse, 0.7);
        if (pk.crystals) drawGlow(ctx, x, y, 'rgba(178,79,255,1)', 30 * pulse, 0.5);
        for (let i = 0; i < 6; i++) {
          const a = i * 1.05 + this.clock;
          ctx.fillStyle = i % 3 === 0 && pk.crystals ? '#b77bff' : '#ffd24a';
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 12, y + Math.sin(a) * 8, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.font = '700 13px Bungee, sans-serif';
        ctx.textAlign = 'center';
        const label = [pk.coins ? `${pk.coins}` : '', pk.crystals ? `${pk.crystals}◆` : ''].filter(Boolean).join('  ');
        ctx.fillStyle = 'rgba(10,9,24,0.9)';
        ctx.fillText(label, x + 1, y - 25);
        ctx.fillStyle = '#ffe27a';
        ctx.fillText(label, x, y - 26);
      }
    }
  }

  private renderObstacles(ctx: CanvasRenderingContext2D): void {
    const viewL = this.cameraX - this.width / 2 - 120;
    const viewR = this.cameraX + this.width / 2 + 120;
    const viewT = this.cameraY - this.height / 2 - 120;
    const viewB = this.cameraY + this.height / 2 + 120;
    this.obstacles.forEach((o, i) => {
      if (o.x + o.r < viewL || o.x - o.r > viewR || o.y + o.r < viewT || o.y - o.r > viewB) return;
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(i * 1.7 + this.clock * 0.05 * (i % 2 ? 1 : -1));
      drawAsteroid(ctx, o.r > 70 ? 'boss' : 'large', i, o.r * 2.25);
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
    if (p.slowed) this.renderSlow(ctx, x, y);

    // ім'я і смужка HP над ворогом
    const pct = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = 'rgba(10,9,24,0.8)';
    ctx.fillRect(x - 26, y - 44, 52, 6);
    const ally = this.isAlly(p.id);
    ctx.fillStyle = ally ? '#4fe08a' : pct > 0.4 ? '#ff6a6a' : '#ff2a4a';
    ctx.fillRect(x - 25, y - 43, 50 * pct, 4);
    if (ally) {
      ctx.strokeStyle = 'rgba(79,224,138,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.renderNick(ctx, p.nickname, x, y - 50, ally ? '168,255,200' : '255,190,190');
    if (p.lootCoins || p.lootCrystals) {
      ctx.font = '600 11px Bungee, sans-serif';
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(`${p.lootCoins}${p.lootCrystals ? `  ${p.lootCrystals}◆` : ''}`, x, y - 66);
    }
  }

  /** Нікнейм над літаком: дрібно й напівпрозоро, щоб не заважав бачити бій. */
  private renderNick(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, rgb: string): void {
    ctx.font = '600 10px Onest, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(6,5,16,0.45)';
    ctx.fillText(name, x + 1, y + 1);
    ctx.fillStyle = `rgba(${rgb},0.62)`;
    ctx.fillText(name, x, y);
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
