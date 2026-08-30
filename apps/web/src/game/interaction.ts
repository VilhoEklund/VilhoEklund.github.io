import {
  BlockId,
  PLAYER_REACH,
  WORLD_HEIGHT,
  distanceSqToBlockCenter,
  doorCounterpart,
  isDoor,
  isDoorBottom,
  isDoorTop,
  isFullCube,
  isLadder,
  isReplaceable,
  isSlab,
  isSolid,
  ladderSupportOffset,
  orientBlock,
  toggleDoorBlock,
  topSlabVariant,
  supportsBlockAbove,
  type HorizontalFacing,
  type ClientMessage,
  type ServerMessage,
} from '@eternal-blocks/shared';
import type { NetClient } from '../net/connection.ts';
import { raycastVoxel, type RayHit } from './raycast.ts';
import type { WorldStore } from './world/worldStore.ts';
import { playerIntersectsBlock, type LocalPlayer } from './player.ts';
import type { SignsRenderer } from './signsRenderer.ts';

export interface InteractionHooks {
  toast: (msg: string, kind?: 'info' | 'error' | 'good') => void;
  markDirty: (x: number, y: number, z: number) => void;
  persistLocal: (x: number, z: number) => void;
  onSignPlaced: (cell: { x: number; y: number; z: number }) => void;
}

export interface InteractionOptions {
  localOnly: boolean;
  playerId: string;
  playerName: string;
}

interface PendingOp {
  eid: string;
  kind: 'place' | 'break' | 'use';
  cells: Array<{ x: number; y: number; z: number; prevBlock: number }>;
  sentAt: number;
  frame: ClientMessage;
}

const ERROR_TOASTS: Record<string, string> = {
  unreachable: 'Too far away.',
  unbreakable: 'Bedrock cannot be broken.',
  nothing_to_edit: 'Something changed there already.',
  rate_limited: 'Slow down a little.',
  out_of_range: 'That spot is out of bounds.',
  invalid_use: 'That block cannot be used.',
  sign_forbidden: 'Only the author can edit that sign.',
  sign_not_found: 'That sign no longer exists.',
  world_locked: 'World is in maintenance mode.',
  banned: 'You are banned from this world.',
};

let uid = 0;
export function newEid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  uid += 1;
  return `e${Date.now().toString(36)}${String(uid).padStart(6, '0')}`;
}

/**
 * Block/sign interaction: client-side validation, optimistic application,
 * server acknowledgement tracking and rollback on rejection. Edit ids make
 * retries idempotent server-side, so flushing the pending queue after a
 * reconnect never duplicates mutations.
 */
export class Interaction {
  selectedBlock: number | null = null;

  private pending = new Map<string, PendingOp>();

  constructor(
    private readonly world: WorldStore,
    private readonly net: NetClient,
    private readonly signs: SignsRenderer,
    private readonly player: LocalPlayer,
    private readonly hooks: InteractionHooks,
    private readonly opts: InteractionOptions,
  ) {}

  targetFromCamera(
    eye: { x: number; y: number; z: number },
    look: { dx: number; dy: number; dz: number },
  ): RayHit | null {
    return raycastVoxel(this.world, eye.x, eye.y, eye.z, look.dx, look.dy, look.dz, PLAYER_REACH);
  }

