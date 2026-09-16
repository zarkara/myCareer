'use strict';
/**
 * Packages share/mycareer/ into mycareer.zip for upload to Claude.
 *
 *   node share/make_zip.js
 *
 * Written by hand rather than shelled out to Compress-Archive, which writes Windows
 * backslash separators into entry names. The ZIP spec requires forward slashes, and an
 * uploader that follows the spec will not find the skill folder in such an archive.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, 'mycareer');
const dest = path.join(__dirname, 'mycareer.zip');

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(full, rel));
    else out.push({ full, rel });
  }
  return out;
}

// Fixed timestamp so the archive is byte-identical between builds.
const DOS_TIME = 0;           // 00:00:00
const DOS_DATE = (2026 - 1980) << 9 | (1 << 5) | 1;   // 2026-01-01

const files = walk(root).map((f) => ({ ...f, rel: `mycareer/${f.rel}` }));
if (!files.length) throw new Error(`nothing to package in ${root}`);

const locals = [];
const central = [];
let offset = 0;

for (const f of files) {
  const name = Buffer.from(f.rel, 'utf8');
  const data = fs.readFileSync(f.full);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  // Stored beats deflated for tiny files; pick whichever is smaller.
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;
  const sum = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0, 6);             // flags
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);            // extra length
  locals.push(local, name, body);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);              // version made by
  dir.writeUInt16LE(20, 6);              // version needed
  dir.writeUInt16LE(0, 8);
  dir.writeUInt16LE(method, 10);
  dir.writeUInt16LE(DOS_TIME, 12);
  dir.writeUInt16LE(DOS_DATE, 14);
  dir.writeUInt32LE(sum, 16);
  dir.writeUInt32LE(body.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt16LE(0, 30);              // extra
  dir.writeUInt16LE(0, 32);              // comment
  dir.writeUInt16LE(0, 34);              // disk
  dir.writeUInt16LE(0, 36);              // internal attrs
  // >>> 0 because a 32-bit left shift past bit 30 goes negative in JavaScript.
  dir.writeUInt32LE((0o100644 << 16) >>> 0, 38); // regular file, rw-r--r--
  dir.writeUInt32LE(offset, 42);
  central.push(dir, name);

  offset += local.length + name.length + body.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

fs.writeFileSync(dest, Buffer.concat([...locals, centralBuf, eocd]));

console.log(`${path.basename(dest)}  ${(fs.statSync(dest).size / 1024).toFixed(1)} KB  ${files.length} entries`);
for (const f of files) console.log(`  ${f.rel}`);
