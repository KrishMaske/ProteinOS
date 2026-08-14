import { renderPdfIllustrationCrops } from './pdf-images.ts';

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

async function deflate(source: Uint8Array) {
  const stream = new Blob([source]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function onePageRasterPdf() {
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
  const image = await deflate(predicted);
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

function parsePng(png: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => png[index] === value)) throw new Error('Invalid PNG signature');
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  let offset = signature.length;
  while (offset < png.byteLength) {
    const view = new DataView(png.buffer, png.byteOffset + offset);
    const length = view.getUint32(0);
    const typeBytes = png.slice(offset + 4, offset + 8);
    const data = png.slice(offset + 8, offset + 8 + length);
    let crc = 0xffffffff;
    for (const part of [typeBytes, data]) {
      for (const byte of part) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
          crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
        }
      }
    }
    if (view.getUint32(8 + length) !== ((crc ^ 0xffffffff) >>> 0)) throw new Error('Invalid PNG chunk CRC');
    chunks.push({ type: new TextDecoder().decode(typeBytes), data });
    offset += length + 12;
  }
  return chunks;
}

Deno.test('extracts and native-deflate PNG-encodes a crop from an image-backed PDF page', async () => {
  const rendered = await renderPdfIllustrationCrops(await onePageRasterPdf(), [{
    exerciseKey: 'slot-01-exercise-01',
    pageNumber: 1,
    crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  }]);
  const png = rendered.images.get('slot-01-exercise-01');
  if (!png) throw new Error(rendered.failures.get('slot-01-exercise-01') ?? 'No crop returned');
  const chunks = parsePng(png);
  if (chunks.map(({ type }) => type).join(',') !== 'IHDR,IDAT,IEND') throw new Error('Unexpected PNG chunk layout');
  const header = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset);
  if (header.getUint32(0) !== 22 || header.getUint32(4) !== 22 || chunks[0].data[9] !== 2) {
    throw new Error('PNG crop dimensions or color type are incorrect');
  }
  const scanlines = new Uint8Array(await new Response(
    new Blob([chunks[1].data]).stream().pipeThrough(new DecompressionStream('deflate')),
  ).arrayBuffer());
  if (scanlines.byteLength !== 22 * ((22 * 3) + 1)) throw new Error('PNG scanline byte count is invalid');
  if (scanlines[0] !== 0 || scanlines[1] !== 40 || scanlines[2] !== 40 || scanlines[3] !== 160) {
    throw new Error('PNG crop did not retain the expected source pixels');
  }
});

Deno.test('unsupported vector PDFs fall back without throwing', async () => {
  const vector = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Page /MediaBox [0 0 100 100] >>\nendobj\n%%EOF');
  const rendered = await renderPdfIllustrationCrops(vector, [{
    exerciseKey: 'vector-exercise',
    pageNumber: 1,
    crop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  }]);
  if (rendered.images.size !== 0 || !rendered.failures.has('vector-exercise')) {
    throw new Error('Unsupported PDF should produce a safe source-image fallback');
  }
});
