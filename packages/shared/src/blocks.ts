/**
 * Block registry. Original block set for Eternal Blocks.
 * IDs are persisted; never renumber or reuse existing entries.
 */

export const BlockId = {
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
  Sign: 13,

  WhiteWool: 14,
  LightGrayWool: 15,
  GrayWool: 16,
  BlackWool: 17,
  BrownWool: 18,
  RedWool: 19,
  OrangeWool: 20,
  YellowWool: 21,
  LimeWool: 22,
  GreenWool: 23,
  CyanWool: 24,
  LightBlueWool: 25,
  BlueWool: 26,
  PurpleWool: 27,
  MagentaWool: 28,
  PinkWool: 29,

  OakSlabBottom: 30,
  OakSlabTop: 31,
  StoneSlabBottom: 32,
  StoneSlabTop: 33,
  BrickSlabBottom: 34,
  BrickSlabTop: 35,

  OakStairsNorth: 36,
  OakStairsEast: 37,
  OakStairsSouth: 38,
  OakStairsWest: 39,
  StoneStairsNorth: 40,
  StoneStairsEast: 41,
  StoneStairsSouth: 42,
  StoneStairsWest: 43,
  BrickStairsNorth: 44,
  BrickStairsEast: 45,
  BrickStairsSouth: 46,
  BrickStairsWest: 47,

  LadderNorth: 48,
  LadderEast: 49,
  LadderSouth: 50,
  LadderWest: 51,

  DoorBottomClosedNorth: 52,
  DoorBottomClosedEast: 53,
  DoorBottomClosedSouth: 54,
  DoorBottomClosedWest: 55,
  DoorTopClosedNorth: 56,
  DoorTopClosedEast: 57,
  DoorTopClosedSouth: 58,
  DoorTopClosedWest: 59,
  DoorBottomOpenNorth: 60,
  DoorBottomOpenEast: 61,
  DoorBottomOpenSouth: 62,
  DoorBottomOpenWest: 63,
  DoorTopOpenNorth: 64,
  DoorTopOpenEast: 65,
  DoorTopOpenSouth: 66,
  DoorTopOpenWest: 67,
} as const;

export type BlockIdValue = (typeof BlockId)[keyof typeof BlockId];
export type HorizontalFacing = 0 | 1 | 2 | 3; // north, east, south, west

export type BlockShape =
  | 'none'
  | 'cube'
  | 'slab_bottom'
  | 'slab_top'
  | 'stairs_north'
  | 'stairs_east'
  | 'stairs_south'
  | 'stairs_west'
  | 'ladder_north'
  | 'ladder_east'
  | 'ladder_south'
  | 'ladder_west'
  | 'door_north'
  | 'door_east'
  | 'door_south'
  | 'door_west';

/** Axis-aligned box in block-local coordinates. */
export interface BlockBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface BlockDef {
  id: number;
  /** Human readable name shown in UI. */
  name: string;
  /** Blocks player movement. Collision still follows the block's exact shape. */
  solid: boolean;
  /** Only full-cube opaque blocks may hide all faces of their neighbours. */
  opaque: boolean;
  /** Can be replaced by placing a block into it (air, water). */
  replaceable: boolean;
  /** Cannot be broken by players (bedrock). */
  unbreakable: boolean;
  /** Rendered in the translucent pass (water). */
  liquid?: boolean;
  /** Geometry, selection and (when solid) collision shape. */
  shape: BlockShape;
  /** False for internal door states that only the server may create. */
  directPlaceable?: boolean;
  /** Base color used for UI accents / minimap-ish swatches. */
  color: string;
}

function def(d: BlockDef): BlockDef {
  return d;
}

function cube(id: number, name: string, color: string, opaque = true): BlockDef {
  return def({
    id,
    name,
    solid: true,
    opaque,
    replaceable: false,
    unbreakable: false,
    shape: 'cube',
    color,
  });
}

function shaped(
  id: number,
  name: string,
  color: string,
  shape: BlockShape,
  solid = true,
): BlockDef {
  return def({
    id,
    name,
    solid,
    opaque: false,
    replaceable: false,
    unbreakable: false,
    shape,
    color,
  });
}

