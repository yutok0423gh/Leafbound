import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputDirectory = join(root, "assets", "icons");

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const position = lengthSquared
    ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared))
    : 0;
  return Math.hypot(x - (x1 + position * dx), y - (y1 + position * dy));
}

function roundedRectangleContains(x, y, left, top, right, bottom, radius) {
  const centerX = Math.max(left + radius, Math.min(right - radius, x));
  const centerY = Math.max(top + radius, Math.min(bottom - radius, y));
  return Math.hypot(x - centerX, y - centerY) <= radius;
}

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const background = [230, 238, 235, 255];
  const ink = [24, 48, 44, 255];
  const plum = [141, 62, 87, 255];
  const stroke = size * 0.045;
  const bookSegments = [
    [0.28, 0.23, 0.28, 0.77],
    [0.72, 0.23, 0.72, 0.77],
    [0.28, 0.27, 0.39, 0.23],
    [0.39, 0.23, 0.50, 0.29],
    [0.50, 0.29, 0.61, 0.23],
    [0.61, 0.23, 0.72, 0.27],
    [0.28, 0.72, 0.39, 0.68],
    [0.39, 0.68, 0.50, 0.73],
    [0.50, 0.73, 0.61, 0.68],
    [0.61, 0.68, 0.72, 0.72],
    [0.50, 0.29, 0.50, 0.73]
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      let color = background;
      const onBook = bookSegments.some(([x1, y1, x2, y2]) => (
        distanceToSegment(nx, ny, x1, y1, x2, y2) <= stroke / size / 2
      ));
      if (onBook) color = ink;
      if (Math.hypot(nx - 0.5, ny - 0.5) <= 0.06) color = plum;
      const offset = (y * size + x) * 4;
      pixels.set(color, offset);
    }
  }

  // Add a quiet inset frame that remains inside maskable-icon safe bounds.
  const frameStroke = Math.max(1, Math.round(size * 0.008));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const insideOuter = roundedRectangleContains(x, y, size * 0.08, size * 0.08, size * 0.92, size * 0.92, size * 0.14);
      const insideInner = roundedRectangleContains(x, y, size * 0.08 + frameStroke, size * 0.08 + frameStroke, size * 0.92 - frameStroke, size * 0.92 - frameStroke, size * 0.14 - frameStroke);
      if (insideOuter && !insideInner) {
        const offset = (y * size + x) * 4;
        pixels.set([58, 91, 83, 255], offset);
      }
    }
  }

  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row += 1) {
    const outputOffset = row * (size * 4 + 1);
    scanlines[outputOffset] = 0;
    pixels.copy(scanlines, outputOffset + 1, row * size * 4, (row + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

await mkdir(outputDirectory, { recursive: true });
for (const size of [192, 512]) {
  await writeFile(join(outputDirectory, `leafbound-${size}.png`), createIcon(size));
}

