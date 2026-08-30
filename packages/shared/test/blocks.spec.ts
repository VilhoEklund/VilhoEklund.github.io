import { describe, expect, it } from 'vitest';
import {
  BLOCKS,
  BlockId,
  HOTBAR_BLOCKS,
  INVENTORY_BLOCKS,
  WOOL_BLOCKS,
  blockCollisionBoxes,
  doorCounterpart,
  isDoorBottom,
  isPlaceable,
  ladderSupportOffset,
  orientBlock,
  supportsBlockAbove,
  toggleDoorBlock,
  topSlabVariant,
} from '../src/blocks.ts';

describe('expanded block registry', () => {
  it('keeps ten hotbar slots while exposing every new block family in the inventory', () => {
    expect(HOTBAR_BLOCKS).toHaveLength(10);
    expect(WOOL_BLOCKS).toHaveLength(16);
    expect(new Set(INVENTORY_BLOCKS).size).toBe(INVENTORY_BLOCKS.length);
    for (const id of INVENTORY_BLOCKS) {
      expect(BLOCKS[id]).toBeDefined();
      expect(isPlaceable(id)).toBe(true);
    }
  });

  it('defines half-height slabs and directional stair collision shapes', () => {
    expect(blockCollisionBoxes(BlockId.OakSlabBottom)).toEqual([
      expect.objectContaining({ minY: 0, maxY: 0.5 }),
    ]);
    expect(blockCollisionBoxes(BlockId.OakSlabTop)).toEqual([
      expect.objectContaining({ minY: 0.5, maxY: 1 }),
    ]);
    expect(topSlabVariant(BlockId.BrickSlabBottom)).toBe(BlockId.BrickSlabTop);
    expect(orientBlock(BlockId.StoneStairsNorth, 2)).toBe(BlockId.StoneStairsSouth);
    expect(blockCollisionBoxes(BlockId.StoneStairsSouth)).toHaveLength(2);
    expect(supportsBlockAbove(BlockId.Stone)).toBe(true);
    expect(supportsBlockAbove(BlockId.StoneSlabTop)).toBe(true);
    expect(supportsBlockAbove(BlockId.StoneSlabBottom)).toBe(false);
  });

  it('keeps door halves paired through every orientation and open state', () => {
    for (let id = BlockId.DoorBottomClosedNorth; id <= BlockId.DoorBottomClosedWest; id++) {
      expect(isDoorBottom(id)).toBe(true);
      const top = doorCounterpart(id);
      expect(top).not.toBeNull();
      expect(doorCounterpart(top!)).toBe(id);
      expect(toggleDoorBlock(toggleDoorBlock(id)!)).toBe(id);
      expect(isPlaceable(top!)).toBe(false);
    }
  });

  it('orients ladders toward a matching support cell', () => {
    expect(ladderSupportOffset(orientBlock(BlockId.LadderNorth, 0))).toEqual({ x: 0, z: -1 });
    expect(ladderSupportOffset(orientBlock(BlockId.LadderNorth, 1))).toEqual({ x: 1, z: 0 });
    expect(ladderSupportOffset(orientBlock(BlockId.LadderNorth, 2))).toEqual({ x: 0, z: 1 });
    expect(ladderSupportOffset(orientBlock(BlockId.LadderNorth, 3))).toEqual({ x: -1, z: 0 });
  });
});
