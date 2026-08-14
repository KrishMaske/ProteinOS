import type { NormalizedImageCrop } from './review.ts';

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizedCropToPixels(
  crop: NormalizedImageCrop,
  imageWidth: number,
  imageHeight: number,
  padding = 0.02,
): PixelCrop {
  if (!Number.isInteger(imageWidth) || !Number.isInteger(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('Image dimensions must be positive integers');
  }
  const left = clamp(crop.x - padding, 0, 1);
  const top = clamp(crop.y - padding, 0, 1);
  const right = clamp(crop.x + crop.width + padding, 0, 1);
  const bottom = clamp(crop.y + crop.height + padding, 0, 1);
  const x = Math.floor(left * imageWidth);
  const y = Math.floor(top * imageHeight);
  const rightPixel = Math.ceil(right * imageWidth);
  const bottomPixel = Math.ceil(bottom * imageHeight);
  const width = rightPixel - x;
  const height = bottomPixel - y;
  if (width < 2 || height < 2) throw new Error('Image crop is too small to render');
  return { x, y, width, height };
}

export function cropRgba(
  source: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  crop: NormalizedImageCrop,
) {
  const expectedBytes = imageWidth * imageHeight * 4;
  if (source.byteLength !== expectedBytes) throw new Error('Rendered PDF page has an invalid RGBA buffer');
  const pixels = normalizedCropToPixels(crop, imageWidth, imageHeight);
  const output = new Uint8Array(pixels.width * pixels.height * 4);
  const sourceStride = imageWidth * 4;
  const outputStride = pixels.width * 4;
  for (let row = 0; row < pixels.height; row += 1) {
    const sourceOffset = ((pixels.y + row) * sourceStride) + (pixels.x * 4);
    output.set(source.subarray(sourceOffset, sourceOffset + outputStride), row * outputStride);
  }
  return { data: output, width: pixels.width, height: pixels.height };
}
