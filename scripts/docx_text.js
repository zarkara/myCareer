'use strict';
/**
 * Extracts plain text from a .docx, with no external tooling.
 *
 *   node scripts/docx_text.js <file.docx> [...]        prints text
 *   node scripts/docx_text.js --write <file.docx> ...  writes <file>.txt beside each
 *
 * Verification should not depend on LibreOffice being installed. A .docx is a zip
 * holding word/document.xml; this reads the stored or deflated entry directly and
 * strips the markup, keeping paragraph and tab boundaries.
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

/** Minimal zip reader: locate an entry by name via the central directory. */
function readZipEntry(buf, wanted) {
  const eocd = (() => {
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--)
      if (buf.readUInt32LE(i) === 0x06054b50) return i;
    return -1;
  })();
  if (eocd < 0) throw new Error('not a zip file');

  let p = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (name === wanted) {
      const lnameLen = buf.readUInt16LE(localOff + 26);
      const lextraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lnameLen + lextraLen;
      const raw = buf.subarray(start, start + compSize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`entry not found: ${wanted}`);
}

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

function docxText(file) {
  const xml = readZipEntry(fs.readFileSync(file), 'word/document.xml').toString('utf8');
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;|&#\d+;/g, m => ENT[m] || (m.startsWith('&#') ? String.fromCharCode(Number(m.slice(2, -1))) : m))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Rough page estimate from rendered text, for the page-count check without a PDF. */
function estimatePages(text, { linesPerPage = 46, charsPerLine = 96 } = {}) {
  const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / charsPerLine)), 0);
  return Math.max(1, Math.round((lines / linesPerPage) * 10) / 10);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const write = args[0] === '--write';
  const files = write ? args.slice(1) : args;
  if (!files.length) { console.error('usage: node scripts/docx_text.js [--write] <file.docx> ...'); process.exit(2); }
  for (const f of files) {
    const t = docxText(f);
    if (write) {
      const dest = path.join(path.dirname(f), path.basename(f, '.docx') + '.txt');
      fs.writeFileSync(dest, t, 'utf8');
      console.log(`${dest}  (~${estimatePages(t)} page${estimatePages(t) === 1 ? '' : 's'})`);
    } else {
      console.log(`===== ${f} =====\n${t}\n`);
    }
  }
}

module.exports = { docxText, estimatePages };