export const WOOL_BLOCKS: ReadonlyArray<{ id: number; name: string; color: string }> = [
  { id: BlockId.WhiteWool, name: 'White Wool', color: '#e9ecec' },
  { id: BlockId.LightGrayWool, name: 'Light Gray Wool', color: '#9d9d97' },
  { id: BlockId.GrayWool, name: 'Gray Wool', color: '#474f52' },
  { id: BlockId.BlackWool, name: 'Black Wool', color: '#1d1d21' },
  { id: BlockId.BrownWool, name: 'Brown Wool', color: '#835432' },
  { id: BlockId.RedWool, name: 'Red Wool', color: '#b02e26' },
  { id: BlockId.OrangeWool, name: 'Orange Wool', color: '#f07613' },
  { id: BlockId.YellowWool, name: 'Yellow Wool', color: '#f8c627' },
  { id: BlockId.LimeWool, name: 'Lime Wool', color: '#70b919' },
  { id: BlockId.GreenWool, name: 'Green Wool', color: '#546d1b' },
  { id: BlockId.CyanWool, name: 'Cyan Wool', color: '#169c9c' },
  { id: BlockId.LightBlueWool, name: 'Light Blue Wool', color: '#3ab3da' },
  { id: BlockId.BlueWool, name: 'Blue Wool', color: '#3c44aa' },
  { id: BlockId.PurpleWool, name: 'Purple Wool', color: '#8932b8' },
  { id: BlockId.MagentaWool, name: 'Magenta Wool', color: '#c74ebd' },
  { id: BlockId.PinkWool, name: 'Pink Wool', color: '#ed8dac' },
];

export const BLOCKS: Record<number, BlockDef> = {
  [BlockId.Air]: def({
    id: BlockId.Air,
    name: 'Air',
    solid: false,
    opaque: false,
    replaceable: true,
    unbreakable: false,
    shape: 'none',
    color: '#000000',
  }),
  [BlockId.Grass]: cube(BlockId.Grass, 'Grass', '#58b04a'),
  [BlockId.Dirt]: cube(BlockId.Dirt, 'Dirt', '#7a5636'),
  [BlockId.Stone]: cube(BlockId.Stone, 'Stone', '#8a8f94'),
  [BlockId.Sand]: cube(BlockId.Sand, 'Sand', '#e3d29b'),
  [BlockId.Water]: def({
    id: BlockId.Water,
    name: 'Water',
    solid: false,
    opaque: false,
    replaceable: true,
    unbreakable: false,
    liquid: true,
    shape: 'cube',
    color: '#3f76e4',
  }),
  [BlockId.Log]: cube(BlockId.Log, 'Log', '#6e522f'),
  [BlockId.Leaves]: cube(BlockId.Leaves, 'Leaves', '#3e7d33', false),
  [BlockId.Planks]: cube(BlockId.Planks, 'Planks', '#b08a52'),
  [BlockId.Brick]: cube(BlockId.Brick, 'Brick', '#a5503c'),
  [BlockId.Glass]: cube(BlockId.Glass, 'Glass', '#cfe8ef', false),
  [BlockId.Bedrock]: {
    ...cube(BlockId.Bedrock, 'Bedrock', '#33363b'),
    unbreakable: true,
    directPlaceable: false,
  },
  [BlockId.Sign]: def({
    id: BlockId.Sign,
    name: 'Sign',
    solid: false,
    opaque: false,
    replaceable: false,
    unbreakable: false,
    shape: 'none',
    color: '#c9a86a',
  }),
};

for (const wool of WOOL_BLOCKS) BLOCKS[wool.id] = cube(wool.id, wool.name, wool.color);

