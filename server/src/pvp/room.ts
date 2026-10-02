import type { Server as IOServer, Socket } from 'socket.io';
import { User } from '../models/User.js';
import { grantReward, addBp } from '../progress.js';
import { getWeaponDef, DEFAULT_WEAPON_ID } from '../content/weapons.js';
import { updateBot } from './bot.js';
import { ROOM_SIZE, WORLD_W, WORLD_H, TICK_MS, MATCH_TIME_LIMIT_MS, RADAR_VISIBLE_AFTER_FIRE_MS, baseHpFor, matchReward } from './constants.js';
import type { Participant, Obstacle, MatchState, PublicParticipant, MatchResultEntry } from './types.js';

const BOT_NAMES = ['Вихор', 'Корсар', 'Немезида', 'Беркут', 'Скорпіон', 'Фантом-7', 'Ренегат', 'Сокира'];
let botSeq = 0;

function randPos(): { x: number; y: number } {
  return { x: 40 + Math.random() * (WORLD_W - 80), y: 40 + Math.random() * (WORLD_H - 80) };
}

function makeObstacles(): Obstacle[] {
  const list: Obstacle[] = [];
  for (let i = 0; i < 46; i++) list.push({ ...randPos(), r: 30 + Math.random() * 70 });
  return list;
}

export class Room {
  readonly id: string;
  state: MatchState = 'countdown';
  private participants = new Map<string, Participant>();
  private sockets = new Map<string, Socket>();
  private obstacles: Obstacle[];
  private startedAt = Date.now();
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private ended = false;

  constructor(
    id: string,
    private readonly io: IOServer,
    entrants: { socket: Socket; userId: string; nickname: string; planeId: string; weaponId: string; tier: number; level: number }[],
  ) {
    this.id = id;
    this.obstacles = makeObstacles();

    for (const e of entrants) {
      const hp = baseHpFor(e.tier, e.level);
      this.participants.set(e.socket.id, {
        id: e.socket.id,
        userId: e.userId,
        isBot: false,
        nickname: e.nickname,
        planeId: e.planeId,
        weaponId: getWeaponDef(e.weaponId) ? e.weaponId : DEFAULT_WEAPON_ID,
        pos: randPos(),
        angle: -Math.PI / 2,
        firing: false,
        lastFiredAt: 0,
        hp,
        maxHp: hp,
        alive: true,
        kills: 0,
        place: null,
      });
      this.sockets.set(e.socket.id, e.socket);
      e.socket.join(id);
    }

    while (this.participants.size < ROOM_SIZE) {
      const botId = `bot-${++botSeq}`;
      const hp = baseHpFor(1 + Math.floor(Math.random() * 3), 1 + Math.floor(Math.random() * 4));
      this.participants.set(botId, {
        id: botId,
        userId: null,
        isBot: true,
        nickname: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
        planeId: 'falcon',
        weaponId: Math.random() < 0.3 ? 'rocket_launcher' : 'machine_gun',
        pos: randPos(),
        angle: -Math.PI / 2,
        firing: false,
        lastFiredAt: 0,
        hp,
        maxHp: hp,
        alive: true,
        kills: 0,
        place: null,
        botState: 'patrol',
        botDir: { x: 0, y: 1 },
        botTimer: 0,
      });
    }

    this.io.to(id).emit('match:init', {
      roomId: id,
      world: { w: WORLD_W, h: WORLD_H },
      obstacles: this.obstacles,
      selfId: null, // клієнт бере свій id із власного socket.id
      participants: this.publicList(),
    });

    setTimeout(() => this.begin(), 3000);
  }

  private begin(): void {
    this.state = 'active';
    this.startedAt = Date.now();
    this.io.to(this.id).emit('match:start', { startedAt: this.startedAt });
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
  }

  private publicList(): PublicParticipant[] {
    return [...this.participants.values()].map((p) => ({
      id: p.id,
      isBot: p.isBot,
      nickname: p.nickname,
      planeId: p.planeId,
      pos: p.pos,
      angle: p.angle,
      firing: p.firing,
      lastFiredAt: p.lastFiredAt,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      kills: p.kills,
    }));
  }

