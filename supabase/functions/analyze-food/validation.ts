export const MAX_FOOD_PHOTO_BYTES = 10 * 1024 * 1024;

const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isSupportedFoodImage(bytes: Uint8Array, mimeType: string) {
  if (!supportedImageTypes.has(mimeType) || bytes.byteLength < 12 || bytes.byteLength > MAX_FOOD_PHOTO_BYTES) {
    return false;
  }

  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  return String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
}
