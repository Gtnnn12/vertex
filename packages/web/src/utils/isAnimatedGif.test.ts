import { describe, it, expect } from 'vitest';
import { isAnimatedGif } from './isAnimatedGif';

/**
 * Minimal GIF89a byte builders for testing frame-count detection.
 * The image data itself is a (possibly invalid) single sub-block — the parser
 * we test only counts image descriptors, so pixel content is irrelevant.
 */

function header(version: '87a' | '89a' = '89a'): number[] {
  return [...('GIF' + version).split('').map((c) => c.charCodeAt(0))];
}

/** Logical screen descriptor, no global color table. */
function lsd(width = 1, height = 1): number[] {
  const flags = 0x00; // no global color table
  return [
    width & 0xff,
    (width >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
    flags,
    0x00, // background color index
    0x00, // pixel aspect ratio
  ];
}

/** Image descriptor + minimal LZW data sub-block. */
function imageDescriptor(width = 1, height = 1): number[] {
  const flags = 0x00; // no local color table
  return [
    0x2c, // image descriptor introducer
    0x00,
    0x00, // left
    0x00,
    0x00, // top
    width & 0xff,
    (width >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
    flags,
    0x02, // LZW minimum code size
    0x02, // data sub-block size
    0x44,
    0x00, // dummy LZW bytes
    0x00, // sub-block terminator
  ];
}

/** Plain text extension (0x21 0x01) with an empty sub-block chain. */
function textExtension(): number[] {
  return [0x21, 0x01, 0x00];
}

/** Graphic control extension (0x21 0xF9) with one 4-byte sub-block. */
function graphicControl(delay = 0): number[] {
  const packed = 0x04; // disposal method: restore to background
  return [0x21, 0xf9, 0x04, packed, delay & 0xff, (delay >> 8) & 0xff, 0x00, 0x00];
}

function toBuffer(bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

function staticGif(): Uint8Array {
  return toBuffer([...header(), ...lsd(), ...imageDescriptor(), 0x3b]);
}

function animatedGif(): Uint8Array {
  return toBuffer([
    ...header(),
    ...lsd(),
    ...graphicControl(10),
    ...imageDescriptor(),
    ...graphicControl(10),
    ...imageDescriptor(),
    0x3b,
  ]);
}

function gifWithTextExtension(): Uint8Array {
  return toBuffer([...header(), ...lsd(), ...textExtension(), ...imageDescriptor(), 0x3b]);
}

describe('isAnimatedGif', () => {
  it('returns false for a single-frame GIF', async () => {
    await expect(isAnimatedGif(staticGif())).resolves.toBe(false);
  });

  it('returns true for a two-frame GIF', async () => {
    await expect(isAnimatedGif(animatedGif())).resolves.toBe(true);
  });

  it('skips extensions between frames when counting', async () => {
    await expect(isAnimatedGif(gifWithTextExtension())).resolves.toBe(false);
  });

  it('returns false for a non-GIF byte stream', async () => {
    await expect(isAnimatedGif(toBuffer([0x89, 0x50, 0x4e, 0x47]))).resolves.toBe(false);
  });

  it('returns false for truncated input without crashing', async () => {
    await expect(isAnimatedGif(toBuffer(header().slice(0, 3)))).resolves.toBe(false);
  });

  it('accepts a Blob input', async () => {
    const blob = new Blob([staticGif().buffer as ArrayBuffer], { type: 'image/gif' });
    await expect(isAnimatedGif(blob)).resolves.toBe(false);
  });
});