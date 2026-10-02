import type { Participant, Obstacle, Vec } from './types.js';
import { WORLD_W, WORLD_H } from './constants.js';
import { getWeaponDef } from '../content/weapons.js';

const SPEED = 260;
const DETECT_RADIUS = 950;
const ATTACK_RANGE = 520;
const FLEE_HP_PCT = 0.3;

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalize(v: Vec): Vec {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

/** Відхилення від найближчих перешкод — щоб боти не застрягали в астероїдах. */
function avoidance(pos: Vec, obstacles: readonly Obstacle[]): Vec {
  let ax = 0;
  let ay = 0;
  for (const o of obstacles) {
    const d = dist(pos, o);
    const margin = o.r + 70;
    if (d < margin) {
      const push = (margin - d) / margin;
      ax += ((pos.x - o.x) / (d || 1)) * push;
      ay += ((pos.y - o.y) / (d || 1)) * push;
    }
  }
  return { x: ax, y: ay };
}

export function updateBot(bot: Participant, others: readonly Participant[], obstacles: readonly Obstacle[], dt: number, now: number): void {
  if (!bot.alive) return;
  const enemies = others.filter((p) => p.alive && p.id !== bot.id);
  let nearest: Participant | null = null;
  let nearestDist = Infinity;
  for (const e of enemies) {
    const d = dist(bot.pos, e.pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }

  const hpPct = bot.hp / bot.maxHp;
  if (hpPct < FLEE_HP_PCT && nearest) bot.botState = 'flee';
  else if (nearest && nearestDist < ATTACK_RANGE) bot.botState = 'attack';
  else if (nearest && nearestDist < DETECT_RADIUS) bot.botState = 'chase';
  else bot.botState = 'patrol';

  let dir: Vec = bot.botDir ?? { x: 0, y: 1 };
  bot.botTimer = (bot.botTimer ?? 0) - dt;

  switch (bot.botState) {
    case 'patrol': {
      if (bot.botTimer <= 0) {
        bot.botTimer = 2 + Math.random() * 2.5;
        const a = Math.random() * Math.PI * 2;
        dir = { x: Math.cos(a), y: Math.sin(a) };
      }
      break;
    }
    case 'chase': {
      dir = normalize({ x: nearest!.pos.x - bot.pos.x, y: nearest!.pos.y - bot.pos.y });
      break;
    }
    case 'attack': {
      const def = getWeaponDef(bot.weaponId);
      const keepDistance = def?.id === 'rocket_launcher' ? 260 : 120;
      const toEnemy = { x: nearest!.pos.x - bot.pos.x, y: nearest!.pos.y - bot.pos.y };
      const d = Math.hypot(toEnemy.x, toEnemy.y);
      dir = d < keepDistance ? normalize({ x: -toEnemy.x, y: -toEnemy.y }) : d > keepDistance * 1.4 ? normalize(toEnemy) : { x: 0, y: 0 };
      bot.angle = Math.atan2(toEnemy.y, toEnemy.x);
      break;
    }
    case 'flee': {
      dir = normalize({ x: bot.pos.x - nearest!.pos.x, y: bot.pos.y - nearest!.pos.y });
      break;
    }
  }
  bot.botDir = dir;

  const avoid = avoidance(bot.pos, obstacles);
  const moveX = dir.x + avoid.x * 1.5;
  const moveY = dir.y + avoid.y * 1.5;
  const moveLen = Math.hypot(moveX, moveY) || 1;
  bot.pos.x = Math.max(40, Math.min(WORLD_W - 40, bot.pos.x + (moveX / moveLen) * SPEED * dt));
  bot.pos.y = Math.max(40, Math.min(WORLD_H - 40, bot.pos.y + (moveY / moveLen) * SPEED * dt));

  if (bot.botState !== 'attack' && (moveX !== 0 || moveY !== 0)) bot.angle = Math.atan2(moveY, moveX);

  bot.firing = false;
  if (bot.botState === 'attack' && nearest) {
    const def = getWeaponDef(bot.weaponId);
    const cooldown = 1 / (def?.fireRate ?? 4);
    if (now - bot.lastFiredAt >= cooldown * 1000) {
      bot.firing = true;
      bot.lastFiredAt = now;
    }
  }
}
