import { normalizedCropToPixels } from './image-crop.ts';
import { MAX_STAGED_IMAGE_BYTES } from './limits.ts';
import type { NormalizedImageCrop } from './review.ts';

const MAX_PDF_OBJECTS = 4_000;
const MAX_PAGE_COUNT = 1_000;
const MAX_CONTENT_BYTES = 128 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;

export type PdfCropRequest = {
  exerciseKey: string;
  pageNumber: number;
  crop: NormalizedImageCrop;
};

type PdfObject = {
  header: string;
  start: number;
  stream: Uint8Array | null;
};

type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

type RasterPage = {
  image: PdfObject;
  matrix: Matrix;
  mediaBox: { x: number; y: number; width: number; height: number };
};

type DecodedRaster = {
  data: Uint8Array;
  width: number;
  height: number;
  colors: 1 | 3;
};

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IHDR = new Uint8Array([0x49, 0x48, 0x44, 0x52]);
const PNG_IDAT = new Uint8Array([0x49, 0x44, 0x41, 0x54]);
const PNG_IEND = new Uint8Array([0x49, 0x45, 0x4e, 0x44]);
const PNG_FIXED_BYTES = PNG_SIGNATURE.byteLength + 25 + 12 + 12;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < table.length; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[value] = crc >>> 0;
  }
  return table;
})();

const numberPattern = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';

function integerValue(header: string, name: string) {
  const match = header.match(new RegExp(`/${name}\\s+(\\d+)\\b`));
  return match ? Number(match[1]) : null;
}

function parsePdfObjects(bytes: Uint8Array) {
  const source = new TextDecoder('latin1').decode(bytes);
  const matches = [...source.matchAll(/(?:^|[\r\n])(\d+)\s+(\d+)\s+obj\b/g)];
  if (!matches.length || matches.length > MAX_PDF_OBJECTS) throw new Error('Unsupported PDF object layout');

  const objects: PdfObject[] = [];
  for (const match of matches) {
    const objectToken = `${match[1]} ${match[2]} obj`;
    const start = match.index! + match[0].lastIndexOf(objectToken);
    const bounded = source.slice(start, Math.min(source.length, start + 16_384));
    const streamMatch = /\bstream\r?\n/.exec(bounded);
    const endObject = bounded.indexOf('endobj');
    const headerEnd = streamMatch?.index ?? endObject;
    if (headerEnd < 0) continue;
    const header = bounded.slice(0, headerEnd);
    let stream: Uint8Array | null = null;
    if (streamMatch) {
      const length = integerValue(header, 'Length');
      const streamStart = start + streamMatch.index + streamMatch[0].length;
      if (length !== null && length >= 0 && streamStart + length <= bytes.byteLength) {
        stream = bytes.subarray(streamStart, streamStart + length);
      }
    }
    objects.push({ header, start, stream });
  }
  return objects;
}

async function inflateWithLimit(source: Uint8Array, maximumBytes: number) {
  const reader = new Blob([source])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error('PDF stream expands beyond its validated size');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function decodedStream(object: PdfObject, maximumBytes: number) {
  if (!object.stream) throw new Error('PDF stream is missing');
  if (!/\/Filter\s*\//.test(object.header)) {
    if (object.stream.byteLength > maximumBytes) throw new Error('PDF stream is too large');
    return object.stream;
  }
  if (!/\/Filter\s*\/FlateDecode\b/.test(object.header)) throw new Error('Unsupported PDF stream filter');
  return inflateWithLimit(object.stream, maximumBytes);
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: (left.a * right.a) + (left.c * right.b),
    b: (left.b * right.a) + (left.d * right.b),
    c: (left.a * right.c) + (left.c * right.d),
    d: (left.b * right.c) + (left.d * right.d),
    e: (left.a * right.e) + (left.c * right.f) + left.e,
    f: (left.b * right.e) + (left.d * right.f) + left.f,
  };
}