  tryBreak(hit: RayHit): void {
    const current = this.world.getBlock(hit.x, hit.y, hit.z);
    if (current === BlockId.Air || current === BlockId.Water) return;
    if (current === BlockId.Bedrock) {
      this.hooks.toast('Bedrock cannot be broken.', 'error');
      return;
    }
    const eid = newEid();
    const frame: ClientMessage = { t: 'edit', eid, action: 'break', x: hit.x, y: hit.y, z: hit.z };
    const cells = [{ x: hit.x, y: hit.y, z: hit.z, prevBlock: current }];
    if (isDoor(current)) {
      const otherY = hit.y + (isDoorBottom(current) ? 1 : -1);
      const expected = doorCounterpart(current);
      if (
        otherY >= 0 &&
        otherY < WORLD_HEIGHT &&
        expected !== null &&
        this.world.getBlock(hit.x, otherY, hit.z) === expected
      ) {
        cells.push({ x: hit.x, y: otherY, z: hit.z, prevBlock: expected });
      }
    }
    for (const removed of [...cells]) {
      for (const [dx, dz] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const lx = removed.x + dx;
        const lz = removed.z + dz;
        const ladder = this.world.getBlock(lx, removed.y, lz);
        const support = ladderSupportOffset(ladder);
        if (
          support &&
          lx + support.x === removed.x &&
          lz + support.z === removed.z &&
          !cells.some((cell) => cell.x === lx && cell.y === removed.y && cell.z === lz)
        ) {
          cells.push({ x: lx, y: removed.y, z: lz, prevBlock: ladder });
        }
      }
    }
    for (const cell of cells) this.applyLocal(cell.x, cell.y, cell.z, BlockId.Air);
    if (this.opts.localOnly) {
      if (current === BlockId.Sign) this.signs.removeAt(hit.x, hit.y, hit.z);
      this.persistCells(cells);
      return;
    }
    this.pending.set(eid, {
      eid,
      kind: 'break',
      cells,
      sentAt: Date.now(),
      frame,
    });
    if (!this.net.send(frame))
      this.hooks.toast('Offline - edit will sync after reconnect.', 'info');
  }

  tryPlace(hit: RayHit): void {
    const selected = this.selectedBlock;
    if (selected === null) {
      this.hooks.toast('That hotbar slot is empty.', 'info');
      return;
    }
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const current = this.world.getBlock(x, y, z);
    if (!isReplaceable(current)) return;

    const facing = this.playerFacing();
    let block = orientBlock(selected, facing);
    if (isLadder(selected)) {
      const ladderFacing = this.ladderFacing(hit);
      if (ladderFacing === null) {
        this.hooks.toast('Ladders attach to the side of a block.', 'info');
        return;
      }
      block = orientBlock(selected, ladderFacing);
      const support = ladderSupportOffset(block)!;
      const supportBlock = this.world.getBlock(x + support.x, y, z + support.z);
      if (!isSolid(supportBlock) || !isFullCube(supportBlock)) {
        this.hooks.toast('A ladder needs a solid supporting block.', 'error');
        return;
      }
    } else if (isSlab(selected) && (hit.ny < 0 || (hit.ny === 0 && hit.hy - hit.y > 0.5))) {
      block = topSlabVariant(block);
    }

    const placements = [{ x, y, z, block, prevBlock: current }];
    if (isDoorBottom(block)) {
      const topY = y + 1;
      const top = doorCounterpart(block);
      if (
        !supportsBlockAbove(this.world.getBlock(x, y - 1, z)) ||
        topY >= WORLD_HEIGHT ||
        top === null ||
        !isReplaceable(this.world.getBlock(x, topY, z))
      ) {
        this.hooks.toast('A door needs two empty blocks of height.', 'error');
        return;
      }
      placements.push({
        x,
        y: topY,
        z,
        block: top,
        prevBlock: this.world.getBlock(x, topY, z),
      });
    }
    if (
      placements.some((cell) =>
        playerIntersectsBlock(
          this.player.pos.x,
          this.player.pos.y,
          this.player.pos.z,
          cell.x,
          cell.y,
          cell.z,
          cell.block,
          this.player.height,
        ),
      )
    ) {
      this.hooks.toast('Not enough room.', 'error');
      return;
    }
    const eid = newEid();
    const frame: ClientMessage = { t: 'edit', eid, action: 'place', x, y, z, block };
    for (const cell of placements) this.applyLocal(cell.x, cell.y, cell.z, cell.block);
    if (block === BlockId.Sign) {
      // Compute facing quadrant from player yaw (0..3), matching signsRenderer.
      const yawDeg = ((-this.player.yaw * 180) / Math.PI + 360 + 45) % 360;
      const rot = Math.floor(yawDeg / 90) % 4;
      if (this.opts.localOnly) {
        this.signs.upsert({
          x,
          y,
          z,
          text: '',
          authorId: this.opts.playerId,
          authorName: this.opts.playerName,
          updatedAt: Date.now(),
          rot,
        });
        this.persistCells(placements);
        this.hooks.onSignPlaced({ x, y, z });
        return;
      }
      const signFrame: ClientMessage = {
        t: 'sign',
        eid: newEid(),
        op: 'create',
        x,
        y,
        z,
        text: '',
        rot,
      };
      this.pending.set(signFrame.eid, {
        eid: signFrame.eid,
        kind: 'place',
        cells: [{ x, y, z, prevBlock: current }],
        sentAt: Date.now(),
        frame: signFrame,
      });
      this.net.send(signFrame);
      this.hooks.onSignPlaced({ x, y, z });
    }
    if (this.opts.localOnly) {
      this.persistCells(placements);
      return;
    }
    this.pending.set(eid, {
      eid,
      kind: 'place',
      cells: placements.map(({ x: px, y: py, z: pz, prevBlock }) => ({
        x: px,
        y: py,
        z: pz,
        prevBlock,
      })),
      sentAt: Date.now(),
      frame,
    });
    if (!this.net.send(frame))
      this.hooks.toast('Offline - edit will sync after reconnect.', 'info');
  }

