import { Vec2 } from '../../core/math';
import { t, type TKey } from '../../core/i18n';
import { drawGlow } from '../../game/fx';
import { drawPlane } from '../../game/PlaneArt';
import { PLANES, type PlaneId } from '../../game/planes';
import { WEAPON_DEFS, WeaponState, type WeaponDef } from '../../game/weapons';
import { Projectile } from '../../game/entities/Projectile';
import { Asteroid, BlackHole, BouncingAsteroid, Comet, HomingAsteroid } from '../../game/entities/Asteroid';
import { BossAsteroid, LaserGate, Mine } from '../../game/entities/Hazards';
import { drawAsteroid } from '../../game/AsteroidArt';
import { ParticleSystem } from '../../game/systems/Particles';
import { Vfx, beam, boostFx, cometTail, frostOverlay, iceShell, lightning, shieldBubble, shockwave, starFlare, trail, zoneFx } from '../../game/vfx';
import { signatureAt, SIGNATURE_GUNS, type SignatureAt } from '../../../server/src/shared/signature';
import { Icons, button, h, icon } from '../dom';
import { Screen } from '../Screen';
import { animateSkillSlots } from '../skillFx';
import { MainMenuScreen } from './MainMenuScreen';

/**
 * Dev-вітрина: усі літаки, постріли, фірмові гармати, ефекти й небезпеки в русі — щоб оцінювати графіку,
 * не граючи. Доступна лише в dev-збірці (кнопка в меню).
 */

type Tab = 'planes' | 'weapons' | 'signature' | 'effects' | 'hazards' | 'hud';
type Ctx = CanvasRenderingContext2D;

const TABS: [Tab, string][] = [
  ['planes', 'Літаки'],
  ['weapons', 'Зброя'],
  ['signature', 'Фірмові гармати'],
  ['effects', 'Ефекти'],
  ['hazards', 'Небезпеки'],
  ['hud', 'HUD скілів'],
];

const MISSILE_SPEED = 520;
const MISSILE_TURN = 2.2;

/** Підпис над клітинкою вітрини */
function label(ctx: Ctx, text: string, x: number, y: number, sub?: string): void {
  ctx.font = '700 13px Onest, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e8ecff';
  ctx.fillText(text, x, y);
  if (sub) {
    const w = ctx.measureText(text).width;
    ctx.font = '500 11px Onest, system-ui, sans-serif';
    ctx.fillStyle = '#8f9bc0';
    ctx.fillText(sub, x + w + 8, y + 2);
  }
}

/** Рамка клітинки */
function cell(ctx: Ctx, x: number, y: number, w: number, hgt: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  ctx.fillRect(x, y, w, hgt);
  ctx.strokeStyle = 'rgba(140,160,255,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hgt - 1);
}

interface Dummy {
  x: number;
  y: number;
  hitAt: number;
  burn: number;
  poison: number;
  slow: number;
  /** Зсув від буксира/притягання */
  ox: number;
  oy: number;
}

interface LaneMissile {
  pos: Vec2;
  angle: number;
  life: number;
  hist: { x: number; y: number }[];
  turn: number;
  color: string;
  sig: boolean;
}

interface LaneBeam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  life: number;
  color: string;
  rail?: boolean;
  wide?: number;
}

interface LaneZone {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  kind: 'fire' | 'acid' | 'void';
}

interface LaneChain {
  pts: number[];
  t: number;
  color: string;
}

/**
 * Доріжка стрільби: літак ліворуч стріляє по трьох мішенях праворуч. Для основної зброї — WeaponState,
 * для фірмової гармати — залп/перезарядка й візуальна імітація ефектів тіру (без урону).
 */
class Lane {
  x = 0;
  y = 0;
  w = 0;
  hgt = 0;
  readonly dummies: Dummy[] = [];
  private projectiles: Projectile[] = [];
  private missiles: LaneMissile[] = [];
  private beams: LaneBeam[] = [];
  private zones: LaneZone[] = [];
  private chains: LaneChain[] = [];
  private later: { at: number; fn: () => void }[] = [];
  private readonly gun?: WeaponState;
  private sigCd = 0.6;
  private sigLeft = 0;
  private sigTimer = 0;
  private sigIndex = 0;
  private time = 0;

  constructor(
    readonly title: string,
    readonly sub: string,
    readonly planeId: PlaneId,
    readonly tier: number,
    readonly level: number,
    private readonly vfx: Vfx,
    private readonly particles: ParticleSystem,
    readonly weapon?: WeaponDef,
    readonly sig?: SignatureAt,
  ) {
    if (weapon) this.gun = new WeaponState(weapon);
    for (let i = 0; i < 3; i++) this.dummies.push({ x: 0, y: 0, hitAt: -9, burn: 0, poison: 0, slow: 0, ox: 0, oy: 0 });
  }

  layout(x: number, y: number, w: number, hgt: number): void {
    this.x = x;
    this.y = y;
    this.w = w;
    this.hgt = hgt;
    const cy = y + hgt / 2 + 8;
    const spots = [0.55, 0.72, 0.88];
    this.dummies.forEach((d, i) => {
      d.x = x + w * spots[i];
      d.y = cy + (i - 1) * Math.min(14, hgt * 0.12);
    });
  }

  get muzzle(): { x: number; y: number } {
    return { x: this.x + 74, y: this.y + this.hgt / 2 + 8 };
  }