function imageMatrix(content: string) {
  const tokens = content.match(new RegExp(`/${'[^\\s]+'}|${numberPattern}|[A-Za-z]+`, 'g')) ?? [];
  const identity: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: Matrix[] = [];
  const numbers: number[] = [];
  let current = identity;
  let imageName: string | null = null;

  for (const token of tokens) {
    const number = Number(token);
    if (Number.isFinite(number)) {
      numbers.push(number);
      continue;
    }
    if (token.startsWith('/')) {
      imageName = token;
      numbers.length = 0;
      continue;
    }
    if (token === 'q') {
      stack.push({ ...current });
    } else if (token === 'Q') {
      current = stack.pop() ?? identity;
    } else if (token === 'cm' && numbers.length >= 6) {
      const values = numbers.slice(-6);
      current = multiply(current, {
        a: values[0], b: values[1], c: values[2],
        d: values[3], e: values[4], f: values[5],
      });
    } else if (token === 'Do' && imageName) {
      return current;
    }
    numbers.length = 0;
  }
  return null;
}

function mediaBox(header: string) {
  const match = header.match(new RegExp(
    `/MediaBox\\s*\\[\\s*(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s+(${numberPattern})\\s*\\]`,
  ));
  if (!match) return null;
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  const width = x2 - x1;
  const height = y2 - y1;
  return width > 0 && height > 0 ? { x: x1, y: y1, width, height } : null;
}

async function rasterPages(bytes: Uint8Array) {
  const objects = parsePdfObjects(bytes);
  const pageObjects = objects
    .filter((object) => /\/Type\s*\/Page\b/.test(object.header))
    .sort((left, right) => left.start - right.start);
  if (!pageObjects.length || pageObjects.length > MAX_PAGE_COUNT) throw new Error('Unsupported PDF page layout');

  const pages: Array<RasterPage | null> = [];
  for (let pageIndex = 0; pageIndex < pageObjects.length; pageIndex += 1) {
    const page = pageObjects[pageIndex];
    const pageEnd = pageObjects[pageIndex + 1]?.start ?? bytes.byteLength;
    const pageBox = mediaBox(page.header);
    const pageSegment = objects.filter((object) => object.start > page.start && object.start < pageEnd);
    const images = pageSegment.filter((object) => /\/Subtype\s*\/Image\b/.test(object.header) && object.stream);
    if (!pageBox || images.length !== 1) {
      pages.push(null);
      continue;
    }

    let matrix: Matrix | null = null;
    const contentStreams = pageSegment.filter((object) => (
      object.stream
      && object !== images[0]
      && object.stream.byteLength <= MAX_CONTENT_BYTES
    ));
    for (const contentObject of contentStreams) {
      try {
        const content = new TextDecoder().decode(await decodedStream(contentObject, MAX_CONTENT_BYTES));
        matrix = imageMatrix(content);
        if (matrix) break;
      } catch {
        // Other small streams can be metadata, object maps, or cross references.
      }
    }
    if (!matrix || matrix.a <= 0 || matrix.d <= 0 || Math.abs(matrix.b) > 0.001 || Math.abs(matrix.c) > 0.001) {
      pages.push(null);
      continue;
    }
    pages.push({ image: images[0], matrix, mediaBox: pageBox });
  }
  return pages;
}

function paeth(left: number, above: number, upperLeft: number) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const diagonalDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= diagonalDistance
    ? left
    : aboveDistance <= diagonalDistance ? above : upperLeft;
}

