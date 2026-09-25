import { describe, it, expect } from 'vitest';
import { compressImage, formatBytes, secondsOn2G, targetSize } from './compressImage';

describe('low-bandwidth helpers', () => {
  it('caps the longest side and never enlarges', () => {
    expect(targetSize(4288, 2848, 1800)).toEqual({ width: 1800, height: 1196 });
    expect(targetSize(2848, 4288, 1800)).toEqual({ width: 1196, height: 1800 });
    expect(targetSize(640, 480, 1800)).toEqual({ width: 640, height: 480 });
  });

  it('times a camera JPEG over the 2G-grade link', () => {
    // 0.4 MB at 60 kbit/s usable with 10% overhead: about 59 s
    expect(secondsOn2G(400000)).toBeCloseTo(58.7, 1);
  });

  it('formats sizes', () => {
    expect(formatBytes(1930000)).toBe('1.93 MB');
    expect(formatBytes(412345)).toBe('412 kB');
  });

  it('keeps the original when the browser cannot re-encode (jsdom has no canvas encoder)', async () => {
    const file = new File([new Uint8Array(1000)], 'eye.png', { type: 'image/png' });
    const out = await compressImage(file);
    expect(out.file).toBe(file);
    expect(out.compressed).toBe(false);
    expect(out.sentBytes).toBe(1000);
  });
});
