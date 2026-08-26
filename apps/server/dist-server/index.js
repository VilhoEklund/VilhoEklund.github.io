var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/env.ts
var DEFAULT_WORLD_ID = "the-eternal-world";

// src/origin.ts
function parseAllowedOrigins(raw) {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
__name(parseAllowedOrigins, "parseAllowedOrigins");
function originPolicyFromEnv(raw) {
  const origins = parseAllowedOrigins(raw);
  return { allowAll: origins.includes("*"), origins: new Set(origins) };
}
__name(originPolicyFromEnv, "originPolicyFromEnv");
function isOriginAllowed(policy, origin) {
  if (policy.allowAll) return true;
  if (origin === null) return true;
  return policy.origins.has(origin);
}
__name(isOriginAllowed, "isOriginAllowed");
function corsHeaders(origin) {
  const h = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "86400"
  };
  if (origin) {
    h["Access-Control-Allow-Origin"] = origin;
  }
  return h;
}
__name(corsHeaders, "corsHeaders");
function tokensMatch(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) {
    let x = 0;
    for (let i = 0; i < b.length; i++) x |= b.charCodeAt(i);
    return x === -1 && false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(tokensMatch, "tokensMatch");

// ../../packages/shared/src/constants.ts
var PROTOCOL_VERSION = 1;
var TERRAIN_VERSION = 1;
var DEFAULT_SEED_STRING = "eternal-blocks/primeval/1";
var CHUNK_SIZE = 16;
var WORLD_HEIGHT = 80;
var SEA_LEVEL = 26;
var MAX_WORLD_COORD = 1e6;
var PLAYER_REACH = 6;
var SERVER_REACH_MARGIN = 1.75;
var NICKNAME_MIN = 2;
var NICKNAME_MAX = 16;
var CHAT_MAX_LEN = 200;
var SIGN_MAX_LINES = 3;
var SIGN_MAX_LINE_LEN = 24;
var SIGN_MAX_CHARS = SIGN_MAX_LINES * SIGN_MAX_LINE_LEN;
var PLAYER_STALE_MS = 9e4;
var RATE_LIMITS = {
  /** All messages combined per second (burst window). */
  messagesPerSecond: 45,
  /** Block edit messages per second. */
  editsPerSecond: 12,
  /** Chat messages per second. */
  chatPerSecond: 4,
  /** Position updates per second (generous ceiling above POS_SEND_INTERVAL_MS). */
  posPerSecond: 30,
  /** Sign operations per second. */
  signsPerSecond: 6
};
var MAX_FRAME_BYTES = 16 * 1024;
var AUDIT_MAX_ROWS = 5e4;
var CLOSE_CODES = {
  protocolMismatch: 4001,
  banned: 4003,
  notAuthorized: 4004,
  idle: 4005,
  malformed: 4007,
  rateLimited: 4008,
  oversizedFrame: 4009
};
var EXPORT_FORMAT = "eternal-blocks/world-export@1";

// ../../packages/shared/src/blocks.ts
var BlockId = {
  Air: 0,
  Grass: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  Water: 5,
  Log: 6,
  Leaves: 7,
  Planks: 8,
  Brick: 9,
  Glass: 10,
  // 11 was Snow, removed from the game; never reassign this ID.
  Bedrock: 12,
  Sign: 13
};
function def(d) {
  return d;
}
__name(def, "def");
var BLOCKS = {
  [BlockId.Air]: def({
    id: BlockId.Air,
    name: "Air",
    solid: false,
    opaque: false,
    replaceable: true,
    unbreakable: false,
    color: "#000000"
  }),
  [BlockId.Grass]: def({
    id: BlockId.Grass,
    name: "Grass",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: "#58b04a"
  }),
  [BlockId.Dirt]: def({
    id: BlockId.Dirt,
    name: "Dirt",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: "#7a5636"
  }),
  [BlockId.Stone]: def({
    id: BlockId.Stone,
    name: "Stone",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: "#8a8f94"
  }),
  [BlockId.Sand]: def({
    id: BlockId.Sand,
    name: "Sand",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: "#e3d29b"
  }),
  [BlockId.Water]: def({
    id: BlockId.Water,
    name: "Water",
    solid: false,
    opaque: false,
    replaceable: true,
    unbreakable: false,
    liquid: true,
    color: "#3f76e4"
  }),
  [BlockId.Log]: def({
    id: BlockId.Log,
    name: "Log",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: "#6e522f"
  }),
  [BlockId.Leaves]: def({
    id: BlockId.Leaves,
    name: "Leaves",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: "#3e7d33"
  }),
  [BlockId.Planks]: def({
    id: BlockId.Planks,
    name: "Planks",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: "#b08a52"
  }),
  [BlockId.Brick]: def({
    id: BlockId.Brick,
    name: "Brick",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: "#a5503c"
  }),
  [BlockId.Glass]: def({
    id: BlockId.Glass,
    name: "Glass",
    solid: true,
    opaque: false,
    replaceable: false,
    unbreakable: false,
    color: "#cfe8ef"
  }),
  [BlockId.Bedrock]: def({
    id: BlockId.Bedrock,
    name: "Bedrock",
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: true,
    color: "#33363b"
  }),
  [BlockId.Sign]: def({
    id: BlockId.Sign,
    name: "Sign",
    // Non-solid so signs never trap players; rendered as a post + panel.
    solid: false,
    opaque: false,
    replaceable: false,
    unbreakable: false,
    color: "#c9a86a"
  })
};
var HOTBAR_BLOCKS = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Sand,
  BlockId.Log,
  BlockId.Leaves,
  BlockId.Planks,
  BlockId.Brick,
  BlockId.Glass,
  BlockId.Sign
];
var BLOCK_ID_VALUES = Object.values(BlockId);

// ../../packages/shared/src/coords.ts
function chunkCoord(v) {
  return v >> 4;
}
__name(chunkCoord, "chunkCoord");
function blockIndex(lx, y, lz) {
  return lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}
__name(blockIndex, "blockIndex");
function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}
__name(chunkKey, "chunkKey");
function distanceSqToBlockCenter(px, py, pz, x, y, z) {
  const dx = px - (x + 0.5);
  const dy = py - (y + 0.5);
  const dz = pz - (z + 0.5);
  return dx * dx + dy * dy + dz * dz;
}
__name(distanceSqToBlockCenter, "distanceSqToBlockCenter");
function spiralOffsets(radius) {
  const out = [[0, 0]];
  for (let r = 1; r <= radius; r++) {
    for (let x = -r; x <= r; x++) {
      out.push([x, -r], [x, r]);
    }
    for (let z = -r + 1; z <= r - 1; z++) {
      out.push([-r, z], [r, z]);
    }
  }
  return out;
}
__name(spiralOffsets, "spiralOffsets");

// ../../packages/shared/src/noise.ts
function hashInt(n) {
  n = Math.imul(n ^ n >>> 16, 73244475);
  n = Math.imul(n ^ n >>> 16, 73244475);
  n = (n ^ n >>> 16) >>> 0;
  return n;
}
__name(hashInt, "hashInt");
function hash3(a, b, c) {
  return hashInt((Math.imul(a | 0, 668265261) ^ Math.imul(b | 0, 374761393) ^ Math.imul(c | 0, 2654435761)) >>> 0);
}
__name(hash3, "hash3");
function hash2f(seed, x, z) {
  return hash3(seed, x | 0, z | 0) / 4294967296;
}
__name(hash2f, "hash2f");
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
__name(hashString, "hashString");
function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
__name(smootherstep, "smootherstep");
function valueNoise2(seed, x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smootherstep(x - x0);
  const fz = smootherstep(z - z0);
  const v00 = hash2f(seed, x0, z0);
  const v10 = hash2f(seed, x0 + 1, z0);
  const v01 = hash2f(seed, x0, z0 + 1);
  const v11 = hash2f(seed, x0 + 1, z0 + 1);
  const a = v00 + (v10 - v00) * fx;
  const b = v01 + (v11 - v01) * fx;
  return a + (b - a) * fz;
}
__name(valueNoise2, "valueNoise2");
function fbm2(seed, x, z, opts = {}) {
  const octaves = Math.max(1, opts.octaves ?? 4);
  const lacunarity = opts.lacunarity ?? 2;
  const gain = opts.gain ?? 0.5;
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise2(seed + o * 2654435769, x * freq, z * freq);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}
__name(fbm2, "fbm2");
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
__name(clamp, "clamp");
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
}
__name(smoothstep, "smoothstep");

