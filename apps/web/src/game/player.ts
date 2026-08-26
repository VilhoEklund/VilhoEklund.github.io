import { clamp, lerpAngle } from '@eternal-blocks/shared';
import { BlockId, isSolid } from '@eternal-blocks/shared';
import type { WorldStore } from './world/worldStore.ts';

/**
 * First-person input + physics.
 *
 * - WASD movement with ground/air control and sprint
 * - crouch (KeyC or Ctrl): shorter hitbox, cannot walk off block ledges
 * - gravity, jumping, swimming in water
 * - axis-separated AABB collision against solid voxels
 */

export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const PLAYER_CROUCH_HEIGHT = 1.5;
export const EYE_CROUCH_HEIGHT = 1.35;

const WALK_SPEED = 4.4;
const SPRINT_SPEED = 7.0;
const CROUCH_SPEED = 2.8;
const GRAVITY = 24;
const JUMP_VELOCITY = 8.6;
const WATER_GRAVITY = 5;
const WATER_SWIM_UP = 11;
const WATER_DRAG = 4.5;

export interface InputState {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
}

/** Keyboard + mouse input attached to a pointer-locked canvas. */
export class Input {
  readonly keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;

  private onKeyPress: ((code: string) => void) | null = null;

  attach(target: HTMLElement | Window): void {
    const el = target as Window;
    el.addEventListener('keydown', this.keydown);
    el.addEventListener('keyup', this.keyup);
    el.addEventListener('blur', this.clear);
  }

  detach(target: HTMLElement | Window): void {
    const el = target as Window;
    el.removeEventListener('keydown', this.keydown);
    el.removeEventListener('keyup', this.keyup);
    el.removeEventListener('blur', this.clear);
    this.clear();
  }

  setKeyPressHandler(fn: (code: string) => void): void {
    this.onKeyPress = fn;
  }

  private keydown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      // Still swallow repeats for game-relevant keys to avoid page scroll etc.
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      return;
    }
    this.keys.add(e.code);
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    this.onKeyPress?.(e.code);
  };

  private keyup = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private clear = (): void => {
    this.keys.clear();
  };

  /** Consume accumulated mouse movement (called once per frame). */
  takeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  state(): InputState {
    return {
      forward: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
      back: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      jump: this.keys.has('Space'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      crouch: this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.keys.has('ControlRight'),
    };
  }
}

function isSolidAt(world: WorldStore, x: number, y: number, z: number): boolean {
  return world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== undefined &&
    isSolid(world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
}

function boxCollides(world: WorldStore, px: number, py: number, pz: number, height: number): boolean {
  const minX = Math.floor(px - PLAYER_HALF_WIDTH);
  const maxX = Math.floor(px + PLAYER_HALF_WIDTH);
  const minY = Math.floor(py);
  const maxY = Math.floor(py + height);
  const minZ = Math.floor(pz - PLAYER_HALF_WIDTH);
  const maxZ = Math.floor(pz + PLAYER_HALF_WIDTH);
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const b = world.getBlock(x, y, z);
        if (b !== BlockId.Air && isSolid(b)) return true;
      }
    }
  }
  return false;
}

/** True if the player's bounding box overlaps the given block cell. */
export function playerIntersectsCell(
  px: number,
  py: number,
  pz: number,
  bx: number,
  by: number,
  bz: number,
  height: number = PLAYER_HEIGHT,
): boolean {
  return (
    px + PLAYER_HALF_WIDTH > bx &&
    px - PLAYER_HALF_WIDTH < bx + 1 &&
    py + height > by &&
    py < by + 1 &&
    pz + PLAYER_HALF_WIDTH > bz &&
    pz - PLAYER_HALF_WIDTH < bz + 1
  );
}

export class LocalPlayer {
  pos = { x: 8.5, y: 40, z: 8.5 };
  vel = { x: 0, y: 0, z: 0 };
  yaw = 0; // radians, 0 = looking toward -z
  pitch = 0;
  onGround = false;
  inWater = false;
  crouching = false;
  flyingEnabled = false; // reserved; creative flight not part of MVP

  constructor(private world: WorldStore) {}

  /** Current collision height (shorter while crouched). */
  get height(): number {
    return this.crouching ? PLAYER_CROUCH_HEIGHT : PLAYER_HEIGHT;
  }

  get eyeHeight(): number {
    return this.crouching ? EYE_CROUCH_HEIGHT : EYE_HEIGHT;
  }

  teleport(x: number, y: number, z: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
  }

  applyLook(dxPixels: number, dyPixels: number, sensitivity: number): void {
    const s = 0.0022 * sensitivity;
    this.yaw -= dxPixels * s;
    this.pitch -= dyPixels * s;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    this.yaw = lerpAngle(this.yaw, this.yaw, 0); // keep yaw unbounded but stable
  }

  lookDirection(): { dx: number; dy: number; dz: number } {
    const cp = Math.cos(this.pitch);
    return {
      dx: -Math.sin(this.yaw) * cp,
      dy: Math.sin(this.pitch),
      dz: -Math.cos(this.yaw) * cp,
    };
  }

  eyePosition(): { x: number; y: number; z: number } {
    return { x: this.pos.x, y: this.pos.y + this.eyeHeight, z: this.pos.z };
  }

