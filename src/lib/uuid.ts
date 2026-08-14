/**
 * Cross-platform UUID v4 generator.
 *
 * Expo Go does not polyfill `crypto.randomUUID()` on all platforms.
 * Expo Modules Core exposes `expo.uuidv4()` on native. Browsers normally
 * expose `crypto.randomUUID()`. The final fallback is sufficient for unique,
 * non-secret Storage object names; `upsert: false` still prevents collisions.
 */
export function uuid(): string {
  const nativeUuid = (globalThis as typeof globalThis & {
    expo?: { uuidv4?: () => string };
  }).expo?.uuidv4?.();
  if (nativeUuid) return nativeUuid;

  const browserUuid = globalThis.crypto?.randomUUID?.();
  if (browserUuid) return browserUuid;

  let timestamp = Date.now();
  let highResolution = globalThis.performance?.now?.() ?? 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    let random = Math.random() * 16;
    if (timestamp > 0) {
      random = (timestamp + random) % 16;
      timestamp = Math.floor(timestamp / 16);
    } else {
      random = (highResolution + random) % 16;
      highResolution = Math.floor(highResolution / 16);
    }
    const value = character === 'x' ? random : (Math.floor(random) & 0x3) | 0x8;
    return Math.floor(value).toString(16);
  });
}