// ../../packages/shared/src/terrain.ts
function bundleFromSeed(seed) {
  return {
    hills: seed ^ 439041101,
    cont: seed ^ 1584361601,
    mountMask: seed ^ 2460202181,
    mount: seed ^ 3605526537,
    temp: seed ^ 287454020,
    moist: seed ^ 1432778632,
    forest: seed ^ 2578103244,
    tree: seed ^ 3723427584
  };
}
__name(bundleFromSeed, "bundleFromSeed");
var TerrainGenerator = class _TerrainGenerator {
  static {
    __name(this, "TerrainGenerator");
  }
  seed;
  version;
  s;
  constructor(seed, version = TERRAIN_VERSION) {
    this.seed = seed >>> 0;
    this.version = version;
    this.s = bundleFromSeed(this.seed);
  }
  static fromSeedString(seedString, version = TERRAIN_VERSION) {
    return new _TerrainGenerator(hashString(seedString), version);
  }
  static seedFromString(seedString) {
    return hashString(seedString);
  }
  columnInfo(wx, wz) {
    const s = this.s;
    const hills = fbm2(s.hills, wx * 0.016, wz * 0.016, { octaves: 4 });
    const cont = fbm2(s.cont, wx * 4e-3, wz * 4e-3, { octaves: 3 });
    const maskRaw = fbm2(s.mountMask, wx * 28e-4, wz * 28e-4, { octaves: 2 });
    const mask = smoothstep(0.58, 0.78, maskRaw);
    const mountNoise = Math.pow(fbm2(s.mount, wx * 0.03, wz * 0.03, { octaves: 4 }), 1.5);
    let h = Math.round(24 + (hills - 0.5) * 20 + (cont - 0.5) * 14 + mask * mountNoise * 30);
    h = Math.max(4, Math.min(WORLD_HEIGHT - 12, h));
    const temp = fbm2(s.temp, wx * 4e-3, wz * 4e-3, { octaves: 2 }) - Math.max(0, h - 36) * 8e-3;
    const moist = fbm2(s.moist, wx * 5e-3, wz * 5e-3, { octaves: 2 });
    let biome = "grass";
    if (temp > 0.62 && moist < 0.45) biome = "desert";
    if (temp < 0.3 || h >= 48) biome = "desert";
    return { h, biome };
  }
  /** Tree occupying this column, if any (deterministic per column). */
  treeAt(wx, wz, info) {
    const col = info ?? this.columnInfo(wx, wz);
    if (col.biome !== "grass" || col.h <= SEA_LEVEL) return null;
    const forest = smoothstep(0.42, 0.68, fbm2(this.s.forest, wx * 0.01, wz * 0.01, { octaves: 2 }));
    const density = 18e-4 + forest * 0.026;
    if (hash2f(this.s.tree, wx, wz) >= density) return null;
    const r = hashInt(Math.imul(wx, 668265261) ^ Math.imul(wz, 374761393) ^ this.s.tree);
    const trunkHeight = 4 + r % 3;
    return { h: col.h, trunkHeight };
  }
  /**
   * Fill a chunk array (CHUNK_SIZE x WORLD_HEIGHT x CHUNK_SIZE) with
   * generated terrain including water and trees whose canopies overlap.
   */
  fillChunk(data, cx, cz) {
    data.fill(BlockId.Air);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = baseX + lx;
        const wz = baseZ + lz;
        const { h, biome } = this.columnInfo(wx, wz);
        const underwater = h <= SEA_LEVEL;
        let topBlock;
        let fillBlock;
        const beach = h > SEA_LEVEL && h <= SEA_LEVEL + 2;
        if (biome === "desert" || beach) {
          topBlock = BlockId.Sand;
          fillBlock = BlockId.Sand;
        } else {
          topBlock = BlockId.Grass;
          fillBlock = BlockId.Dirt;
        }
        if (underwater) {
          topBlock = SEA_LEVEL - h <= 2 ? BlockId.Sand : BlockId.Dirt;
          fillBlock = BlockId.Dirt;
        }
        for (let y = 0; y < h; y++) {
          let b;
          if (y === 0) b = BlockId.Bedrock;
          else if (y === h - 1) b = topBlock;
          else if (y >= h - 3) b = fillBlock;
          else b = BlockId.Stone;
          data[blockIndex(lx, y, lz)] = b;
        }
        if (underwater) {
          for (let y = h; y <= SEA_LEVEL; y++) {
            data[blockIndex(lx, y, lz)] = BlockId.Water;
          }
        }
      }
    }
    const margin = 2;
    for (let wz = baseZ - margin; wz < baseZ + CHUNK_SIZE + margin; wz++) {
      for (let wx = baseX - margin; wx < baseX + CHUNK_SIZE + margin; wx++) {
        const tree = this.treeAt(wx, wz);
        if (!tree) continue;
        this.writeTree(data, cx, cz, wx, wz, tree);
      }
    }
  }
  writeTree(data, cx, cz, wx, wz, tree) {
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const setIfAir = /* @__PURE__ */ __name((x, y, z, b) => {
      const lx = x - baseX;
      const lz = z - baseZ;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
      if (y < 0 || y >= WORLD_HEIGHT) return;
      const idx = blockIndex(lx, y, lz);
      if (data[idx] === BlockId.Air) data[idx] = b;
    }, "setIfAir");
    const topY = tree.h + tree.trunkHeight - 1;
    for (let y = tree.h; y <= topY; y++) {
      const lx = wx - baseX;
      const lz = wz - baseZ;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) break;
      data[blockIndex(lx, y, lz)] = BlockId.Log;
    }
    for (let dy = -1; dy <= 0; dy++) {
      const y = topY + dy + 1;
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          setIfAir(wx + dx, y, wz + dz, BlockId.Leaves);
        }
      }
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        setIfAir(wx + dx, topY + 2, wz + dz, BlockId.Leaves);
      }
    }
    setIfAir(wx + 1, topY + 3, wz, BlockId.Leaves);
    setIfAir(wx - 1, topY + 3, wz, BlockId.Leaves);
    setIfAir(wx, topY + 3, wz + 1, BlockId.Leaves);
    setIfAir(wx, topY + 3, wz - 1, BlockId.Leaves);
    setIfAir(wx, topY + 3, wz, BlockId.Leaves);
  }
  /** Find a pleasant land spawn deterministically (spiral search from origin). */
  findSpawn(maxRadius = 96) {
    for (const [dx, dz] of spiralOffsets(maxRadius)) {
      const wx = dx;
      const wz = dz;
      const info = this.columnInfo(wx, wz);
      if (info.h <= SEA_LEVEL + 1 || info.h >= WORLD_HEIGHT - 16) continue;
      if (this.treeAt(wx, wz, info)) continue;
      if (this.treeAt(wx + 1, wz) || this.treeAt(wx - 1, wz)) continue;
      if (this.treeAt(wx, wz + 1) || this.treeAt(wx, wz - 1)) continue;
      return { x: wx + 0.5, y: info.h, z: wz + 0.5 };
    }
    return { x: 0.5, y: WORLD_HEIGHT / 2, z: 0.5 };
  }
};

// ../../packages/shared/src/protocol.ts
var valid = /* @__PURE__ */ __name((value) => ({ ok: true, value }), "valid");
var invalid = /* @__PURE__ */ __name((error) => ({ ok: false, error }), "invalid");
var CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u202A-\u202E\u2066-\u2069\uFEFF]/g;
function stripControls(s) {
  return s.normalize("NFC").replace(CONTROL_RE, "");
}
__name(stripControls, "stripControls");
function sanitizeChatText(raw, maxLen = CHAT_MAX_LEN) {
  if (typeof raw !== "string") return "";
  let s = stripControls(raw).replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}
