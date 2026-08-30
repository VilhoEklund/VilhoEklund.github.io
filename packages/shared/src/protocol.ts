import {
  CHAT_MAX_LEN,
  MAX_WORLD_COORD,
  NICKNAME_MAX,
  NICKNAME_MIN,
  PROTOCOL_VERSION,
  SIGN_MAX_CHARS,
  SIGN_MAX_LINES,
  SIGN_MAX_LINE_LEN,
  WORLD_HEIGHT,
} from './constants.ts';
import { isPlaceable } from './blocks.ts';

/**
 * Versioned, validated WebSocket protocol for Eternal Blocks.
 *
 * All messages are JSON objects with a discriminant field `t`.
 * The server treats every incoming message as hostile: sizes are capped,
 * strings sanitized, coordinates range-checked before anything touches
 * storage or other players.
 */

export type ValidResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const valid = <T>(value: T): ValidResult<T> => ({ ok: true, value });
export const invalid = <T = never>(error: string): ValidResult<T> => ({ ok: false, error });

// ---------------------------------------------------------------------------
// Shared payload types
// ---------------------------------------------------------------------------

export interface SignInfo {
  x: number;
  y: number;
  z: number;
  /** Plain text; newline-separated lines. Already sanitized. */
  text: string;
  authorId: string;
  authorName: string;
  updatedAt: number;
  /** Facing quadrant 0-3 (set at creation, persisted). */
  rot?: number;
}

