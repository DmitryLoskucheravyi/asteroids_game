import { StateEncoder, encodeShot, type NetState } from '../shared/netcodec.js';
import { HazardSystem } from './hazards.js';
import { driftPos, obstacleHp, windAt, type HazardKind } from '../shared/hazards.js';
import { FLARE_ACTIVE_MS, FLARE_COOLDOWN_MS, hitsDecoy, nearestDecoy, rayDecoy, type FlareBurst } from '../shared/flares.js';
import { getWeaponDef, DEFAULT_WEAPON_ID, PROJECTILE_RANGE } from '../content/weapons.js';
import { getItemDef, type ItemMeta } from '../content/items.js';
import { PLANE_IDS, planeCombat } from '../content/planes.js';
import { updateBot } from './bot.js';
import type { LeaverPayload, MatchResultsPayload } from './results.js';
import {
  ROOM_SIZE,
  WORLD_W,
  WORLD_H,
  TICK_MS,
  TICK_HZ,
  MAX_REWIND_MS,
  HISTORY_MS,
  CLIENT_INTERP_MS,
  MISSILE_SPEED,
  SCAN_COOLDOWN_MS,
  SCAN_ERROR,
  MISSILE_TURN,
  MISSILE_LIFE,
  MAX_MOVE_SPEED,
  JUMP_ALLOWANCE,
  COUNTDOWN_MS,
  MATCH_TIME_LIMIT_MS,
  HIT_RADIUS,
  matchReward,
  MODE_SPEC,
  scaledPlace,
  type QueueMode,
  rollPlaceCrate,
  PICKUP_START,
  PICKUP_MAX,
  PICKUP_SPAWN_MS,
  PICKUP_RADIUS,
  CRYSTAL_CHANCE,
} from './constants.js';
import { botStrength, rankDelta } from '../content/ranks.js';
import type { Participant, Obstacle, MatchState, PublicParticipant, MatchResultEntry, ServerProjectile, SkillKind, Pickup } from './types.js';

const BOT_NAMES = ['Вихор', 'Корсар', 'Немезида', 'Беркут', 'Скорпіон', 'Фантом-7', 'Ренегат', 'Сокира'];
let botSeq = 0;

export interface Entrant {
  /** Id учасника в матчі (його ж бачить клієнт як selfId) */
  pid: string;
  userId: string;
  nickname: string;
  planeId: string;
  weaponId: string;
  tier: number;
  level: number;
  activeDefId: string | null;
  passiveDefId: string | null;
  rankPoints: number;
  /** Група (паті): усі її учасники потрапляють в одну команду */
  groupId?: string | null;
}

/**
 * Транспорт кімнати. Кімната не знає, чи це WebSocket, socket.io чи тест: бінарні пакети (Uint8Array)
 * і JSON-події просто віддаються сюди; except — не слати автору (він уже показав ефект у себе).
 */
export interface RoomNet {
  broadcast(event: string, data: unknown, except?: string): void;
  send(pid: string, event: string, data: unknown): void;
}

/** Зовнішній світ кімнати: присутність гравців і запис результатів — справа інших сервісів. */
export interface RoomHooks {
  setInMatch(userId: string, inMatch: boolean): void;
  results(payload: MatchResultsPayload): void;
  leaver(payload: LeaverPayload): void;
}

/** Скільки чекаємо, поки всі гравці підʼєднаються до ігрового сервера, перш ніж почати відлік */
const CONNECT_GRACE_MS = 6000;

/** Гравець не стріляв і майже не рухався весь матч — ферма/AFK. */
const isIdle = (p: Participant): boolean => !p.isBot && p.shots === 0 && p.travelled < 400;

function randPos(): { x: number; y: number } {
  return { x: 200 + Math.random() * (WORLD_W - 400), y: 200 + Math.random() * (WORLD_H - 400) };
}

function makeObstacles(): Obstacle[] {
  const list: Obstacle[] = [];
  for (let i = 0; i < 70; i++) {
    const pos = randPos();
    const r = 30 + Math.random() * 70;
    // великі дрейфують повільніше
    const sp = 10 + Math.random() * 25 * (60 / r);
    const a = Math.random() * Math.PI * 2;
    const hp = obstacleHp(r);
    list.push({ id: i, x: pos.x, y: pos.y, x0: pos.x, y0: pos.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r, hp, maxHp: hp });
  }
  return list;
}

/** Найменша відстань від точки (cx,cy) до відрізка (ax,ay)-(bx,by). */
function segDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const k = len2 > 0 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2)) : 0;
  return Math.hypot(ax + dx * k - cx, ay + dy * k - cy);
}

function makeParticipant(base: Pick<Participant, 'id' | 'userId' | 'isBot' | 'nickname' | 'planeId' | 'tier' | 'level' | 'weaponId'>, active: ItemMeta | null, passive: ItemMeta | null, pos: { x: number; y: number }): Participant {
  const combat = planeCombat(base.planeId, base.tier, base.level);
  const hp = Math.round(combat.hp + (passive?.combat?.hp ?? 0));
  return {
    ...base,
    activeItem: active,
    passiveItem: passive,
    // бонус урону дають обидва предмети — і пасив, і актив
    damageMul: combat.damageMul * (1 + (passive?.combat?.damage ?? 0) + (active?.combat?.damage ?? 0)),
    fireRateMul: 1 + (passive?.combat?.fireRate ?? 0),
    cooldownMul: 1 - (passive?.combat?.cooldown ?? 0),
    pos,
    angle: Math.atan2(WORLD_H / 2 - pos.y, WORLD_W / 2 - pos.x),
    firing: false,
    lastFiredAt: 0,
    hp,
    maxHp: hp,
    alive: true,
    kills: 0,
    place: null,
    flareUntil: 0,
    phaseUntil: 0,
    slowUntil: 0,
    lastFlareAt: -Infinity,
    lastItemAt: -Infinity,
    lastScanAt: -Infinity,
    shotTokens: 0,
    shotTokensAt: 0,
    moveBudget: 0,
    lastMoveAt: 0,
    lastJumpAt: 0,
    lootCoins: 0,
    lootCrystals: 0,
    rankPoints: 0,
    shots: 0,
    travelled: 0,
    damageDealt: 0,
    team: 0,
    teamPlace: null,
    diedAt: 0,
  };
}

/** Найкоротша різниця кутів (−π..π). */
const angDiff = (from: number, to: number): number => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

