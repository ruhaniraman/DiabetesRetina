/**
 * Low-bandwidth mode: shrink a fundus photo in the browser before it is uploaded, for primary health centres on 2G-grade links.
 * The longest side is capped at MAX_SIDE px and the photo re-encoded as JPEG. The effect on grading was measured
 * (validation/results/compression.md): the referral decision is unchanged at these settings.
 */
export const MAX_SIDE = 1800;
export const JPEG_QUALITY = 0.85;
// Stage 5's 2G-grade link (stage5_simulink/districtParameters.m): 0.1 Mbps nominal, 60% usable, 10% protocol overhead
export const LINK_KBPS = 100 * 0.6;
export const PROTOCOL_OVERHEAD = 1.1;

/** Seconds to send `bytes` over the 2G-grade link. */
export const secondsOn2G = (bytes) => (bytes * 8 * PROTOCOL_OVERHEAD) / (LINK_KBPS * 1000);

export const formatBytes = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);

/** Output size (w, h) with the longest side capped at maxSide; never enlarges. */
export function targetSize(width, height, maxSide = MAX_SIDE) {
  const s = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * s), height: Math.round(height * s) };
}

/**
 * Resolves to { file, originalBytes, sentBytes, compressed }. The original is kept when the browser cannot decode or encode the
 * photo, or when the compressed copy would not be smaller.
 */
export async function compressImage(file, { maxSide = MAX_SIDE, quality = JPEG_QUALITY } = {}) {
  const keep = { file, originalBytes: file.size, sentBytes: file.size, compressed: false };
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return keep;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = targetSize(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return keep;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return keep;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([blob], name, { type: 'image/jpeg' }), originalBytes: file.size, sentBytes: blob.size, compressed: true };
  } catch {
    return keep;
  }
}
