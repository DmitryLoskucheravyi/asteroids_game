export const FREEZE_DURATION = 2;
export const BOOST_DURATION = 2.5;
export const BOOST_MULTIPLIER = 1.6;
export const JUMP_COOLDOWN = 4;
export const MAX_CHARGES = 5;

/** Навички гравця: заморозка, форсаж, ривок. */
export class SkillSystem {
  freezeCharges = 0;
  boostCharges = 0;
  freezeLeft = 0;
  boostLeft = 0;
  jumpCooldown = 0;
  /** Скільки разів гравець використав навички (для статистики) */
  used = 0;

  reset(freeze: number, boost: number): void {
    this.freezeCharges = freeze;
    this.boostCharges = boost;
    this.freezeLeft = 0;
    this.boostLeft = 0;
    this.jumpCooldown = 0;
    this.used = 0;
  }

  update(dt: number): void {
    this.freezeLeft = Math.max(0, this.freezeLeft - dt);
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
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
    this.freezeLeft = FREEZE_DURATION;
    this.used++;
    return true;
  }

  tryBoost(): boolean {
    if (this.boostCharges <= 0 || this.boostLeft > 0) return false;
    this.boostCharges--;
    this.boostLeft = BOOST_DURATION;
    this.used++;
    return true;
  }

  tryJump(): boolean {
    if (this.jumpCooldown > 0) return false;
    this.jumpCooldown = JUMP_COOLDOWN;
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
