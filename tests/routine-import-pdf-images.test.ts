import { deflateSync, inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { renderPdfIllustrationCrops } from '../supabase/functions/import-workout-file/pdf-images';

function bytes(...parts: (string | Uint8Array)[]) {
  const encoded = parts.map((part) => typeof part === 'string' ? new TextEncoder().encode(part) : part);
  const result = new Uint8Array(encoded.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of encoded) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function onePageRasterPdf() {
  const width = 32;
  const height = 32;
  const predicted = new Uint8Array((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (width * 3 + 1);
    predicted[rowStart] = 0;
    for (let column = 0; column < width; column += 1) {
      const pixel = rowStart + 1 + column * 3;
      predicted[pixel] = column * 8;
      predicted[pixel + 1] = row * 8;
      predicted[pixel + 2] = 160;
    }
  }
  const image = new Uint8Array(deflateSync(predicted));
  const content = 'q\n32 0 0 32 4 4 cm\n/Im1 Do\nQ\n';
  return bytes(
    '%PDF-1.4\n',
    '1 0 obj\n<< /Type /Page /MediaBox [0 0 40 40] /Contents 3 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 10 /Colors 3 /Columns ${width} >> /Length ${image.byteLength} >>\nstream\n`,
    image,
    '\nendstream\nendobj\n',
    `3 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n%%EOF`,
  );
}

function oversizedPngCropPdf() {
  const width = 1_400;
  const height = 1_400;
  const rowBytes = width * 3;
  const predicted = new Uint8Array((rowBytes + 1) * height);
  let state = 0x9e3779b9;
  for (let row = 0; row < height; row += 1) {
    const rowStart = row * (rowBytes + 1);
    for (let column = 0; column < rowBytes; column += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      predicted[rowStart + column + 1] = state >>> 24;
    }
  }
  const image = new Uint8Array(deflateSync(predicted, { level: 1 }));
  const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im1 Do\nQ\n`;
  return bytes(
    '%PDF-1.4\n',
    `1 0 obj\n<< /Type /Page /MediaBox [0 0 ${width} ${height}] /Contents 3 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 10 /Colors 3 /Columns ${width} >> /Length ${image.byteLength} >>\nstream\n`,
    image,
    '\nendstream\nendobj\n',
    `3 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n%%EOF`,
  );
}

function parsePng(png: Uint8Array) {
  expect(png.slice(0, 8)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  let offset = 8;
  while (offset < png.byteLength) {
    const view = new DataView(png.buffer, png.byteOffset + offset);
    const length = view.getUint32(0);
    const typeBytes = png.slice(offset + 4, offset + 8);
    const data = png.slice(offset + 8, offset + 8 + length);
    let crc = 0xffffffff;
    for (const byte of new Uint8Array([...typeBytes, ...data])) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
    }
    expect(view.getUint32(8 + length)).toBe((crc ^ 0xffffffff) >>> 0);
    chunks.push({ type: new TextDecoder().decode(typeBytes), data });
    offset += length + 12;
  }
  return chunks;
}

describe('workout PDF source-image extraction', () => {
  it('extracts and native-deflate PNG-encodes the requested crop', async () => {
    const rendered = await renderPdfIllustrationCrops(onePageRasterPdf(), [{
      exerciseKey: 'slot-01-exercise-01',
      pageNumber: 1,
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    }]);
    const png = rendered.images.get('slot-01-exercise-01');
    expect(rendered.failures.size).toBe(0);
    expect(png).toBeDefined();
    const chunks = parsePng(png!);
    expect(chunks.map(({ type }) => type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    const header = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset);
    expect([header.getUint32(0), header.getUint32(4), chunks[0].data[9]]).toEqual([22, 22, 2]);

    const pixels = new Uint8Array(inflateSync(chunks[1].data));
    expect(pixels.byteLength).toBe(22 * ((22 * 3) + 1));
    expect(pixels.slice(0, 4)).toEqual(new Uint8Array([0, 40, 40, 160]));
    expect(pixels.at(-3)).toBe(208);
    expect(pixels.at(-2)).toBe(208);
    expect(pixels.at(-1)).toBe(160);
  });

  it('falls back safely for a vector-only PDF', async () => {
    const vector = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Page /MediaBox [0 0 100 100] >>\nendobj\n%%EOF');
    const rendered = await renderPdfIllustrationCrops(vector, [{
      exerciseKey: 'vector-exercise',
      pageNumber: 1,
      crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    }]);
    expect(rendered.images.size).toBe(0);
    expect(rendered.failures.has('vector-exercise')).toBe(true);
  });

  it('rejects a PNG crop that would exceed the 5 MiB staged-image cap', async () => {
    const rendered = await renderPdfIllustrationCrops(oversizedPngCropPdf(), [{
      exerciseKey: 'oversized-crop',
      pageNumber: 1,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    }]);
    expect(rendered.images.size).toBe(0);
    expect(rendered.failures.has('oversized-crop')).toBe(true);
  }, 10_000);
});