Object.assign(BLOCKS, {
  [BlockId.OakSlabBottom]: shaped(BlockId.OakSlabBottom, 'Oak Slab', '#b08a52', 'slab_bottom'),
  [BlockId.OakSlabTop]: shaped(BlockId.OakSlabTop, 'Oak Slab', '#b08a52', 'slab_top'),
  [BlockId.StoneSlabBottom]: shaped(
    BlockId.StoneSlabBottom,
    'Stone Slab',
    '#8a8f94',
    'slab_bottom',
  ),
  [BlockId.StoneSlabTop]: shaped(BlockId.StoneSlabTop, 'Stone Slab', '#8a8f94', 'slab_top'),
  [BlockId.BrickSlabBottom]: shaped(
    BlockId.BrickSlabBottom,
    'Brick Slab',
    '#a5503c',
    'slab_bottom',
  ),
  [BlockId.BrickSlabTop]: shaped(BlockId.BrickSlabTop, 'Brick Slab', '#a5503c', 'slab_top'),

  [BlockId.OakStairsNorth]: shaped(BlockId.OakStairsNorth, 'Oak Stairs', '#b08a52', 'stairs_north'),
  [BlockId.OakStairsEast]: shaped(BlockId.OakStairsEast, 'Oak Stairs', '#b08a52', 'stairs_east'),
  [BlockId.OakStairsSouth]: shaped(BlockId.OakStairsSouth, 'Oak Stairs', '#b08a52', 'stairs_south'),
  [BlockId.OakStairsWest]: shaped(BlockId.OakStairsWest, 'Oak Stairs', '#b08a52', 'stairs_west'),
  [BlockId.StoneStairsNorth]: shaped(
    BlockId.StoneStairsNorth,
    'Stone Stairs',
    '#8a8f94',
    'stairs_north',
  ),
  [BlockId.StoneStairsEast]: shaped(
    BlockId.StoneStairsEast,
    'Stone Stairs',
    '#8a8f94',
    'stairs_east',
  ),
  [BlockId.StoneStairsSouth]: shaped(
    BlockId.StoneStairsSouth,
    'Stone Stairs',
    '#8a8f94',
    'stairs_south',
  ),
  [BlockId.StoneStairsWest]: shaped(
    BlockId.StoneStairsWest,
    'Stone Stairs',
    '#8a8f94',
    'stairs_west',
  ),
  [BlockId.BrickStairsNorth]: shaped(
    BlockId.BrickStairsNorth,
    'Brick Stairs',
    '#a5503c',
    'stairs_north',
  ),
  [BlockId.BrickStairsEast]: shaped(
    BlockId.BrickStairsEast,
    'Brick Stairs',
    '#a5503c',
    'stairs_east',
  ),
  [BlockId.BrickStairsSouth]: shaped(
    BlockId.BrickStairsSouth,
    'Brick Stairs',
    '#a5503c',
    'stairs_south',
  ),
  [BlockId.BrickStairsWest]: shaped(
    BlockId.BrickStairsWest,
    'Brick Stairs',
    '#a5503c',
    'stairs_west',
  ),

  [BlockId.LadderNorth]: shaped(BlockId.LadderNorth, 'Ladder', '#b88a4a', 'ladder_north', false),
  [BlockId.LadderEast]: shaped(BlockId.LadderEast, 'Ladder', '#b88a4a', 'ladder_east', false),
  [BlockId.LadderSouth]: shaped(BlockId.LadderSouth, 'Ladder', '#b88a4a', 'ladder_south', false),
  [BlockId.LadderWest]: shaped(BlockId.LadderWest, 'Ladder', '#b88a4a', 'ladder_west', false),
});

const DOOR_BOTTOM_CLOSED = [
  BlockId.DoorBottomClosedNorth,
  BlockId.DoorBottomClosedEast,
  BlockId.DoorBottomClosedSouth,
  BlockId.DoorBottomClosedWest,
] as const;
const DOOR_TOP_CLOSED = [
  BlockId.DoorTopClosedNorth,
  BlockId.DoorTopClosedEast,
  BlockId.DoorTopClosedSouth,
  BlockId.DoorTopClosedWest,
] as const;
const DOOR_BOTTOM_OPEN = [
  BlockId.DoorBottomOpenNorth,
  BlockId.DoorBottomOpenEast,
  BlockId.DoorBottomOpenSouth,
  BlockId.DoorBottomOpenWest,
] as const;
const DOOR_TOP_OPEN = [
  BlockId.DoorTopOpenNorth,
  BlockId.DoorTopOpenEast,
  BlockId.DoorTopOpenSouth,
  BlockId.DoorTopOpenWest,
] as const;

const FACING_SHAPES = ['north', 'east', 'south', 'west'] as const;
for (let facing = 0; facing < 4; facing++) {
  const closedShape = `door_${FACING_SHAPES[facing]}` as BlockShape;
  const openShape = `door_${FACING_SHAPES[(facing + 1) % 4]}` as BlockShape;
  BLOCKS[DOOR_BOTTOM_CLOSED[facing]] = shaped(
    DOOR_BOTTOM_CLOSED[facing],
    'Oak Door',
    '#a8763e',
    closedShape,
  );
  BLOCKS[DOOR_TOP_CLOSED[facing]] = {
    ...shaped(DOOR_TOP_CLOSED[facing], 'Oak Door', '#a8763e', closedShape),
    directPlaceable: false,
  };
  BLOCKS[DOOR_BOTTOM_OPEN[facing]] = {
    ...shaped(DOOR_BOTTOM_OPEN[facing], 'Oak Door', '#a8763e', openShape),
    directPlaceable: false,
  };
  BLOCKS[DOOR_TOP_OPEN[facing]] = {
    ...shaped(DOOR_TOP_OPEN[facing], 'Oak Door', '#a8763e', openShape),
    directPlaceable: false,
  };
}