  onMove(socketId: string, pos: { x: number; y: number }, angle: number, firing: boolean): void {
    const p = this.participants.get(socketId);
    if (!p || !p.alive || this.state !== 'active') return;
    p.pos.x = Math.max(0, Math.min(WORLD_W, pos.x));
    p.pos.y = Math.max(0, Math.min(WORLD_H, pos.y));
    p.angle = angle;
    if (firing && !p.firing) p.lastFiredAt = Date.now();
    p.firing = firing;
  }

  onHit(attackerId: string, targetId: string): void {
    if (this.state !== 'active') return;
    const attacker = this.participants.get(attackerId);
    const target = this.participants.get(targetId);
    if (!attacker || !target || !attacker.alive || !target.alive) return;
    const def = getWeaponDef(attacker.weaponId);
    this.applyDamage(attacker, target, def?.damage ?? 1);
  }

  private applyDamage(attacker: Participant, target: Participant, damage: number): void {
    target.hp = Math.max(0, target.hp - damage);
    const died = target.hp <= 0 && target.alive;
    if (died) {
      target.alive = false;
      attacker.kills++;
    }
    this.io.to(this.id).emit('match:hit', { attackerId: attacker.id, targetId: target.id, hp: target.hp, died });
    if (died) this.checkEnd();
  }

  private tick(): void {
    if (this.state !== 'active') return;
    const now = Date.now();
    const list = [...this.participants.values()];
    for (const p of list) {
      if (!p.isBot || !p.alive) continue;
      updateBot(p, list, this.obstacles, TICK_MS / 1000, now);
      if (p.firing) {
        const enemies = list.filter((e) => e.alive && e.id !== p.id);
        let nearest: Participant | null = null;
        let nearestDist = Infinity;
        for (const e of enemies) {
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = e;
          }
        }
        if (nearest && nearestDist < 560 && Math.random() < 0.6) {
          const def = getWeaponDef(p.weaponId);
          this.applyDamage(p, nearest, def?.damage ?? 1);
        }
      }
    }
    this.io.to(this.id).emit('match:state', { participants: this.publicList(), t: now - this.startedAt });

    if (now - this.startedAt > MATCH_TIME_LIMIT_MS) this.checkEnd(true);
  }

  private checkEnd(force = false): void {
    if (this.ended) return;
    const alive = [...this.participants.values()].filter((p) => p.alive);
    if (!force && alive.length > 1) return;
    this.ended = true;
    this.state = 'ended';
    if (this.tickHandle) clearInterval(this.tickHandle);

    const ranked = [...this.participants.values()].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.kills - a.kills;
    });
    ranked.forEach((p, i) => (p.place = i + 1));

    void this.grantRewards(ranked);

    const results: MatchResultEntry[] = ranked.map((p) => ({ id: p.id, userId: p.userId, nickname: p.nickname, place: p.place!, kills: p.kills, isBot: p.isBot }));
    this.io.to(this.id).emit('match:end', { results });
    for (const s of this.sockets.values()) s.leave(this.id);
    setTimeout(() => this.destroy(), 500);
  }

  private async grantRewards(ranked: Participant[]): Promise<void> {
    for (const p of ranked) {
      if (p.isBot || !p.userId) continue;
      try {
        const user = await User.findById(p.userId);
        if (!user) continue;
        const reward = matchReward(p.place!, p.kills);
        grantReward(user, { coins: reward.coins }, 'pvp');
        addBp(user, reward.bpXp);
        await user.save();
      } catch {
        // гравець лишиться без нагороди цього разу — не блокуємо завершення матчу
      }
    }
  }

  removeSocket(socketId: string): void {
    const p = this.participants.get(socketId);
    if (p) {
      p.alive = false;
      p.firing = false;
    }
    this.sockets.delete(socketId);
    if (this.state === 'active') this.checkEnd();
  }

  hasRealPlayers(): boolean {
    return [...this.participants.values()].some((p) => !p.isBot);
  }

  destroy(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.participants.clear();
    this.sockets.clear();
  }
}
