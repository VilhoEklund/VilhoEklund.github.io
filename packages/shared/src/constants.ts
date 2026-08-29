/**
 * Eternal Blocks - shared constants.
 *
 * These values define the permanent shared world. They must never be changed
 * casually: TERRAIN_VERSION and the persisted seed define the one canonical
 * world. See README ("World integrity") before touching anything here.
 */

/** Wire protocol version. Bump on breaking protocol changes. */
export const PROTOCOL_VERSION = 1;

/**
 * Terrain generator version. Persisted alongside the world seed in durable
 * storage when the world is first initialized. If this value ever changes,
 * the server refuses to serve the world rather than silently regenerating
 * terrain on top of player edits.
 */
export const TERRAIN_VERSION = 1;

/** Default seed string. Persisted on first world initialization; never rotated. */
export const DEFAULT_SEED_STRING = 'eternal-blocks/scenic-highlands/2';

/** Horizontal chunk edge length (blocks). */
export const CHUNK_SIZE = 16;
/** World height in blocks (y from 0 to WORLD_HEIGHT-1). */
export const WORLD_HEIGHT = 80;
/** Sea level; water fills terrain below this height. */
export const SEA_LEVEL = 26;

/** Maximum horizontal block coordinate magnitude accepted by the server. */
export const MAX_WORLD_COORD = 1_000_000;

/** Player reach for block interaction (client-side targeting distance). */
export const PLAYER_REACH = 6;
/** Extra slack the server allows when validating edit distance. */
export const SERVER_REACH_MARGIN = 1.75;

/** Nickname constraints. */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;
/** Chat message max length (characters, after sanitization). */
export const CHAT_MAX_LEN = 200;
/** Sign text constraints: up to SIGN_MAX_LINES lines of SIGN_MAX_LINE_LEN chars. */
export const SIGN_MAX_LINES = 3;
export const SIGN_MAX_LINE_LEN = 24;
export const SIGN_MAX_CHARS = SIGN_MAX_LINES * SIGN_MAX_LINE_LEN;

/** Client movement update rate (messages per second). */
export const POS_SEND_INTERVAL_MS = 100;
/** How often the server durably records a player's last known position. */
export const PLAYER_POS_PERSIST_INTERVAL_MS = 20_000;
/** Client ping interval / server liveness sweep. */
export const PING_INTERVAL_MS = 10_000;
export const PLAYER_STALE_MS = 90_000;

/** Default client render distance in chunks (configurable 2..10 in settings). */
export const RENDER_DISTANCE_DEFAULT = 6;
export const RENDER_DISTANCE_MIN = 2;
export const RENDER_DISTANCE_MAX = 10;

/** Rate limits enforced per connection by the server. */
export const RATE_LIMITS = {
  /** All messages combined per second (burst window). */
  messagesPerSecond: 45,
  /** Block edit messages per second. */
  editsPerSecond: 12,
  /** Chat messages per second. */
  chatPerSecond: 4,
  /** Position updates per second (generous ceiling above POS_SEND_INTERVAL_MS). */
  posPerSecond: 30,
  /** Sign operations per second. */
  signsPerSecond: 6,
} as const;

/** Maximum accepted raw WebSocket frame size (bytes). */
export const MAX_FRAME_BYTES = 16 * 1024;

/** Maximum number of audit rows retained (oldest pruned). */
export const AUDIT_MAX_ROWS = 50_000;

/** WebSocket close codes used by the server. */
export const CLOSE_CODES = {
  protocolMismatch: 4001,
  banned: 4003,
  notAuthorized: 4004,
  idle: 4005,
  malformed: 4007,
  rateLimited: 4008,
  oversizedFrame: 4009,
} as const;

/** Export format identifier written into admin exports. */
export const EXPORT_FORMAT = 'eternal-blocks/world-export@1';
