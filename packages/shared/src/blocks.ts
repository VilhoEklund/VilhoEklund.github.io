/**
 * Block registry. Original block set for Eternal Blocks.
 * IDs are persisted; never renumber existing entries.
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
  Snow: 11,
  Bedrock: 12,
  Sign: 13,
} as const;

export type BlockIdValue = (typeof BlockId)[keyof typeof BlockId];

export interface BlockDef {
  id: number;
  /** Human readable name shown in UI. */
  name: string;
  /** Blocks player movement and raycasts stop on it. */
  solid: boolean;
  /**
   * Faces of neighbouring blocks touching this one are culled only against
   * opaque blocks. Water/glass/leaves are non-opaque.
   */
  opaque: boolean;
  /** Can be replaced by placing a block into it (air, water). */
  replaceable: boolean;
  /** Cannot be broken by players (bedrock). */
  unbreakable: boolean;
  /** Rendered in the translucent pass (water). */
  liquid?: boolean;
  /** Base color used for UI accents / minimap-ish swatches. */
  color: string;
}

function def(d: BlockDef): BlockDef {
  return d;
}

export const BLOCKS: Record<number, BlockDef> = {
  [BlockId.Air]: def({
    id: BlockId.Air,
    name: 'Air',
    solid: false,
    opaque: false,
    replaceable: true,
    unbreakable: false,
    color: '#000000',
  }),
  [BlockId.Grass]: def({
    id: BlockId.Grass,
    name: 'Grass',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#58b04a',
  }),
  [BlockId.Dirt]: def({
    id: BlockId.Dirt,
    name: 'Dirt',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#7a5636',
  }),
  [BlockId.Stone]: def({
    id: BlockId.Stone,
    name: 'Stone',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#8a8f94',
  }),
  [BlockId.Sand]: def({
    id: BlockId.Sand,
    name: 'Sand',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#e3d29b',
  }),
  [BlockId.Water]: def({
    id: BlockId.Water,
    name: 'Water',
    solid: false,
    opaque: false,
    replaceable: true,
    unbreakable: false,
    liquid: true,
    color: '#3f76e4',
  }),
  [BlockId.Log]: def({
    id: BlockId.Log,
    name: 'Log',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#6e522f',
  }),
  [BlockId.Leaves]: def({
    id: BlockId.Leaves,
    name: 'Leaves',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#3e7d33',
  }),
  [BlockId.Planks]: def({
    id: BlockId.Planks,
    name: 'Planks',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#b08a52',
  }),
  [BlockId.Brick]: def({
    id: BlockId.Brick,
    name: 'Brick',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#a5503c',
  }),
  [BlockId.Glass]: def({
    id: BlockId.Glass,
    name: 'Glass',
    solid: true,
    opaque: false,
    replaceable: false,
    unbreakable: false,
    color: '#cfe8ef',
  }),
  [BlockId.Snow]: def({
    id: BlockId.Snow,
    name: 'Snow',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: false,
    color: '#f2f5f7',
  }),
  [BlockId.Bedrock]: def({
    id: BlockId.Bedrock,
    name: 'Bedrock',
    solid: true,
    opaque: true,
    replaceable: false,
    unbreakable: true,
    color: '#33363b',
  }),
  [BlockId.Sign]: def({
    id: BlockId.Sign,
    name: 'Sign',
    // Non-solid so signs never trap players; rendered as a post + panel.
    solid: false,
    opaque: false,
    replaceable: false,
    unbreakable: false,
    color: '#c9a86a',
  }),
};

/** Hotbar palette order (keys 1..0). */
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

const BLOCK_ID_VALUES: number[] = Object.values(BlockId);

export function isSolid(id: number): boolean {
  return BLOCKS[id]?.solid === true;
}

export function isOpaque(id: number): boolean {
  return BLOCKS[id]?.opaque === true;
}

export function isReplaceable(id: number): boolean {
  return BLOCKS[id]?.replaceable === true;
}

export function isPlaceable(id: number): boolean {
  return Number.isInteger(id) && BLOCK_ID_VALUES.includes(id) && id !== BlockId.Air && id !== BlockId.Bedrock;
}
