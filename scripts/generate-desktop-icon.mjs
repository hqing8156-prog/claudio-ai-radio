import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(root, "build");
mkdirSync(buildDir, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function rgba(r, g, b, a = 255) {
  return [clamp(Math.round(r)), clamp(Math.round(g)), clamp(Math.round(b)), clamp(Math.round(a))];
}

function blend(dst, src) {
  const alpha = src[3] / 255;
  const inv = 1 - alpha;
  return [
    src[0] * alpha + dst[0] * inv,
    src[1] * alpha + dst[1] * inv,
    src[2] * alpha + dst[2] * inv,
    255
  ];
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function roundedRectMask(x, y, size, radius) {
  const px = Math.abs(x - size / 2) - size / 2 + radius;
  const py = Math.abs(y - size / 2) - size / 2 + radius;
  const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0)) + Math.min(Math.max(px, py), 0) - radius;
  return 1 - smoothstep(-1.5, 1.5, outside);
}

function drawIcon(size) {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.21875;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const mask = roundedRectMask(x + 0.5, y + 0.5, size, radius);
      if (mask <= 0) continue;

      const bgT = (x + y) / (size * 2);
      let color = rgba(mix(35, 3, bgT), mix(28, 3, bgT), mix(26, 3, bgT), 255 * mask);

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const discR = size * 0.346;
      if (d < discR) {
        const t = d / discR;
        const tone = mix(45, 0, t);
        color = rgba(tone, tone, tone, 255 * mask);
      }

      const groove1 = Math.abs(d - size * 0.283);
      const groove2 = Math.abs(d - size * 0.219);
      if (groove1 < size * 0.007 || groove2 < size * 0.007) {
        const tone = groove1 < groove2 ? 58 : 28;
        color = blend(color, rgba(tone, tone, tone, 130 * mask));
      }

      const labelR = size * 0.152;
      if (d < labelR) {
        const t = d / labelR;
        color = rgba(mix(255, 142, t), mix(99, 7, t), mix(110, 24, t), 255 * mask);
      }

      const holeR = size * 0.058;
      if (d < holeR) color = rgba(10, 10, 10, 255 * mask);

      const angle = Math.atan2(dy, dx);
      const leftArc = Math.abs(d - size * 0.36) < size * 0.02 && Math.abs(angle - Math.PI) < 0.68;
      const rightArc = Math.abs(d - size * 0.36) < size * 0.02 && Math.abs(angle) < 0.68;
      if (leftArc) color = blend(color, rgba(244, 208, 111, 230 * mask));
      if (rightArc) color = blend(color, rgba(255, 72, 86, 230 * mask));

      const shine = Math.abs(d - size * 0.29) < size * 0.012 && angle < -1.15 && angle > -2.18;
      if (shine) color = blend(color, rgba(255, 255, 255, 38 * mask));

      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = color[3];
    }
  }

  drawNote(data, size);
  return data;
}

function fillCircle(data, size, cx, cy, r, color) {
  const minX = Math.max(0, Math.floor(cx - r - 1));
  const maxX = Math.min(size - 1, Math.ceil(cx + r + 1));
  const minY = Math.max(0, Math.floor(cy - r - 1));
  const maxY = Math.min(size - 1, Math.ceil(cy + r + 1));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const alpha = 1 - smoothstep(r - 1.2, r + 1.2, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
      if (alpha <= 0) continue;
      const idx = (y * size + x) * 4;
      const next = blend([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]], [color[0], color[1], color[2], color[3] * alpha]);
      data[idx] = next[0];
      data[idx + 1] = next[1];
      data[idx + 2] = next[2];
      data[idx + 3] = next[3];
    }
  }
}

function fillRect(data, size, x0, y0, w, h, color) {
  const minX = Math.max(0, Math.floor(x0));
  const maxX = Math.min(size - 1, Math.ceil(x0 + w));
  const minY = Math.max(0, Math.floor(y0));
  const maxY = Math.min(size - 1, Math.ceil(y0 + h));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const idx = (y * size + x) * 4;
      const next = blend([data[idx], data[idx + 1], data[idx + 2], data[idx + 3]], color);
      data[idx] = next[0];
      data[idx + 1] = next[1];
      data[idx + 2] = next[2];
      data[idx + 3] = next[3];
    }
  }
}

function drawNote(data, size) {
  const c = rgba(244, 208, 111, 255);
  const s = size / 512;
  fillRect(data, size, 271 * s, 176 * s, 27 * s, 132 * s, c);
  fillRect(data, size, 271 * s, 176 * s, 75 * s, 22 * s, c);
  fillCircle(data, size, 235 * s, 324 * s, 39 * s, c);
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function pngFromRgba(width, height, rgbaData) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgbaData.slice(y * width * 4, (y + 1) * width * 4)).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function icoFromPngs(entries) {
  const headerSize = 6 + entries.length * 16;
  const buffers = [];
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  entries.forEach((entry, index) => {
    const base = 6 + index * 16;
    header[base] = entry.size >= 256 ? 0 : entry.size;
    header[base + 1] = entry.size >= 256 ? 0 : entry.size;
    header[base + 2] = 0;
    header[base + 3] = 0;
    header.writeUInt16LE(1, base + 4);
    header.writeUInt16LE(32, base + 6);
    header.writeUInt32LE(entry.png.length, base + 8);
    header.writeUInt32LE(offset, base + 12);
    offset += entry.png.length;
    buffers.push(entry.png);
  });
  return Buffer.concat([header, ...buffers]);
}

const entries = [];
for (const size of sizes) {
  const data = drawIcon(size);
  const png = pngFromRgba(size, size, data);
  writeFileSync(path.join(buildDir, `icon-${size}.png`), png);
  if (size === 256) writeFileSync(path.join(buildDir, "icon.png"), png);
  entries.push({ size, png });
}
writeFileSync(path.join(buildDir, "icon.ico"), icoFromPngs(entries));

console.log("Generated build/icon.ico and build/icon.png");