  /** Advance simulation by dt seconds using the given input state. */
  step(dt: number, input: InputState): void {
    // Crouch state: only stand back up when there is headroom.
    if (input.crouch) {
      this.crouching = true;
    } else if (this.crouching && !boxCollides(this.world, this.pos.x, this.pos.y, this.pos.z, PLAYER_HEIGHT)) {
      this.crouching = false;
    }

    // Water check at feet and chest.
    const feetBlock = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.1), Math.floor(this.pos.z));
    const chestBlock = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 1.1), Math.floor(this.pos.z));
    this.inWater = feetBlock === BlockId.Water || chestBlock === BlockId.Water;

    // Desired horizontal movement in world space.
    let mx = 0;
    let mz = 0;
    if (input.forward) mz -= 1;
    if (input.back) mz += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Rotate local input into world space matching camera yaw (rotation.y).
    const wishX = mx * cos + mz * sin;
    const wishZ = -mx * sin + mz * cos;

    // Sprinting is not possible while crouched; crouching walks slower.
    const speed = this.crouching
      ? CROUCH_SPEED
      : input.sprint && input.forward
        ? SPRINT_SPEED
        : WALK_SPEED;
    const control = this.onGround ? 12 : this.inWater ? 5 : 3.2;

    this.vel.x += (wishX * speed - this.vel.x) * Math.min(1, control * dt);
    this.vel.z += (wishZ * speed - this.vel.z) * Math.min(1, control * dt);

    if (this.inWater) {
      this.vel.y -= WATER_GRAVITY * dt;
      if (input.jump) this.vel.y += WATER_SWIM_UP * dt;
      this.vel.y *= Math.max(0, 1 - WATER_DRAG * dt);
      this.vel.y = clamp(this.vel.y, -3.4, 4.0);
    } else {
      this.vel.y -= GRAVITY * dt;
      if (input.jump && this.onGround) {
        this.vel.y = JUMP_VELOCITY;
        this.onGround = false;
      }
      this.vel.y = Math.max(this.vel.y, -50);
    }

    // Axis-separated movement with collision resolution.
    // While crouched on the ground, refuse horizontal moves that leave solid
    // ground under the player (sneak ledge protection).
    const guardLedge = this.crouching && this.onGround && !this.inWater;
    if (guardLedge) {
      this.moveWithLedgeGuard('x', this.vel.x * dt);
      this.moveWithLedgeGuard('z', this.vel.z * dt);
    } else {
      this.moveAxis('x', this.vel.x * dt);
      this.moveAxis('z', this.vel.z * dt);
    }
    this.moveAxis('y', this.vel.y * dt);

    if (this.pos.y < -30) {
      // Fell out of the world somehow: put the player back near the surface.
      const surfaceY = this.findSafeY();
      this.teleport(this.pos.x, surfaceY, this.pos.z);
    }
  }

  /** Horizontal move that stops at ledges so a crouched player cannot fall off. */
  private moveWithLedgeGuard(axis: 'x' | 'z', delta: number): void {
    if (delta === 0) return;
    const before = this.pos[axis];
    this.moveAxis(axis, delta);
    if (this.hasGroundSupport(this.pos.x, this.pos.y, this.pos.z)) return;
    // Stepped off the edge: pull back to the furthest still-supported position.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      this.pos[axis] = before + delta * mid;
      if (this.hasGroundSupport(this.pos.x, this.pos.y, this.pos.z)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    this.pos[axis] = before + delta * lo;
    if (!this.hasGroundSupport(this.pos.x, this.pos.y, this.pos.z)) this.pos[axis] = before;
    this.vel[axis] = 0;
  }

  /** True if any solid block lies directly under the player's footprint. */
  private hasGroundSupport(x: number, y: number, z: number): boolean {
    const by = Math.floor(y - 0.06);
    const minX = Math.floor(x - PLAYER_HALF_WIDTH);
    const maxX = Math.floor(x + PLAYER_HALF_WIDTH);
    const minZ = Math.floor(z - PLAYER_HALF_WIDTH);
    const maxZ = Math.floor(z + PLAYER_HALF_WIDTH);
    for (let bz = minZ; bz <= maxZ; bz++) {
      for (let bx = minX; bx <= maxX; bx++) {
        const b = this.world.getBlock(bx, by, bz);
        if (b !== undefined && b !== BlockId.Air && isSolid(b)) return true;
      }
    }
    return false;
  }

  private moveAxis(axis: 'x' | 'y' | 'z', delta: number): void {
    if (delta === 0) return;
    const before = this.pos[axis];
    this.pos[axis] = before + delta;
    if (!boxCollides(this.world, this.pos.x, this.pos.y, this.pos.z, this.height)) {
      if (axis === 'y' && delta < 0) this.onGround = false;
      return;
    }
    // Binary search for the largest non-colliding step.
    let lo = 0;
    let hi = delta;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      this.pos[axis] = before + mid;
      if (boxCollides(this.world, this.pos.x, this.pos.y, this.pos.z, this.height)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    this.pos[axis] = before + lo;
    if (axis === 'y') {
      if (delta < 0) this.onGround = true;
      this.vel.y = 0;
    } else {
      this.vel[axis] = 0;
    }
  }

  private findSafeY(): number {
    for (let y = 70; y > 1; y--) {
      if (isSolidAt(this.world, this.pos.x, y, this.pos.z) && !isSolidAt(this.world, this.pos.x, y + 1, this.pos.z)) {
        return y + 1.01;
      }
    }
    return 45;
  }
}