  update(dt: number): void {
    this.time += dt;
    const m = this.muzzle;
    if (this.later.length) {
      const due = this.later.filter((l) => l.at <= this.time);
      this.later = this.later.filter((l) => l.at > this.time);
      for (const l of due) l.fn();
    }
    if (this.gun && this.weapon) {
      const shots = this.gun.update(dt, true);
      for (let s = 0; s < shots; s++) this.fireWeapon(this.weapon, m);
    }
    if (this.sig) this.updateSig(dt, m);

    const world = { width: 99999, height: 99999, playerPos: new Vec2(), time: this.time };
    const right = this.x + this.w;
    for (const p of this.projectiles) {
      // рикошет від меж доріжки
      if (p.bounces > 0 && (p.pos.y < this.y + 26 || p.pos.y > this.y + this.hgt || p.pos.x > right)) {
        if (p.pos.x > right) p.vel.x = -Math.abs(p.vel.x);
        else p.vel.y = -p.vel.y;
        p.angle = Math.atan2(p.vel.y, p.vel.x);
        p.bounces--;
      }
      p.update(dt, world);
      if (!p.alive) continue;
      if (p.pos.x > right + 20 || p.pos.x < this.x - 20 || p.pos.y < this.y || p.pos.y > this.y + this.hgt + 10) {
        p.kill();
        continue;
      }
      for (let i = 0; i < this.dummies.length; i++) {
        const d = this.dummies[i];
        const id = String(i);
        if (p.hitIds.has(id) || Math.hypot(p.pos.x - d.x - d.ox, p.pos.y - d.y - d.oy) > 20 + p.radius) continue;
        this.onHit(d, i, p.pos.x, p.pos.y, p.kind === 'rocket', p.angle, p.splashRadius);
        if (p.pierce > 0) {
          p.pierce--;
          p.hitIds.add(id);
          continue;
        }
        p.kill();
        break;
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);

    for (const ms of this.missiles) {
      ms.life -= dt;
      let best: Dummy | null = null;
      let bestD = 9999;
      for (const d of this.dummies) {
        const dd = Math.hypot(d.x - ms.pos.x, d.y - ms.pos.y);
        if (dd < bestD) {
          bestD = dd;
          best = d;
        }
      }
      if (best) {
        const want = Math.atan2(best.y - ms.pos.y, best.x - ms.pos.x);
        let diff = want - ms.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = MISSILE_TURN * ms.turn * dt;
        ms.angle += Math.max(-turn, Math.min(turn, diff));
      }
      ms.hist.push({ x: ms.pos.x, y: ms.pos.y });
      if (ms.hist.length > 16) ms.hist.shift();
      ms.pos.add(Vec2.fromAngle(ms.angle), MISSILE_SPEED * dt);
      for (let i = 0; i < this.dummies.length; i++) {
        const d = this.dummies[i];
        if (Math.hypot(d.x - ms.pos.x, d.y - ms.pos.y) < 22) {
          ms.life = 0;
          this.onHit(d, i, ms.pos.x, ms.pos.y, true, ms.angle, 40);
          break;
        }
      }
    }
    this.missiles = this.missiles.filter((ms) => ms.life > 0);
    for (const b of this.beams) b.t += dt;
    this.beams = this.beams.filter((b) => b.t < b.life);
    for (const z of this.zones) z.t += dt;
    this.zones = this.zones.filter((z) => z.t < z.dur);
    for (const c of this.chains) c.t += dt;
    this.chains = this.chains.filter((c) => c.t < 0.25);
    for (const d of this.dummies) {
      d.burn = Math.max(0, d.burn - dt);
      d.poison = Math.max(0, d.poison - dt);
      d.slow = Math.max(0, d.slow - dt);
      d.ox *= Math.max(0, 1 - dt * 4);
      d.oy *= Math.max(0, 1 - dt * 4);
      if (d.burn && Math.random() < 0.5) this.particles.emit(d.x, d.y, { count: 1, speed: [20, 70], angle: -Math.PI / 2, spread: 0.8, life: [0.2, 0.5], size: [2, 4], colors: ['#fff1a8', '#ff8a1f', '#ff3a1a'], drag: 2 });
      if (d.poison && Math.random() < 0.4) this.particles.emit(d.x, d.y, { count: 1, speed: [10, 40], life: [0.3, 0.6], size: [2, 3], colors: ['#b8ff7a', '#5ac828'], drag: 2 });
    }
  }

  private fireWeapon(w: WeaponDef, m: { x: number; y: number }): void {
    const aim = (Math.random() - 0.5) * 2 * (w.spread ?? 0);
    if (w.kind === 'laser') {
      const end = this.rayEnd(m.x, m.y, aim, w.range ?? 380);
      this.beams.push({ x1: m.x, y1: m.y, x2: end.x, y2: end.y, t: 0, life: w.visual === 'rail' ? 0.4 : 0.16, color: w.visual === 'rail' ? '#6edcff' : '#c85aff', rail: w.visual === 'rail' });
      if (end.hit !== null) this.dummies[end.hit].hitAt = this.time;
      return;
    }
    if (w.kind === 'missile') {
      const n = w.salvo ?? 3;
      for (let i = 0; i < n; i++) this.missiles.push({ pos: new Vec2(m.x, m.y), angle: (i - (n - 1) / 2) * 0.32, life: 2.2, hist: [], turn: 1, color: '#ffb050', sig: false });
      this.vfx.flash(m.x + 4, m.y, 30, '#ffb050', 0.1);
      return;
    }
    const style = w.visual === 'pellet' || w.visual === 'plasma' ? w.visual : undefined;
    const n = w.pellets ?? 1;
    for (let i = 0; i < n; i++) {
      const a = n > 1 ? (Math.random() - 0.5) * 2 * (w.spread ?? 0.15) : aim;
      this.projectiles.push(new Projectile(w.kind as 'bullet' | 'rocket', new Vec2(m.x, m.y), a, w.projectileSpeed, w.damage, w.splashRadius ?? 0, false, null, (w.range ?? this.w) + 40, style));
    }
    this.vfx.flash(m.x + 4, m.y, w.kind === 'rocket' ? 34 : 18, w.kind === 'rocket' ? '#ffb050' : '#ffe9a0', w.kind === 'rocket' ? 0.1 : 0.06);
  }

  // ---------- фірмова гармата: залп, перезарядка, ефекти тіру ----------

  private updateSig(dt: number, m: { x: number; y: number }): void {
    const g = this.sig!;
    if (this.sigLeft <= 0) {
      this.sigCd -= dt;
      if (this.sigCd <= 0) {
        // у вітрині перезарядка коротша, ніж у бою, — щоб не чекати
        this.sigCd = Math.min(2.4, g.cooldown * 0.35);
        this.sigLeft = g.shots;
        this.sigTimer = 0;
        this.sigIndex = 0;
        if (g.fx.pulse) {
          for (let i = 0; i < g.fx.pulse.n; i++) this.at(i * g.fx.pulse.every / 1000, () => this.vfx.wave(m.x - 30, m.y, g.fx.pulse!.r, g.color, 0.5));
        }
      }
      return;
    }
    this.sigTimer -= dt;
    while (this.sigTimer <= 0 && this.sigLeft > 0) {
      this.fireSig(g, m);
      this.sigLeft--;
      this.sigTimer += g.interval / 1000;
      if (this.sigLeft === 0 && g.fx.back) {
        for (let i = 0; i < g.fx.back; i++) this.projectiles.push(this.sigProjectile(g, m.x - 50, m.y, Math.PI + (i - (g.fx.back - 1) / 2) * 0.12));
      }
    }
  }

  private sigProjectile(g: SignatureAt, x: number, y: number, a: number): Projectile {
    const style = g.visual === 'pellet' || g.visual === 'plasma' ? g.visual : undefined;
    const p = new Projectile(g.kind === 'rocket' ? 'rocket' : 'bullet', new Vec2(x, y), a, g.speed, g.damage, g.splash ?? 0, false, null, Math.min(g.range ?? this.w, this.w), style);
    p.pierce = g.fx.pierce ?? 0;
    p.bounces = g.fx.ricochet ?? 0;
    p.boomerang = !!g.fx.boomerang;
    p.tint = g.color;
    return p;
  }

  private fireSig(g: SignatureAt, m: { x: number; y: number }): void {
    const idx = this.sigIndex++;
    const aim = (Math.random() - 0.5) * 2 * (g.spread ?? 0);
    if (g.fx.homingEvery && idx % g.fx.homingEvery === g.fx.homingEvery - 1) {
      this.missiles.push({ pos: new Vec2(m.x, m.y), angle: aim, life: 2.2, hist: [], turn: 1, color: g.color, sig: true });
      return;
    }
    if (g.kind === 'laser') {
      const n = g.fx.parallel?.n ?? 1;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * (g.fx.parallel?.gap ?? 0);
        const end = this.rayEnd(m.x, m.y + off, aim, g.range ?? 600, g.fx.wide);
        this.beams.push({ x1: m.x, y1: m.y + off, x2: end.x, y2: end.y, t: 0, life: g.visual === 'rail' ? 0.4 : 0.16, color: g.color, rail: g.visual === 'rail', wide: g.fx.wide });
        if (end.hit !== null) this.onHit(this.dummies[end.hit], end.hit, end.x, end.y, false, aim, 0);
        // пробиття: промінь іде крізь кількох — підсвітимо й наступних
        if (g.fx.pierce) for (let k = (end.hit ?? 9) + 1; k < this.dummies.length && k <= (end.hit ?? 9) + g.fx.pierce; k++) this.dummies[k].hitAt = this.time;
      }
      if (g.fx.echo) {
        const e = g.fx.echo;
        this.at(e.delay / 1000, () => {
          const end = this.rayEnd(m.x, m.y, aim, g.range ?? 600, g.fx.wide);
          this.beams.push({ x1: m.x, y1: m.y, x2: end.x, y2: end.y, t: 0, life: 0.2, color: g.color });
        });
      }
      this.vfx.flash(m.x + 4, m.y, 26, g.color, 0.08);
      return;
    }
    if (g.kind === 'missile') {
      const n = g.salvo ?? 2;
      for (let i = 0; i < n; i++) this.missiles.push({ pos: new Vec2(m.x, m.y), angle: aim + (i - (n - 1) / 2) * 0.32, life: 2.2, hist: [], turn: g.fx.turnMul ?? 1, color: g.color, sig: true });
      this.vfx.flash(m.x + 4, m.y, 30, g.color, 0.1);
      return;
    }
    const n = g.pellets ?? 1;
    for (let i = 0; i < n; i++) {
      const a = g.ring ? ((i + (idx % 2) * 0.5) / n) * Math.PI * 2 : n > 1 ? (Math.random() - 0.5) * 2 * (g.spread ?? 0.2) : aim;
      this.projectiles.push(this.sigProjectile(g, m.x, m.y, a));
    }
    this.vfx.flash(m.x + 4, m.y, g.kind === 'rocket' ? 34 : 20, g.color, 0.08);
  }