__name(sanitizeChatText, "sanitizeChatText");
function sanitizeSignText(raw, maxLines = SIGN_MAX_LINES, maxLineLen = SIGN_MAX_LINE_LEN, maxTotal = SIGN_MAX_CHARS) {
  if (typeof raw !== "string") return "";
  const cleaned = stripControls(raw).replace(/[^\S\n]{2,}/g, " ").replace(/\r/g, "");
  const out = [];
  for (const rawLine of cleaned.split("\n")) {
    const line = rawLine.trim().slice(0, maxLineLen);
    if (line.length === 0) continue;
    if (out.length >= maxLines) break;
    out.push(line);
  }
  return out.join("\n").slice(0, maxTotal);
}
__name(sanitizeSignText, "sanitizeSignText");
var NAME_ALLOWED_RE = /^[\p{L}\p{N} ._-]+$/u;
var PLAYERID_RE = /^[A-Za-z0-9_-]{8,64}$/;
function validateNickname(raw) {
  if (typeof raw !== "string") return invalid("name must be a string");
  const s = stripControls(raw).replace(/\s+/g, " ").trim();
  if (s.length < NICKNAME_MIN || s.length > NICKNAME_MAX) {
    return invalid(`name must be ${NICKNAME_MIN}-${NICKNAME_MAX} characters`);
  }
  if (!NAME_ALLOWED_RE.test(s)) return invalid("name contains unsupported characters");
  return valid(s);
}
__name(validateNickname, "validateNickname");
function validatePlayerId(raw) {
  if (typeof raw !== "string") return invalid("playerId must be a string");
  const s = raw.trim();
  if (!PLAYERID_RE.test(s)) return invalid("playerId malformed");
  return valid(s);
}
__name(validatePlayerId, "validatePlayerId");
function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}
__name(isFiniteNum, "isFiniteNum");
function isIntIn(v, min, max) {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}
__name(isIntIn, "isIntIn");
function isValidWorldCoord(x, y, z) {
  return isIntIn(x, -MAX_WORLD_COORD, MAX_WORLD_COORD) && isIntIn(y, 0, WORLD_HEIGHT - 1) && isIntIn(z, -MAX_WORLD_COORD, MAX_WORLD_COORD);
}
__name(isValidWorldCoord, "isValidWorldCoord");
function isValidEditId(v) {
  return typeof v === "string" && v.length >= 8 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v);
}
__name(isValidEditId, "isValidEditId");
function isPlaceableBlockId(v) {
  return typeof v === "number" && Number.isInteger(v) && v !== BlockId.Air && v !== BlockId.Bedrock && Object.values(BlockId).includes(v);
}
__name(isPlaceableBlockId, "isPlaceableBlockId");
function asRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v : null;
}
__name(asRecord, "asRecord");
function parseWireFrame(text) {
  try {
    return valid(JSON.parse(text));
  } catch {
    return invalid("bad json");
  }
}
__name(parseWireFrame, "parseWireFrame");
function validateClientMessage(v) {
  const o = asRecord(v);
  if (!o) return invalid("message must be an object");
  const t = o["t"];
  switch (t) {
    case "hello": {
      if (o["proto"] !== PROTOCOL_VERSION) return invalid("protocol version mismatch");
      const name = validateNickname(o["name"]);
      if (!name.ok) return invalid(name.error);
      const pid = validatePlayerId(o["playerId"]);
      if (!pid.ok) return invalid(pid.error);
      return valid({ t: "hello", proto: PROTOCOL_VERSION, name: name.value, playerId: pid.value });
    }
    case "pos": {
      const { x, y, z, yaw, pitch } = o;
      if (!isFiniteNum(x) || !isFiniteNum(y) || !isFiniteNum(z)) return invalid("pos requires finite xyz");
      if (!isFiniteNum(yaw) || !isFiniteNum(pitch)) return invalid("pos requires finite angles");
      if (Math.abs(x) > MAX_WORLD_COORD + 64 || Math.abs(z) > MAX_WORLD_COORD + 64 || y < -64 || y > WORLD_HEIGHT + 256) {
        return invalid("pos out of bounds");
      }
      return valid({ t: "pos", x, y, z, yaw, pitch });
    }
    case "edit": {
      const eid = o["eid"];
      if (!isValidEditId(eid)) return invalid("eid malformed");
      const action = o["action"];
      if (action !== "place" && action !== "break") return invalid("action invalid");
      const x = o["x"];
      const y = o["y"];
      const z = o["z"];
      if (!isIntIn(x, -MAX_WORLD_COORD, MAX_WORLD_COORD) || !isIntIn(y, 0, WORLD_HEIGHT - 1) || !isIntIn(z, -MAX_WORLD_COORD, MAX_WORLD_COORD)) {
        return invalid("coordinates out of range");
      }
      if (action === "place") {
        const b = o["block"];
        if (!isPlaceableBlockId(b)) return invalid("block not placeable");
        return valid({ t: "edit", eid, action, x, y, z, block: b });
      }
      return valid({ t: "edit", eid, action, x, y, z });
    }
    case "sign": {
      const eid = o["eid"];
      if (!isValidEditId(eid)) return invalid("eid malformed");
      const op = o["op"];
      if (op !== "create" && op !== "update" && op !== "remove") return invalid("op invalid");
      const x = o["x"];
      const y = o["y"];
      const z = o["z"];
      if (!isIntIn(x, -MAX_WORLD_COORD, MAX_WORLD_COORD) || !isIntIn(y, 0, WORLD_HEIGHT - 1) || !isIntIn(z, -MAX_WORLD_COORD, MAX_WORLD_COORD)) {
        return invalid("coordinates out of range");
      }
      if (op === "remove") return valid({ t: "sign", eid, op, x, y, z });
      const text = sanitizeSignText(o["text"]);
      let rot;
      if (o["rot"] !== void 0) {
        if (!isIntIn(o["rot"], 0, 3)) return invalid("rot out of range");
        rot = o["rot"];
      }
      return valid({ t: "sign", eid, op, x, y, z, text, rot });
    }
    case "chat": {
      const text = sanitizeChatText(o["text"]);
      if (text.length === 0) return invalid("empty chat message");
      return valid({ t: "chat", text });
    }
    case "ping": {
      if (!isFiniteNum(o["ts"])) return invalid("ts required");
      return valid({ t: "ping", ts: o["ts"] });
    }
    default:
      return invalid("unknown message type");
  }
}
__name(validateClientMessage, "validateClientMessage");
function decodeClientFrame(text) {
  const parsed = parseWireFrame(text);
  if (!parsed.ok) return parsed;
  return validateClientMessage(parsed.value);
}
__name(decodeClientFrame, "decodeClientFrame");

// src/adapters.ts
function durableObjectSql(storage) {
  return {
    run(query, ...params) {
      const cursor = storage.sql.exec(query, ...params);
      return { changes: Number(cursor.rowsWritten) };
    },
    all(query, ...params) {
      return storage.sql.exec(query, ...params).toArray();
    },
    transaction(fn) {
      return storage.transaction(fn);
    }
  };
}
__name(durableObjectSql, "durableObjectSql");

// src/ratelimit.ts
var TokenBucket = class {
  constructor(capacity, refillPerSecond, nowMs) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.nowMs = nowMs;
    this.tokens = capacity;
    this.lastRefill = nowMs();
  }
  capacity;
  refillPerSecond;
  nowMs;
  static {
    __name(this, "TokenBucket");
  }
  tokens;
  lastRefill;
  refill() {
    const now = this.nowMs();
    const elapsed = Math.max(0, now - this.lastRefill);
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed / 1e3 * this.refillPerSecond);
    this.lastRefill = now;
  }
  tryTake() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
};