function undoPngPrediction(
  encoded: Uint8Array,
  width: number,
  height: number,
  colors: number,
  predictor: number,
) {
  const rowBytes = width * colors;
  if (predictor === 1) {
    if (encoded.byteLength !== rowBytes * height) throw new Error('PDF image byte count is invalid');
    return encoded;
  }
  if (predictor < 10 || predictor > 15 || encoded.byteLength !== (rowBytes + 1) * height) {
    throw new Error('Unsupported PDF image predictor');
  }

  const output = new Uint8Array(rowBytes * height);
  for (let row = 0; row < height; row += 1) {
    const inputOffset = row * (rowBytes + 1);
    const outputOffset = row * rowBytes;
    const filter = encoded[inputOffset];
    if (filter > 4) throw new Error('Unsupported PNG prediction filter');
    if (filter === 0) {
      output.set(encoded.subarray(inputOffset + 1, inputOffset + rowBytes + 1), outputOffset);
      continue;
    }
    for (let column = 0; column < rowBytes; column += 1) {
      const left = column >= colors ? output[outputOffset + column - colors] : 0;
      const above = row > 0 ? output[outputOffset + column - rowBytes] : 0;
      const upperLeft = row > 0 && column >= colors
        ? output[outputOffset + column - rowBytes - colors]
        : 0;
      const prediction = filter === 1
        ? left
        : filter === 2
          ? above
          : filter === 3
            ? Math.floor((left + above) / 2)
            : filter === 4 ? paeth(left, above, upperLeft) : 0;
      output[outputOffset + column] = (encoded[inputOffset + column + 1] + prediction) & 0xff;
    }
  }
  return output;
}

async function imageRaster(object: PdfObject): Promise<DecodedRaster> {
  const width = integerValue(object.header, 'Width');
  const height = integerValue(object.header, 'Height');
  const bits = integerValue(object.header, 'BitsPerComponent');
  const predictor = integerValue(object.header, 'Predictor') ?? 1;
  const colors = integerValue(object.header, 'Colors')
    ?? (/\/ColorSpace\s*\/DeviceGray\b/.test(object.header) ? 1 : 3);
  const columns = integerValue(object.header, 'Columns') ?? width;
  if (!width || !height || bits !== 8 || columns !== width || ![1, 3].includes(colors)) {
    throw new Error('Unsupported PDF raster format');
  }
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('PDF page image is too large');
  if (colors === 1 && !/\/ColorSpace\s*\/DeviceGray\b/.test(object.header)) throw new Error('Invalid PDF grayscale image');
  if (colors === 3 && !/\/ColorSpace\s*\/DeviceRGB\b/.test(object.header)) throw new Error('Invalid PDF RGB image');

  const maximumDecodedBytes = (width * colors + (predictor === 1 ? 0 : 1)) * height;
  const encoded = await decodedStream(object, maximumDecodedBytes);
  const pixels = undoPngPrediction(encoded, width, height, colors, predictor);
  return { data: pixels, width, height, colors: colors as 1 | 3 };
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function crc32(parts: Uint8Array[]) {
  let crc = 0xffffffff;
  for (const part of parts) {
    for (let index = 0; index < part.byteLength; index += 1) {
      crc = CRC_TABLE[(crc ^ part[index]) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: Uint8Array, data: Uint8Array) {
  const chunk = new Uint8Array(data.byteLength + 12);
  writeUint32(chunk, 0, data.byteLength);
  chunk.set(type, 4);
  chunk.set(data, 8);
  writeUint32(chunk, data.byteLength + 8, crc32([type, data]));
  return chunk;
}

async function deflateCropRows(
  raster: DecodedRaster,
  crop: ReturnType<typeof normalizedCropToPixels>,
  maximumBytes: number,
) {
  const sampleBytes = crop.width * raster.colors;
  let row = 0;
  const rows = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (row >= crop.height) {
        controller.close();
        return;
      }
      const scanline = new Uint8Array(sampleBytes + 1);
      const sourceOffset = (((crop.y + row) * raster.width) + crop.x) * raster.colors;
      scanline.set(raster.data.subarray(sourceOffset, sourceOffset + sampleBytes), 1);
      controller.enqueue(scanline);
      row += 1;
    },
  });
  const reader = rows.pipeThrough(new CompressionStream('deflate')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel('PNG exceeds its staged-image limit');
      throw new Error('Staged image exceeds 5 MB');
    }
    chunks.push(value);
  }
  const compressed = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return compressed;
}

