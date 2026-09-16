const d = require('docx');
const { Document, Packer, Paragraph, TextRun, AlignmentType: A, BorderStyle: B, LevelFormat, ShadingType } = d;
const NAVY = '1F3864', BLUE = '2E74B5', GRAY = '595959', FONT = 'Calibri';
let BODY = 21, P = {};                       // half-points; profile
const setBody = n => { BODY = n; };
const setProfile = p => { P = p; };        // { name, tagline, contact }

// **bold** and [placeholder] inline markup
function runs(t, o = {}) {
  return t.split(/(\*\*[^*]+\*\*|\[[^\]]+\])/g).filter(Boolean).map(s =>
    s.startsWith('**') ? new TextRun({ text: s.slice(2, -2), bold: true, font: FONT, size: o.size || BODY, color: NAVY })
    : s.startsWith('[') ? new TextRun({ text: s, italics: true, font: FONT, size: o.size || BODY, color: BLUE })
    : new TextRun({ text: s, font: FONT, size: o.size || BODY, italics: o.italics }));
}
const letterhead = () => [
  new Paragraph({ alignment: A.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: P.name, bold: true, font: FONT, size: 40, color: NAVY, characterSpacing: 20 })] }),
  new Paragraph({ alignment: A.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: P.tagline, bold: true, font: FONT, size: 22, color: BLUE })] }),
  new Paragraph({ alignment: A.CENTER, spacing: { after: 120 }, border: { bottom: { style: B.SINGLE, size: 12, color: NAVY, space: 6 } },
    children: [new TextRun({ text: P.contact, font: FONT, size: 18, color: GRAY })] }),
];
const docTitle = (t, sub) => [
  new Paragraph({ spacing: { before: 120, after: sub ? 0 : 160 }, children: [new TextRun({ text: t.toUpperCase(), bold: true, font: FONT, size: 24, color: NAVY, characterSpacing: 40 })] }),
  ...(sub ? [new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: sub, italics: true, font: FONT, size: 19, color: GRAY })] })] : []),
];
const para = (t, o = {}) => new Paragraph({ alignment: o.align || A.JUSTIFIED, spacing: { after: o.after ?? 130, before: o.before || 0, line: 276 }, children: runs(t, o) });
const plain = (t, o = {}) => new Paragraph({ spacing: { after: o.after ?? 0, before: o.before || 0 }, children: runs(t, o) });
const heading = (t, o = {}) => new Paragraph({ keepNext: true, spacing: { before: o.before ?? 140, after: 50 }, children: [new TextRun({ text: t, bold: true, font: FONT, size: 22, color: BLUE })] });
const bullet = (t, o = {}) => new Paragraph({ numbering: { reference: 'dots', level: 0 }, alignment: A.JUSTIFIED, spacing: { after: o.after ?? 90, line: 276 }, children: runs(t, o) });
function box(label, t) {
  const bd = { left: { style: B.SINGLE, size: 24, color: BLUE, space: 8 } }, sh = { type: ShadingType.CLEAR, fill: 'EAF1F8', color: 'auto' }, ind = { left: 180, right: 180 };
  return [new Paragraph({ keepNext: true, spacing: { before: 200 }, indent: ind, border: bd, shading: sh, children: [new TextRun({ text: label.toUpperCase(), bold: true, font: FONT, size: 18, color: NAVY, characterSpacing: 30 })] }),
          new Paragraph({ alignment: A.JUSTIFIED, spacing: { after: 120, line: 276 }, indent: ind, border: bd, shading: sh, children: runs(t, { italics: true }) })];
}
const signature = (c = 'Respectfully,') => [plain(c, { before: 80, after: 360 }), new Paragraph({ children: [new TextRun({ text: P.name, bold: true, font: FONT, size: BODY, color: NAVY })] })];
const rule = () => new Paragraph({ spacing: { before: 60, after: 60 }, border: { bottom: { style: B.SINGLE, size: 6, color: 'BFBFBF', space: 1 } }, children: [] });
async function write(children, title, out) {
  const doc = new Document({ creator: P.name, title, styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    numbering: { config: [{ reference: 'dots', levels: [{ level: 0, format: LevelFormat.BULLET, text: '▪', alignment: A.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } }, run: { color: BLUE } } }] }] },
    sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 900, bottom: 900, left: 1080, right: 1080 } } }, children }] });
  require('fs').writeFileSync(out, await Packer.toBuffer(doc));
}
module.exports = { setBody, setProfile, letterhead, docTitle, para, plain, heading, bullet, box, signature, rule, write };