const FULL_BOX: BlockBox = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 };
const BOTTOM_SLAB_BOX: BlockBox = { ...FULL_BOX, maxY: 0.5 };
const TOP_SLAB_BOX: BlockBox = { ...FULL_BOX, minY: 0.5 };
const THIN = 3 / 16;

const SHAPE_BOXES: Record<BlockShape, readonly BlockBox[]> = {
  none: [],
  cube: [FULL_BOX],
  slab_bottom: [BOTTOM_SLAB_BOX],
  slab_top: [TOP_SLAB_BOX],
  stairs_north: [BOTTOM_SLAB_BOX, { ...TOP_SLAB_BOX, maxZ: 0.5 }],
  stairs_east: [BOTTOM_SLAB_BOX, { ...TOP_SLAB_BOX, minX: 0.5 }],
  stairs_south: [BOTTOM_SLAB_BOX, { ...TOP_SLAB_BOX, minZ: 0.5 }],
  stairs_west: [BOTTOM_SLAB_BOX, { ...TOP_SLAB_BOX, maxX: 0.5 }],
  ladder_north: [{ ...FULL_BOX, maxZ: THIN }],
  ladder_east: [{ ...FULL_BOX, minX: 1 - THIN }],
  ladder_south: [{ ...FULL_BOX, minZ: 1 - THIN }],
  ladder_west: [{ ...FULL_BOX, maxX: THIN }],
  door_north: [{ ...FULL_BOX, maxZ: THIN }],
  door_east: [{ ...FULL_BOX, minX: 1 - THIN }],
  door_south: [{ ...FULL_BOX, minZ: 1 - THIN }],
  door_west: [{ ...FULL_BOX, maxX: THIN }],
};

/** Exact boxes rendered and targeted for a block. Signs use their own renderer. */
export function blockSelectionBoxes(id: number): readonly BlockBox[] {
  return SHAPE_BOXES[BLOCKS[id]?.shape ?? 'none'];
}

/** Exact solid boxes used by player collision. */
export function blockCollisionBoxes(id: number): readonly BlockBox[] {
  return BLOCKS[id]?.solid ? blockSelectionBoxes(id) : [];
}

export function isFullCube(id: number): boolean {
  return BLOCKS[id]?.shape === 'cube';
}

export function isSolid(id: number): boolean {
  return BLOCKS[id]?.solid === true;
}

/** Whether the shape has a complete top surface suitable for a door/base. */
export function supportsBlockAbove(id: number): boolean {
  return blockCollisionBoxes(id).some(
    (box) => box.minX === 0 && box.maxX === 1 && box.minZ === 0 && box.maxZ === 1 && box.maxY === 1,
  );
}

export function isOpaque(id: number): boolean {
  return BLOCKS[id]?.opaque === true;
}

export function isReplaceable(id: number): boolean {
  return BLOCKS[id]?.replaceable === true;
}

export function isPlaceable(id: number): boolean {
  const block = BLOCKS[id];
  return (
    Number.isInteger(id) &&
    block !== undefined &&
    id !== BlockId.Air &&
    id !== BlockId.Bedrock &&
    block.directPlaceable !== false
  );
}

export function isLadder(id: number): boolean {
  return id >= BlockId.LadderNorth && id <= BlockId.LadderWest;
}

/** Cell offset from a ladder to the block that supports it. */
export function ladderSupportOffset(id: number): { x: number; z: number } | null {
  if (id === BlockId.LadderNorth) return { x: 0, z: -1 };
  if (id === BlockId.LadderEast) return { x: 1, z: 0 };
  if (id === BlockId.LadderSouth) return { x: 0, z: 1 };
  if (id === BlockId.LadderWest) return { x: -1, z: 0 };
  return null;
}

export function isDoor(id: number): boolean {
  return id >= BlockId.DoorBottomClosedNorth && id <= BlockId.DoorTopOpenWest;
}

export function isDoorBottom(id: number): boolean {
  return (
    DOOR_BOTTOM_CLOSED.includes(id as (typeof DOOR_BOTTOM_CLOSED)[number]) ||
    DOOR_BOTTOM_OPEN.includes(id as (typeof DOOR_BOTTOM_OPEN)[number])
  );
}

