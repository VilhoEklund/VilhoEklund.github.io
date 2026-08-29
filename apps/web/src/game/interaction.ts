import {
  BlockId,
  HOTBAR_BLOCKS,
  PLAYER_REACH,
  distanceSqToBlockCenter,
  type ClientMessage,
  type ServerMessage,
} from '@eternal-blocks/shared';
import type { NetClient } from '../net/connection.ts';
import { raycastVoxel, type RayHit } from './raycast.ts';
import type { WorldStore } from './world/worldStore.ts';
import { playerIntersectsCell, type LocalPlayer } from './player.ts';
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
  kind: 'place' | 'break';
  x: number;
  y: number;
  z: number;
  prevBlock: number;
  sentAt: number;
  frame: ClientMessage;
}

const ERROR_TOASTS: Record<string, string> = {
  unreachable: 'Too far away.',
  unbreakable: 'Bedrock cannot be broken.',
  nothing_to_edit: 'Something changed there already.',
  rate_limited: 'Slow down a little.',
  out_of_range: 'That spot is out of bounds.',
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
  selectedSlot = 0;

  private pending = new Map<string, PendingOp>();

  constructor(
    private readonly world: WorldStore,
    private readonly net: NetClient,
    private readonly signs: SignsRenderer,
    private readonly player: LocalPlayer,
    private readonly hooks: InteractionHooks,
    private readonly opts: InteractionOptions,
  ) {}

  get selectedBlock(): number {
    return HOTBAR_BLOCKS[this.selectedSlot % HOTBAR_BLOCKS.length] ?? BlockId.Stone;
  }

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
    this.applyLocal(hit.x, hit.y, hit.z, BlockId.Air);
    if (this.opts.localOnly) {
      if (current === BlockId.Sign) this.signs.removeAt(hit.x, hit.y, hit.z);
      this.hooks.persistLocal(hit.x, hit.z);
      return;
    }
    this.pending.set(eid, {
      eid,
      kind: 'break',
      x: hit.x,
      y: hit.y,
      z: hit.z,
      prevBlock: current,
      sentAt: Date.now(),
      frame,
    });
    if (!this.net.send(frame))
      this.hooks.toast('Offline - edit will sync after reconnect.', 'info');
  }

  tryPlace(hit: RayHit): void {
    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (y < 0 || y > 255) return;
    const current = this.world.getBlock(x, y, z);
    if (current !== BlockId.Air && current !== BlockId.Water) return;
    if (
      playerIntersectsCell(
        this.player.pos.x,
        this.player.pos.y,
        this.player.pos.z,
        x,
        y,
        z,
        this.player.height,
      )
    ) {
      this.hooks.toast('Not enough room.', 'error');
      return;
    }
    const block = this.selectedBlock;
    const eid = newEid();
    const frame: ClientMessage = { t: 'edit', eid, action: 'place', x, y, z, block };
    this.applyLocal(x, y, z, block);
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
        this.hooks.persistLocal(x, z);
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
        x,
        y,
        z,
        prevBlock: current,
        sentAt: Date.now(),
        frame: signFrame,
      });
      this.net.send(signFrame);
      this.hooks.onSignPlaced({ x, y, z });
    }
    if (this.opts.localOnly) {
      this.hooks.persistLocal(x, z);
      return;
    }
    this.pending.set(eid, {
      eid,
      kind: 'place',
      x,
      y,
      z,
      prevBlock: current,
      sentAt: Date.now(),
      frame,
    });
    if (!this.net.send(frame))
      this.hooks.toast('Offline - edit will sync after reconnect.', 'info');
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
      x: cell.x,
      y: cell.y,
      z: cell.z,
      prevBlock: BlockId.Sign,
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
      x: cell.x,
      y: cell.y,
      z: cell.z,
      prevBlock: BlockId.Sign,
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
      x: cell.x,
      y: cell.y,
      z: cell.z,
      prevBlock: BlockId.Sign,
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
        if (p.kind === 'break') {
          this.applyLocal(p.x, p.y, p.z, p.prevBlock);
        } else if (p.frame.t === 'edit') {
          this.applyLocal(p.x, p.y, p.z, p.prevBlock);
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

  private pruneStale(): void {
    const cutoff = Date.now() - 30_000;
    for (const [eid, op] of [...this.pending]) {
      if (op.sentAt < cutoff) this.pending.delete(eid);
    }
  }
}
