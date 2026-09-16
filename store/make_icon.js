'use strict';
/**
 * Generates the 1024x1024 App Store icon. No dependencies, no image library.
 *
 *   node store/make_icon.js
 *
 * Writes an 8-bit RGB PNG with NO alpha channel, which is what App Store Connect
 * requires: an icon carrying transparency is rejected. iOS applies the rounded
 * corner mask itself, so the artwork is a plain full-bleed square.
 *
 * The mark is a written record: lines of text on a page, one of them confirmed.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024;
const NAVY = [0x1f, 0x38, 0x64];   // matches the document house style
const PAPER = [0xf4, 0xf1, 0xe9];
const BLUE = [0x2e, 0x74, 0xb5];
const GOLD = [0xd9, 0x9d, 0x32];

// --- canvas ---------------------------------------------------------------
const px = Buffer.alloc(SIZE * SIZE * 3);
const fill = (c) => { for (let i = 0; i < SIZE * SIZE; i++) px.set(c, i * 3); };
const rect = (x, y, w, h, c) => {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(SIZE, Math.round(x + w)), y1 = Math.min(SIZE, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * SIZE * 3;
    for (let xx = x0; xx < x1; xx++) px.set(c, row + xx * 3);
  }
};

fill(NAVY);

// The page.
const PAGE_X = 232, PAGE_Y = 168, PAGE_W = 560, PAGE_H = 688;
rect(PAGE_X, PAGE_Y, PAGE_W, PAGE_H, PAPER);

// Lines of writing. The fourth is gold: the one that has been confirmed.
const LINE_X = PAGE_X + 72;
const LINE_W = PAGE_W - 144;
const widths = [1.0, 0.82, 0.94, 0.66, 0.88, 0.74, 0.90, 0.58];
let y = PAGE_Y + 108;
widths.forEach((w, i) => {
  const confirmed = i === 3;
  rect(LINE_X, y, LINE_W * w, confirmed ? 34 : 26, confirmed ? GOLD : BLUE);
  y += confirmed ? 76 : 68;
});

// --- PNG encoding ---------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 2;   // color type 2 = truecolor RGB, no alpha
ihdr[10] = 0;  // deflate
ihdr[11] = 0;  // adaptive filtering
ihdr[12] = 0;  // no interlace

// One filter byte (0 = None) per scanline.
const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
for (let yy = 0; yy < SIZE; yy++) {
  const dst = yy * (1 + SIZE * 3);
  raw[dst] = 0;
  px.copy(raw, dst + 1, yy * SIZE * 3, (yy + 1) * SIZE * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'ios', 'MyCareer', 'Assets.xcassets', 'AppIcon.appiconset', 'icon-1024.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`${out}  ${SIZE}x${SIZE}  ${(png.length / 1024).toFixed(1)} KB  RGB, no alpha`);