export class Room {
  readonly id: string;
  state: MatchState = 'countdown';
  private participants = new Map<string, Participant>();
  /** Учасники-люди, що зараз підʼєднані */
  private conns = new Set<string>();
  /** Перешкоди арени: метеорити + івент режиму */
  readonly hz: HazardSystem;
  private countdownAt = 0;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private obstacles: Obstacle[];
  private projectiles: ServerProjectile[] = [];
  private pickups = new Map<number, Pickup>();
  private pickupSeq = 0;
  private lastPickupSpawn = 0;
  private startedAt = Date.now();
  private tickHandle: ReturnType<typeof setTimeout> | null = null;
  private ended = false;
  onClose: () => void = () => {};
  private readonly teamSize: number;
  private readonly teams: number;
  private teamSpawns: { x: number; y: number }[] = [];

  constructor(
    id: string,
    private readonly net: RoomNet,
    entrants: Entrant[],
    readonly mode: QueueMode = 'casual',
    private readonly hooks: RoomHooks,
  ) {
    this.id = id;
    this.hz = new HazardSystem(mode, {
      planes: () => [...this.participants.values()].filter((p) => p.alive),
      obstacles: () => this.obstacles,
      broadcast: (event, data) => this.net.broadcast(event, data),
      envDamage: (target, damage, kind) => this.applyEnvDamage(target, damage, kind, Date.now()),
      dropPile: (x, y, coins, crystals) => {
        const pile: Pickup = { id: ++this.pickupSeq, kind: 'pile', x, y, coins, crystals };
        this.pickups.set(pile.id, pile);
        this.net.broadcast('match:pickup-spawn', pile);
      },
    });
    const { teamSize, roomSize } = MODE_SPEC[mode];
    this.teamSize = teamSize;
    this.teams = roomSize / teamSize;
    const avgRp = entrants.reduce((s, e) => s + e.rankPoints, 0) / Math.max(1, entrants.length);
    const botLevel = mode !== 'casual' ? botStrength(avgRp) : null;
    this.obstacles = makeObstacles();
    // точки збору команд — рівномірно по колу арени, тіммейти спавняться поруч
    this.teamSpawns = Array.from({ length: this.teams }, (_, i) => {
      const a = (i / this.teams) * Math.PI * 2 + Math.random() * 0.4;
      return { x: WORLD_W / 2 + Math.cos(a) * WORLD_W * 0.36, y: WORLD_H / 2 + Math.sin(a) * WORLD_H * 0.36 };
    });
    // розподіл по командах: групи цілком у вільну команду, одинаки — туди, де найменше людей, решту добирають боти
    const teamFill = Array.from({ length: this.teams }, () => 0);
    const teamOf = new Map<Entrant, number>();
    const groups = new Map<string, Entrant[]>();
    for (const e of entrants) if (e.groupId && this.teamSize > 1) groups.set(e.groupId, [...(groups.get(e.groupId) ?? []), e]);
    for (const members of [...groups.values()].sort((x, y) => y.length - x.length)) {
      const team = teamFill.findIndex((n) => n + members.length <= this.teamSize);
      const t = team >= 0 ? team : teamFill.indexOf(Math.min(...teamFill));
      for (const m of members) teamOf.set(m, t);
      teamFill[t] += members.length;
    }
    for (const e of entrants) {
      if (teamOf.has(e)) continue;
      let t = 0;
      for (let i = 1; i < this.teams; i++) if (teamFill[i] < teamFill[t]) t = i;
      teamOf.set(e, t);
      teamFill[t]++;
    }
    const nextBotTeam = (): number => {
      let t = 0;
      for (let i = 1; i < this.teams; i++) if (teamFill[i] < teamFill[t]) t = i;
      teamFill[t]++;
      return t;
    };

    for (const e of entrants) {
      const active = e.activeDefId ? getItemDef(e.activeDefId) ?? null : null;
      const passive = e.passiveDefId ? getItemDef(e.passiveDefId) ?? null : null;
      const p = makeParticipant(
        {
          id: e.pid,
          userId: e.userId,
          isBot: false,
          nickname: e.nickname,
          planeId: e.planeId,
          tier: e.tier,
          level: e.level,
          weaponId: getWeaponDef(e.weaponId) ? e.weaponId : DEFAULT_WEAPON_ID,
        },
        active?.slot === 'active' ? active : null,
        passive?.slot === 'passive' ? passive : null,
        { x: 0, y: 0 },
      );
      p.team = teamOf.get(e)!;
      p.pos = this.spawnFor(p.team);
      p.angle = Math.atan2(WORLD_H / 2 - p.pos.y, WORLD_W / 2 - p.pos.x);
      p.rankPoints = e.rankPoints;
      this.participants.set(p.id, p);
      this.hooks.setInMatch(e.userId, true);
    }

    while (this.participants.size < roomSize) {
      const botId = `bot-${++botSeq}`;
      const p = makeParticipant(
        {
          id: botId,
          userId: null,
          isBot: true,
          nickname: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
          planeId: PLANE_IDS[Math.floor(Math.random() * PLANE_IDS.length)],
          // у рейтинговому боти сильніші відповідно до рангу гравців
          tier: botLevel ? botLevel.tier : 1 + Math.floor(Math.random() * 3),
          level: botLevel ? botLevel.level : 1 + Math.floor(Math.random() * 4),
          weaponId: (() => {
            const r = Math.random();
            return r < 0.25 ? 'rocket_launcher' : r < 0.45 ? 'laser' : 'machine_gun';
          })(),
        },
        Math.random() < 0.35 ? getItemDef('nano_repair')! : null,
        null,
        { x: 0, y: 0 },
      );
      p.team = nextBotTeam();
      p.pos = this.spawnFor(p.team);
      p.angle = Math.atan2(WORLD_H / 2 - p.pos.y, WORLD_W / 2 - p.pos.x);
      p.botState = 'patrol';
      p.botTimer = 0;
      // у рейтинговому бот має правдоподібний рейтинг поруч із гравцями (для емблеми на екрані завантаження)
      if (mode !== 'casual') p.rankPoints = Math.max(0, Math.round(avgRp + (Math.random() - 0.5) * 300));
      this.participants.set(botId, p);
    }

    for (let i = 0; i < PICKUP_START; i++) this.spawnPickup(false);

    this.order = [...this.participants.keys()];
    this.order.forEach((pid, i) => this.orderIndex.set(pid, i));
    // відлік — коли підʼєднались усі гравці (або минув запас часу)
    this.graceTimer = setTimeout(() => this.startCountdown(), CONNECT_GRACE_MS);
  }

  /** Людей у кімнаті за складом (підʼєднаних чи ні) */
  get humanIds(): string[] {
    return [...this.participants.values()].filter((p) => !p.isBot).map((p) => p.id);
  }