  /** Toggle a complete two-cell door. Returns true when the hit was a door. */
  tryUse(hit: RayHit): boolean {
    const current = this.world.getBlock(hit.x, hit.y, hit.z);
    if (!isDoor(current)) return false;
    const otherY = hit.y + (isDoorTop(current) ? -1 : 1);
    const counterpart = doorCounterpart(current);
    const toggled = toggleDoorBlock(current);
    if (
      otherY < 0 ||
      otherY >= WORLD_HEIGHT ||
      counterpart === null ||
      toggled === null ||
      this.world.getBlock(hit.x, otherY, hit.z) !== counterpart
    ) {
      this.hooks.toast('That door is incomplete.', 'error');
      return true;
    }
    const toggledOther = toggleDoorBlock(counterpart)!;
    const cells = [
      { x: hit.x, y: hit.y, z: hit.z, prevBlock: current },
      { x: hit.x, y: otherY, z: hit.z, prevBlock: counterpart },
    ];
    this.applyLocal(hit.x, hit.y, hit.z, toggled);
    this.applyLocal(hit.x, otherY, hit.z, toggledOther);
    if (this.opts.localOnly) {
      this.persistCells(cells);
      return true;
    }
    const eid = newEid();
    const frame: ClientMessage = { t: 'use', eid, x: hit.x, y: hit.y, z: hit.z };
    this.pending.set(eid, { eid, kind: 'use', cells, sentAt: Date.now(), frame });
    if (!this.net.send(frame))
      this.hooks.toast('Offline - edit will sync after reconnect.', 'info');
    return true;
  }

  saveSignText(cell: { x: number; y: number; z: number }, text: string): void {
    if (this.opts.localOnly) {
      const existing = this.world.signs.get(`${cell.x},${cell.y},${cell.z}`);
      if (existing) this.signs.upsert({ ...existing, text, updatedAt: Date.now() });
      this.hooks.persistLocal(cell.x, cell.z);
      return;
    }
    const frame: ClientMessage = {
      t: 'sign',
      eid: newEid(),
      op: 'update',
      x: cell.x,
      y: cell.y,
      z: cell.z,
      text,
    };
    this.pending.set(frame.eid, {
      eid: frame.eid,
      kind: 'place',
      cells: [{ x: cell.x, y: cell.y, z: cell.z, prevBlock: BlockId.Sign }],
      sentAt: Date.now(),
      frame,
    });
    // Optimistically show the new text.
    const existing = this.world.signs.get(`${cell.x},${cell.y},${cell.z}`);
    if (existing) {
      this.signs.upsert({ ...existing, text });
    }
    this.net.send(frame);
  }

  removeSign(cell: { x: number; y: number; z: number }): void {
    if (this.opts.localOnly) {
      this.signs.removeAt(cell.x, cell.y, cell.z);
      this.applyLocal(cell.x, cell.y, cell.z, BlockId.Air);
      this.hooks.persistLocal(cell.x, cell.z);
      return;
    }
    const frame: ClientMessage = {
      t: 'sign',
      eid: newEid(),
      op: 'remove',
      x: cell.x,
      y: cell.y,
      z: cell.z,
    };
    this.pending.set(frame.eid, {
      eid: frame.eid,
      kind: 'place',
      cells: [{ x: cell.x, y: cell.y, z: cell.z, prevBlock: BlockId.Sign }],
      sentAt: Date.now(),
      frame,
    });
    this.signs.removeAt(cell.x, cell.y, cell.z);
    this.net.send(frame);
    // Also break the block itself so the post disappears.
    const breakFrame: ClientMessage = {
      t: 'edit',
      eid: newEid(),
      action: 'break',
      x: cell.x,
      y: cell.y,
      z: cell.z,
    };
    this.pending.set(breakFrame.eid, {
      eid: breakFrame.eid,
      kind: 'break',
      cells: [{ x: cell.x, y: cell.y, z: cell.z, prevBlock: BlockId.Sign }],
      sentAt: Date.now(),
      frame: breakFrame,
    });
    this.applyLocal(cell.x, cell.y, cell.z, BlockId.Air);
    this.net.send(breakFrame);
  }

