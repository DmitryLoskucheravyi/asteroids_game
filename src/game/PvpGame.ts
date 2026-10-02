import type { Socket } from 'socket.io-client';
import { Vec2, circlesOverlap, clamp } from '../core/math';
import type { InputState } from '../core/input';
import { Save } from '../core/storage';
import { drawPlane } from './PlaneArt';
import { effectivePlaneSpec, getPlane, type PlaneId } from './planes';
import { applyItemPassive, getItemDef } from './items';
import { getWeaponDef, DEFAULT_WEAPON_ID, type WeaponDef } from './weapons';
import { Player } from './entities/Player';
import { Projectile } from './entities/Projectile';
import type { Viewport } from './Game';
import type { MatchInit, MatchResultEntry, Obstacle, PublicParticipant } from '../net/pvpProtocol';

const RADAR_VISIBLE_AFTER_FIRE_MS = 1300;
const SEND_EVERY = 0.1;

/** Легка PvP-гра: власний рух гравця + дротик-камера, решта учасників — просто дані з сервера. */
export class PvpGame {
  width = 1600;
  height = 900;
  readonly player: Player;
  participants = new Map<string, PublicParticipant>();
  obstacles: Obstacle[] = [];
  worldW = 6400;
  worldH = 3600;
  selfId: string | null = null;
  state: 'waiting' | 'countdown' | 'active' | 'ended' = 'countdown';
  results: MatchResultEntry[] = [];
  onMatchEnd: (results: MatchResultEntry[]) => void = () => {};
  onHitFeed: (text: string) => void = () => {};

  private projectiles: Projectile[] = [];
  private weapon: WeaponDef;
  private fireTimer = 0;
  private sendTimer = 0;
  private clock = 0;
  private cameraX = 0;
  private cameraY = 0;

  constructor(
    private readonly socket: Socket,
    private readonly input: InputState,
    planeId: PlaneId,
  ) {
    const progress = Save.progressFor(planeId);
    const loadout = Save.loadoutFor(planeId);
    let spec = effectivePlaneSpec(getPlane(planeId), progress);
    const passiveItem = Save.itemById(loadout.passive);
    if (passiveItem) spec = applyItemPassive(spec, getItemDef(passiveItem.defId), passiveItem.rarity);
    this.weapon = getWeaponDef(loadout.weapon ?? undefined) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
    this.player = new Player(spec, progress.tier, progress.level);
    this.player.reset(this.worldW / 2, this.worldH / 2);

    this.selfId = socket.id ?? null;
    socket.on('match:init', (data: MatchInit) => this.onInit(data));
    socket.on('match:start', () => {
      this.state = 'active';
    });
    socket.on('match:state', (data: { participants: PublicParticipant[] }) => {
      for (const p of data.participants) this.participants.set(p.id, p);
    });
    socket.on('match:hit', (data: { attackerId: string; targetId: string; hp: number; died: boolean }) => {
      const t = this.participants.get(data.targetId);
      if (t) {
        t.hp = data.hp;
        if (data.died) t.alive = false;
      }
      if (data.died) {
        const attacker = this.participants.get(data.attackerId);
        const target = this.participants.get(data.targetId);
        this.onHitFeed(`${attacker?.nickname ?? '?'} → ${target?.nickname ?? '?'}`);
      }
    });
    socket.on('match:end', (data: { results: MatchResultEntry[] }) => {
      this.state = 'ended';
      this.results = data.results;
      this.onMatchEnd(data.results);
    });
  }

  private onInit(data: MatchInit): void {
    this.worldW = data.world.w;
    this.worldH = data.world.h;
    this.obstacles = data.obstacles;
    this.selfId = this.socket.id ?? this.selfId;
    for (const p of data.participants) this.participants.set(p.id, p);
    this.player.reset(this.worldW / 2, this.worldH / 2);
    this.state = 'countdown';
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

  update(dt: number): void {
    this.clock += dt;
    if (this.state !== 'active' || !this.selfAlive) return;

    this.player.update(dt, this.input.axis(), this.worldW, this.worldH);

    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.input.firing() && this.fireTimer <= 0) {
      this.fireTimer = 1 / this.weapon.fireRate;
      const nose = this.player.nose();
      this.projectiles.push(new Projectile(this.weapon.kind, nose, this.player.angle, this.weapon.projectileSpeed, this.weapon.damage, this.weapon.splashRadius ?? 0));
    }
    this.updateProjectiles(dt);

    this.sendTimer -= dt;
    if (this.sendTimer <= 0) {
      this.sendTimer = SEND_EVERY;
      this.socket.emit('match:move', { pos: { x: this.player.pos.x, y: this.player.pos.y }, angle: this.player.angle, firing: this.input.firing() });
    }

    this.cameraX = clamp(this.player.pos.x, this.width / 2, this.worldW - this.width / 2);
    this.cameraY = clamp(this.player.pos.y, this.height / 2, this.worldH - this.height / 2);
  }