  /** Гравець підʼєднався (вперше чи після обриву) — шлемо йому повний стан матчу. */
  attach(pid: string): boolean {
    const p = this.participants.get(pid);
    if (!p || p.isBot || this.ended) return false;
    this.conns.add(pid);
    const now = Date.now();
    const countdownLeft = this.countdownAt ? Math.max(0, COUNTDOWN_MS - (now - this.countdownAt)) : COUNTDOWN_MS;
    this.net.send(pid, 'match:init', {
      roomId: this.id,
      selfId: pid,
      world: { w: WORLD_W, h: WORLD_H },
      obstacles: this.obstacles.map((o) => ({ id: o.id, x: o.x0, y: o.y0, r: o.r, vx: o.vx, vy: o.vy, hp: o.hp, maxHp: o.maxHp })),
      participants: this.publicList(now),
      countdownMs: countdownLeft,
      mode: this.mode,
      teamSize: this.teamSize,
      timeLimitMs: MATCH_TIME_LIMIT_MS,
      pickups: [...this.pickups.values()],
      event: this.hz.event,
      hazards: this.hz.snapshot(),
    });
    if (this.state === 'active') {
      this.net.send(pid, 'match:start', { startedAt: this.startedAt });
      this.encoder.forceKeyframe();
    } else if (!this.countdownAt && this.humanIds.every((id) => this.conns.has(id))) this.startCountdown();
    return true;
  }

  private startCountdown(): void {
    if (this.countdownAt || this.ended) return;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.countdownAt = Date.now();
    // хто так і не підʼєднався — вибуває без штрафу (міг не встигнути через мережу)
    for (const id of this.humanIds) {
      if (this.conns.has(id)) continue;
      const p = this.participants.get(id)!;
      p.alive = false;
      p.diedAt = Date.now();
      if (p.userId) this.hooks.setInMatch(p.userId, false);
    }
    if (!this.hasRealPlayers()) {
      this.destroy();
      return;
    }
    setTimeout(() => this.begin(), COUNTDOWN_MS);
  }

  /** Спавн біля точки збору команди, але не в перешкоді. */
  private spawnFor(team: number): { x: number; y: number } {
    if (this.teamSize === 1) return this.spawnPos();
    const c = this.teamSpawns[team];
    for (let i = 0; i < 20; i++) {
      const pos = { x: Math.max(80, Math.min(WORLD_W - 80, c.x + (Math.random() - 0.5) * 300)), y: Math.max(80, Math.min(WORLD_H - 80, c.y + (Math.random() - 0.5) * 300)) };
      if (this.obstacles.every((o) => Math.hypot(pos.x - o.x, pos.y - o.y) > o.r + 40)) return pos;
    }
    return { ...c };
  }

  private sameTeam(a: Participant, b: Participant): boolean {
    return this.teamSize > 1 && a.team === b.team;
  }

