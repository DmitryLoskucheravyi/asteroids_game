import { Vec2 } from '../../core/math';

/** Те, що сутності знають про світ під час оновлення. */
export interface WorldView {
  readonly width: number;
  readonly height: number;
  readonly playerPos: Vec2;
  readonly time: number;
}

/** Базовий клас усіх ігрових об'єктів. */
export abstract class Entity {
  readonly pos: Vec2;
  readonly vel: Vec2;
  alive = true;

  protected constructor(
    pos: Vec2,
    vel: Vec2,
    /** Радіус хітбокса */
    public radius: number,
  ) {
    this.pos = pos.clone();
    this.vel = vel.clone();
  }

  /** Чи може об'єкт зараз зіткнутись із гравцем. */
  get collidable(): boolean {
    return this.alive;
  }

  abstract update(dt: number, world: WorldView): void;
  abstract render(ctx: CanvasRenderingContext2D, time: number): void;

  kill(): void {
    this.alive = false;
  }

  isOutside(w: number, h: number, margin: number): boolean {
    return this.pos.x < -margin || this.pos.x > w + margin || this.pos.y < -margin || this.pos.y > h + margin;
  }
}
