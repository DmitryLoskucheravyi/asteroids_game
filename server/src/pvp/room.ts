import type { Server as IOServer, Socket } from 'socket.io';
import { User } from '../models/User.js';
import { grantReward, addBp, ensureQuestSlots, incrementQuestProgress } from '../progress.js';
import { getWeaponDef, DEFAULT_WEAPON_ID, PROJECTILE_RANGE } from '../content/weapons.js';
import { getItemDef, type ItemMeta } from '../content/items.js';
import { PLANE_IDS, planeCombat } from '../content/planes.js';
import { updateBot } from './bot.js';
import {
  ROOM_SIZE,
  WORLD_W,
  WORLD_H,
  TICK_MS,
  COUNTDOWN_MS,
  MATCH_TIME_LIMIT_MS,
  HIT_RADIUS,
  FLARE_COOLDOWN_MS,
  FLARE_DURATION_MS,
  FLARE_RADIUS,
  matchReward,
  rollPlaceCrate,
  PICKUP_START,
  PICKUP_MAX,
  PICKUP_SPAWN_MS,
  PICKUP_RADIUS,
  CRYSTAL_CHANCE,
} from './constants.js';
import type { CrateType } from '../content/crates.js';
import { botStrength, rankDelta } from '../content/ranks.js';
import type { MatchMode, Participant, Obstacle, MatchState, PublicParticipant, MatchResultEntry, ServerProjectile, SkillKind, Pickup } from './types.js';

const BOT_NAMES = ['Вихор', 'Корсар', 'Немезида', 'Беркут', 'Скорпіон', 'Фантом-7', 'Ренегат', 'Сокира'];
let botSeq = 0;

export interface Entrant {
  socket: Socket;
  userId: string;
  nickname: string;
  planeId: string;
  weaponId: string;
  tier: number;
  level: number;
  activeDefId: string | null;
  passiveDefId: string | null;
  rankPoints: number;
}

/** Гравець не стріляв і майже не рухався весь матч — ферма/AFK. */
const isIdle = (p: Participant): boolean => !p.isBot && p.shots === 0 && p.travelled < 400;

function randPos(): { x: number; y: number } {
  return { x: 200 + Math.random() * (WORLD_W - 400), y: 200 + Math.random() * (WORLD_H - 400) };
}

function makeObstacles(): Obstacle[] {
  const list: Obstacle[] = [];
  for (let i = 0; i < 70; i++) list.push({ ...randPos(), r: 30 + Math.random() * 70 });
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
    hitWindowStart: 0,
    hitsInWindow: 0,
    lootCoins: 0,
    lootCrystals: 0,
    rankPoints: 0,
    shots: 0,
    travelled: 0,
    damageDealt: 0,
  };
}

export class Room {
  readonly id: string;
  state: MatchState = 'countdown';
  private participants = new Map<string, Participant>();
  private sockets = new Map<string, Socket>();
  private obstacles: Obstacle[];
  private projectiles: ServerProjectile[] = [];
  private pickups = new Map<number, Pickup>();
  private pickupSeq = 0;
  private lastPickupSpawn = 0;
  private startedAt = Date.now();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private ended = false;
  onClose: () => void = () => {};

  constructor(
    id: string,
    private readonly io: IOServer,
    entrants: Entrant[],
    readonly mode: MatchMode = 'casual',
  ) {
    this.id = id;
    const avgRp = entrants.reduce((s, e) => s + e.rankPoints, 0) / Math.max(1, entrants.length);
    const botLevel = mode === 'ranked' ? botStrength(avgRp) : null;
    this.obstacles = makeObstacles();

    for (const e of entrants) {
      const active = e.activeDefId ? getItemDef(e.activeDefId) ?? null : null;
      const passive = e.passiveDefId ? getItemDef(e.passiveDefId) ?? null : null;
      const p = makeParticipant(
        {
          id: e.socket.id,
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
        this.spawnPos(),
      );
      p.rankPoints = e.rankPoints;
      this.participants.set(p.id, p);
      this.sockets.set(e.socket.id, e.socket);
      e.socket.join(id);
    }

    while (this.participants.size < ROOM_SIZE) {
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
        this.spawnPos(),
      );
      p.botState = 'patrol';
      p.botTimer = 0;
      // у рейтинговому бот має правдоподібний рейтинг поруч із гравцями (для емблеми на екрані завантаження)
      if (mode === 'ranked') p.rankPoints = Math.max(0, Math.round(avgRp + (Math.random() - 0.5) * 300));
      this.participants.set(botId, p);
    }

    for (let i = 0; i < PICKUP_START; i++) this.spawnPickup(false);

    this.io.to(id).emit('match:init', {
      roomId: id,
      world: { w: WORLD_W, h: WORLD_H },
      obstacles: this.obstacles,
      participants: this.publicList(Date.now()),
      countdownMs: COUNTDOWN_MS,
      mode,
      timeLimitMs: MATCH_TIME_LIMIT_MS,
      pickups: [...this.pickups.values()],
    });

    setTimeout(() => this.begin(), COUNTDOWN_MS);
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
    this.io.to(this.id).emit('match:start', { startedAt: this.startedAt });
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
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
      lastFiredAt: p.lastFiredAt,
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
    if (announce) this.io.to(this.id).emit('match:pickup-spawn', p);
  }

