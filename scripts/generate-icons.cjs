#!/usr/bin/env node
/**
 * Generate PWA icons using pure Node.js
 * Creates simple solid-color PNG icons with the FieldSync brand color
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const ICONS_DIR = path.join(__dirname, '..', 'public', 'icons');

// FieldSync brand blue color: #3b82f6
const BRAND_COLOR = { r: 59, g: 130, b: 246 };
const WHITE = { r: 255, g: 255, b: 255 };

// CRC32 table for PNG chunks
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

function createPNG(size) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk - image header
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr.writeUInt8(8, 8);        // bit depth
  ihdr.writeUInt8(2, 9);        // color type (RGB)
  ihdr.writeUInt8(0, 10);       // compression
  ihdr.writeUInt8(0, 11);       // filter
  ihdr.writeUInt8(0, 12);       // interlace

  // Create image data - simple icon with rounded appearance
  // Each row has filter byte (0) + RGB data
  const rowBytes = 1 + size * 3;
  const rawData = Buffer.alloc(rowBytes * size);

  const center = size / 2;
  const outerRadius = size * 0.45;  // Blue circle
  const innerRadius = size * 0.25;  // White "F" area

  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // No filter

    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let color;
      if (dist <= outerRadius) {
        // Inside the blue circle
        // Draw a simple "F" shape in white
        const relX = (x - center) / outerRadius;
        const relY = (y - center) / outerRadius;

        // F shape boundaries (simplified)
        const isVerticalBar = relX >= -0.3 && relX <= -0.05 && relY >= -0.5 && relY <= 0.5;
        const isTopBar = relX >= -0.3 && relX <= 0.35 && relY >= -0.5 && relY <= -0.25;
        const isMiddleBar = relX >= -0.3 && relX <= 0.2 && relY >= -0.15 && relY <= 0.1;

        if (isVerticalBar || isTopBar || isMiddleBar) {
          color = WHITE;
        } else {
          color = BRAND_COLOR;
        }
      } else {
        // Transparent/white background
        color = WHITE;
      }

      rawData[pixelOffset] = color.r;
      rawData[pixelOffset + 1] = color.g;
      rawData[pixelOffset + 2] = color.b;
    }
  }

  // Compress with zlib (DEFLATE)
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // Create chunks
  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Ensure icons directory exists
if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
}

// Generate all icon sizes
console.log('Generating PWA icons...');
for (const size of ICON_SIZES) {
  const png = createPNG(size);
  const filename = `icon-${size}.png`;
  const filepath = path.join(ICONS_DIR, filename);
  fs.writeFileSync(filepath, png);
  console.log(`  Created ${filename} (${png.length} bytes)`);
}

console.log('Done! Icons created in public/icons/');