async function encodePngCrop(raster: DecodedRaster, crop: NormalizedImageCrop) {
  const pixels = normalizedCropToPixels(crop, raster.width, raster.height);
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, pixels.width);
  writeUint32(ihdr, 4, pixels.height);
  ihdr[8] = 8;
  ihdr[9] = raster.colors === 1 ? 0 : 2;
  const compressed = await deflateCropRows(
    raster,
    pixels,
    MAX_STAGED_IMAGE_BYTES - PNG_FIXED_BYTES,
  );
  const header = pngChunk(PNG_IHDR, ihdr);
  const image = pngChunk(PNG_IDAT, compressed);
  const end = pngChunk(PNG_IEND, new Uint8Array());
  const png = new Uint8Array(PNG_SIGNATURE.byteLength + header.byteLength + image.byteLength + end.byteLength);
  let offset = 0;
  for (const part of [PNG_SIGNATURE, header, image, end]) {
    png.set(part, offset);
    offset += part.byteLength;
  }
  if (png.byteLength > MAX_STAGED_IMAGE_BYTES) throw new Error('Staged image exceeds 5 MB');
  return png;
}

function cropInImage(page: RasterPage, crop: NormalizedImageCrop): NormalizedImageCrop {
  const imageLeft = page.matrix.e - page.mediaBox.x;
  const imageBottom = page.matrix.f - page.mediaBox.y;
  const imageTop = page.mediaBox.height - imageBottom - page.matrix.d;
  return {
    x: ((crop.x * page.mediaBox.width) - imageLeft) / page.matrix.a,
    y: ((crop.y * page.mediaBox.height) - imageTop) / page.matrix.d,
    width: (crop.width * page.mediaBox.width) / page.matrix.a,
    height: (crop.height * page.mediaBox.height) / page.matrix.d,
  };
}

/**
 * Extracts exercise crops without executing PDF code or fetching a renderer.
 * It supports image-backed PDFs with one full-page FlateDecode raster per page,
 * including the user's gym.pdf. Other PDF layouts safely fall back to a
 * title/details-only review instead of blocking the import.
 */
export async function renderPdfIllustrationCrops(
  pdfBytes: Uint8Array,
  requests: PdfCropRequest[],
) {
  const images = new Map<string, Uint8Array>();
  const failures = new Map<string, string>();
  if (!requests.length) return { images, failures };

  let pages: Array<RasterPage | null>;
  try {
    pages = await rasterPages(pdfBytes);
  } catch {
    for (const request of requests) {
      failures.set(request.exerciseKey, 'This PDF does not expose a safely extractable page image.');
    }
    return { images, failures };
  }

  const byPage = new Map<number, PdfCropRequest[]>();
  for (const request of requests) {
    const group = byPage.get(request.pageNumber) ?? [];
    group.push(request);
    byPage.set(request.pageNumber, group);
  }

  for (const [pageNumber, pageRequests] of byPage) {
    const page = pages[pageNumber - 1];
    if (!page) {
      for (const request of pageRequests) failures.set(request.exerciseKey, 'The referenced PDF page is not an extractable full-page image.');
      continue;
    }
    try {
      const decoded = await imageRaster(page.image);
      for (const request of pageRequests) {
        try {
          const encoded = await encodePngCrop(decoded, cropInImage(page, request.crop));
          images.set(request.exerciseKey, encoded);
        } catch {
          failures.set(request.exerciseKey, 'The exercise illustration could not be cropped from its PDF page.');
        }
      }
    } catch {
      for (const request of pageRequests) failures.set(request.exerciseKey, 'The referenced PDF page image could not be decoded.');
    }
  }
  return { images, failures };
}