  /** Влучання: спалах на мішені + ефекти фірмової гармати (лише візуал). */
  private onHit(d: Dummy, index: number, x: number, y: number, explode: boolean, angle: number, splash: number): void {
    d.hitAt = this.time;
    this.particles.emit(x, y, { count: 6, speed: [60, 200], life: [0.15, 0.35], size: [2, 3], colors: ['#ffffff', '#ffd27a', '#ff8a3a'] });
    if (explode) {
      this.vfx.explode(x, y, 22 + splash * 0.15, '#ff9a3a', 0.6);
      if (splash) this.vfx.wave(x, y, splash, '255,170,80', 0.4);
    }
    const g = this.sig;
    if (!g) return;
    const fx = g.fx;
    const others = this.dummies.map((o, i) => ({ o, i })).filter((q) => q.i !== index);
    if (fx.dot?.kind === 'burn') d.burn = fx.dot.dur;
    if (fx.dot?.kind === 'poison') d.poison = fx.dot.dur;
    if (fx.dot?.spread) for (const q of others) {
      q.o.burn = fx.dot.dur;
      this.chains.push({ pts: [d.x, d.y, q.o.x, q.o.y], t: 0, color: '#ff8a1f' });
    }
    if (fx.slow || fx.stun) d.slow = Math.max(fx.slow ?? 0, fx.stun ?? 0);
    if (fx.chain) {
      const pts = [d.x, d.y];
      for (const q of others.slice(0, fx.chain.n)) {
        pts.push(q.o.x, q.o.y);
        q.o.hitAt = this.time;
        if (fx.stun) q.o.slow = fx.stun;
      }
      this.chains.push({ pts, t: 0, color: g.color });
    }
    if (fx.storm) {
      for (let i = 0; i < fx.storm.n; i++) {
        this.at(((i + 1) * fx.storm.every) / 1000, () => {
          const sx = d.x + (Math.random() - 0.5) * fx.storm!.r;
          const sy = d.y + (Math.random() - 0.5) * fx.storm!.r * 0.4;
          this.vfx.bolt(sx + (Math.random() - 0.5) * 50, this.y + 20, sx, sy, g.color, 0.3, 3);
          this.vfx.wave(sx, sy, fx.storm!.area, g.color, 0.35);
        });
      }
    }
    if (fx.forks) {
      for (let i = 0; i < fx.forks.n; i++) {
        const a = angle + (i - (fx.forks.n - 1) / 2) * fx.forks.arc * 2;
        const l = Math.min(fx.forks.range, 140);
        this.beams.push({ x1: x, y1: y, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l, t: 0, life: 0.18, color: g.color });
      }
    }
    if (fx.tow) d.ox -= 26;
    if (fx.pull) {
      for (const q of others) q.o.ox += Math.sign(d.x - q.o.x) * 14;
      this.vfx.wave(x, y, fx.pull.r * 0.5, g.color, 0.4, fx.pull.r * 0.5);
    }
    if (fx.lifesteal) {
      const m = this.muzzle;
      this.chains.push({ pts: [d.x, d.y, m.x - 30, m.y], t: 0, color: '#4fe08a' });
    }
    if (fx.zone) this.zones.push({ x, y, r: Math.min(fx.zone.r, this.hgt * 0.45), t: 0, dur: fx.zone.dur, kind: fx.zone.kind });
    if (fx.split) {
      for (let i = 0; i < fx.split.n; i++) {
        const a = Math.random() * Math.PI * 2;
        const p = new Projectile(fx.split.kind, new Vec2(x, y), a, fx.split.speed, 0, fx.split.splash ?? 0, false, null, Math.min(fx.split.range, 120));
        p.tint = g.color;
        p.hitIds.add(String(index));
        this.projectiles.push(p);
      }
    }
    if (fx.shockRing) this.at(fx.shockRing.delay / 1000, () => this.vfx.wave(x, y, Math.min(fx.shockRing!.r, this.hgt), g.color, 0.5));
  }