  /** Збитий літак лишає на місці все, що встиг зібрати. */
  private dropLoot(p: Participant): void {
    if (p.lootCoins <= 0 && p.lootCrystals <= 0) return;
    const pile: Pickup = { id: ++this.pickupSeq, kind: 'pile', x: p.pos.x, y: p.pos.y, coins: p.lootCoins, crystals: p.lootCrystals };
    p.lootCoins = 0;
    p.lootCrystals = 0;
    this.pickups.set(pile.id, pile);
    this.io.to(this.id).emit('match:pickup-spawn', pile);
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
        this.io.to(this.id).emit('match:pickup-taken', { id: pk.id, by: p.id, coins: pk.coins, crystals: pk.crystals });
      }
    }
  }

  /** Розсилка всім у кімнаті, крім автора (він уже показав ефект локально). */
  private relay(fromId: string, event: string, data: unknown): void {
    const s = this.sockets.get(fromId);
    if (s) s.to(this.id).emit(event, data);
    else this.io.to(this.id).emit(event, data);
  }

  onMove(socketId: string, pos: { x: number; y: number }, angle: number, firing: boolean): void {
    const p = this.participants.get(socketId);
    if (!p || !p.alive || this.state !== 'active') return;
    if (typeof pos?.x !== 'number' || typeof pos?.y !== 'number' || !Number.isFinite(angle)) return;
    const nx = Math.max(0, Math.min(WORLD_W, pos.x));
    const ny = Math.max(0, Math.min(WORLD_H, pos.y));
    p.travelled += Math.min(200, Math.hypot(nx - p.pos.x, ny - p.pos.y));
    p.pos.x = nx;
    p.pos.y = ny;
    p.angle = angle;
    p.firing = !!firing;
  }

  /** Гравець вистрілив — ретранслюємо, щоб інші бачили снаряд. */
  onShot(socketId: string, data: { x: number; y: number; angle: number; kind: string }): void {
    const p = this.participants.get(socketId);
    if (!p || !p.alive || this.state !== 'active') return;
    if (![data?.x, data?.y, data?.angle].every((n) => typeof n === 'number' && Number.isFinite(n))) return;
    const kind = data.kind === 'rocket' || data.kind === 'missile' || data.kind === 'laser' ? data.kind : 'bullet';
    p.lastFiredAt = Date.now();
    p.shots++;
    const def = getWeaponDef(p.weaponId);
    this.relay(socketId, 'match:shot', { ownerId: p.id, x: data.x, y: data.y, angle: data.angle, kind, speed: kind === 'missile' ? 560 : def?.projectileSpeed ?? 900 });
  }

  onHit(attackerId: string, targetId: string, source: string): void {
    if (this.state !== 'active') return;
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target || !attacker.alive || !target.alive || attacker === target) return;
    const now = Date.now();
    if (Math.hypot(attacker.pos.x - target.pos.x, attacker.pos.y - target.pos.y) > 1500) return;

    // грубий анти-чит: не більше N влучань за секунду
    if (now - attacker.hitWindowStart > 1000) {
      attacker.hitWindowStart = now;
      attacker.hitsInWindow = 0;
    }
    if (++attacker.hitsInWindow > 50) return;

    const def = getWeaponDef(attacker.weaponId) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
    let damage: number;
    if (source === 'swarm') {
      const a = attacker.activeItem?.active;
      if (a?.kind !== 'swarm' || now - attacker.lastItemAt > 5000) return;
      damage = (a.power ?? 0) * attacker.damageMul;
    } else if (source === 'splash') {
      if (def.kind !== 'rocket' && attacker.activeItem?.active?.kind !== 'swarm') return;
      damage = def.damage * 0.5 * attacker.damageMul;
    } else {
      damage = def.damage * attacker.damageMul;
    }
    this.applyDamage(attacker, target, damage, now);
  }

  onSkill(socketId: string, data: { kind: SkillKind; x: number; y: number; angle: number }): void {
    const p = this.participants.get(socketId);
    if (!p || !p.alive || this.state !== 'active') return;
    this.useSkill(p, data?.kind, Date.now(), Number(data?.angle) || p.angle);
  }

  private useSkill(p: Participant, kind: SkillKind, now: number, angle: number): void {
    let extra: Record<string, number> = {};
    if (kind === 'flare') {
      if (now - p.lastFlareAt < FLARE_COOLDOWN_MS * p.cooldownMul * 0.9) return;
      p.lastFlareAt = now;
      p.flareUntil = now + FLARE_DURATION_MS;
    } else if (kind === 'jump') {
      // ривок — чисто візуальний для інших (позицію шле клієнт)
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
        case 'emp': {
          const radius = a.radius ?? 250;
          const until = now + (a.duration ?? 2.5) * 1000;
          for (const o of this.participants.values()) {
            if (o === p || !o.alive) continue;
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
    if (!target.alive || now < target.phaseUntil) return;
    // під час пасток кулі й ракети збиваються (з невеликим допуском на затримку мережі)
    if (now < target.flareUntil - 80) return;
    // одне влучання не знімає більше половини максимального HP — ваншот неможливий
    damage = Math.min(damage, target.maxHp * 0.5);
    attacker.damageDealt += Math.min(damage, target.hp);
    target.hp = Math.max(0, target.hp - damage);
    target.botLastHitAt = now;
    const died = target.hp <= 0;
    if (died) {
      target.alive = false;
      target.firing = false;
      attacker.kills++;
      this.dropLoot(target);
    }
    this.io.to(this.id).emit('match:hit', { attackerId: attacker.id, targetId: target.id, hp: target.hp, died, damage: Math.round(damage * 10) / 10 });
    if (died) this.checkEnd();
  }

  private spawnBotShot(bot: Participant, angle: number): void {
    const def = getWeaponDef(bot.weaponId) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
    const nose = { x: bot.pos.x + Math.cos(bot.angle) * 24, y: bot.pos.y + Math.sin(bot.angle) * 24 };
    if (def.kind === 'laser') {
      this.fireLaser(bot, nose, angle, def.range ?? 700, def.damage * bot.damageMul);
      return;
    }
    if (def.kind !== 'bullet' && def.kind !== 'rocket') return;
    this.projectiles.push({
      ownerId: bot.id,
      kind: def.kind,
      x: nose.x,
      y: nose.y,
      vx: Math.cos(angle) * def.projectileSpeed,
      vy: Math.sin(angle) * def.projectileSpeed,
      traveled: 0,
      range: PROJECTILE_RANGE[def.kind],
      damage: def.damage * bot.damageMul,
      splash: def.splashRadius ?? 0,
    });
    this.io.to(this.id).emit('match:shot', { ownerId: bot.id, x: nose.x, y: nose.y, angle, kind: def.kind, speed: def.projectileSpeed });
  }

  /** Лазер бота: миттєвий промінь до першої перешкоди або цілі. */
  private fireLaser(bot: Participant, from: { x: number; y: number }, angle: number, range: number, damage: number): void {
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
    for (const o of this.obstacles) {
      const d = rayHit(o.x, o.y, o.r);
      if (d !== null && d < best) best = d;
    }
    const now = Date.now();
    for (const p of this.participants.values()) {
      if (p === bot || !p.alive || now < p.phaseUntil) continue;
      const d = rayHit(p.pos.x, p.pos.y, HIT_RADIUS);
      if (d !== null && d < best) {
        best = d;
        hit = p;
      }
    }
    this.io.to(this.id).emit('match:shot', { ownerId: bot.id, x: from.x, y: from.y, angle, kind: 'laser', speed: 0 });
    if (hit) this.applyDamage(bot, hit, damage, now);
  }

  private updateProjectiles(dt: number, now: number): void {
    const list = [...this.participants.values()];
    for (const pr of this.projectiles) {
      const nx = pr.x + pr.vx * dt;
      const ny = pr.y + pr.vy * dt;
      let dead = false;
      let hit: Participant | null = null;
      for (const o of this.obstacles) {
        if (segDist(pr.x, pr.y, nx, ny, o.x, o.y) < o.r) {
          dead = true;
          break;
        }
      }
      if (!dead) {
        for (const p of list) {
          if (!p.alive || p.id === pr.ownerId) continue;
          const d = segDist(pr.x, pr.y, nx, ny, p.pos.x, p.pos.y);
          if (now < p.flareUntil && d < FLARE_RADIUS) {
            dead = true;
            break;
          }
          if (now < p.phaseUntil) continue;
          if (d < HIT_RADIUS + (pr.kind === 'rocket' ? 6 : 0)) {
            hit = p;
            dead = true;
            break;
          }
        }
      }
      pr.x = nx;
      pr.y = ny;
      pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;
      if (pr.traveled > pr.range || pr.x < -50 || pr.y < -50 || pr.x > WORLD_W + 50 || pr.y > WORLD_H + 50) dead = true;
      if (hit) {
        const owner = this.participants.get(pr.ownerId);
        if (owner) {
          this.applyDamage(owner, hit, pr.damage, now);
          if (pr.splash > 0) {
            for (const p of list) {
              if (p === hit || p === owner || !p.alive) continue;
              if (Math.hypot(p.pos.x - pr.x, p.pos.y - pr.y) < pr.splash) this.applyDamage(owner, p, pr.damage * 0.5, now);
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
    for (const p of list) {
      if (!p.isBot || !p.alive) continue;
      const actions = updateBot(p, list, this.obstacles, this.projectiles, this.pickups.values(), dt, now);
      for (const a of actions.shots) this.spawnBotShot(p, a);
      if (actions.flare) this.useSkill(p, 'flare', now, p.angle);
      if (p.activeItem?.active?.kind === 'nanoRepair' && p.hp < p.maxHp * 0.5) this.useSkill(p, 'nanoRepair', now, p.angle);
    }
    // кілька підкроків — швидкі кулі не "проскакують" крізь літаки
    for (let i = 0; i < 2; i++) this.updateProjectiles(dt / 2, now);
    if (this.ended) return;
    this.collectPickups(now);
    this.io.to(this.id).emit('match:state', { participants: this.publicList(now), t: now - this.startedAt });

    if (now - this.startedAt > MATCH_TIME_LIMIT_MS) this.checkEnd(true);
  }

  private checkEnd(force = false): void {
    if (this.ended) return;
    const alive = [...this.participants.values()].filter((p) => p.alive);
    const realAlive = alive.some((p) => !p.isBot);
    if (!force && alive.length > 1 && (realAlive || !this.hasRealPlayers())) return;
    this.ended = true;
    this.state = 'ended';
    if (this.tickHandle) clearInterval(this.tickHandle);

    const ranked = [...this.participants.values()].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (b.kills !== a.kills) return b.kills - a.kills;
      return b.hp - a.hp;
    });
    ranked.forEach((p, i) => (p.place = i + 1));

    // увесь вантаж, що лишився на борту живих, забирає лише переможець
    const jackpot = { coins: 0, crystals: 0 };
    for (const p of ranked) {
      if (!p.alive) continue;
      jackpot.coins += p.lootCoins;
      jackpot.crystals += p.lootCrystals;
    }
    // ящик розігрується один раз на гравця — і для нарахування, і для екрана результатів
    const crates = new Map(ranked.map((p) => [p.id, rollPlaceCrate(p.place!)]));
    const rewardOf = (p: Participant) => {
      const base = matchReward(p.place!, p.kills, this.mode === 'ranked');
      const idle = isIdle(p);
      const crate = crates.get(p.id) ?? null;
      const won = p.place === 1;
      // досвід пілота: за місце й фраги
      const xp = 30 + p.kills * 8 + Math.max(0, ROOM_SIZE + 1 - p.place!) * 6;
      return { coins: (idle ? Math.round(base.coins * 0.5) : base.coins) + (won ? jackpot.coins : 0), crystals: won ? jackpot.crystals : 0, bpXp: base.bpXp, xp, crate };
    };

    const rankOf = (p: Participant) => {
      if (this.mode !== 'ranked' || p.isBot) return null;
      // бездіяльний гравець отримує RP як за останнє місце
      const delta = rankDelta(isIdle(p) ? ROOM_SIZE : p.place!, p.kills, p.rankPoints);
      return { before: p.rankPoints, after: Math.max(0, p.rankPoints + delta), delta };
    };

    void this.grantRewards(ranked, rewardOf, rankOf);

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
        jackpot: p.place === 1 ? jackpot : { coins: 0, crystals: 0 },
        rank: rankOf(p),
      };
    });
    // невелика пауза, щоб клієнт встиг показати останній вибух
    setTimeout(() => {
      this.io.to(this.id).emit('match:end', { results });
      for (const s of this.sockets.values()) s.leave(this.id);
      setTimeout(() => this.destroy(), 500);
    }, 1200);
  }

  private async grantRewards(ranked: Participant[], rewardOf: (p: Participant) => { coins: number; crystals: number; bpXp: number; xp: number; crate: CrateType | null }, rankOf: (p: Participant) => { after: number } | null): Promise<void> {
    for (const p of ranked) {
      if (p.isBot || !p.userId) continue;
      try {
        const user = await User.findById(p.userId);
        if (!user) continue;
        const reward = rewardOf(p);
        grantReward(user, { coins: reward.coins, xp: reward.xp, crystals: reward.crystals, crate: reward.crate ?? undefined }, 'pvp');
        addBp(user, reward.bpXp);
        ensureQuestSlots(user);
        incrementQuestProgress(user, 'pvpMatches', 1);
        incrementQuestProgress(user, 'pvpKills', p.kills);
        if (p.place! <= 3) incrementQuestProgress(user, 'pvpTop3', 1);
        if (p.place === 1) incrementQuestProgress(user, 'pvpWins', 1);
        const st = user.stats!;
        st.pvpMatches += 1;
        st.pvpKills += p.kills;
        st.pvpDamage += Math.round(p.damageDealt);
        st.bestKills = Math.max(st.bestKills, p.kills);
        if (p.place === 1) st.pvpWins += 1;
        if (p.place! <= 3) st.pvpTop3 += 1;
        if (!p.alive) st.pvpDeaths += 1;
        const rank = rankOf(p);
        if (rank) {
          user.rankPoints = rank.after;
          user.rankBest = Math.max(user.rankBest ?? 0, rank.after);
          user.rankedMatches = (user.rankedMatches ?? 0) + 1;
          if (p.place === 1) user.rankedWins = (user.rankedWins ?? 0) + 1;
        }
        await user.save();
      } catch {
        // гравець лишиться без нагороди цього разу — не блокуємо завершення матчу
      }
    }
  }

  /** Вихід із рейтингового матчу посеред бою — зараховується як останнє місце (інакше поразку можна було б "скинути"). */
  private async penalizeLeaver(p: Participant): Promise<void> {
    if (!p.userId) return;
    try {
      const user = await User.findById(p.userId);
      if (!user) return;
      user.rankPoints = Math.max(0, (user.rankPoints ?? 0) + rankDelta(ROOM_SIZE, p.kills, p.rankPoints));
      user.rankedMatches = (user.rankedMatches ?? 0) + 1;
      user.stats!.pvpMatches += 1;
      user.stats!.pvpDeaths += 1;
      user.stats!.pvpKills += p.kills;
      await user.save();
    } catch {
      // не блокуємо вихід
    }
  }

  removeSocket(socketId: string): void {
    const p = this.participants.get(socketId);
    if (p && this.mode === 'ranked' && !this.ended && p.alive && !p.isBot) void this.penalizeLeaver(p);
    if (p) {
      p.alive = false;
      p.firing = false;
    }
    this.sockets.delete(socketId);
    if (this.state === 'active') this.checkEnd();
  }

  hasRealPlayers(): boolean {
    return [...this.participants.values()].some((p) => !p.isBot && this.sockets.has(p.id));
  }

  destroy(): void {
    this.ended = true;
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.participants.clear();
    this.sockets.clear();
    this.onClose();
    this.onClose = () => {};
  }
}