// src/store.ts
var WorldLockedError = class extends Error {
  constructor(message, persistedVersion) {
    super(message);
    this.persistedVersion = persistedVersion;
  }
  persistedVersion;
  static {
    __name(this, "WorldLockedError");
  }
};
var SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  z INTEGER NOT NULL,
  cx INTEGER NOT NULL,
  cz INTEGER NOT NULL,
  block INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY (x, y, z)
);
CREATE INDEX IF NOT EXISTS idx_blocks_chunk ON blocks (cx, cz);
CREATE TABLE IF NOT EXISTS signs (
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  z INTEGER NOT NULL,
  cx INTEGER NOT NULL,
  cz INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  rot INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (x, y, z)
);
CREATE INDEX IF NOT EXISTS idx_signs_chunk ON signs (cx, cz);
CREATE TABLE IF NOT EXISTS edits (
  eid TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  online INTEGER NOT NULL DEFAULT 0,
  last_x REAL,
  last_y REAL,
  last_z REAL,
  banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT NOT NULL DEFAULT ''
);
`;
var WorldStore = class {
  constructor(sql, now = () => Date.now()) {
    this.sql = sql;
    this.now = now;
  }
  sql;
  now;
  static {
    __name(this, "WorldStore");
  }
  metaCache = null;
  async init(seedStringOverride) {
    for (const stmt of SCHEMA.split(";")) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) this.sql.run(trimmed);
    }
    const rows = this.sql.all(
      `SELECT key, value FROM meta WHERE key IN ('seed','seedString','terrainVersion','createdAt')`
    );
    const map = new Map(rows.map((r) => [r.key, r.value]));
    let meta = this.metaFromRows(map);
    if (!meta) {
      const seedString = seedStringOverride && seedStringOverride.trim().length > 0 ? seedStringOverride : DEFAULT_SEED_STRING;
      const fresh = {
        seed: hashSeedString(seedString),
        seedString,
        terrainVersion: TERRAIN_VERSION,
        createdAt: this.now()
      };
      await this.sql.transaction(() => {
        this.sql.run(`INSERT INTO meta(key,value) VALUES('seed',?)`, String(fresh.seed));
        this.sql.run(`INSERT INTO meta(key,value) VALUES('seedString',?)`, fresh.seedString);
        this.sql.run(`INSERT INTO meta(key,value) VALUES('terrainVersion',?)`, String(fresh.terrainVersion));
        this.sql.run(`INSERT INTO meta(key,value) VALUES('createdAt',?)`, String(fresh.createdAt));
      });
      this.audit("system", "world-init", JSON.stringify({ seed: fresh.seed, terrainVersion: fresh.terrainVersion }));
      meta = fresh;
    } else if (meta.terrainVersion !== TERRAIN_VERSION) {
      throw new WorldLockedError(
        `world was created with terrain version ${meta.terrainVersion}, server runs ${TERRAIN_VERSION}`,
        meta.terrainVersion
      );
    }
    this.metaCache = meta;
    return meta;
  }
  get meta() {
    if (!this.metaCache) throw new Error("world not initialized");
    return this.metaCache;
  }
  metaFromRows(map) {
    const seed = map.get("seed");
    const ver = map.get("terrainVersion");
    if (seed === void 0 || ver === void 0) return null;
    return {
      seed: Number(seed),
      seedString: map.get("seedString") ?? "",
      terrainVersion: Number(ver),
      createdAt: Number(map.get("createdAt") ?? 0)
    };
  }
  // ---------------------------------------------------------------------------
  // Blocks
  // ---------------------------------------------------------------------------
  getBlock(x, y, z) {
    const rows = this.sql.all(`SELECT block FROM blocks WHERE x=? AND y=? AND z=?`, x, y, z);
    return rows.length > 0 ? rows[0].block : null;
  }
  /**
   * Persist a block mutation atomically with its idempotency marker.
   * Retrying an already-applied edit id is a no-op that reports duplicate.
   * When the previous cell held a sign and `cascadeSignRemove` is set, the
   * sign row is deleted in the same transaction.
   */
  async applyBlock(args) {
    const at = this.now();
    let duplicate = false;
    let signRemoved = false;
    await this.sql.transaction(() => {
      const ins = this.sql.run(
        `INSERT INTO edits(eid,kind,at) VALUES(?,'block',?) ON CONFLICT(eid) DO NOTHING`,
        args.eid,
        at
      );
      if (ins.changes === 0) {
        duplicate = true;
        return;
      }
      const prev = this.getBlock(args.x, args.y, args.z);
      const hadSignBlock = prev === 13;
      this.sql.run(
        `INSERT INTO blocks(x,y,z,cx,cz,block,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)
         ON CONFLICT(x,y,z) DO UPDATE SET block=excluded.block, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
        args.x,
        args.y,
        args.z,
        chunkCoord(args.x),
        chunkCoord(args.z),
        args.block,
        at,
        args.actorId
      );
      if (hadSignBlock && args.cascadeSignRemove) {
        this.sql.run(`DELETE FROM signs WHERE x=? AND y=? AND z=?`, args.x, args.y, args.z);
        signRemoved = true;
        this.appendAuditUnsafe(args.actorId, args.actorName, "sign:remove", {
          eid: `${args.eid}:cascade`,
          x: args.x,
          y: args.y,
          z: args.z,
          chars: 0
        });
      }
      this.appendAuditUnsafe(args.actorId, args.actorName, "block", {
        eid: args.eid,
        x: args.x,
        y: args.y,
        z: args.z,
        block: args.block
      });
    });
    return { duplicate, signRemoved };
  }
  /** Whether this edit id has already been applied (idempotency check). */
  hasEdit(eid) {
    return this.sql.all(`SELECT eid FROM edits WHERE eid=?`, eid).length > 0;
  }
  /** Override rows for one chunk as [flatIndex, blockId] pairs. */
  chunkOverrides(cx, cz) {
    const rows = this.sql.all(
      `SELECT x,y,z,block FROM blocks WHERE cx=? AND cz=?`,
      cx,
      cz
    );
    return rows.map((r) => [blockIndex((r.x % 16 + 16) % 16, r.y, (r.z % 16 + 16) % 16), r.block]);
  }
  allBlocks() {
    return this.sql.all(
      `SELECT x,y,z,block,updated_at FROM blocks ORDER BY updated_at ASC`
    ).map((r) => ({ x: r.x, y: r.y, z: r.z, block: r.block, updatedAt: r.updated_at }));
  }
  auditCount() {
    const rows = this.sql.all(`SELECT COUNT(*) AS n FROM audit`);
    return Number(rows[0]?.n ?? 0);
  }
  pruneAudit(maxRows = AUDIT_MAX_ROWS) {
    this.sql.run(
      `DELETE FROM audit WHERE seq <= ((SELECT COALESCE(MAX(seq),0) FROM audit) - ?)`,
      maxRows
    );
  }
  // ---------------------------------------------------------------------------
  // Signs
  // ---------------------------------------------------------------------------
  getSign(x, y, z) {
    const rows = this.sql.all(
      `SELECT x,y,z,text,author_id,author_name,rot,created_at,updated_at FROM signs WHERE x=? AND y=? AND z=?`,
      x,
      y,
      z
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      x: r.x,
      y: r.y,
      z: r.z,
      text: r.text,
      authorId: r.author_id,
      authorName: r.author_name,
      updatedAt: r.updated_at,
      rot: r.rot
    };
  }
  async applySign(args) {
    const at = this.now();
    let duplicate = false;
    await this.sql.transaction(() => {
      const kind = `sign:${args.op}`;
      const ins = this.sql.run(`INSERT INTO edits(eid,kind,at) VALUES(?,?,?) ON CONFLICT(eid) DO NOTHING`, args.eid, kind, at);
      if (ins.changes === 0) {
        duplicate = true;
        return;
      }
      if (args.op === "remove") {
        this.sql.run(`DELETE FROM signs WHERE x=? AND y=? AND z=?`, args.x, args.y, args.z);
      } else {
        const existingRot = this.sql.all(
          `SELECT rot FROM signs WHERE x=? AND y=? AND z=?`,
          args.x,
          args.y,
          args.z
        );
        const rot = existingRot.length > 0 ? existingRot[0].rot : Math.max(0, Math.min(3, args.rot ?? 0));
        this.sql.run(
          `INSERT INTO signs(x,y,z,cx,cz,text,author_id,author_name,rot,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(x,y,z) DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at`,
          args.x,
          args.y,
          args.z,
          chunkCoord(args.x),
          chunkCoord(args.z),
          args.text,
          args.actorId,
          args.actorName,
          rot,
          at,
          at
        );
      }
      this.appendAuditUnsafe(args.actorId, args.actorName, kind, {
        eid: args.eid,
        x: args.x,
        y: args.y,
        z: args.z,
        chars: args.text.length
      });
    });
    return { duplicate };
  }
  chunkSigns(cx, cz) {
    const rows = this.sql.all(`SELECT x,y,z,text,author_id,author_name,rot,updated_at FROM signs WHERE cx=? AND cz=?`, cx, cz);
    return rows.map((r) => ({
      x: r.x,
      y: r.y,
      z: r.z,
      text: r.text,
      authorId: r.author_id,
      authorName: r.author_name,
      updatedAt: r.updated_at,
      rot: r.rot
    }));
  }
  allSigns() {
    return this.sql.all(`SELECT x,y,z,text,author_id,author_name,rot,updated_at FROM signs ORDER BY updated_at ASC`).map((r) => ({
      x: r.x,
      y: r.y,
      z: r.z,
      text: r.text,
      authorId: r.author_id,
      authorName: r.author_name,
      updatedAt: r.updated_at,
      rot: r.rot
    }));
  }
  // ---------------------------------------------------------------------------
  // Players / presence / moderation
  // ---------------------------------------------------------------------------
  getPlayer(id) {
    const rows = this.sql.all(`SELECT id,name,banned,ban_reason,last_x FROM players WHERE id=?`, id);
    if (rows.length === 0) return null;
    const r = rows[0];
    return { id: r.id, name: r.name, banned: r.banned === 1, banReason: r.ban_reason, lastX: r.last_x };
  }
  recordJoin(id, name) {
    const at = this.now();
    this.sql.run(
      `INSERT INTO players(id,name,first_seen,last_seen,online) VALUES(?,?,?,?,1)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, last_seen=excluded.last_seen, online=1`,
      id,
      name,
      at,
      at
    );
  }
  markOnline(id, online) {
    this.sql.run(`UPDATE players SET online=?, last_seen=? WHERE id=?`, online, this.now(), id);
  }
  persistPosition(id, x, y, z) {
    this.sql.run(
      `UPDATE players SET last_x=?, last_y=?, last_z=?, last_seen=? WHERE id=?`,
      x,
      y,
      z,
      this.now(),
      id
    );
  }
  lastKnownPosition(id) {
    const rows = this.sql.all(
      `SELECT last_x,last_y,last_z FROM players WHERE id=?`,
      id
    );
    const r = rows[0];
    if (!r || r.last_x === null || r.last_y === null || r.last_z === null) return null;
    return { x: r.last_x, y: r.last_y, z: r.last_z };
  }
  rosterOnline(staleMs) {
    const cutoff = this.now() - staleMs;
    return this.sql.all(
      `SELECT id,name FROM players WHERE online=1 AND last_seen > ?`,
      cutoff
    ).map((r) => ({ id: r.id, name: r.name }));
  }
  setBan(id, reason, byAdmin) {
    const res = this.sql.run(`UPDATE players SET banned=1, ban_reason=? WHERE id=?`, `${reason} (by ${byAdmin})`, id);
    this.audit("admin", "ban", JSON.stringify({ playerId: id, reason }));
    return res.changes > 0;
  }
  clearBan(id, byAdmin) {
    const res = this.sql.run(`UPDATE players SET banned=0, ban_reason='' WHERE id=?`, id);
    this.audit("admin", "unban", JSON.stringify({ playerId: id, admin: byAdmin }));
    return res.changes > 0;
  }
  listBans() {
    return this.sql.all(`SELECT id,ban_reason FROM players WHERE banned=1`).map((r) => ({ id: r.id, reason: r.ban_reason }));
  }
  // ---------------------------------------------------------------------------
  // Audit + export/import
  // ---------------------------------------------------------------------------
  audit(actorId, kind, payloadJson) {
    this.appendAuditUnsafe(actorId, "", kind, JSON.parse(payloadJson));
    if (this.auditCount() > AUDIT_MAX_ROWS * 1.05) this.pruneAudit();
  }
  appendAuditUnsafe(actorId, actorName, kind, payload) {
    this.sql.run(
      `INSERT INTO audit(at,actor_id,actor_name,kind,payload) VALUES(?,?,?,?,?)`,
      this.now(),
      actorId,
      actorName,
      kind,
      JSON.stringify(payload)
    );
  }
  exportAll() {
    return {
      format: "eternal-blocks/world-export@1",
      exportedAt: this.now(),
      meta: this.meta,
      blocks: this.allBlocks(),
      signs: this.allSigns(),
      bans: this.listBans(),
      auditTail: this.sql.all(
        `SELECT at,actor_id,kind,payload FROM audit ORDER BY seq DESC LIMIT 1000`
      ).map((r) => ({ at: r.at, actorId: r.actor_id, kind: r.kind, payload: r.payload }))
    };
  }
  /**
   * Merge-only restore path. Never overwrites the persisted seed; incoming
   * rows win only when newer than stored rows.
   */
  async importMerge(data) {
    if (data.meta && typeof data.meta.seed === "number" && data.meta.seed !== this.meta.seed) {
      throw new WorldLockedError("import rejected: seed mismatch (refusing to replace the world)", this.meta.terrainVersion);
    }
    if (data.meta?.terrainVersion !== void 0 && data.meta.terrainVersion !== TERRAIN_VERSION) {
      throw new WorldLockedError("import rejected: terrain version mismatch", this.meta.terrainVersion);
    }
    let blocksMerged = 0;
    let signsMerged = 0;
    await this.sql.transaction(() => {
      for (const b of data.blocks ?? []) {
        if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || !Number.isInteger(b.z)) continue;
        if (b.y < 0 || b.y >= WORLD_HEIGHT || !Number.isInteger(b.block)) continue;
        this.sql.run(
          `INSERT INTO blocks(x,y,z,cx,cz,block,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,'import')
           ON CONFLICT(x,y,z) DO UPDATE SET
             block=CASE WHEN excluded.updated_at > blocks.updated_at THEN excluded.block ELSE blocks.block END,
             updated_at=CASE WHEN excluded.updated_at > blocks.updated_at THEN excluded.updated_at ELSE blocks.updated_at END`,
          b.x,
          b.y,
          b.z,
          chunkCoord(b.x),
          chunkCoord(b.z),
          b.block,
          b.updatedAt ?? this.now()
        );
        blocksMerged++;
      }
      for (const s of data.signs ?? []) {
        if (!Number.isInteger(s.x) || !Number.isInteger(s.y) || !Number.isInteger(s.z)) continue;
        if (s.y < 0 || s.y >= WORLD_HEIGHT) continue;
        this.sql.run(
          `INSERT INTO signs(x,y,z,cx,cz,text,author_id,author_name,rot,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(x,y,z) DO UPDATE SET
             text=CASE WHEN excluded.updated_at > signs.updated_at THEN excluded.text ELSE signs.text END,
             updated_at=CASE WHEN excluded.updated_at > signs.updated_at THEN excluded.updated_at ELSE signs.updated_at END`,
          s.x,
          s.y,
          s.z,
          chunkCoord(s.x),
          chunkCoord(s.z),
          String(s.text ?? ""),
          String(s.authorId ?? ""),
          String(s.authorName ?? ""),
          Math.max(0, Math.min(3, s.rot ?? 0)),
          s.updatedAt ?? this.now(),
          s.updatedAt ?? this.now()
        );
        signsMerged++;
      }
      this.audit("system", "import", JSON.stringify({ note: data.auditNote ?? "", blocksMerged, signsMerged }));
    });
    return { blocksMerged, signsMerged };
  }
};
function hashSeedString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
__name(hashSeedString, "hashSeedString");