  private at(delay: number, fn: () => void): void {
    this.later.push({ at: this.time + delay, fn });
  }

  /** Кінець променя: перша мішень на шляху або межа дальності/доріжки. */
  private rayEnd(x: number, y: number, a: number, range: number, wide = 1): { x: number; y: number; hit: number | null } {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = Math.min(range, this.x + this.w - x);
    let hit: number | null = null;
    this.dummies.forEach((d, i) => {
      const fx = d.x - x;
      const fy = d.y - y;
      const along = fx * dx + fy * dy;
      if (along < 0) return;
      const perp = Math.sqrt(Math.max(0, fx * fx + fy * fy - along * along));
      if (perp < 20 * wide && along < best) {
        best = along - 14;
        hit = i;
      }
    });
    return { x: x + dx * best, y: y + dy * best, hit };
  }

  render(ctx: Ctx, clock: number): void {
    cell(ctx, this.x, this.y, this.w, this.hgt);
    label(ctx, this.title, this.x + 10, this.y + 8, this.sub);
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.x, this.y + 24, this.w, this.hgt - 24);
    ctx.clip();
    for (const z of this.zones) zoneFx(ctx, z.x, z.y, z.r, z.kind, z.t / z.dur, clock, this.sig?.color);
    // мішені — ворожі літаки носом до стрільця
    for (const d of this.dummies) {
      const x = d.x + d.ox;
      const y = d.y + d.oy;
      const flash = clock - d.hitAt < 0.1;
      if (d.slow) drawGlow(ctx, x, y, 'rgba(120,200,255,1)', 40, 0.4);
      if (d.burn) drawGlow(ctx, x, y, 'rgba(255,120,40,1)', 34, 0.35);
      if (d.poison) drawGlow(ctx, x, y, 'rgba(120,230,60,1)', 34, 0.3);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 2);
      ctx.globalAlpha = 0.85;
      drawPlane(ctx, 'viper', 40, clock, 1, 1);
      ctx.restore();
      if (flash) drawGlow(ctx, x, y, 'rgba(255,240,200,1)', 30, 0.8);
    }
    // стрілець
    ctx.save();
    ctx.translate(this.x + 44, this.y + this.hgt / 2 + 8);
    ctx.rotate(Math.PI / 2);
    drawPlane(ctx, this.planeId, 54, clock, this.tier, this.level);
    ctx.restore();
    for (const ms of this.missiles) {
      if (ms.hist.length > 1) trail(ctx, [...ms.hist, ms.pos], ms.color, 4, true);
      drawGlow(ctx, ms.pos.x, ms.pos.y, 'rgba(255,220,140,1)', 10, 1);
      ctx.fillStyle = ms.color;
      ctx.beginPath();
      ctx.arc(ms.pos.x, ms.pos.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.projectiles) p.render(ctx, clock);
    for (const b of this.beams) beam(ctx, b.x1, b.y1, b.x2, b.y2, 1 - b.t / b.life, clock, { color: b.color, rail: b.rail, wide: b.wide });
    for (const c of this.chains) {
      const k = 1 - c.t / 0.25;
      for (let i = 0; i + 3 < c.pts.length; i += 2) lightning(ctx, c.pts[i], c.pts[i + 1], c.pts[i + 2], c.pts[i + 3], c.color, k, i * 17 + Math.floor(clock * 30));
    }
    ctx.restore();
  }
}