export function isDoorTop(id: number): boolean {
  return (
    DOOR_TOP_CLOSED.includes(id as (typeof DOOR_TOP_CLOSED)[number]) ||
    DOOR_TOP_OPEN.includes(id as (typeof DOOR_TOP_OPEN)[number])
  );
}

export function doorCounterpart(id: number): number | null {
  for (let facing = 0; facing < 4; facing++) {
    if (id === DOOR_BOTTOM_CLOSED[facing]) return DOOR_TOP_CLOSED[facing];
    if (id === DOOR_TOP_CLOSED[facing]) return DOOR_BOTTOM_CLOSED[facing];
    if (id === DOOR_BOTTOM_OPEN[facing]) return DOOR_TOP_OPEN[facing];
    if (id === DOOR_TOP_OPEN[facing]) return DOOR_BOTTOM_OPEN[facing];
  }
  return null;
}

export function toggleDoorBlock(id: number): number | null {
  for (let facing = 0; facing < 4; facing++) {
    if (id === DOOR_BOTTOM_CLOSED[facing]) return DOOR_BOTTOM_OPEN[facing];
    if (id === DOOR_TOP_CLOSED[facing]) return DOOR_TOP_OPEN[facing];
    if (id === DOOR_BOTTOM_OPEN[facing]) return DOOR_BOTTOM_CLOSED[facing];
    if (id === DOOR_TOP_OPEN[facing]) return DOOR_TOP_CLOSED[facing];
  }
  return null;
}

const STAIR_GROUPS: readonly (readonly number[])[] = [
  [BlockId.OakStairsNorth, BlockId.OakStairsEast, BlockId.OakStairsSouth, BlockId.OakStairsWest],
  [
    BlockId.StoneStairsNorth,
    BlockId.StoneStairsEast,
    BlockId.StoneStairsSouth,
    BlockId.StoneStairsWest,
  ],
  [
    BlockId.BrickStairsNorth,
    BlockId.BrickStairsEast,
    BlockId.BrickStairsSouth,
    BlockId.BrickStairsWest,
  ],
];
const LADDER_GROUP = [
  BlockId.LadderNorth,
  BlockId.LadderEast,
  BlockId.LadderSouth,
  BlockId.LadderWest,
] as const;

/** Resolve a palette representative into its horizontal placement variant. */
export function orientBlock(id: number, facing: HorizontalFacing): number {
  for (const group of STAIR_GROUPS) {
    if (group.includes(id)) return group[facing];
  }
  if (LADDER_GROUP.includes(id as (typeof LADDER_GROUP)[number])) return LADDER_GROUP[facing];
  if (DOOR_BOTTOM_CLOSED.includes(id as (typeof DOOR_BOTTOM_CLOSED)[number]))
    return DOOR_BOTTOM_CLOSED[facing];
  return id;
}

export function topSlabVariant(id: number): number {
  if (id === BlockId.OakSlabBottom || id === BlockId.OakSlabTop) return BlockId.OakSlabTop;
  if (id === BlockId.StoneSlabBottom || id === BlockId.StoneSlabTop) return BlockId.StoneSlabTop;
  if (id === BlockId.BrickSlabBottom || id === BlockId.BrickSlabTop) return BlockId.BrickSlabTop;
  return id;
}

export function isSlab(id: number): boolean {
  return id >= BlockId.OakSlabBottom && id <= BlockId.BrickSlabTop;
}

/** Initial ten-slot loadout (keys 1..0). */
export const HOTBAR_BLOCKS: number[] = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Sand,
  BlockId.Log,
  BlockId.Leaves,
  BlockId.Planks,
  BlockId.Brick,
  BlockId.Glass,
  BlockId.Sign,
];

/** Creative inventory palette. Stateful variants are intentionally represented once. */
export const INVENTORY_BLOCKS: number[] = [
  ...HOTBAR_BLOCKS,
  ...WOOL_BLOCKS.map((wool) => wool.id),
  BlockId.OakSlabBottom,
  BlockId.StoneSlabBottom,
  BlockId.BrickSlabBottom,
  BlockId.OakStairsNorth,
  BlockId.StoneStairsNorth,
  BlockId.BrickStairsNorth,
  BlockId.DoorBottomClosedNorth,
  BlockId.LadderNorth,
];
