import { describe, expect, it } from 'vitest';
import { WOOL_BLOCKS } from '@eternal-blocks/shared';
import { BLOCK_TILES, paintTextureTile } from '../src/game/textures.ts';

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

describe('wool textures', () => {
  it('keeps every pixel within the block color family', () => {
    for (const wool of WOOL_BLOCKS) {
      const tile = BLOCK_TILES[wool.id][0];
      const pixels = paintTextureTile(tile);
      const base = hexToRgb(wool.color);
      const baseLengthSq = base.reduce((sum, channel) => sum + channel * channel, 0);

      for (let i = 0; i < pixels.length; i += 4) {
        const pixel = [pixels[i], pixels[i + 1], pixels[i + 2]];
        const scale = pixel.reduce(
          (sum, channel, channelIndex) => sum + channel * base[channelIndex],
          0,
        ) / baseLengthSq;

        // Wool may vary slightly in brightness, but never in hue. A one-point
        // allowance covers integer rounding performed while painting pixels.
        expect(scale, `${wool.name} brightness at pixel ${i / 4}`).toBeGreaterThanOrEqual(0.95);
        expect(scale, `${wool.name} brightness at pixel ${i / 4}`).toBeLessThanOrEqual(1.05);
        for (let channel = 0; channel < 3; channel++) {
          expect(
            Math.abs(pixel[channel] - base[channel] * scale),
            `${wool.name} hue drift at pixel ${i / 4}`,
          ).toBeLessThanOrEqual(1);
        }
        expect(pixels[i + 3], `${wool.name} alpha at pixel ${i / 4}`).toBe(255);
      }
    }
  });
});