  /** Спавн подалі від перешкод та інших учасників. */
  private spawnPos(): { x: number; y: number } {
    let best = randPos();
    let bestScore = -Infinity;
    for (let i = 0; i < 24; i++) {
      const c = randPos();
      let score = Infinity;
      for (const o of this.obstacles) score = Math.min(score, Math.hypot(c.x - o.x, c.y - o.y) - o.r - 40);
      for (const p of this.participants.values()) score = Math.min(score, Math.hypot(c.x - p.pos.x, c.y - p.pos.y) / 4);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private begin(): void {
    if (this.ended) return;
    this.state = 'active';
    this.startedAt = Date.now();
    this.net.broadcast('match:start', { startedAt: this.startedAt });
    this.nextTickAt = Date.now() + TICK_MS;
    this.schedule();
  }

  /**
   * Рівний такт: setInterval у Node "пливе" (особливо на Windows з точністю таймера ~15 мс),
   * тому плануємо кожен тік до абсолютного часу й наздоганяємо пропущені (не більше 3 за раз).
   */
  private nextTickAt = 0;
  private schedule(): void {
    if (this.ended) return;
    this.tickHandle = setTimeout(() => {
      let n = 0;
      while (Date.now() >= this.nextTickAt && n < 3 && !this.ended) {
        const t0 = performance.now();
        this.tick();
        const ms = performance.now() - t0;
        this.metrics.ticks++;
        this.metrics.tickMsTotal += ms;
        this.metrics.tickMsMax = Math.max(this.metrics.tickMsMax, ms);
        this.nextTickAt += TICK_MS;
        n++;
      }
      if (Date.now() > this.nextTickAt + TICK_MS * 3) this.nextTickAt = Date.now() + TICK_MS;
      this.schedule();
    }, Math.max(0, this.nextTickAt - Date.now()));
  }

  /** Кодувальник дельт стану і порядок учасників (індекс = позиція в match:init) */
  private readonly encoder = new StateEncoder(TICK_HZ);
  private order: string[] = [];
  private readonly orderIndex = new Map<string, number>();
  /** Метрики кімнати: байти, розіслані клієнтам, і кількість тіків */
  readonly metrics = { bytesOut: 0, ticks: 0, tickMsTotal: 0, tickMsMax: 0 };

  private indexOf(id: string): number {
    return this.orderIndex.get(id) ?? 255;
  }

  /** Розсилка всім у кімнаті з обліком трафіку. */
  private broadcast(event: string, payload: Uint8Array): void {
    this.metrics.bytesOut += payload.byteLength * this.conns.size;
    this.net.broadcast(event, payload);
  }

  private netStates(now: number): NetState[] {
    return this.order.map((id) => {
      const p = this.participants.get(id)!;
      return {
        x: p.pos.x,
        y: p.pos.y,
        angle: p.angle,
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        firing: p.firing,
        flare: now < p.flareUntil,
        phase: now < p.phaseUntil,
        slowed: now < p.slowUntil,
        kills: p.kills,
        lootCoins: p.lootCoins,
        lootCrystals: p.lootCrystals,
        lastFiredAt: p.lastFiredAt && this.startedAt ? Math.max(1, p.lastFiredAt - this.startedAt) : 0,
      };
    });
  }

  private publicList(now: number): PublicParticipant[] {
    return [...this.participants.values()].map((p) => ({
      id: p.id,
      isBot: p.isBot,
      nickname: p.nickname,
      planeId: p.planeId,
      tier: p.tier,
      level: p.level,
      pos: p.pos,
      angle: p.angle,
      firing: p.firing,
      lastFiredAt: 0,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      kills: p.kills,
      flare: now < p.flareUntil,
      phase: now < p.phaseUntil,
      slowed: now < p.slowUntil,
      lootCoins: p.lootCoins,
      lootCrystals: p.lootCrystals,
      rankPoints: p.rankPoints,
      team: p.team,
    }));
  }

  /** Випадкова монета/кристал у вільному від перешкод місці. */
  private spawnPickup(announce = true): void {
    let pos = { x: 0, y: 0 };
    for (let i = 0; i < 12; i++) {
      pos = { x: 120 + Math.random() * (WORLD_W - 240), y: 120 + Math.random() * (WORLD_H - 240) };
      if (this.obstacles.every((o) => Math.hypot(pos.x - o.x, pos.y - o.y) > o.r + 40)) break;
    }
    const crystal = Math.random() < CRYSTAL_CHANCE;
    const p: Pickup = { id: ++this.pickupSeq, kind: crystal ? 'crystal' : 'coin', ...pos, coins: crystal ? 0 : 10 + Math.floor(Math.random() * 16), crystals: crystal ? 1 + (Math.random() < 0.25 ? 1 : 0) : 0 };
    this.pickups.set(p.id, p);
    if (announce) this.net.broadcast('match:pickup-spawn', p);
  }

  /** Збитий літак лишає на місці все, що встиг зібрати. */
  private dropLoot(p: Participant): void {
    if (p.lootCoins <= 0 && p.lootCrystals <= 0) return;
    const pile: Pickup = { id: ++this.pickupSeq, kind: 'pile', x: p.pos.x, y: p.pos.y, coins: p.lootCoins, crystals: p.lootCrystals };
    p.lootCoins = 0;
    p.lootCrystals = 0;
    this.pickups.set(pile.id, pile);
    this.net.broadcast('match:pickup-spawn', pile);
  }

  private collectPickups(now: number): void {
    if (now - this.lastPickupSpawn > PICKUP_SPAWN_MS && this.pickups.size < PICKUP_MAX) {
      this.lastPickupSpawn = now;
      this.spawnPickup();
    }
    for (const p of this.participants.values()) {
      if (!p.alive) continue;
      for (const pk of this.pickups.values()) {
        if (Math.hypot(pk.x - p.pos.x, pk.y - p.pos.y) > PICKUP_RADIUS + (pk.kind === 'pile' ? 14 : 0)) continue;
        p.lootCoins += pk.coins;
        p.lootCrystals += pk.crystals;
        this.pickups.delete(pk.id);
        this.net.broadcast('match:pickup-taken', { id: pk.id, by: p.id, coins: pk.coins, crystals: pk.crystals });
      }
    }
  }

  /** Розсилка всім у кімнаті, крім автора (він уже показав ефект локально). */
  private relay(fromId: string, event: string, data: unknown): void {
    if (data instanceof Uint8Array) this.metrics.bytesOut += data.byteLength * Math.max(0, this.conns.size - 1);
    this.net.broadcast(event, data, fromId);
  }

  onMove(socketId: string, pos: { x: number; y: number }, angle: number, firing: boolean): void {
    const p = this.participants.get(socketId);
    if (!p || !p.alive || this.state !== 'active') return;
    if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number' || !Number.isFinite(angle)) return;
    let nx = Math.max(0, Math.min(WORLD_W, pos.x));
    let ny = Math.max(0, Math.min(WORLD_H, pos.y));
    // анти-чит: бюджет переміщення поповнюється з часом (запас — чверть секунди, після ривка — плюс ривок);
    // що понад бюджет — обрізаємо, тож "телепорт" чи спідхак на сервері не працюють
    const now = Date.now();
    const cap = MAX_MOVE_SPEED * 0.25 + (now - p.lastJumpAt < 600 ? JUMP_ALLOWANCE : 0);
    p.moveBudget = Math.min(cap, p.moveBudget + ((now - (p.lastMoveAt || now)) / 1000) * MAX_MOVE_SPEED);
    p.lastMoveAt = now;
    const dist = Math.hypot(nx - p.pos.x, ny - p.pos.y);
    if (dist > p.moveBudget + 1) {
      const k = p.moveBudget / dist;
      nx = p.pos.x + (nx - p.pos.x) * k;
      ny = p.pos.y + (ny - p.pos.y) * k;
    }
    p.moveBudget = Math.max(0, p.moveBudget - Math.min(dist, p.moveBudget));
    p.travelled += Math.min(200, Math.hypot(nx - p.pos.x, ny - p.pos.y));
    p.pos.x = nx;
    p.pos.y = ny;
    p.angle = angle;
    p.firing = !!firing;
  }

  /**
   * Гравець вистрілив. Сервер перевіряє зброю й темп, сам симулює снаряд і сам вирішує, у кого він влучив.
   * Компенсація лагу: цілі перевіряються там, де їх бачив стрілець (viewT), але не далі MAX_REWIND_MS назад.
   */
  onShot(socketId: string, data: { x: number; y: number; angle: number; kind: string; viewT?: number }): void {
    const p = this.participants.get(socketId);
    if (!p || !p.alive || this.state !== 'active') return;
    if (![data?.x, data?.y, data?.angle].every((n) => typeof n === 'number' && Number.isFinite(n))) return;
    const def = getWeaponDef(p.weaponId) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
    // тип снаряда — лише той, що в зброї гравця
    if (data.kind !== def.kind) return;
    const now = Date.now();
    // темп: token bucket на основі скорострільності зброї (з запасом на форсаж і нерівну доставку)
    const perSec = def.fireRate * (def.salvo ?? 1) * p.fireRateMul * 1.6;
    p.shotTokens = Math.min(perSec + (def.salvo ?? 1) + 2, (p.shotTokensAt ? p.shotTokens + ((now - p.shotTokensAt) / 1000) * perSec : perSec));
    p.shotTokensAt = now;
    if (p.shotTokens < 1) return;
    p.shotTokens -= 1;
    // точка вильоту — біля свого літака (не з іншого кінця карти)
    const origin = Math.hypot(data.x - p.pos.x, data.y - p.pos.y) < 120 ? { x: data.x, y: data.y } : { x: p.pos.x + Math.cos(data.angle) * 24, y: p.pos.y + Math.sin(data.angle) * 24 };
    const lagMs = this.lagFor(data.viewT, now);
    p.lastFiredAt = now;
    p.shots++;
    const speed = def.kind === 'missile' ? MISSILE_SPEED : def.projectileSpeed;
    this.relay(socketId, 'match:shot', encodeShot({ owner: this.indexOf(p.id), x: origin.x, y: origin.y, angle: data.angle, kind: def.kind, speed }));
    if (def.kind === 'laser') {
      this.fireLaser(p, origin, data.angle, def.range ?? PROJECTILE_RANGE.laser, def.damage * p.damageMul, lagMs, false);
      return;
    }
    this.spawnProjectile(p, def.kind, origin, data.angle, def.damage * p.damageMul, def.splashRadius ?? 0, lagMs);
  }

  /** На скільки мс відмотати цілі для пострілу, який гравець зробив, бачачи світ на момент viewT. */
  private lagFor(viewT: number | undefined, now: number): number {
    if (typeof viewT !== 'number' || !Number.isFinite(viewT) || !viewT) return CLIENT_INTERP_MS;
    return Math.max(0, Math.min(MAX_REWIND_MS, now - (this.startedAt + viewT)));
  }

  private spawnProjectile(owner: Participant, kind: 'bullet' | 'rocket' | 'missile', from: { x: number; y: number }, angle: number, damage: number, splash: number, lagMs: number): void {
    const speed = kind === 'missile' ? MISSILE_SPEED : getWeaponDef(owner.weaponId)?.projectileSpeed ?? 900;
    this.projectiles.push({
      ownerId: owner.id,
      kind,
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      traveled: 0,
      range: PROJECTILE_RANGE[kind],
      damage,
      splash,
      lagMs,
      simT: Date.now(),
      angle,
      life: kind === 'missile' ? MISSILE_LIFE : undefined,
    });
  }

  // ---------- історія позицій (для компенсації лагу) ----------

  private readonly history = new Map<string, { t: number; x: number; y: number }[]>();

  /** Активні пастки: іскри летять назад від літака, збивають чужі снаряди */
  private flares: FlareBurst[] = [];

  /** Пастки, що збивають снаряди цього власника (чужі команди, не свої). */
  private enemyFlares(owner: Participant | undefined): FlareBurst[] {
    return this.flares.filter((f) => {
      if (f.ownerId === owner?.id) return false;
      const fo = this.participants.get(f.ownerId);
      return !(owner && fo && this.sameTeam(owner, fo));
    });
  }

  private recordHistory(now: number): void {
    for (const p of this.participants.values()) {
      let h = this.history.get(p.id);
      if (!h) this.history.set(p.id, (h = []));
      h.push({ t: now, x: p.pos.x, y: p.pos.y });
      while (h.length > 2 && h[0].t < now - HISTORY_MS) h.shift();
    }
  }

  /** Де був учасник у момент t (інтерполяція між тіками; новіше за історію — поточна позиція). */
  private posAt(p: Participant, t: number): { x: number; y: number } {
    const h = this.history.get(p.id);
    if (!h || !h.length || t >= h[h.length - 1].t) return p.pos;
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1];
      const b = h[i];
      if (t >= a.t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return p.pos;
  }

  onSkill(socketId: string, data: { kind: SkillKind; x: number; y: number; angle: number }): void {
    const p = this.participants.get(socketId);
    if (!p || !p.alive || this.state !== 'active') return;
    this.useSkill(p, data?.kind, Date.now(), Number(data?.angle) || p.angle);
  }

  private useSkill(p: Participant, kind: SkillKind, now: number, angle: number): void {
    let extra: Record<string, number> = {};
    if (kind === 'scan') {
      // сканер є в усіх; результат бачить лише той, хто сканував (іншим нічого не шлемо)
      if (now - p.lastScanAt < SCAN_COOLDOWN_MS - 1000) return;
      p.lastScanAt = now;
      const blips = [...this.participants.values()]
        .filter((o) => o !== p && o.alive)
        .map((o) => ({
          x: Math.round(Math.max(0, Math.min(WORLD_W, o.pos.x + (Math.random() * 2 - 1) * WORLD_W * SCAN_ERROR))),
          y: Math.round(Math.max(0, Math.min(WORLD_H, o.pos.y + (Math.random() * 2 - 1) * WORLD_H * SCAN_ERROR))),
          ally: this.sameTeam(o, p),
        }));
      this.net.send(p.id, 'match:scan', { blips });
      return;
    }
    if (kind === 'flare') {
      if (now - p.lastFlareAt < FLARE_COOLDOWN_MS * p.cooldownMul * 0.9) return;
      p.lastFlareAt = now;
      p.flareUntil = now + FLARE_ACTIVE_MS;
      this.flares.push({ ownerId: p.id, x: p.pos.x, y: p.pos.y, angle: p.angle, t0: now });
    } else if (kind === 'jump') {
      // ривок: позицію шле клієнт — лише дозволяємо одноразовий стрибок у бюджеті руху
      p.moveBudget += JUMP_ALLOWANCE;
      p.lastJumpAt = now;
    } else {
      const a = p.activeItem?.active;
      if (!a || a.kind !== kind) return;
      if (now - p.lastItemAt < a.cooldown * 1000 * p.cooldownMul * 0.9) return;
      p.lastItemAt = now;
      switch (a.kind) {
        case 'nanoRepair':
          p.hp = Math.min(p.maxHp, p.hp + (a.power ?? 30));
          break;
        case 'phase':
          p.phaseUntil = now + (a.duration ?? 2) * 1000;
          break;
        case 'swarm': {
          // 6 самонавідних ракет віялом з носа; інші бачать їх як звичайні постріли
          for (let i = 0; i < 6; i++) {
            const ang = angle + (i - 2.5) * 0.28;
            const nose = { x: p.pos.x + Math.cos(angle) * 24, y: p.pos.y + Math.sin(angle) * 24 };
            this.spawnProjectile(p, 'missile', nose, ang, (a.power ?? 10) * p.damageMul, 0, CLIENT_INTERP_MS);
            this.relay(p.id, 'match:shot', encodeShot({ owner: this.indexOf(p.id), x: nose.x, y: nose.y, angle: ang, kind: 'missile', speed: MISSILE_SPEED }));
          }
          break;
        }
        case 'emp': {
          const radius = a.radius ?? 250;
          const until = now + (a.duration ?? 2.5) * 1000;
          for (const o of this.participants.values()) {
            if (o === p || !o.alive || this.sameTeam(o, p)) continue;
            if (Math.hypot(o.pos.x - p.pos.x, o.pos.y - p.pos.y) >= radius) continue;
            o.slowUntil = until;
            if (a.power) this.applyDamage(p, o, a.power * p.damageMul, now);
          }
          extra = { radius, duration: a.duration ?? 2.5 };
          break;
        }
        default:
          break;
      }
    }
    this.relay(p.id, 'match:skill', { id: p.id, kind, x: p.pos.x, y: p.pos.y, angle, ...extra });
  }

  private applyDamage(attacker: Participant, target: Participant, damage: number, now: number): void {
    if (!target.alive || now < target.phaseUntil || this.sameTeam(attacker, target)) return;
    // одне влучання не знімає більше половини максимального HP — ваншот неможливий
    damage = Math.min(damage, target.maxHp * 0.5);
    attacker.damageDealt += Math.min(damage, target.hp);
    target.hp = Math.max(0, target.hp - damage);
    target.botLastHitAt = now;
    const died = target.hp <= 0;
    if (died) {
      target.alive = false;
      target.diedAt = now;
      target.firing = false;
      attacker.kills++;
      this.dropLoot(target);
    }
    this.net.broadcast('match:hit', { attackerId: attacker.id, targetId: target.id, hp: target.hp, died, damage: Math.round(damage * 10) / 10 });
    if (died) this.checkEnd();
  }

  /** Коли востаннє слали HP скелі (щоб кулемет не засипав мережу подіями) */
  private obsHpSent = new Map<number, number>();

  /** Влучання в скелю: HP падає; зруйнована велика скеля розколюється на уламки. */
  private damageObstacle(o: Obstacle, damage: number, t: number): void {
    o.hp -= damage;
    if (o.hp > 0) {
      if (t - (this.obsHpSent.get(o.id) ?? -1e9) > 120) {
        this.obsHpSent.set(o.id, t);
        // лише факт влучання (для спалаху) — HP гравцям не показуємо
        this.net.broadcast('match:obs-hp', { id: o.id });
      }
      return;
    }
    this.obstacles = this.obstacles.filter((x) => x !== o);
    this.net.broadcast('match:obs-gone', { id: o.id, x: Math.round(o.x), y: Math.round(o.y), r: Math.round(o.r) });
    if (o.r >= 42) this.hz.fragments(o.x, o.y, o.r, t);
  }

  /** Шкода від перешкод арени: без автора, фраг нікому не зараховується. */
  private applyEnvDamage(target: Participant, damage: number, kind: HazardKind, now: number): void {
    if (!target.alive || now < target.phaseUntil) return;
    damage = Math.min(damage, target.maxHp * 0.5);
    target.hp = Math.max(0, target.hp - damage);
    target.botLastHitAt = now;
    const died = target.hp <= 0;
    if (died) {
      target.alive = false;
      target.diedAt = now;
      target.firing = false;
      this.dropLoot(target);
    }
    this.net.broadcast('match:hit', { attackerId: `hz:${kind}`, targetId: target.id, hp: target.hp, died, damage: Math.round(damage * 10) / 10 });
    if (died) this.checkEnd();
  }

  private spawnBotShot(bot: Participant, angle: number): void {
    const def = getWeaponDef(bot.weaponId) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
    const nose = { x: bot.pos.x + Math.cos(bot.angle) * 24, y: bot.pos.y + Math.sin(bot.angle) * 24 };
    if (def.kind === 'laser') {
      this.fireLaser(bot, nose, angle, def.range ?? 700, def.damage * bot.damageMul, 0, true);
      return;
    }
    if (def.kind !== 'bullet' && def.kind !== 'rocket') return;
    this.spawnProjectile(bot, def.kind, nose, angle, def.damage * bot.damageMul, def.splashRadius ?? 0, 0);
    this.broadcast('match:shot', encodeShot({ owner: this.indexOf(bot.id), x: nose.x, y: nose.y, angle, kind: def.kind, speed: def.projectileSpeed }));
  }

  /** Лазер: миттєвий промінь до першої перешкоди або цілі (цілі — на момент, який бачив стрілець). */
  private fireLaser(bot: Participant, from: { x: number; y: number }, angle: number, range: number, damage: number, lagMs: number, announce: boolean): void {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = range;
    let hit: Participant | null = null;
    const rayHit = (cx: number, cy: number, r: number): number | null => {
      const fx = cx - from.x;
      const fy = cy - from.y;
      const along = fx * dx + fy * dy;
      if (along < 0) return null;
      const perp2 = fx * fx + fy * fy - along * along;
      if (perp2 > r * r) return null;
      return along - Math.sqrt(r * r - perp2);
    };
    let rock: Obstacle | null = null;
    for (const o of this.obstacles) {
      const d = rayHit(o.x, o.y, o.r);
      if (d !== null && d < best) {
        best = d;
        rock = o;
      }
    }
    const rockDist = best;
    const now = Date.now();
    for (const p of this.participants.values()) {
      if (p === bot || !p.alive || now < p.phaseUntil || this.sameTeam(p, bot)) continue;
      const at = this.posAt(p, now - lagMs);
      const d = rayHit(at.x, at.y, HIT_RADIUS);
      if (d !== null && d < best) {
        best = d;
        hit = p;
      }
    }
    // іскри пасток розсіюють промінь
    for (const f of this.enemyFlares(bot)) {
      const d = rayDecoy(f, now - lagMs, from.x, from.y, dx, dy);
      if (d !== null && d < best) {
        best = d;
        hit = null;
      }
    }
    // перешкода арени — лише якщо вона стоїть першою на промені (тоді й отримує шкоду)
    const hzHit = this.hz.rayHit(from.x, from.y, dx, dy, best, now - this.startedAt, damage);
    if (hzHit) {
      best = hzHit.dist;
      hit = null;
    }
    if (rock && best === rockDist) this.damageObstacle(rock, damage, now - this.startedAt);
    if (announce) this.broadcast('match:shot', encodeShot({ owner: this.indexOf(bot.id), x: from.x, y: from.y, angle, kind: 'laser', speed: 0 }));
    if (hit) this.applyDamage(bot, hit, damage, now);
  }

  /** Просимулювати снаряди до моменту now: кожен — рівно на час, що минув від його попереднього кроку. */
  private updateProjectiles(now: number): void {
    const list = [...this.participants.values()];
    for (const pr of this.projectiles) {
      if (pr.range < 0) continue;
      const dt = (now - pr.simT) / 1000;
      if (dt <= 0) continue;
      pr.simT = now;
      const owner0 = this.participants.get(pr.ownerId);
      if (pr.kind === 'missile') {
        pr.life = (pr.life ?? 0) - dt;
        if (pr.life <= 0) {
          pr.range = -1;
          continue;
        }
        // самонаведення на найближчого ворога в передньому секторі (як на клієнті)
        let best: { x: number; y: number } | null = null;
        let bestD = 900;
        for (const p of list) {
          if (!p.alive || p.id === pr.ownerId || (owner0 && this.sameTeam(owner0, p))) continue;
          const at = this.posAt(p, now - pr.lagMs);
          const d = Math.hypot(at.x - pr.x, at.y - pr.y);
          const want = Math.atan2(at.y - pr.y, at.x - pr.x);
          if (d < bestD && Math.abs(angDiff(pr.angle ?? 0, want)) < 1.6) {
            bestD = d;
            best = at;
          }
        }
        // теплові пастки: ракета переводить наведення на найближчу іскру попереду
        for (const f of this.enemyFlares(owner0)) {
          const dec = nearestDecoy(f, now - pr.lagMs, pr.x, pr.y);
          if (!dec) continue;
          const want = Math.atan2(dec.y - pr.y, dec.x - pr.x);
          if (dec.d * 0.6 < bestD && Math.abs(angDiff(pr.angle ?? 0, want)) < 1.6) {
            bestD = dec.d * 0.6;
            best = dec;
          }
        }
        if (best) {
          const want = Math.atan2(best.y - pr.y, best.x - pr.x);
          const turn = MISSILE_TURN * dt;
          pr.angle = (pr.angle ?? 0) + Math.max(-turn, Math.min(turn, angDiff(pr.angle ?? 0, want)));
        }
        pr.vx = Math.cos(pr.angle ?? 0) * MISSILE_SPEED;
        pr.vy = Math.sin(pr.angle ?? 0) * MISSILE_SPEED;
      }
      const nx = pr.x + pr.vx * dt;
      const ny = pr.y + pr.vy * dt;
      let dead = false;
      let hit: Participant | null = null;
      // снаряд, що влучив в іскру пастки, згорає (без сплешу)
      let intercepted = false;
      for (const f of this.enemyFlares(owner0)) {
        if (hitsDecoy(f, now - pr.lagMs, pr.x, pr.y, nx, ny)) {
          intercepted = true;
          break;
        }
      }
      if (intercepted || this.hz.hitByProjectile(pr.x, pr.y, nx, ny, pr.damage, now - this.startedAt)) {
        pr.range = -1;
        continue;
      }
      for (const o of this.obstacles) {
        if (segDist(pr.x, pr.y, nx, ny, o.x, o.y) < o.r) {
          dead = true;
          this.damageObstacle(o, pr.damage, now - this.startedAt);
          break;
        }
      }
      if (!dead) {
        for (const p of list) {
          if (!p.alive || p.id === pr.ownerId || (owner0 && this.sameTeam(owner0, p))) continue;
          const at = this.posAt(p, now - pr.lagMs);
          const d = segDist(pr.x, pr.y, nx, ny, at.x, at.y);
          if (now < p.phaseUntil) continue;
          if (d < HIT_RADIUS + (pr.kind === 'rocket' ? 6 : pr.kind === 'missile' ? 4 : 0)) {
            hit = p;
            dead = true;
            break;
          }
        }
      }
      pr.x = nx;
      pr.y = ny;
      pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;
      // ракета, що вибухнула в перешкоді, теж зачіпає сплешем — як на клієнті
      if (dead && !hit && pr.splash > 0 && owner0) {
        for (const p of list) {
          if (p === owner0 || !p.alive) continue;
          const at = this.posAt(p, now - pr.lagMs);
          if (Math.hypot(at.x - pr.x, at.y - pr.y) < pr.splash) this.applyDamage(owner0, p, pr.damage * 0.5, now);
        }
      }
      if (pr.traveled > pr.range || pr.x < -50 || pr.y < -50 || pr.x > WORLD_W + 50 || pr.y > WORLD_H + 50) dead = true;
      if (hit) {
        const owner = this.participants.get(pr.ownerId);
        if (owner) {
          this.applyDamage(owner, hit, pr.damage, now);
          if (pr.splash > 0) {
            for (const p of list) {
              if (p === hit || p === owner || !p.alive) continue;
              const at = this.posAt(p, now - pr.lagMs);
              if (Math.hypot(at.x - pr.x, at.y - pr.y) < pr.splash) this.applyDamage(owner, p, pr.damage * 0.5, now);
            }
          }
        }
      }
      if (dead) pr.range = -1;
    }
    this.projectiles = this.projectiles.filter((p) => p.range >= 0);
  }

  private tick(): void {
    if (this.state !== 'active') return;
    const now = Date.now();
    const dt = TICK_MS / 1000;
    const list = [...this.participants.values()];
    const tm = now - this.startedAt;
    for (const o of this.obstacles) {
      const pos = driftPos(o, tm);
      o.x = pos.x;
      o.y = pos.y;
    }
    for (const p of list) {
      if (!p.isBot || !p.alive) continue;
      const foes = this.teamSize > 1 ? list.filter((o) => o.team !== p.team) : list;
      const actions = updateBot(p, foes, this.obstacles, this.projectiles, this.pickups.values(), dt, now);
      for (const a of actions.shots) this.spawnBotShot(p, a);
      if (actions.flare) this.useSkill(p, 'flare', now, p.angle);
      if (p.activeItem?.active?.kind === 'nanoRepair' && p.hp < p.maxHp * 0.5) this.useSkill(p, 'nanoRepair', now, p.angle);
    }
    // сонячний вітер зносить і ботів (гравців — їхні клієнти)
    if (this.hz.event === 'wind') {
      const w = windAt(now - this.startedAt);
      for (const p of list) {
        if (!p.isBot || !p.alive) continue;
        p.pos.x = Math.max(0, Math.min(WORLD_W, p.pos.x + w.x * dt));
        p.pos.y = Math.max(0, Math.min(WORLD_H, p.pos.y + w.y * dt));
      }
    }
    this.recordHistory(now);
    this.flares = this.flares.filter((f) => now - f.t0 < FLARE_ACTIVE_MS + 400);
    // два підкроки з власним часом — швидкі кулі не "проскакують" крізь літаки, а ціль не "застигає"
    this.updateProjectiles(now - TICK_MS / 2);
    this.updateProjectiles(now);
    if (this.ended) return;
    this.hz.update(now - this.startedAt, dt);
    if (this.ended) return;
    this.collectPickups(now);
    this.broadcast('match:state', this.encoder.encode(now - this.startedAt, this.netStates(now)));

    if (now - this.startedAt > MATCH_TIME_LIMIT_MS) this.checkEnd(true);
  }

  private checkEnd(force = false): void {
    if (this.ended) return;
    const all = [...this.participants.values()];
    const alive = all.filter((p) => p.alive);
    const aliveTeams = new Set(alive.map((p) => p.team));
    const realAlive = alive.some((p) => !p.isBot);
    if (!force && aliveTeams.size > 1 && (realAlive || !this.hasRealPlayers())) return;
    console.log(`[room ${this.id}] кінець матчу: ${force ? 'час вийшов' : aliveTeams.size <= 1 ? 'лишилась одна команда' : 'живих гравців не лишилось'}`);
    this.ended = true;
    this.state = 'ended';
    if (this.tickHandle) clearTimeout(this.tickHandle);

    // команди: живі — вище (за фрагами й HP), вибулі — за часом вибування (пізніше = краще)
    const teamIds = [...new Set(all.map((p) => p.team))];
    const teamInfo = teamIds.map((team) => {
      const members = all.filter((p) => p.team === team);
      const aliveN = members.filter((p) => p.alive).length;
      return {
        team,
        aliveN,
        kills: members.reduce((s, p) => s + p.kills, 0),
        hp: members.reduce((s, p) => s + (p.alive ? p.hp : 0), 0),
        out: aliveN ? Infinity : Math.max(...members.map((p) => p.diedAt)),
      };
    });
    teamInfo.sort((x, y) => (x.aliveN > 0 ? 1 : 0) !== (y.aliveN > 0 ? 1 : 0) ? (y.aliveN > 0 ? 1 : 0) - (x.aliveN > 0 ? 1 : 0) : x.aliveN > 0 ? y.kills - x.kills || y.hp - x.hp : y.out - x.out || y.kills - x.kills);
    const teamPlace = new Map(teamInfo.map((t, i) => [t.team, i + 1]));
    for (const p of all) {
      p.teamPlace = teamPlace.get(p.team)!;
      // для нагород і RP — місце команди в шкалі 10 місць
      p.place = scaledPlace(p.teamPlace, this.teams);
    }
    const ranked = [...all].sort((x, y) => x.teamPlace! - y.teamPlace! || y.kills - x.kills);
    const winners = ranked.filter((p) => p.teamPlace === 1);

    // увесь вантаж, що лишився на борту живих, забирає лише переможець
    const jackpot = { coins: 0, crystals: 0 };
    for (const p of ranked) {
      if (!p.alive) continue;
      jackpot.coins += p.lootCoins;
      jackpot.crystals += p.lootCrystals;
    }
    // у командних режимах переможці ділять лут порівну
    const share = { coins: Math.floor(jackpot.coins / Math.max(1, winners.length)), crystals: Math.floor(jackpot.crystals / Math.max(1, winners.length)) };
    // ящик розігрується один раз на гравця — і для нарахування, і для екрана результатів
    const crates = new Map(ranked.map((p) => [p.id, rollPlaceCrate(p.place!)]));
    const rewardOf = (p: Participant) => {
      const base = matchReward(p.place!, p.kills, this.mode !== 'casual');
      const idle = isIdle(p);
      const crate = crates.get(p.id) ?? null;
      const won = p.teamPlace === 1;
      // досвід пілота: за місце й фраги
      const xp = 30 + p.kills * 8 + Math.max(0, ROOM_SIZE + 1 - p.place!) * 6;
      return { coins: (idle ? Math.round(base.coins * 0.5) : base.coins) + (won ? share.coins : 0), crystals: won ? share.crystals : 0, bpXp: base.bpXp, xp, crate };
    };

    const rankOf = (p: Participant) => {
      if (this.mode === 'casual' || p.isBot) return null;
      // бездіяльний гравець отримує RP як за останнє місце
      const delta = rankDelta(isIdle(p) ? ROOM_SIZE : p.place!, p.kills, p.rankPoints);
      return { before: p.rankPoints, after: Math.max(0, p.rankPoints + delta), delta };
    };

    // нагороди записує сервіс профілю
    this.hooks.results({
      matchId: this.id,
      mode: this.mode,
      players: ranked
        .filter((p) => !p.isBot && p.userId)
        .map((p) => {
          const r = rewardOf(p);
          return { userId: p.userId!, place: p.place!, teamPlace: p.teamPlace!, kills: p.kills, damageDealt: p.damageDealt, alive: p.alive, reward: { coins: r.coins, crystals: r.crystals, xp: r.xp, bpXp: r.bpXp, crate: r.crate }, rankAfter: rankOf(p)?.after ?? null };
        }),
    });

    const results: MatchResultEntry[] = ranked.map((p) => {
      const r = rewardOf(p);
      return {
        id: p.id,
        userId: p.userId,
        nickname: p.nickname,
        place: p.place!,
        kills: p.kills,
        isBot: p.isBot,
        reward: { coins: r.coins, crystals: r.crystals, crate: r.crate, xp: r.xp, bp: r.bpXp },
        jackpot: p.teamPlace === 1 ? share : { coins: 0, crystals: 0 },
        team: p.team,
        teamPlace: p.teamPlace!,
        rank: rankOf(p),
      };
    });
    // невелика пауза, щоб клієнт встиг показати останній вибух
    setTimeout(() => {
      this.net.broadcast('match:end', { results });
      setTimeout(() => this.destroy(), 500);
    }, 1200);
  }

  /** Гравець відʼєднався або вийшов з матчу. */
  detach(pid: string): void {
    if (!this.conns.has(pid)) return;
    const p = this.participants.get(pid);
    // вихід посеред рейтингового бою — як останнє місце (інакше поразку можна було б "скинути")
    if (p && p.userId && this.mode !== 'casual' && !this.ended && p.alive && !p.isBot) this.hooks.leaver({ matchId: this.id, mode: this.mode, userId: p.userId, kills: p.kills, rankPoints: p.rankPoints });
    if (p?.userId) this.hooks.setInMatch(p.userId, false);
    if (p) {
      if (p.alive) p.diedAt = Date.now();
      p.alive = false;
      p.firing = false;
    }
    this.conns.delete(pid);
    if (this.state === 'active') this.checkEnd();
    // живих людей не лишилось — кімната з самими ботами нікому не потрібна
    if (!this.ended && !this.hasRealPlayers() && this.countdownAt) this.destroy();
  }

  hasRealPlayers(): boolean {
    return [...this.participants.values()].some((p) => !p.isBot && this.conns.has(p.id));
  }

  destroy(): void {
    this.ended = true;
    if (this.graceTimer) clearTimeout(this.graceTimer);
    for (const p of this.participants.values()) if (p.userId) this.hooks.setInMatch(p.userId, false);
    if (this.tickHandle) clearTimeout(this.tickHandle);
    this.participants.clear();
    this.conns.clear();
    this.onClose();
    this.onClose = () => {};
  }
}