/** Петля демонстрації в одній клітинці "Ефекти"/"Небезпеки". */
interface Demo {
  title: string;
  sub?: string;
  /** Тривалість циклу, с */
  loop: number;
  draw(ctx: Ctx, cx: number, cy: number, w: number, hgt: number, t: number, clock: number): void;
  /** Скинути стан на початку циклу */
  reset?(cx: number, cy: number): void;
}

export class ShowcaseScreen extends Screen {
  private tab: Tab = 'planes';
  private tier = 4;
  private level = 4;
  private speed = 1;
  private paused = false;
  private canvas!: HTMLCanvasElement;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private readonly vfx = new Vfx();
  private readonly particles = new ParticleSystem();
  private lanes: Lane[] = [];
  private demos: Demo[] = [];
  private hudTimer = 0;

  protected build(): HTMLElement {
    this.canvas = h('canvas', { class: 'showcase-canvas' }) as HTMLCanvasElement;
    const tabs = h(
      'div',
      { class: 'showcase-tabs', role: 'tablist' },
      ...TABS.map(([id, name]) => button(name, () => this.setTab(id), `tab${this.tab === id ? ' on' : ''}`, { role: 'tab', 'aria-selected': this.tab === id })),
    );
    const seg = (name: string, values: number[], cur: number, set: (v: number) => void, fmt: (v: number) => string) =>
      h('div', { class: 'showcase-seg' }, h('small', {}, name), ...values.map((v) => button(fmt(v), () => set(v), `seg-btn${v === cur ? ' on' : ''}`)));
    const controls = h(
      'div',
      { class: 'showcase-controls' },
      seg('Тір', [1, 2, 3, 4], this.tier, (v) => this.setOpt(() => (this.tier = v)), (v) => `T${v}`),
      seg('Рівень', [1, 2, 3, 4], this.level, (v) => this.setOpt(() => (this.level = v)), (v) => `L${v}`),
      seg('Швидкість', [0.1, 0.25, 0.5, 1], this.speed, (v) => this.setOpt(() => (this.speed = v), false), (v) => `×${v}`),
      button(this.paused ? '▶ Пуск' : '❚❚ Пауза', () => this.setOpt(() => (this.paused = !this.paused), false), 'seg-btn'),
    );
    const hud = this.tab === 'hud' ? this.hudDemo() : null;
    return h(
      'div',
      { class: 'page showcase' },
      h('div', { class: 'screen-head' }, button(h('span', {}, icon(Icons.back), ' Назад'), () => this.onBack(), 'back-btn'), h('h2', {}, 'Вітрина анімацій'), h('span', { class: 'dev-tag' }, 'DEV')),
      tabs,
      controls,
      hud ?? this.canvas,
    );
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    this.rebuild();
  }

  private setOpt(fn: () => void, rebuild = true): void {
    fn();
    if (rebuild) this.rebuild();
    else this.render();
  }

  private rebuild(): void {
    this.render();
    this.vfx.clear();
    this.particles.clear();
    this.setupScene();
  }

