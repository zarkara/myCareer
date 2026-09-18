import fs from 'fs';
import path from 'path';
import { parseHTML } from 'linkedom';
import { extractPosting, condense } from '../lib/jobpost.mjs';

const dir = path.join(import.meta.dirname, 'fixtures');
let fail = 0;
const ok = (cond, label) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if (!cond) fail++; };

for (const file of fs.readdirSync(dir).sort()) {
  const { document } = parseHTML(fs.readFileSync(path.join(dir, file), 'utf8'));
  const p = extractPosting(document);
  console.log(`\n${file}  (source: ${p?.source})`);
  console.log(`  title:    ${p?.title}`);
  console.log(`  company:  ${p?.company ?? '(not published)'}`);
  console.log(`  location: ${p?.location ?? '(not published)'}`);
  console.log(`  required:  ${JSON.stringify(p?.requirements.required)}`);
  console.log(`  preferred: ${JSON.stringify(p?.requirements.preferred)}`);
}

console.log('\nassertions');
const { document: d1 } = parseHTML(fs.readFileSync(path.join(dir, 'jsonld.html'), 'utf8'));
const a = extractPosting(d1);
ok(a.source === 'json-ld', 'prefers JSON-LD over heuristics');
ok(a.company === 'Northwind Health', 'reads the hiring organisation');
ok(a.location === 'Tampa, FL', 'assembles locality and region');
ok(a.requirements.required.some(r => /^ISO 27001/.test(r)), 'strips "8+ years of hands-on experience with"');
ok(a.requirements.required.some(r => /^HIPAA Security Rule/.test(r)), 'strips "Strong background in"');
ok(a.requirements.preferred.length === 2, 'separates nice-to-have from required');
ok(!a.requirements.required.some(r => /PTO|401k/i.test(r)), 'stops at the benefits heading');

const { document: d2 } = parseHTML(fs.readFileSync(path.join(dir, 'heuristic.html'), 'utf8'));
const b = extractPosting(d2);
ok(b.source === 'heuristic', 'falls back when there is no structured data');
ok(b.requirements.required.length >= 3, 'still finds bullets without JSON-LD');

ok(condense('- 10+ years of progressive experience leading SOC 2 programs') === 'SOC 2 programs',
   'condense handles a compound preamble');
ok(condense('Must have expertise in FedRAMP') === 'FedRAMP', 'condense handles must-have');
ok(condense('x') === null, 'condense rejects noise');

console.log(fail ? `\n${fail} failure(s).` : '\nall passed.');
process.exit(fail ? 1 : 0);
