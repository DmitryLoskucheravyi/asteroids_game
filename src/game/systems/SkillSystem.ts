import { FLARE_ACTIVE_MS, FLARE_COOLDOWN_MS } from '../../../server/src/shared/flares';
import type { PlaneFeature } from '../planes';

export const FREEZE_DURATION = 2;
export const BOOST_DURATION = 2.5;
export const BOOST_MULTIPLIER = 1.6;
export const JUMP_COOLDOWN = 4;
export const MAX_CHARGES = 5;
/** Теплові пастки (flares) — базова навичка кожного літака: відстрілюються назад і збивають кулі/ракети. */
export const FLARE_COOLDOWN = FLARE_COOLDOWN_MS / 1000;
/** Коротке вікно захисту — пастки треба відстрілювати вчасно, а не тримати щит постійно. */
export const FLARE_DURATION = FLARE_ACTIVE_MS / 1000;
export const FLARE_RADIUS = 95;

/** Навички гравця: заморозка, форсаж, ривок. Параметри залежать від літака. */
export class SkillSystem {
  freezeCharges = 0;
  boostCharges = 0;
  freezeLeft = 0;
  boostLeft = 0;
  /** Таймер відновлення наступного заряду ривка */
  jumpCooldown = 0;
  jumpCharges = 1;
  /** Скільки разів гравець використав навички (для статистики) */
  used = 0;

  freezeDuration = FREEZE_DURATION;
  boostDuration = BOOST_DURATION;
  jumpCooldownMax = JUMP_COOLDOWN;
  jumpChargesMax = 1;

  flareLeft = 0;
  flareCooldown = 0;
  flareCooldownMax = FLARE_COOLDOWN;

  /** Перезарядка активного предмета (0 — предмет не екіпіровано, слот неактивний) */
  itemCooldown = 0;
  itemCooldownMax = 0;

  /** Налаштовує навички під літак і видає стартові заряди. itemCooldownMax=0, якщо активний предмет не екіпіровано. */
  reset(feature: PlaneFeature, itemCooldownMax = 0, cooldownMul = 1): void {
    this.freezeDuration = FREEZE_DURATION * (feature.freezeDurationMul ?? 1);
    this.boostDuration = BOOST_DURATION * (feature.boostDurationMul ?? 1);
    this.jumpCooldownMax = JUMP_COOLDOWN * (feature.jumpCooldownMul ?? 1) * cooldownMul;
    this.flareCooldownMax = FLARE_COOLDOWN * cooldownMul;
    this.flareCooldown = 0;
    this.flareLeft = 0;
    this.jumpChargesMax = feature.jumpCharges ?? 1;
    this.freezeCharges = 1 + (feature.extraFreeze ?? 0);
    this.boostCharges = 2 + (feature.extraBoost ?? 0);
    this.jumpCharges = this.jumpChargesMax;
    this.freezeLeft = 0;
    this.boostLeft = 0;
    this.jumpCooldown = 0;
    this.itemCooldownMax = itemCooldownMax * cooldownMul;
    this.itemCooldown = 0;
    this.used = 0;
  }

  update(dt: number): void {
    this.freezeLeft = Math.max(0, this.freezeLeft - dt);
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    this.itemCooldown = Math.max(0, this.itemCooldown - dt);
    this.flareLeft = Math.max(0, this.flareLeft - dt);
    this.flareCooldown = Math.max(0, this.flareCooldown - dt);
    if (this.jumpCharges < this.jumpChargesMax) {
      this.jumpCooldown -= dt;
      if (this.jumpCooldown <= 0) {
        this.jumpCharges++;
        this.jumpCooldown = this.jumpCharges < this.jumpChargesMax ? this.jumpCooldownMax : 0;
      }
    }
  }

  addFreeze(n = 1): void {
    this.freezeCharges = Math.min(MAX_CHARGES, this.freezeCharges + n);
  }

  addBoost(n = 1): void {
    this.boostCharges = Math.min(MAX_CHARGES, this.boostCharges + n);
  }

  tryFreeze(): boolean {
    if (this.freezeCharges <= 0 || this.freezeLeft > 0) return false;
    this.freezeCharges--;
    this.freezeLeft = this.freezeDuration;
    this.used++;
    return true;
  }

  tryBoost(): boolean {
    if (this.boostCharges <= 0 || this.boostLeft > 0) return false;
    this.boostCharges--;
    this.boostLeft = this.boostDuration;
    this.used++;
    return true;
  }

  tryJump(): boolean {
    if (this.jumpCharges <= 0) return false;
    if (this.jumpCharges === this.jumpChargesMax) this.jumpCooldown = this.jumpCooldownMax;
    this.jumpCharges--;
    this.used++;
    return true;
  }

  tryFlare(): boolean {
    if (this.flareCooldown > 0) return false;
    this.flareCooldown = this.flareCooldownMax;
    this.flareLeft = FLARE_DURATION;
    this.used++;
    return true;
  }

  get isFlaring(): boolean {
    return this.flareLeft > 0;
  }

  itemEquipped(): boolean {
    return this.itemCooldownMax > 0;
  }

  tryItem(): boolean {
    if (!this.itemEquipped() || this.itemCooldown > 0) return false;
    this.itemCooldown = this.itemCooldownMax;
    this.used++;
    return true;
  }

  get isFrozen(): boolean {
    return this.freezeLeft > 0;
  }

  get isBoosted(): boolean {
    return this.boostLeft > 0;
  }
}
