#!/usr/bin/env node
/**
 * Generate FieldSync brand icons using pure Node.js (no dependencies).
 *
 * Renders the FieldSync mark — a construction hard hat on the brand-blue
 * rounded square (mirrors src/components/ui/LogoMark.jsx) — and writes:
 *   - public/icons/icon-{72..512}.png  (PWA icons, transparent corners)
 *   - public/apple-touch-icon.png      (180px, full-bleed background)
 *   - public/favicon.ico               (16/32/48 PNG-compressed ICO)
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');

// Brand palette (matches src/styles/base/variables.css)
const BRAND_BLUE = { r: 0x1c, g: 0x4e, b: 0x80 };  // --color-primary #1C4E80
const HAT_AMBER = { r: 0xf5, g: 0x9e, b: 0x0b };   // --color-warning #F59E0B
const HAT_AMBER_LIGHT = { r: 0xfb, g: 0xbf, b: 0x24 }; // amber-400 #FBBF24

// ---------------------------------------------------------------------------
// Geometry in a 64x64 design space (mirrors the LogoMark SVG)
// ---------------------------------------------------------------------------

function inRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const nx = Math.min(Math.max(px, x + r), x + w - r);
  const ny = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - nx;
  const dy = py - ny;
  return dx * dx + dy * dy <= r * r;
}

// Sample the mark at design-space point (px, py).
// fullBleed=true paints the background over the whole canvas (apple-touch-icon).
function sampleMark(px, py, fullBleed) {
  let color = null;

  if (fullBleed || inRoundedRect(px, py, 0, 0, 64, 64, 14)) {
    color = BRAND_BLUE;
  } else {
    return null; // transparent corner
  }

  // Hard hat dome: half-disc, center (32,40), radius 15
  const ddx = px - 32;
  const ddy = py - 40;
  if (py <= 40 && ddx * ddx + ddy * ddy <= 15 * 15) color = HAT_AMBER;

  // Top ridge knob
  if (inRoundedRect(px, py, 28, 17, 8, 12, 3)) color = HAT_AMBER;

  // Front ribs (only visible where they overlap the dome area)
  if (inRoundedRect(px, py, 22, 31, 3, 9, 1.5)) color = HAT_AMBER_LIGHT;
  if (inRoundedRect(px, py, 39, 31, 3, 9, 1.5)) color = HAT_AMBER_LIGHT;

  // Brim
  if (inRoundedRect(px, py, 11, 40, 42, 6, 3)) color = HAT_AMBER_LIGHT;

  return color;
}

// Render an RGBA pixel buffer at `size`, supersampled 4x4 per pixel.
function renderMark(size, fullBleed) {
  const SS = 4;
  const scale = 64 / size;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) * scale;
          const py = (y + (sy + 0.5) / SS) * scale;
          const c = sampleMark(px, py, fullBleed);
          if (c) {
            r += c.r;
            g += c.g;
            b += c.b;
            a += 255;
          }
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      const alpha = a / n;
      // Un-premultiply against the sample average so edges stay clean
      const cov = alpha > 0 ? a / 255 : 1;
      pixels[o] = Math.round(r / cov);
      pixels[o + 1] = Math.round(g / cov);
      pixels[o + 2] = Math.round(b / cov);
      pixels[o + 3] = Math.round(alpha);
    }
  }
  return pixels;
}

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const crcData = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData));

  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePNG(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr.writeUInt8(8, 8);        // bit depth
  ihdr.writeUInt8(6, 9);        // color type (RGBA)
  ihdr.writeUInt8(0, 10);       // compression
  ihdr.writeUInt8(0, 11);       // filter
  ihdr.writeUInt8(0, 12);       // interlace

  // Raw scanlines: filter byte 0 + RGBA row
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0;
    pixels.copy(raw, y * rowBytes + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------------------------------------------------------------------------
// ICO encoding (PNG-compressed entries)
// ---------------------------------------------------------------------------

function encodeICO(entries) {
  // entries: [{ size, png }]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);

  const dirSize = 16 * entries.length;
  let offset = 6 + dirSize;
  const dirs = [];
  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, 1); // height
    dir.writeUInt8(0, 2);  // palette count
    dir.writeUInt8(0, 3);  // reserved
    dir.writeUInt16LE(1, 4);  // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += png.length;
    dirs.push(dir);
  }

  return Buffer.concat([header, ...dirs, ...entries.map(e => e.png)]);
}

// ---------------------------------------------------------------------------
// Generate everything
// ---------------------------------------------------------------------------

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

console.log('Generating FieldSync brand icons...');

for (const size of ICON_SIZES) {
  const png = encodePNG(size, renderMark(size, false));
  const filename = `icon-${size}.png`;
  fs.writeFileSync(path.join(ICONS_DIR, filename), png);
  console.log(`  Created icons/${filename} (${png.length} bytes)`);
}

// Apple touch icon: 180px, full-bleed background (iOS applies its own mask)
const appleTouch = encodePNG(180, renderMark(180, true));
fs.writeFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'), appleTouch);
console.log(`  Created apple-touch-icon.png (${appleTouch.length} bytes)`);

// favicon.ico with 16/32/48 PNG entries
const icoEntries = [16, 32, 48].map(size => ({
  size,
  png: encodePNG(size, renderMark(size, false))
}));
const ico = encodeICO(icoEntries);
fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), ico);
console.log(`  Created favicon.ico (${ico.length} bytes)`);

console.log('Done!');
