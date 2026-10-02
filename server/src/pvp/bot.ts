import type { Participant, Obstacle, ServerProjectile, Vec, Pickup } from './types.js';
import { WORLD_W, WORLD_H, FLARE_COOLDOWN_MS } from './constants.js';
import { getWeaponDef, DEFAULT_WEAPON_ID } from '../content/weapons.js';

const DETECT_RADIUS = 1100;
const ATTACK_RANGE = 650;
const FLEE_HP_PCT = 0.25;
/** Швидкість повороту, рад/с — бот летить як літак: лише вперед, розвертається дугою. */
const TURN_RATE = 2.3;
const EDGE = 260;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDiff(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Відхилення від найближчих перешкод і країв світу — щоб боти не застрягали. */
function avoidance(pos: Vec, obstacles: readonly Obstacle[]): Vec {
  let ax = 0;
  let ay = 0;
  for (const o of obstacles) {
    const d = dist(pos, o);
    const margin = o.r + 130;
    if (d < margin) {
      const push = (margin - d) / margin;
      ax += ((pos.x - o.x) / (d || 1)) * push * 2;
      ay += ((pos.y - o.y) / (d || 1)) * push * 2;
    }
  }
  if (pos.x < EDGE) ax += (EDGE - pos.x) / EDGE * 2;
  if (pos.x > WORLD_W - EDGE) ax -= (pos.x - (WORLD_W - EDGE)) / EDGE * 2;
  if (pos.y < EDGE) ay += (EDGE - pos.y) / EDGE * 2;
  if (pos.y > WORLD_H - EDGE) ay -= (pos.y - (WORLD_H - EDGE)) / EDGE * 2;
  return { x: ax, y: ay };
}

export interface BotActions {
  /** Кути пострілів у цьому тіку */
  shots: number[];
  flare: boolean;
}

export function updateBot(bot: Participant, others: readonly Participant[], obstacles: readonly Obstacle[], projectiles: readonly ServerProjectile[], pickups: Iterable<Pickup>, dt: number, now: number): BotActions {
  const out: BotActions = { shots: [], flare: false };
  if (!bot.alive) return out;

  let nearest: Participant | null = null;
  let nearestDist = Infinity;
  for (const e of others) {
    if (!e.alive || e.id === bot.id) continue;
    const d = dist(bot.pos, e.pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }

  const hpPct = bot.hp / bot.maxHp;
  if (hpPct < FLEE_HP_PCT && nearest && nearestDist < 700) bot.botState = 'flee';
  else if (nearest && nearestDist < ATTACK_RANGE) bot.botState = 'attack';
  else if (nearest && nearestDist < DETECT_RADIUS) bot.botState = 'chase';
  else bot.botState = 'patrol';

  let want: Vec = bot.botDir ?? { x: Math.cos(bot.angle), y: Math.sin(bot.angle) };
  bot.botTimer = (bot.botTimer ?? 0) - dt;
  let targetSpeed = 290;

  switch (bot.botState) {
    case 'patrol': {
      // поруч лут — летимо збирати (купи збитих літаків цікавіші за дрібні монети)
      let loot: Pickup | null = null;
      let lootScore = Infinity;
      for (const pk of pickups) {
        const d = Math.hypot(pk.x - bot.pos.x, pk.y - bot.pos.y) / (pk.kind === 'pile' ? 3 : 1);
        if (d < 700 && d < lootScore) {
          lootScore = d;
          loot = pk;
        }
      }
      if (loot) {
        want = { x: loot.x - bot.pos.x, y: loot.y - bot.pos.y };
        break;
      }
      if (bot.botTimer <= 0) {
        bot.botTimer = 2 + Math.random() * 2.5;
        // боти "полюють": здебільшого летять у бік випадкового суперника, щоб бій не затягувався
        const prey = others.filter((e) => e.alive && e.id !== bot.id);
        const target = prey.length && Math.random() < 0.7 ? prey[Math.floor(Math.random() * prey.length)] : null;
        if (target) want = { x: target.pos.x - bot.pos.x + (Math.random() - 0.5) * 600, y: target.pos.y - bot.pos.y + (Math.random() - 0.5) * 600 };
        else {
          const a = Math.random() * Math.PI * 2;
          want = { x: Math.cos(a), y: Math.sin(a) };
        }
      }
      break;
    }
    case 'chase': {
      want = { x: nearest!.pos.x - bot.pos.x, y: nearest!.pos.y - bot.pos.y };
      targetSpeed = 340;
      break;
    }
    case 'attack': {
      const to = { x: nearest!.pos.x - bot.pos.x, y: nearest!.pos.y - bot.pos.y };
      // надто близько — відвертаємо вбік і заходимо на нову атаку (не летимо задом)
      if (nearestDist < 150) {
        if (bot.botTimer <= 0) bot.botTimer = 0.9;
        want = { x: -to.y, y: to.x };
      } else want = to;
      targetSpeed = 300;
      break;
    }
    case 'flee': {
      want = { x: bot.pos.x - nearest!.pos.x, y: bot.pos.y - nearest!.pos.y };
      targetSpeed = 380;
      break;
    }
  }
  bot.botDir = want;

  const avoid = avoidance(bot.pos, obstacles);
  const len = Math.hypot(want.x, want.y) || 1;
  const steerX = want.x / len + avoid.x;
  const steerY = want.y / len + avoid.y;
  const desired = Math.atan2(steerY, steerX);
  const diff = angleDiff(bot.angle, desired);
  const maxTurn = TURN_RATE * dt;
  bot.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

  if (now < bot.slowUntil) targetSpeed *= 0.6;
  const speed = bot.botSpeed ?? 250;
  bot.botSpeed = speed + Math.max(-400 * dt, Math.min(400 * dt, targetSpeed - speed));
  bot.pos.x = Math.max(30, Math.min(WORLD_W - 30, bot.pos.x + Math.cos(bot.angle) * bot.botSpeed * dt));
  bot.pos.y = Math.max(30, Math.min(WORLD_H - 30, bot.pos.y + Math.sin(bot.angle) * bot.botSpeed * dt));
  for (const o of obstacles) {
    const d = dist(bot.pos, o);
    const min = o.r + 18;
    if (d < min) {
      bot.pos.x = o.x + ((bot.pos.x - o.x) / (d || 1)) * min;
      bot.pos.y = o.y + ((bot.pos.y - o.y) / (d || 1)) * min;
    }
  }

  // ---- теплові пастки: коли по боту влучають або летить ракета ----
  if (now - bot.lastFlareAt > FLARE_COOLDOWN_MS) {
    const recentlyHit = now - (bot.botLastHitAt ?? 0) < 350;
    const rocketIncoming = projectiles.some((p) => p.ownerId !== bot.id && p.kind === 'rocket' && Math.hypot(p.x - bot.pos.x, p.y - bot.pos.y) < 260);
    // шанси задані на тік 20 Гц — перераховуємо під поточний крок, щоб частота тіків не змінювала поведінку
    const perTick = (p20: number) => 1 - Math.pow(1 - p20, dt / 0.05);
    if ((recentlyHit && Math.random() < perTick(0.08)) || (rocketIncoming && Math.random() < perTick(0.35))) out.flare = true;
  }

  // ---- стрільба: лише коли ціль у секторі перед носом ----
  bot.firing = false;
  const def = getWeaponDef(bot.weaponId) ?? getWeaponDef(DEFAULT_WEAPON_ID)!;
  const capacity = def.burst?.shots ?? def.ammo ?? 6;
  if (bot.botRounds === undefined) bot.botRounds = capacity;
  if ((bot.botCooldownUntil ?? 0) > now) return out;
  if ((bot.botCooldownUntil ?? 0) > 0 && bot.botRounds < 1) bot.botRounds = capacity;

  if (nearest && nearestDist < ATTACK_RANGE + 80 && (bot.botState === 'attack' || bot.botState === 'chase')) {
    const aim = Math.atan2(nearest.pos.y - bot.pos.y, nearest.pos.x - bot.pos.x);
    if (Math.abs(angleDiff(bot.angle, aim)) < 0.3) {
      const interval = 1000 / def.fireRate;
      if (now - bot.lastFiredAt > interval * 4) bot.lastFiredAt = now - interval;
      let due = Math.min(2, Math.floor((now - bot.lastFiredAt) / interval));
      while (due-- > 0 && bot.botRounds >= 1) {
        bot.lastFiredAt += interval;
        bot.botRounds -= 1;
        // похибка прицілу — боти не мають бути снайперами
        out.shots.push(bot.angle + (Math.random() - 0.5) * 2 * ((def.spread ?? 0) + 0.05));
      }
      bot.firing = out.shots.length > 0;
      if (bot.botRounds < 1) bot.botCooldownUntil = now + 1000 * (def.burst?.cooldown ?? def.reloadTime ?? 2);
    }
  }
  return out;
}