// src/coordinator.ts
var DEFAULT_SUBSCRIBE_RADIUS = 4;
var WorldCoordinator = class {
  constructor(store, now = Date.now, opts = {}) {
    this.now = now;
    this.store = store;
    this.subscribeRadius = Math.max(1, opts.subscribeRadius ?? DEFAULT_SUBSCRIBE_RADIUS);
    this.staleMs = opts.staleMs ?? PLAYER_STALE_MS;
  }
  now;
  static {
    __name(this, "WorldCoordinator");
  }
  store;
  generator = null;
  worldLocked = null;
  handlersByPlayer = /* @__PURE__ */ new Map();
  chunkSubs = /* @__PURE__ */ new Map();
  terrainCache = /* @__PURE__ */ new Map();
  subscribeRadius;
  staleMs;
  sweepCounter = 0;
  async init(seedStringOverride) {
    let meta;
    try {
      meta = await this.store.init(seedStringOverride);
    } catch (err) {
      if (err instanceof WorldLockedError) {
        this.worldLocked = err;
        return;
      }
      throw err;
    }
    this.generator = new TerrainGenerator(meta.seed, meta.terrainVersion);
  }
  get seed() {
    return this.store.meta.seed;
  }
  /** Effective block at a coordinate: persisted override or generated terrain. */
  getEffectiveBlock(x, y, z) {
    const override = this.store.getBlock(x, y, z);
    if (override !== null) return override;
    if (!this.generator) throw new Error("world not initialized");
    const ck = chunkKey(chunkCoord(x), chunkCoord(z));
    let data = this.terrainCache.get(ck);
    if (!data) {
      data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 80);
      this.generator.fillChunk(data, chunkCoord(x), chunkCoord(z));
      this.terrainCache.set(ck, data);
      if (this.terrainCache.size > 128) {
        const first = this.terrainCache.keys().next().value;
        if (first !== void 0) this.terrainCache.delete(first);
      }
    }
    const lx = (x % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = (z % CHUNK_SIZE + CHUNK_SIZE) % CHUNK_SIZE;
    return data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  }
  spawnPoint() {
    return this.generator ? this.generator.findSpawn() : { x: 0.5, y: 40, z: 0.5 };
  }
  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------
  createHandler(socket) {
    return new ConnectionHandler(this, socket);
  }
  register(playerId, handler) {
    const existing = this.handlersByPlayer.get(playerId);
    if (existing && existing !== handler) {
      existing.kick(CLOSE_CODES.idle, "replaced by a newer session");
    }
    this.handlersByPlayer.set(playerId, handler);
  }
  unregister(playerId, handler) {
    if (this.handlersByPlayer.get(playerId) !== handler) return;
    this.handlersByPlayer.delete(playerId);
    for (const [ck, set] of this.chunkSubs) {
      set.delete(playerId);
      if (set.size === 0) this.chunkSubs.delete(ck);
    }
    try {
      this.store.markOnline(playerId, 0);
    } catch {
    }
    this.broadcast({ t: "pleave", id: playerId });
  }
  onlineCount() {
    return this.handlersByPlayer.size;
  }
  roster() {
    return this.store.rosterOnline(this.staleMs);
  }
  // ---------------------------------------------------------------------------
  // Subscriptions & fan-out
  // ---------------------------------------------------------------------------
  subscribe(handler, cx, cz) {
    const pid = handler.playerId;
    const ck = chunkKey(cx, cz);
    const conn = handler.conn;
    if (conn.subscribedChunks.has(ck)) return false;
    conn.subscribedChunks.add(ck);
    let set = this.chunkSubs.get(ck);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.chunkSubs.set(ck, set);
    }
    set.add(pid);
    return true;
  }
  sendChunkSnapshot(handler, cx, cz) {
    if (!this.generator) return;
    const overrides = this.store.chunkOverrides(cx, cz);
    const signs = this.store.chunkSigns(cx, cz);
    handler.send({
      t: "chunk",
      cx,
      cz,
      overrides,
      signs
    });
  }
  broadcast(msg, exceptPlayerId) {
    for (const [pid, h] of this.handlersByPlayer) {
      if (pid === exceptPlayerId) continue;
      h.send(msg);
    }
  }
  broadcastToChunkSubscribers(chunkKeyStr, msg) {
    const set = this.chunkSubs.get(chunkKeyStr);
    if (!set) return;
    for (const pid of set) {
      const h = this.handlersByPlayer.get(pid);
      if (h) h.send(msg);
    }
  }
  /**
   * Periodic maintenance: drop presence for players whose sockets vanished
   * (hibernation wakeups, crashes) without a clean close.
   */
  sweep(livePlayerIds) {
    this.sweepCounter++;
    const rows = this.store.rosterOnline(this.staleMs * 10);
    for (const p of rows) {
      if (!livePlayerIds.has(p.id)) {
        this.store.markOnline(p.id, 0);
        if (this.handlersByPlayer.has(p.id)) continue;
        this.broadcast({ t: "pleave", id: p.id });
      }
    }
    if (this.sweepCounter % 20 === 0) this.store.pruneAudit();
  }
};
var ConnectionHandler = class {
  constructor(coord, socket) {
    this.coord = coord;
    this.socket = socket;
  }
  coord;
  socket;
  static {
    __name(this, "ConnectionHandler");
  }
  playerId = null;
  conn = null;
  closed = false;
  send(msg) {
    if (this.closed) return;
    try {
      this.socket.send(JSON.stringify(msg));
    } catch {
    }
  }
  kick(code, reason) {
    if (this.closed) return;
    this.closed = true;
    try {
      this.socket.close(code, reason.slice(0, 120));
    } catch {
    }
    if (this.playerId) this.coord.unregister(this.playerId, this);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.playerId) this.coord.unregister(this.playerId, this);
  }
  sendError(code, msg, ref) {
    this.send(ref === void 0 ? { t: "error", code, msg } : { t: "error", code, msg, ref });
  }
  makeBuckets() {
    const now = this.coord.now;
    return {
      msgs: new TokenBucket(RATE_LIMITS.messagesPerSecond, RATE_LIMITS.messagesPerSecond / 2, now),
      pos: new TokenBucket(RATE_LIMITS.posPerSecond * 2, RATE_LIMITS.posPerSecond, now),
      edits: new TokenBucket(RATE_LIMITS.editsPerSecond * 2, RATE_LIMITS.editsPerSecond, now),
      chat: new TokenBucket(RATE_LIMITS.chatPerSecond * 2, RATE_LIMITS.chatPerSecond, now),
      signs: new TokenBucket(RATE_LIMITS.signsPerSecond * 2, RATE_LIMITS.signsPerSecond, now),
      chunks: new TokenBucket(60, 30, now)
    };
  }
  strike(n) {
    if (!this.conn) return;
    this.conn.strikes += 1;
    if (this.conn.strikes >= n) this.kick(CLOSE_CODES.rateLimited, "too many violations");
  }
  /** Number of accumulated violations (used by tests). */
  get strikes() {
    return this.conn?.strikes ?? 0;
  }
  /** Entry point from the DO: raw frame in, side effects + replies out. */
  async handleRawFrame(raw, byteLength) {
    if (this.closed) return;
    const size = byteLength ?? (typeof raw === "string" ? raw.length : raw.byteLength);
    if (size > MAX_FRAME_BYTES) {
      this.kick(CLOSE_CODES.oversizedFrame, "frame too large");
      return;
    }
    if (typeof raw !== "string") {
      this.sendError("bad_message", "binary frames are not accepted");
      this.strike(3);
      return;
    }
    const parsed = decodeClientFrame(raw);
    if (!parsed.ok) {
      const isJsonBroken = /^bad json/.test(parsed.error);
      this.sendError(isJsonBroken ? "bad_json" : "bad_message", parsed.error);
      this.strike(isJsonBroken ? 5 : 5);
      return;
    }
    if (this.conn && !this.conn.buckets.msgs.tryTake()) {
      this.sendError("rate_limited", "slow down");
      this.strike(12);
      return;
    }
    await this.handleMessage(parsed.value);
  }
  async handleMessage(msg) {
    switch (msg.t) {
      case "hello":
        await this.handleHello(msg);
        return;
      case "pos":
        this.handlePos(msg);
        return;
      case "edit":
        await this.handleEdit(msg);
        return;
      case "sign":
        await this.handleSign(msg);
        return;
      case "chat":
        this.handleChat(msg);
        return;
      case "ping":
        this.send({ t: "pong", ts: msg.ts });
        return;
    }
  }
  requireJoined() {
    if (!this.conn || !this.playerId) {
      this.sendError("not_joined", "send hello first");
      return false;
    }
    return true;
  }
  async handleHello(msg) {
    if (this.coord.worldLocked) {
      this.sendError("world_locked", "the world was created with a different terrain generator version");
      this.closed = true;
      try {
        this.socket.close(CLOSE_CODES.protocolMismatch, "world locked");
      } catch {
      }
      return;
    }
    const banned = this.coord.store.getPlayer(msg.playerId);
    if (banned?.banned) {
      this.sendError("banned", `you are banned: ${banned.banReason}`);
      this.kick(CLOSE_CODES.banned, "banned");
      return;
    }
    this.playerId = msg.playerId;
    this.conn = {
      playerId: msg.playerId,
      name: msg.name,
      lastPos: (() => {
        const lp = this.coord.store.lastKnownPosition(msg.playerId);
        return lp ? { ...lp, yaw: 0, pitch: 0 } : null;
      })(),
      lastPersistAt: 0,
      buckets: this.makeBuckets(),
      strikes: 0,
      subscribedChunks: /* @__PURE__ */ new Set()
    };
    this.coord.register(msg.playerId, this);
    this.coord.store.recordJoin(msg.playerId, msg.name);
    const others = this.coord.roster().filter((p) => p.id !== msg.playerId);
    this.send({
      t: "welcome",
      proto: 1,
      playerId: msg.playerId,
      seed: this.coord.seed,
      terrainVersion: this.coord.store.meta.terrainVersion,
      spawn: this.coord.spawnPoint(),
      players: others,
      serverTime: Date.now()
    });
    const start = this.conn.lastPos ?? this.coord.spawnPoint();
    this.syncArea(Math.floor(start.x) >> 4, Math.floor(start.z) >> 4);
    this.coord.broadcast({ t: "pjoin", id: msg.playerId, name: msg.name }, msg.playerId);
  }
  /** Subscribe to the radius around a chunk center and push snapshots. */
  syncArea(cx, cz) {
    if (!this.conn) return;
    const r = this.coord.subscribeRadius;
    const fresh = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const ccx = cx + dx;
        const ccz = cz + dz;
        if (this.coord.subscribe(this, ccx, ccz)) fresh.push([ccx, ccz]);
      }
    }
    if (fresh.length > 0) {
      this.send({ t: "syncStart", chunks: fresh });
      for (const [ax, az] of fresh) this.coord.sendChunkSnapshot(this, ax, az);
      this.send({ t: "syncDone" });
    }
  }
  handlePos(msg) {
    if (!this.requireJoined()) return;
    const conn = this.conn;
    if (!conn.buckets.pos.tryTake()) return;
    conn.lastPos = { x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, pitch: msg.pitch };
    const now = this.coord.now();
    if (now - conn.lastPersistAt > 2e4) {
      conn.lastPersistAt = now;
      try {
        this.coord.store.persistPosition(conn.playerId, msg.x, msg.y, msg.z);
      } catch {
      }
    }
    const pcx = Math.floor(msg.x) >> 4;
    const pcz = Math.floor(msg.z) >> 4;
    const r = this.coord.subscribeRadius;
    const wanted = /* @__PURE__ */ new Set();
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) wanted.add(chunkKey(pcx + dx, pcz + dz));
    }
    let driftedFar = false;
    for (const ck of conn.subscribedChunks) {
      if (!wanted.has(ck)) {
        driftedFar = true;
        break;
      }
    }
    if (driftedFar) {
      for (const ck of conn.subscribedChunks) {
        if (!wanted.has(ck)) {
          const set = this.coord.chunkSubs.get(ck);
          if (set) {
            set.delete(conn.playerId);
            if (set.size === 0) this.coord.chunkSubs.delete(ck);
          }
          conn.subscribedChunks.delete(ck);
        }
      }
      this.syncArea(pcx, pcz);
    }
    this.coord.broadcast(
      {
        t: "ps",
        id: conn.playerId,
        x: msg.x,
        y: msg.y,
        z: msg.z,
        yaw: msg.yaw,
        pitch: msg.pitch
      },
      conn.playerId
    );
  }
  validateReach(x, y, z) {
    const pos = this.conn.lastPos;
    if (!pos) {
      this.sendError("unreachable", "position unknown; move before editing");
      return false;
    }
    const limit = (PLAYER_REACH + SERVER_REACH_MARGIN) ** 2;
    if (distanceSqToBlockCenter(pos.x, pos.y + 1.62, pos.z, x, y, z) > limit) {
      this.sendError("unreachable", "target out of reach");
      return false;
    }
    return true;
  }
  async handleEdit(msg) {
    if (!this.requireJoined()) return;
    const conn = this.conn;
    if (!conn.buckets.edits.tryTake()) {
      this.sendError("rate_limited", "too many edits", msg.eid);
      this.strike(6);
      return;
    }
    if (!isValidWorldCoord(msg.x, msg.y, msg.z)) {
      this.sendError("out_of_range", "coordinates out of range", msg.eid);
      return;
    }
    if (this.coord.store.hasEdit(msg.eid)) {
      const stored = this.coord.store.getBlock(msg.x, msg.y, msg.z) ?? BlockId.Air;
      this.send({
        t: "blockApplied",
        eid: msg.eid,
        action: msg.action,
        x: msg.x,
        y: msg.y,
        z: msg.z,
        block: stored,
        by: { id: conn.playerId, name: conn.name }
      });
      return;
    }
    if (!this.validateReach(msg.x, msg.y, msg.z)) return;
    const current = this.coord.getEffectiveBlock(msg.x, msg.y, msg.z);
    let newBlock;
    if (msg.action === "break") {
      if (current === BlockId.Air || current === BlockId.Water || current === null) {
        this.sendError("nothing_to_edit", "nothing to break here", msg.eid);
        return;
      }
      if (current === BlockId.Bedrock) {
        this.sendError("unbreakable", "bedrock cannot be broken", msg.eid);
        return;
      }
      newBlock = BlockId.Air;
    } else {
      if (current !== BlockId.Air && current !== BlockId.Water) {
        this.sendError("nothing_to_edit", "cell is occupied", msg.eid);
        return;
      }
      newBlock = msg.block;
    }
    const result = await this.coord.store.applyBlock({
      eid: msg.eid,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      block: newBlock,
      actorId: conn.playerId,
      actorName: conn.name,
      cascadeSignRemove: msg.action === "break" && current === BlockId.Sign
    });
    if (result.duplicate) {
      const stored = this.coord.store.getBlock(msg.x, msg.y, msg.z);
      this.send({
        t: "blockApplied",
        eid: msg.eid,
        action: msg.action,
        x: msg.x,
        y: msg.y,
        z: msg.z,
        block: stored ?? newBlock,
        by: { id: conn.playerId, name: conn.name }
      });
      return;
    }
    const applied = {
      t: "blockApplied",
      eid: msg.eid,
      action: msg.action,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      block: newBlock,
      by: { id: conn.playerId, name: conn.name }
    };
    this.coord.broadcastToChunkSubscribers(chunkKey(chunkCoord(msg.x), chunkCoord(msg.z)), applied);
    if (result.signRemoved) {
      const signMsg = {
        t: "signApplied",
        eid: `${msg.eid}:cascade`,
        op: "remove",
        sign: { x: msg.x, y: msg.y, z: msg.z, text: "", authorId: "", authorName: "", updatedAt: 0 }
      };
      this.coord.broadcastToChunkSubscribers(chunkKey(chunkCoord(msg.x), chunkCoord(msg.z)), signMsg);
    }
  }
  async handleSign(msg) {
    if (!this.requireJoined()) return;
    const conn = this.conn;
    if (!conn.buckets.signs.tryTake()) {
      this.sendError("rate_limited", "too many sign operations", msg.eid);
      this.strike(6);
      return;
    }
    if (!isValidWorldCoord(msg.x, msg.y, msg.z)) {
      this.sendError("out_of_range", "coordinates out of range", msg.eid);
      return;
    }
    if (this.coord.store.hasEdit(msg.eid)) {
      const stored = this.coord.store.getSign(msg.x, msg.y, msg.z);
      this.send({ t: "signApplied", eid: msg.eid, op: msg.op, sign: stored ?? placeholderSign(msg, conn) });
      return;
    }
    if (!this.validateReach(msg.x, msg.y, msg.z)) return;
    const existing = this.coord.store.getSign(msg.x, msg.y, msg.z);
    if (msg.op === "update" || msg.op === "remove") {
      if (!existing) {
        this.sendError("sign_not_found", "no sign at that location", msg.eid);
        return;
      }
      if (existing.authorId !== conn.playerId) {
        this.sendError("sign_forbidden", "only the author can modify a sign", msg.eid);
        return;
      }
    }
    const text = msg.op === "remove" ? "" : msg.text ?? "";
    const result = await this.coord.store.applySign({
      eid: msg.eid,
      op: msg.op,
      x: msg.x,
      y: msg.y,
      z: msg.z,
      text,
      rot: msg.rot,
      actorId: conn.playerId,
      actorName: conn.name
    });
    if (result.duplicate) {
      const stored = this.coord.store.getSign(msg.x, msg.y, msg.z);
      this.send({ t: "signApplied", eid: msg.eid, op: msg.op, sign: stored ?? placeholderSign(msg, conn) });
      return;
    }
    const sign = msg.op === "remove" ? { x: msg.x, y: msg.y, z: msg.z, text: "", authorId: existing?.authorId ?? "", authorName: "", updatedAt: 0 } : this.coord.store.getSign(msg.x, msg.y, msg.z) ?? placeholderSign(msg, conn);
    const out = {
      t: "signApplied",
      eid: msg.eid,
      op: msg.op,
      sign
    };
    this.coord.broadcastToChunkSubscribers(chunkKey(chunkCoord(msg.x), chunkCoord(msg.z)), out);
  }
  handleChat(msg) {
    if (!this.requireJoined()) return;
    const conn = this.conn;
    if (!conn.buckets.chat.tryTake()) {
      this.sendError("rate_limited", "chat slower please");
      this.strike(6);
      return;
    }
    this.coord.broadcast({
      t: "chatMsg",
      from: { id: conn.playerId, name: conn.name },
      text: msg.text,
      ts: Date.now()
    });
  }
};
function placeholderSign(msg, conn) {
  return {
    x: msg.x,
    y: msg.y,
    z: msg.z,
    text: "",
    authorId: conn.playerId,
    authorName: conn.name,
    updatedAt: 0
  };
}
__name(placeholderSign, "placeholderSign");