  /** Server confirmed a block change (possibly from another player). */
  onBlockApplied(msg: Extract<ServerMessage, { t: 'blockApplied' }>): void {
    if (msg.eid) {
      const p = this.pending.get(msg.eid);
      if (p) this.pending.delete(msg.eid);
    }
    // Apply authoritative state (covers remote players and reconciles our own).
    this.world.setOverride(msg.x, msg.y, msg.z, msg.block);
    if (msg.block === BlockId.Air) {
      // Breaking a sign cascades a signApplied remove; nothing else needed here.
    }
    this.hooks.markDirty(msg.x, msg.y, msg.z);
  }

  onSignApplied(msg: Extract<ServerMessage, { t: 'signApplied' }>): void {
    if (msg.eid) this.pending.delete(msg.eid);
    if (msg.op === 'remove') {
      this.signs.removeAt(msg.sign.x, msg.sign.y, msg.sign.z);
    } else {
      this.signs.upsert(msg.sign);
    }
  }

  /** Server rejected one of our edits: roll back the optimistic change. */
  onError(code: string, ref?: string): void {
    if (ref) {
      const p = this.pending.get(ref);
      if (p) {
        if (p.frame.t === 'edit' || p.frame.t === 'use') {
          for (const cell of p.cells) {
            this.applyLocal(cell.x, cell.y, cell.z, cell.prevBlock);
          }
        }
        this.pending.delete(ref);
      }
    }
    const toast = ERROR_TOASTS[code] ?? 'Action rejected.';
    this.hooks.toast(toast, 'error');
    this.pruneStale();
  }

  /** Resend unacknowledged edits after a reconnect (idempotent server-side). */
  flushPending(): void {
    if (this.pending.size === 0) return;
    const ops = [...this.pending.values()].sort((a, b) => a.sentAt - b.sentAt);
    let sent = 0;
    for (const op of ops) {
      if (this.net.send(op.frame)) sent++;
    }
    if (sent > 0)
      this.hooks.toast(`Re-synced ${sent} pending edit${sent === 1 ? '' : 's'}.`, 'good');
    this.pruneStale();
  }

  dropPending(): void {
    this.pending.clear();
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Validate a target is within reach before acting (defense in depth). */
  withinReach(eye: { x: number; y: number; z: number }, hit: RayHit): boolean {
    return (
      distanceSqToBlockCenter(eye.x, eye.y, eye.z, hit.x, hit.y, hit.z) <= (PLAYER_REACH + 0.5) ** 2
    );
  }

  private applyLocal(x: number, y: number, z: number, block: number): void {
    this.world.setOverride(x, y, z, block);
    this.hooks.markDirty(x, y, z);
  }

  private playerFacing(): HorizontalFacing {
    return (((Math.round(-this.player.yaw / (Math.PI / 2)) % 4) + 4) % 4) as HorizontalFacing;
  }

  /** Resolve which inner wall face the ladder should lie against. */
  private ladderFacing(hit: RayHit): HorizontalFacing | null {
    if (hit.nx > 0) return 3; // support west of the new cell
    if (hit.nx < 0) return 1; // support east
    if (hit.nz > 0) return 0; // support north
    if (hit.nz < 0) return 2; // support south
    return null;
  }

  private persistCells(cells: Array<{ x: number; z: number }>): void {
    const chunks = new Set<string>();
    for (const cell of cells) {
      const key = `${cell.x},${cell.z}`;
      if (chunks.has(key)) continue;
      chunks.add(key);
      this.hooks.persistLocal(cell.x, cell.z);
    }
  }

  private pruneStale(): void {
    const cutoff = Date.now() - 30_000;
    for (const [eid, op] of [...this.pending]) {
      if (op.sentAt < cutoff) this.pending.delete(eid);
    }
  }
}