  onShow(): void {
    super.onShow();
    this.setupScene();
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - this.last) / 1000) * (this.paused ? 0 : this.speed);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  onHide(): void {
    cancelAnimationFrame(this.raf);
  }

  onBack(): void {
    this.app.show(new MainMenuScreen(this.app));
  }

  // ---------- сцени ----------

  private setupScene(): void {
    this.lanes = [];
    this.demos = [];
    const tier = this.tier;
    const level = this.level;
    if (this.tab === 'weapons') {
      for (const w of WEAPON_DEFS) this.lanes.push(new Lane(t(w.nameKey), `${w.kind}${w.visual ? ' · ' + w.visual : ''}`, 'falcon', tier, level, this.vfx, this.particles, w));
    } else if (this.tab === 'signature') {
      for (const id of Object.keys(SIGNATURE_GUNS) as PlaneId[]) {
        const g = signatureAt(id, tier);
        this.lanes.push(new Lane(`${t(`plane.${id}` as TKey)} — ${t(`sig.${g.id}` as TKey)}`, tier > 1 ? `T${tier}: ${t(`sigTier.${id}.${tier}` as TKey)}` : t(`sigDesc.${g.id}` as TKey), id, tier, level, this.vfx, this.particles, undefined, g));
      }
    } else if (this.tab === 'effects') {
      this.demos = this.effectDemos();
    } else if (this.tab === 'hazards') {
      this.demos = this.hazardDemos();
    }
  }

  private frame(dt: number): void {
    if (this.tab === 'hud') {
      this.hudTick(dt);
      return;
    }
    const c = this.canvas;
    if (!c.isConnected) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const hgt = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hgt * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05040d';
    ctx.fillRect(0, 0, w, hgt);
    this.clock += dt;
    this.vfx.update(dt);
    this.particles.update(dt);

    if (this.tab === 'planes') this.drawPlanes(ctx, w);
    else if (this.lanes.length) {
      const cols = this.tab === 'signature' ? 2 : 1;
      const rows = Math.ceil(this.lanes.length / cols);
      const lw = (w - 12 * (cols + 1)) / cols;
      const lh = Math.max(96, Math.min(150, (hgt - 12) / rows - 8));
      this.lanes.forEach((l, i) => {
        l.layout(12 + (i % cols) * (lw + 12), 6 + Math.floor(i / cols) * (lh + 8), lw, lh);
        l.update(dt);
        l.render(ctx, this.clock);
      });
      this.ensureHeight(6 + rows * (lh + 8));
    } else if (this.demos.length) {
      const cols = Math.max(2, Math.floor(w / 300));
      const cw = (w - 12 * (cols + 1)) / cols;
      const ch = 230;
      this.demos.forEach((d, i) => {
        const x = 12 + (i % cols) * (cw + 12);
        const y = 6 + Math.floor(i / cols) * (ch + 12);
        cell(ctx, x, y, cw, ch);
        label(ctx, d.title, x + 10, y + 8, d.sub);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y + 24, cw, ch - 24);
        ctx.clip();
        const tt = this.clock % d.loop;
        if (d.reset && tt < dt + 1e-6) d.reset(x + cw / 2, y + ch / 2 + 12);
        d.draw(ctx, x + cw / 2, y + ch / 2 + 12, cw, ch - 24, tt, this.clock);
        ctx.restore();
      });
      this.ensureHeight(6 + Math.ceil(this.demos.length / cols) * (ch + 12));
    }
    this.particles.render(ctx);
    this.vfx.render(ctx, this.clock);
  }

  /** Полотно росте за вмістом — сторінку можна гортати. */
  private ensureHeight(px: number): void {
    const want = `${Math.max(px + 10, 400)}px`;
    if (this.canvas.style.height !== want) this.canvas.style.height = want;
  }

  private drawPlanes(ctx: Ctx, w: number): void {
    const cols = Math.max(3, Math.floor(w / 220));
    const cw = (w - 12 * (cols + 1)) / cols;
    const ch = 200;
    PLANES.forEach((p, i) => {
      const x = 12 + (i % cols) * (cw + 12);
      const y = 6 + Math.floor(i / cols) * (ch + 12);
      cell(ctx, x, y, cw, ch);
      label(ctx, t(`plane.${p.id}` as TKey), x + 10, y + 8, `T${this.tier} · L${this.level}`);
      const cx = x + cw / 2;
      const cy = y + ch / 2 + 14;
      // вихлоп і сам літак у русі (нахил туди-сюди)
      const a = Math.sin(this.clock * 0.8 + i) * 0.25;
      const ex = cx - Math.sin(a) * -40;
      drawGlow(ctx, ex, cy + Math.cos(a) * 40, `rgba(${parseInt(p.flame[1].slice(1, 3), 16)},${parseInt(p.flame[1].slice(3, 5), 16)},${parseInt(p.flame[1].slice(5, 7), 16)},1)`, 24, 0.7);
      if (Math.random() < 0.5) this.particles.emit(cx + Math.sin(a) * -36, cy + Math.cos(a) * 36, { count: 1, speed: [60, 120], angle: Math.PI / 2 - a, spread: 0.25, life: [0.15, 0.3], size: [3, 5], colors: p.flame, drag: 3 });
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      drawPlane(ctx, p.id, 110, this.clock, this.tier, this.level);
      ctx.restore();
    });
    this.ensureHeight(6 + Math.ceil(PLANES.length / cols) * (ch + 12));
  }

  // ---------- ефекти ----------

  private effectDemos(): Demo[] {
    const vfx = this.vfx;
    const particles = this.particles;
    const ghosts = (ctx: Ctx, cx: number, cy: number, t: number, clock: number) => {
      const k = (t % 1.2) / 1.2;
      const x0 = cx - 90;
      const x1 = cx + 90;
      const px = x0 + (x1 - x0) * Math.min(1, k * 6);
      for (let i = 0; i < 5; i++) {
        const gk = k - i * 0.03;
        if (gk < 0.17 || gk > 0.45) continue;
        ctx.save();
        ctx.globalAlpha = 0.45 * (1 - (gk - 0.17) / 0.28);
        ctx.translate(x0 + ((x1 - x0) * i) / 5, cy);
        ctx.rotate(Math.PI / 2);
        drawPlane(ctx, 'phantom', 60, clock, this.tier, this.level);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(px, cy);
      ctx.rotate(Math.PI / 2);
      drawPlane(ctx, 'phantom', 60, clock, this.tier, this.level);
      ctx.restore();
    };
    return [
      { title: 'Вибух', sub: 'вогняна куля, дим, уламки', loop: 1, reset: (x, y) => vfx.explode(x, y, 46, '#ff9a3a', 0.85), draw: () => {} },
      { title: 'Великий вибух', sub: 'смерть літака / міна', loop: 1.3, reset: (x, y) => { vfx.explode(x, y, 70, '#ff9a3a', 1.1); vfx.wave(x, y, 110, '255,170,80', 0.6); particles.emit(x, y, { count: 40, speed: [80, 360], life: [0.4, 1], size: [2, 5], colors: ['#fff1a8', '#ffb020', '#ff5a1f'], drag: 2.2 }); }, draw: () => {} },
      { title: 'Ударна хвиля', sub: 'хвиля ривка / імпульс', loop: 1, draw: (ctx, x, y, _w, hh, t) => shockwave(ctx, x, y, 10 + (hh * 0.45) * (1 - Math.pow(1 - t, 3)), t, '120,190,255') },
      { title: 'Спалах', sub: 'дуло / влучання', loop: 0.6, draw: (ctx, x, y, _w, _h, t, c) => starFlare(ctx, x, y, 60 * (1 - t), '#ffb050', 1 - t, c) },
      { title: 'Лазер', sub: 'імпульси, ядро, іскри', loop: 0.5, draw: (ctx, x, y, w, _h, t, c) => beam(ctx, x - w * 0.4, y, x + w * 0.4, y, 1 - t * 0.6, c, { color: '#c85aff' }) },
      { title: 'Рейкотрон', sub: 'подвійна спіраль', loop: 0.8, draw: (ctx, x, y, w, _h, t, c) => beam(ctx, x - w * 0.4, y, x + w * 0.4, y, 1 - t, c, { color: '#6edcff', rail: true }) },
      { title: 'Промінь-тягач', sub: 'широкий', loop: 0.5, draw: (ctx, x, y, w, _h, t, c) => beam(ctx, x - w * 0.4, y, x + w * 0.4, y, 1 - t * 0.6, c, { color: '#3adc78', wide: 2 }) },
      { title: 'Блискавка', sub: 'ланцюг із відгалуженнями', loop: 0.4, draw: (ctx, x, y, w, _h, t, c) => { lightning(ctx, x - w * 0.4, y - 30, x, y + 20, '#9fd0ff', 1 - t * 0.5, Math.floor(c * 24)); lightning(ctx, x, y + 20, x + w * 0.4, y - 20, '#9fd0ff', 1 - t * 0.5, Math.floor(c * 24) + 7); } },
      { title: 'Шторм', sub: 'удари згори', loop: 0.7, reset: (x, y) => { vfx.bolt(x + (Math.random() - 0.5) * 80, y - 110, x + (Math.random() - 0.5) * 60, y + 30, '#9fd0ff', 0.3, 3.4); vfx.wave(x, y + 30, 50, '#9fd0ff', 0.35); }, draw: () => {} },
      { title: 'Щит', sub: 'гекс-бульбашка', loop: 10, draw: (ctx, x, y, _w, _h, _t, c) => { ctx.save(); ctx.translate(x, y); drawPlane(ctx, 'titan', 70, c, this.tier, this.level); ctx.restore(); shieldBubble(ctx, x, y, 48, c); } },
      { title: 'Форсаж', sub: 'конус і смуги швидкості', loop: 10, draw: (ctx, x, y, _w, _h, _t, c) => { boostFx(ctx, x + 20, y, 0, c, ['#9fe3ff', '#2f7bff']); ctx.save(); ctx.translate(x + 20, y); ctx.rotate(Math.PI / 2); drawPlane(ctx, 'falcon', 64, c, this.tier, this.level); ctx.restore(); } },
      { title: 'Ривок', sub: 'фантомні копії', loop: 1.2, draw: (ctx, x, y, _w, _h, t, c) => ghosts(ctx, x, y, t, c) },
      { title: 'Заморозка', sub: 'іній з країв', loop: 2.5, draw: (ctx, x, y, w, hh, t, c) => { ctx.save(); ctx.translate(x - w / 2, y - hh / 2); frostOverlay(ctx, w, hh, Math.min(1, t * 3, (2.5 - t) * 3), c); ctx.restore(); } },
      { title: 'Крижаний панцир', sub: 'замерзлий астероїд', loop: 10, draw: (ctx, x, y, _w, _h, _t, c) => { ctx.save(); ctx.translate(x, y); drawAsteroid(ctx, 'medium', 2, 58); ctx.restore(); iceShell(ctx, x, y, 30, c); } },
      { title: 'Зона вогню', sub: 'мортира / фенікс', loop: 2.5, draw: (ctx, x, y, _w, hh, t, c) => zoneFx(ctx, x, y, hh * 0.38, 'fire', t / 2.5, c) },
      { title: 'Кислотна калюжа', sub: 'гадюка', loop: 2.5, draw: (ctx, x, y, _w, hh, t, c) => zoneFx(ctx, x, y, hh * 0.38, 'acid', t / 2.5, c) },
      { title: 'Мікро-«чорна діра»', sub: 'колектор', loop: 2, draw: (ctx, x, y, _w, hh, t, c) => zoneFx(ctx, x, y, hh * 0.4, 'void', t / 2, c, '#18c8b0') },
      { title: 'Комета-хвіст', sub: 'полум’я в три шари', loop: 10, draw: (ctx, x, y, _w, _h, _t, c) => { ctx.save(); ctx.translate(x + 70, y); cometTail(ctx, -1, 0.15, 11, c); ctx.restore(); drawGlow(ctx, x + 70, y, 'rgba(255,170,60,1)', 40, 0.9); } },
    ];
  }

  // ---------- небезпеки ----------

  private hazardDemos(): Demo[] {
    const world = (x: number, y: number) => ({ width: 99999, height: 99999, playerPos: new Vec2(x, y), time: this.clock });
    const make = <T>(f: () => T) => {
      let v: T | null = null;
      return { get: () => (v ??= f()), set: (n: T) => (v = n) };
    };
    const hole = make(() => new BlackHole(new Vec2(0, 0), new Vec2(), 900));
    const frozenHole = make(() => new BlackHole(new Vec2(0, 0), new Vec2(), 900));
    let comet: Comet | null = null;
    let mine: Mine | null = null;
    let gate: LaserGate | null = null;
    const boss = make(() => new BossAsteroid(new Vec2(0, 0), new Vec2(), 3));
    const rocks = make(() => [new Asteroid('small', new Vec2(), new Vec2()), new Asteroid('medium', new Vec2(), new Vec2()), new Asteroid('large', new Vec2(), new Vec2())]);
    const hunter = make(() => new HomingAsteroid('medium', new Vec2(), new Vec2()));
    const bouncer = make(() => new BouncingAsteroid('medium', new Vec2(), new Vec2()));
    const dt = () => 1 / 60;
    return [
      {
        title: 'Чорна діра',
        sub: 'диск, лінзування, пил',
        loop: 10,
        draw: (ctx, x, y, _w, _h, _t, c) => {
          const bh = hole.get();
          bh.pos.set(x, y);
          bh.update(dt(), world(x, y));
          bh.pos.set(x, y);
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(0.55, 0.55);
          ctx.translate(-x, -y);
          bh.render(ctx, c);
          ctx.restore();
        },
      },
      {
        title: 'Чорна діра (заморожена)',
        loop: 10,
        draw: (ctx, x, y, _w, _h, _t, c) => {
          const bh = frozenHole.get();
          bh.pos.set(x, y);
          bh.frozen = true;
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(0.55, 0.55);
          ctx.translate(-x, -y);
          bh.render(ctx, c);
          ctx.restore();
        },
      },
      {
        title: 'Комета',
        sub: 'попередження → проліт',
        loop: 2.4,
        reset: (x, y) => (comet = new Comet(new Vec2(x - 160, y - 40), new Vec2(1, 0.25), 300)),
        draw: (ctx, _x, _y, _w, _h, _t, c) => {
          if (!comet) return;
          comet.update(dt() * this.speed, world(0, 0));
          comet.render(ctx, c);
        },
      },
      {
        title: 'Міна',
        sub: 'озброєння → таймер → вибух',
        loop: 3.2,
        reset: (x, y) => (mine = new Mine(new Vec2(x, y))),
        draw: (ctx, x, y, _w, _h, t, c) => {
          if (!mine) return;
          // "літак" підлітає після озброєння
          mine.update(dt() * this.speed, world(t > 1.5 ? x : x + 400, y));
          if (mine.detonate) {
            this.vfx.explode(x, y, 50, '#ff8a3a', 0.9);
            this.vfx.wave(x, y, 90, '255,120,60', 0.5);
            mine = null;
            return;
          }
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(0.8, 0.8);
          ctx.translate(-x, -y);
          mine.render(ctx, c);
          ctx.restore();
        },
      },
      {
        title: 'Лазерні ворота',
        sub: 'заряд → промінь',
        loop: 3,
        reset: (x, y) => (gate = new LaserGate(new Vec2(x, y), 0)),
        draw: (ctx, _x, _y, _w, _h, _t, c) => {
          if (!gate) return;
          gate.update(dt() * this.speed, world(0, 0));
          if (gate.alive) gate.render(ctx, c);
        },
      },
      {
        title: 'Бос',
        sub: 'заряд залпу',
        loop: 10,
        draw: (ctx, x, y, _w, _h, _t, c) => {
          const b = boss.get();
          b.pos.set(x, y);
          b.update(dt() * this.speed, world(x, y));
          b.pos.set(x, y);
          if (b.pendingBurst) {
            b.pendingBurst = false;
            this.vfx.wave(x, y, 120, '255,120,60', 0.5);
          }
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(0.5, 0.5);
          ctx.translate(-x, -y);
          b.render(ctx, c);
          ctx.restore();
        },
      },
      {
        title: 'Астероїди',
        sub: 'малий · середній · великий',
        loop: 10,
        draw: (ctx, x, y, w, _h, _t, c) => {
          rocks.get().forEach((a, i) => {
            a.pos.set(x + (i - 1) * w * 0.3, y);
            a.update(dt() * this.speed, world(0, 0));
            a.pos.set(x + (i - 1) * w * 0.3, y);
            a.render(ctx, c);
          });
        },
      },
      {
        title: 'Мисливець',
        sub: 'самонавідний',
        loop: 10,
        draw: (ctx, x, y, _w, _h, _t, c) => {
          const a = hunter.get();
          a.pos.set(x, y);
          a.render(ctx, c);
        },
      },
      {
        title: 'Рикошетний',
        sub: 'відбивається від країв',
        loop: 10,
        draw: (ctx, x, y, _w, _h, _t, c) => {
          const a = bouncer.get();
          a.pos.set(x, y);
          a.render(ctx, c);
        },
      },
    ];
  }

  // ---------- HUD ----------

  private hudSlots: { el: HTMLElement; kind: string }[] = [];

  /** Живі слоти скілів: по черзі перезарядка → готово → активний. */
  private hudDemo(): HTMLElement {
    const mk = (cls: string, ico: string, name: string, key: string) => {
      const el = h('div', { class: `skill ${cls}` }, h('span', { class: 'sk-inner' }, icon(ico), h('span', { class: 'sk-count' }), h('span', { class: 'sk-key' }, key), h('span', { class: 'sk-label' }, name)));
      return el;
    };
    const items: [string, string, string, string][] = [
      ['sk-freeze', Icons.snow, 'Мороз', '1'],
      ['sk-boost', Icons.bolt, 'Форсаж', '2'],
      ['sk-jump', Icons.dash, 'Ривок', 'SHIFT'],
      ['sk-flare', Icons.star, 'Пастки', '3'],
      ['sk-sig', Icons.star, 'Гармата', 'X'],
    ];
    this.hudSlots = items.map(([cls, ico, name, key]) => ({ el: mk(cls, ico, name, key), kind: cls }));
    const row = animateSkillSlots(h('div', { class: 'hud-skills showcase-hud' }, ...this.hudSlots.map((s) => s.el)));
    return h(
      'div',
      { class: 'showcase-hud-wrap' },
      h('p', { class: 'muted' }, 'Слоти по черзі: перезарядка (сірий, світла кромка сектора) → спалах «готово» → активний (пульсує).'),
      row,
    );
  }

  private hudTick(dt: number): void {
    this.hudTimer += dt;
    this.hudSlots.forEach((s, i) => {
      // цикл 5 с зі зсувом для кожного слота: 0–2.5 перезарядка, 2.5–3.5 готовий, 3.5–5 активний
      const tt = (this.hudTimer + i * 0.7) % 5;
      const el = s.el;
      const cooling = tt < 2.5;
      const active = tt >= 3.5;
      el.classList.toggle('empty', cooling);
      el.classList.toggle('active', active);
      el.style.setProperty('--p', String(cooling ? 1 - tt / 2.5 : active ? 1 - (tt - 3.5) / 1.5 : 0));
      const count = el.querySelector('.sk-count');
      if (count) count.textContent = cooling ? (2.5 - tt).toFixed(1) : active ? '' : 'OK';
    });
  }
}
