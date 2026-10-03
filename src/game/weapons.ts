import type { TKey } from '../core/i18n';

/** bullet/rocket — снаряди; laser — миттєвий промінь; missile — залп самонавідних ракет. */
export type WeaponKind = 'bullet' | 'rocket' | 'laser' | 'missile';

export interface WeaponDef {
  id: string;
  kind: WeaponKind;
  nameKey: TKey;
  descKey: TKey;
  /** Пострілів за секунду */
  fireRate: number;
  projectileSpeed: number;
  /** Урон за влучання (PvP) */
  damage: number;
  /** Лише для rocket — радіус ураження вибуху */
  splashRadius?: number;
  /** Магазин: обмежені патрони + перезарядка */
  ammo: number | 'infinite';
  reloadTime?: number;
  /** Черга: стільки пострілів поспіль, потім охолодження */
  burst?: { shots: number; cooldown: number };
  /** Розкид, рад */
  spread?: number;
  /** Лазер — дальність променя */
  range?: number;
  /** Залп — скільки ракет за один постріл */
  salvo?: number;
  /** 0 — стартова зброя, доступна всім безкоштовно */
  price: number;
}

/** Тримати синхронізовано з server/src/content/weapons.ts (id/price/damage/fireRate/burst/speed). */
export const WEAPON_DEFS: readonly WeaponDef[] = [
  {
    id: 'machine_gun',
    kind: 'bullet',
    nameKey: 'weapon.machineGun',
    descKey: 'weaponDesc.machineGun',
    fireRate: 16,
    projectileSpeed: 1150,
    damage: 3.5,
    ammo: 'infinite',
    burst: { shots: 36, cooldown: 1.8 },
    spread: 0.035,
    price: 0,
  },
  { id: 'rocket_launcher', kind: 'rocket', nameKey: 'weapon.rocketLauncher', descKey: 'weaponDesc.rocketLauncher', fireRate: 1.4, projectileSpeed: 780, damage: 34, splashRadius: 125, ammo: 8, reloadTime: 2.6, price: 450 },
  {
    id: 'laser',
    kind: 'laser',
    nameKey: 'weapon.laser',
    descKey: 'weaponDesc.laser',
    fireRate: 12,
    projectileSpeed: 0,
    damage: 4,
    range: 380,
    ammo: 'infinite',
    burst: { shots: 48, cooldown: 2.4 },
    price: 1200,
  },
  { id: 'homing_salvo', kind: 'missile', nameKey: 'weapon.homingSalvo', descKey: 'weaponDesc.homingSalvo', fireRate: 1.5, projectileSpeed: 520, damage: 11, salvo: 3, ammo: 4, reloadTime: 3.2, price: 1800 },
];

export const getWeaponDef = (id: string | null | undefined): WeaponDef | undefined => WEAPON_DEFS.find((w) => w.id === id);
export const DEFAULT_WEAPON_ID = 'machine_gun';

/** Чи досить сильна зброя, щоб знищити астероїд цього розміру (ast без розколу на уламки — одне влучання). */
export function canDestroy(kind: WeaponKind, size: 'small' | 'medium' | 'large'): boolean {
  if (size === 'large') return false;
  if (kind === 'rocket' || kind === 'missile') return true;
  return size === 'small';
}

/**
 * Стан стрільби: черги (кулемет) або магазин із перезарядкою (ракетниця).
 * Спільний для кампанії й PvP, щоб зброя поводилась однаково.
 */
export class WeaponState {
  private fireTimer = 0;
  /** Залишок пострілів у черзі / магазині */
  rounds: number;
  /** Охолодження після черги або перезарядка магазину */
  cooldown = 0;
  fireRateMul = 1;

  constructor(readonly def: WeaponDef) {
    this.rounds = this.capacity;
  }

  get capacity(): number {
    if (this.def.burst) return this.def.burst.shots;
    return this.def.ammo === 'infinite' ? Infinity : this.def.ammo;
  }

  get cooldownMax(): number {
    return this.def.burst?.cooldown ?? this.def.reloadTime ?? 2;
  }

  reset(): void {
    this.fireTimer = 0;
    this.cooldown = 0;
    this.rounds = this.capacity;
  }

  /** Повертає кількість пострілів, які треба зробити в цьому кроці. */
  update(dt: number, trigger: boolean): number {
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.cooldown = 0;
        this.rounds = this.capacity;
      }
      return 0;
    }
    // кулемет потроху "остигає", якщо гравець відпустив гашетку посеред черги
    if (!trigger && this.def.burst && this.rounds < this.capacity && this.fireTimer <= 0) {
      this.rounds = Math.min(this.capacity, this.rounds + dt * this.def.burst.shots * 0.35);
    }
    if (!trigger || this.fireTimer > 0 || this.rounds < 1) return 0;
    this.fireTimer = 1 / (this.def.fireRate * this.fireRateMul);
    this.rounds -= 1;
    if (this.rounds < 1) this.cooldown = this.cooldownMax;
    return 1;
  }

  /** 0..1 — заповненість черги/магазину (для HUD) */
  get fill(): number {
    if (this.cooldown > 0) return 1 - this.cooldown / this.cooldownMax;
    return Number.isFinite(this.capacity) ? this.rounds / this.capacity : 1;
  }
}