  private updateProjectiles(dt: number): void {
    const world = { width: this.worldW, height: this.worldH, playerPos: this.player.pos, time: this.clock };
    for (const pr of this.projectiles) {
      pr.update(dt, world);
      if (!pr.alive) continue;
      for (const o of this.obstacles) {
        if (circlesOverlap(pr.pos, pr.radius, new Vec2(o.x, o.y), o.r)) {
          pr.kill();
          break;
        }
      }
      if (!pr.alive) continue;
      for (const [id, p] of this.participants) {
        if (id === this.selfId || !p.alive) continue;
        if (circlesOverlap(pr.pos, pr.radius, new Vec2(p.pos.x, p.pos.y), 18)) {
          pr.kill();
          this.socket.emit('match:fire-hit', { targetId: id });
          break;
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.alive);
  }

  /** Мітки на радарі: чужі кораблі видно лише поки стріляють (і трохи після). */
  radarContacts(): { id: string; x: number; y: number; isSelf: boolean }[] {
    const now = Date.now();
    const out: { id: string; x: number; y: number; isSelf: boolean }[] = [];
    if (this.selfId) out.push({ id: this.selfId, x: this.player.pos.x, y: this.player.pos.y, isSelf: true });
    for (const [id, p] of this.participants) {
      if (id === this.selfId || !p.alive) continue;
      if (p.firing || now - p.lastFiredAt < RADAR_VISIBLE_AFTER_FIRE_MS) out.push({ id, x: p.pos.x, y: p.pos.y, isSelf: false });
    }
    return out;
  }

  render(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const w = vp.cw / vp.dpr;
    const h = vp.ch / vp.dpr;
    this.width = w;
    this.height = h;
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.fillStyle = '#05040d';
    ctx.fillRect(0, 0, w, h);

    const ox = w / 2 - this.cameraX;
    const oy = h / 2 - this.cameraY;
    ctx.save();
    ctx.translate(ox, oy);

    // зоряне поле — проста паралакс-сітка крапок
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const gstep = 140;
    const startX = Math.floor((this.cameraX - w) / gstep) * gstep;
    const startY = Math.floor((this.cameraY - h) / gstep) * gstep;
    for (let x = startX; x < this.cameraX + w; x += gstep) {
      for (let y = startY; y < this.cameraY + h; y += gstep) {
        ctx.fillRect(x + ((y * 7) % 23), y, 2, 2);
      }
    }

    ctx.strokeStyle = 'rgba(120,140,255,0.25)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, this.worldW, this.worldH);

    ctx.fillStyle = 'rgba(140,130,160,0.5)';
    ctx.strokeStyle = 'rgba(200,195,220,0.35)';
    ctx.lineWidth = 2;
    for (const o of this.obstacles) {
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (const [id, p] of this.participants) {
      if (id === this.selfId || !p.alive) continue;
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(p.angle + Math.PI / 2);
      drawPlane(ctx, (p.planeId as PlaneId) ?? 'falcon', 56, this.clock);
      ctx.restore();
      ctx.fillStyle = '#0a0918';
      ctx.fillRect(p.pos.x - 20, p.pos.y - 36, 40, 5);
      ctx.fillStyle = p.hp / p.maxHp > 0.4 ? '#4fe08a' : '#ff4a5a';
      ctx.fillRect(p.pos.x - 20, p.pos.y - 36, 40 * Math.max(0, p.hp / p.maxHp), 5);
    }

    if (this.selfAlive) {
      ctx.save();
      ctx.translate(this.player.pos.x, this.player.pos.y);
      ctx.rotate(this.player.angle + Math.PI / 2);
      drawPlane(ctx, this.player.spec.id, 56, this.clock);
      ctx.restore();
    }

    for (const pr of this.projectiles) pr.render(ctx, this.clock);

    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