// src/do.ts
var EternalWorld = class {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  state;
  env;
  static {
    __name(this, "EternalWorld");
  }
  coordinator = null;
  initPromise = null;
  handlers = /* @__PURE__ */ new Map();
  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  ensure() {
    if (this.coordinator) return Promise.resolve(this.coordinator);
    if (!this.initPromise) {
      this.initPromise = this.buildCoordinator();
    }
    return this.initPromise;
  }
  async buildCoordinator() {
    const store = new WorldStore(durableObjectSql(this.state.storage));
    const coord = new WorldCoordinator(store);
    try {
      await coord.init(this.env.SEED_STRING);
    } catch (err) {
      if (err instanceof WorldLockedError) {
        coord.worldLocked = err;
      } else {
        throw err;
      }
    }
    await this.state.storage.setAlarm(Date.now() + 3e4);
    this.coordinator = coord;
    return coord;
  }
  async alarm() {
    const coord = await this.ensure();
    const live = /* @__PURE__ */ new Set();
    for (const ws of this.liveSockets()) {
      const att = readAttachment(ws);
      if (att?.pid) live.add(att.pid);
    }
    coord.sweep(live);
    await this.state.storage.setAlarm(Date.now() + 3e4);
  }
  liveSockets() {
    const s = this.state;
    if (typeof s.getWebSockets === "function") return s.getWebSockets();
    if (typeof s.getWebsockets === "function") return s.getWebsockets();
    return [...this.handlers.keys()];
  }
  // ---------------------------------------------------------------------------
  // HTTP routes served by the DO itself
  // ---------------------------------------------------------------------------
  async fetch(request) {
    const url = new URL(request.url);
    switch (url.pathname) {
      case "/ws":
        return this.upgrade();
      case "/stats": {
        const coord = await this.ensure();
        return jsonResponse({
          ok: true,
          online: coord.onlineCount(),
          seed: coord.worldLocked ? null : coord.seed,
          terrainVersion: coord.worldLocked ? null : coord.store.meta.terrainVersion,
          locked: Boolean(coord.worldLocked)
        });
      }
      case "/export": {
        await this.ensure();
        return this.handleExport(request);
      }
      case "/import": {
        await this.ensure();
        return this.handleImport(request);
      }
      case "/admin/ban":
      case "/admin/unban": {
        await this.ensure();
        return this.handleBan(request, url.pathname === "/admin/ban");
      }
      default:
        return jsonResponse({ ok: false, error: "not found" }, 404);
    }
  }
  upgrade() {
    const pair = new WebSocketPair();
    const server = pair[1];
    const state = this.state;
    state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  requireAdmin(request) {
    const header = request.headers.get("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    return tokensMatch(token, this.env.ADMIN_TOKEN);
  }
  handleExport(request) {
    if (!this.requireAdmin(request)) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    if (this.coordinator?.worldLocked) {
      return jsonResponse({ ok: false, error: "world locked; export refused" }, 409);
    }
    const data = this.ensureSyncStore().exportAll();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="eternal-blocks-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json"`
      }
    });
  }
  async handleImport(request) {
    if (!this.requireAdmin(request)) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid json body" }, 400);
    }
    const b = body;
    if (b?.confirm !== "merge") {
      return jsonResponse({ ok: false, error: 'body must include "confirm":"merge" (merge-only import)' }, 400);
    }
    const store = this.ensureSyncStore();
    try {
      const res = await store.importMerge(b.data ?? {});
      return jsonResponse({ ok: true, ...res });
    } catch (err) {
      return jsonResponse({ ok: false, error: String(err instanceof Error ? err.message : err) }, 409);
    }
  }
  async handleBan(request, ban) {
    if (!this.requireAdmin(request)) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid json body" }, 400);
    }
    if (typeof body.playerId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(body.playerId)) {
      return jsonResponse({ ok: false, error: "playerId malformed" }, 400);
    }
    const store = this.ensureSyncStore();
    const changed = ban ? store.setBan(body.playerId, String(body.reason ?? "no reason given"), "admin") : store.clearBan(body.playerId, "admin");
    if (!changed) return jsonResponse({ ok: false, error: "unknown playerId" }, 404);
    if (ban) {
      for (const [pid, handler] of [...this.handlerByPid()]) {
        if (pid === body.playerId) handler.kick(4003, "banned");
      }
    }
    return jsonResponse({ ok: true });
  }
  handlerByPid() {
    const out = /* @__PURE__ */ new Map();
    for (const h of this.handlers.values()) {
      if (h.playerId && !h.closed) out.set(h.playerId, h);
    }
    return out;
  }
  /** Synchronous accessor when the coordinator is guaranteed to exist already. */
  ensureSyncStore() {
    if (!this.coordinator) throw new Error("coordinator not initialized");
    return this.coordinator.store;
  }
  // ---------------------------------------------------------------------------
  // WebSocket events (Hibernation API)
  // ---------------------------------------------------------------------------
  async webSocketMessage(ws, raw) {
    const coord = await this.ensure();
    let handler = this.handlers.get(ws);
    if (!handler) {
      handler = coord.createHandler(socketLike(ws));
      this.handlers.set(ws, handler);
    }
    try {
      await handler.handleRawFrame(raw);
      if (handler.playerId && readAttachment(ws)?.pid !== handler.playerId) {
        try {
          ws.serializeAttachment({ pid: handler.playerId });
        } catch {
        }
      }
    } catch (err) {
      console.error("message handling failed", err);
      try {
        handler.send({ t: "error", code: "server_error", msg: "internal error" });
      } catch {
      }
    }
  }
  async webSocketClose(ws) {
    const handler = this.handlers.get(ws);
    if (handler) {
      handler.close();
      this.handlers.delete(ws);
    }
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
};
function readAttachment(ws) {
  try {
    return ws.deserializeAttachment();
  } catch {
    return null;
  }
}
__name(readAttachment, "readAttachment");
function socketLike(ws) {
  return {
    send(data) {
      ws.send(data);
    },
    close(code, reason) {
      try {
        ws.close(code, reason);
      } catch {
      }
    }
  };
}
__name(socketLike, "socketLike");
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Export-Format": EXPORT_FORMAT }
  });
}
__name(jsonResponse, "jsonResponse");

// src/index.ts
var ADMIN_PATHS = /* @__PURE__ */ new Set(["/export", "/import", "/admin/ban", "/admin/unban"]);
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const policy = originPolicyFromEnv(env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") {
      if (!isOriginAllowed(policy, origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders(origin), "Access-Control-Allow-Headers": "Authorization,Content-Type" }
      });
    }
    if (url.pathname === "/health") {
      return withCors(jsonResponse2({ ok: true, service: "eternal-blocks-server" }), origin);
    }
    if (!isOriginAllowed(policy, origin)) {
      return withCors(
        jsonResponse2({ ok: false, error: "origin not allowed" }, 403),
        origin
      );
    }
    if (url.pathname === "/") {
      return withCors(
        jsonResponse2({
          ok: true,
          service: "eternal-blocks-server",
          endpoints: ["/ws (websocket)", "/stats", "/health"],
          note: "This is the Eternal Blocks game server. Clients connect via WebSocket to /ws."
        }),
        origin
      );
    }
    if (ADMIN_PATHS.has(url.pathname)) {
      const header = request.headers.get("Authorization") ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const ok = token.length > 0 && token === (env.ADMIN_TOKEN ?? "");
      if (!ok) return withCors(jsonResponse2({ ok: false, error: "unauthorized" }, 401), origin);
    }
    const id = env.ETERNAL_WORLD.idFromName(env.WORLD_ID || DEFAULT_WORLD_ID);
    const stub = env.ETERNAL_WORLD.get(id);
    const response = await stub.fetch(new Request(new URL(url.pathname + url.search, request.url), request));
    if (url.pathname === "/ws") return response;
    return withCors(response, origin);
  }
};
function withCors(res, origin) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(origin))) out.headers.set(k, v);
  return out;
}
__name(withCors, "withCors");
function jsonResponse2(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
__name(jsonResponse2, "jsonResponse");
export {
  EternalWorld,
  index_default as default
};
//# sourceMappingURL=index.js.map