export interface PlayerRosterEntry {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Client -> Server messages
// ---------------------------------------------------------------------------

export interface HelloMsg {
  t: 'hello';
  proto: number;
  name: string;
  playerId: string;
}

export interface PosMsg {
  t: 'pos';
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface EditMsg {
  t: 'edit';
  /** Client-generated unique edit id; makes retries idempotent. */
  eid: string;
  action: 'place' | 'break';
  x: number;
  y: number;
  z: number;
  /** Required for action==='place'; must be a placeable block id. */
  block?: number;
}

export interface SignMsg {
  t: 'sign';
  eid: string;
  op: 'create' | 'update' | 'remove';
  x: number;
  y: number;
  z: number;
  /** Required for create/update; sanitized server-side. */
  text?: string;
  /** Facing quadrant 0-3; honored on create, immutable afterwards. */
  rot?: number;
}

export interface UseMsg {
  t: 'use';
  eid: string;
  x: number;
  y: number;
  z: number;
}

export interface ChatMsgC {
  t: 'chat';
  text: string;
}

export interface PingMsg {
  t: 'ping';
  ts: number;
}

export type ClientMessage = HelloMsg | PosMsg | EditMsg | UseMsg | SignMsg | ChatMsgC | PingMsg;

// ---------------------------------------------------------------------------
// Server -> Client messages
// ---------------------------------------------------------------------------

export interface WelcomeMsg {
  t: 'welcome';
  proto: number;
  playerId: string;
  seed: number;
  terrainVersion: number;
  spawn: { x: number; y: number; z: number };
  players: PlayerRosterEntry[];
  serverTime: number;
}

export interface SyncStartMsg {
  t: 'syncStart';
  chunks: Array<[number, number]>;
}

export interface ChunkSnapshotMsg {
  t: 'chunk';
  cx: number;
  cz: number;
  /** Sparse overrides as [flatIndex, blockId] pairs. */
  overrides: Array<[number, number]>;
  signs: SignInfo[];
}

export interface SyncDoneMsg {
  t: 'syncDone';
}

export interface PJoinMsg {
  t: 'pjoin';
  id: string;
  name: string;
}

export interface PLeaveMsg {
  t: 'pleave';
  id: string;
}

export interface PStateMsg {
  t: 'ps';
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface BlockAppliedMsg {
  t: 'blockApplied';
  eid?: string;
  action: 'place' | 'break' | 'use';
  x: number;
  y: number;
  z: number;
  /** Authoritative resulting block id in the cell. */
  block: number;
  by: { id: string; name: string };
}

export interface SignAppliedMsg {
  t: 'signApplied';
  eid?: string;
  op: 'create' | 'update' | 'remove';
  sign: SignInfo;
}

export interface ChatMsgS {
  t: 'chatMsg';
  from: { id: string; name: string };
  text: string;
  ts: number;
}

export type ErrorCode =
  | 'bad_json'
  | 'unknown_type'
  | 'bad_message'
  | 'too_large'
  | 'not_joined'
  | 'protocol_mismatch'
  | 'invalid_name'
  | 'banned'
  | 'rate_limited'
  | 'out_of_range'
  | 'unreachable'
  | 'invalid_block'
  | 'invalid_use'
  | 'unbreakable'
  | 'nothing_to_edit'
  | 'sign_not_found'
  | 'sign_forbidden'
  | 'sign_too_long'
  | 'chat_too_long'
  | 'world_locked'
  | 'server_error';

export interface ErrorMsg {
  t: 'error';
  code: ErrorCode;
  msg: string;
  /** Echo of the client edit/sign id that caused the error, if any. */
  ref?: string;
}

export interface PongMsg {
  t: 'pong';
  ts: number;
}

export type ServerMessage =
  | WelcomeMsg
  | SyncStartMsg
  | ChunkSnapshotMsg
  | SyncDoneMsg
  | PJoinMsg
  | PLeaveMsg
  | PStateMsg
  | BlockAppliedMsg
  | SignAppliedMsg
  | ChatMsgS
  | ErrorMsg
  | PongMsg;

// ---------------------------------------------------------------------------
// Text sanitization
// ---------------------------------------------------------------------------

const CONTROL_RE =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Strip control/zero-width characters and normalize. */
export function stripControls(s: string): string {
  return s.normalize('NFC').replace(CONTROL_RE, '');
}

/** Sanitize free single-line text (chat). Returns '' when nothing remains. */
export function sanitizeChatText(raw: unknown, maxLen = CHAT_MAX_LEN): string {
  if (typeof raw !== 'string') return '';
  let s = stripControls(raw).replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

/** Sanitize multi-line sign text into at most `maxLines` non-empty trimmed lines. */
export function sanitizeSignText(
  raw: unknown,
  maxLines = SIGN_MAX_LINES,
  maxLineLen = SIGN_MAX_LINE_LEN,
  maxTotal = SIGN_MAX_CHARS,
): string {
  if (typeof raw !== 'string') return '';
  // Collapse horizontal whitespace runs (keep explicit newlines for signs).
  const cleaned = stripControls(raw)
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\r/g, '');
  const out: string[] = [];
  for (const rawLine of cleaned.split('\n')) {
    const line = rawLine.trim().slice(0, maxLineLen);
    if (line.length === 0) continue;
    if (out.length >= maxLines) break;
    out.push(line);
  }
  return out.join('\n').slice(0, maxTotal);
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

const NAME_ALLOWED_RE = /^[\p{L}\p{N} ._-]+$/u;
const PLAYERID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function validateNickname(raw: unknown): ValidResult<string> {
  if (typeof raw !== 'string') return invalid('name must be a string');
  const s = stripControls(raw).replace(/\s+/g, ' ').trim();
  if (s.length < NICKNAME_MIN || s.length > NICKNAME_MAX) {
    return invalid(`name must be ${NICKNAME_MIN}-${NICKNAME_MAX} characters`);
  }
  if (!NAME_ALLOWED_RE.test(s)) return invalid('name contains unsupported characters');
  return valid(s);
}

export function validatePlayerId(raw: unknown): ValidResult<string> {
  if (typeof raw !== 'string') return invalid('playerId must be a string');
  const s = raw.trim();
  if (!PLAYERID_RE.test(s)) return invalid('playerId malformed');
  return valid(s);
}

export function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

export function isValidWorldCoord(x: unknown, y: unknown, z: unknown): boolean {
  return (
    isIntIn(x, -MAX_WORLD_COORD, MAX_WORLD_COORD) &&
    isIntIn(y, 0, WORLD_HEIGHT - 1) &&
    isIntIn(z, -MAX_WORLD_COORD, MAX_WORLD_COORD)
  );
}

export function isValidEditId(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 8 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
}

export function isPlaceableBlockId(v: unknown): v is number {
  return typeof v === 'number' && isPlaceable(v);
}

// ---------------------------------------------------------------------------
// Whole-message validation
// ---------------------------------------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function parseWireFrame(text: string): ValidResult<unknown> {
  try {
    return valid(JSON.parse(text));
  } catch {
    return invalid('bad json');
  }
}

/** Validate an already-parsed client message. */
export function validateClientMessage(v: unknown): ValidResult<ClientMessage> {
  const o = asRecord(v);
  if (!o) return invalid('message must be an object');
  const t = o['t'];
  switch (t) {
    case 'hello': {
      if (o['proto'] !== PROTOCOL_VERSION) return invalid('protocol version mismatch');
      const name = validateNickname(o['name']);
      if (!name.ok) return invalid(name.error);
      const pid = validatePlayerId(o['playerId']);
      if (!pid.ok) return invalid(pid.error);
      return valid({ t: 'hello', proto: PROTOCOL_VERSION, name: name.value, playerId: pid.value });
    }
    case 'pos': {
      const { x, y, z, yaw, pitch } = o as Record<string, unknown>;
      if (!isFiniteNum(x) || !isFiniteNum(y) || !isFiniteNum(z))
        return invalid('pos requires finite xyz');
      if (!isFiniteNum(yaw) || !isFiniteNum(pitch)) return invalid('pos requires finite angles');
      if (
        Math.abs(x) > MAX_WORLD_COORD + 64 ||
        Math.abs(z) > MAX_WORLD_COORD + 64 ||
        y < -64 ||
        y > WORLD_HEIGHT + 256
      ) {
        return invalid('pos out of bounds');
      }
      return valid({ t: 'pos', x, y, z, yaw, pitch });
    }
    case 'edit': {
      const eid = o['eid'];
      if (!isValidEditId(eid)) return invalid('eid malformed');
      const action = o['action'];
      if (action !== 'place' && action !== 'break') return invalid('action invalid');
      const x = o['x'];
      const y = o['y'];
      const z = o['z'];
      if (
        !isIntIn(x, -MAX_WORLD_COORD, MAX_WORLD_COORD) ||
        !isIntIn(y, 0, WORLD_HEIGHT - 1) ||
        !isIntIn(z, -MAX_WORLD_COORD, MAX_WORLD_COORD)
      ) {
        return invalid('coordinates out of range');
      }
      if (action === 'place') {
        const b = o['block'];
        if (!isPlaceableBlockId(b)) return invalid('block not placeable');
        return valid({ t: 'edit', eid, action, x, y, z, block: b });
      }
      return valid({ t: 'edit', eid, action, x, y, z });
    }
    case 'use': {
      const eid = o['eid'];
      if (!isValidEditId(eid)) return invalid('eid malformed');
      const x = o['x'];
      const y = o['y'];
      const z = o['z'];
      if (!isValidWorldCoord(x, y, z)) return invalid('coordinates out of range');
      return valid({ t: 'use', eid, x: x as number, y: y as number, z: z as number });
    }
    case 'sign': {
      const eid = o['eid'];
      if (!isValidEditId(eid)) return invalid('eid malformed');
      const op = o['op'];
      if (op !== 'create' && op !== 'update' && op !== 'remove') return invalid('op invalid');
      const x = o['x'];
      const y = o['y'];
      const z = o['z'];
      if (
        !isIntIn(x, -MAX_WORLD_COORD, MAX_WORLD_COORD) ||
        !isIntIn(y, 0, WORLD_HEIGHT - 1) ||
        !isIntIn(z, -MAX_WORLD_COORD, MAX_WORLD_COORD)
      ) {
        return invalid('coordinates out of range');
      }
      if (op === 'remove') return valid({ t: 'sign', eid, op, x, y, z });
      // create/update carry sanitized text; empty is allowed so clients can
      // open the editor right after placement.
      const text = sanitizeSignText(o['text']);
      let rot: number | undefined;
      if (o['rot'] !== undefined) {
        if (!isIntIn(o['rot'], 0, 3)) return invalid('rot out of range');
        rot = o['rot'];
      }
      return valid({ t: 'sign', eid, op, x, y, z, text, rot });
    }
    case 'chat': {
      const text = sanitizeChatText(o['text']);
      if (text.length === 0) return invalid('empty chat message');
      return valid({ t: 'chat', text });
    }
    case 'ping': {
      if (!isFiniteNum(o['ts'])) return invalid('ts required');
      return valid({ t: 'ping', ts: o['ts'] });
    }
    default:
      return invalid('unknown message type');
  }
}

export function encodeMessage(msg: ServerMessage | ClientMessage): string {
  return JSON.stringify(msg);
}

/** Validate a raw frame (size-capped) into a typed client message. */
export function decodeClientFrame(text: string): ValidResult<ClientMessage> {
  const parsed = parseWireFrame(text);
  if (!parsed.ok) return parsed;
  return validateClientMessage(parsed.value);
}
