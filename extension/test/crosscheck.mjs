/**
 * The CommonJS matcher in scripts/match.js is the reference. This asserts the browser port
 * agrees with it on every requirement, so the extension and the CLI can never quietly
 * disagree about whether someone is a fit.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { matchRequirement as browserMatch, tailoredResume } from '../lib/match.mjs';

const require = createRequire(import.meta.url);
const root = path.join(import.meta.dirname, '..', '..');
const cjs = require(path.join(root, 'scripts', 'match.js'));
const M = require(path.join(root, 'scripts', 'mycareer.js'));
const adjacency = M.loadAdjacency();

const corpus = M.load(path.join(root, 'schema', 'mycareer.example.json'));
const view = require(path.join(root, 'scripts', 'recruiter_view.js'))
  .project(corpus, { targetKey: 'architect_director' });

const REQUIREMENTS = [
  'ISO 27001', 'FedRAMP', 'HITRUST', 'HIPAA Security Rule', 'PCI DSS', 'SOC 2',
  'Kubernetes at scale', 'cost reduction', 'board reporting', 'NIST 800-171',
  'GDPR', 'something nobody has ever done',
];

let fail = 0;
console.log('requirement                          CJS            browser        agree');
for (const req of REQUIREMENTS) {
  const a = cjs.matchRequirement(req, view);
  const b = browserMatch(req, view, adjacency);
  const same = a.status === b.status && a.why === b.why
            && a.claims.length === b.claims.length;
  if (!same) fail++;
  console.log(`${req.padEnd(36)} ${a.status.padEnd(14)} ${b.status.padEnd(14)} ${same ? 'yes' : 'NO'}`);
}

const results = REQUIREMENTS.map((r) => browserMatch(r, view, adjacency));
const resume = tailoredResume(view, { title: 'Director of Platform Security', company: 'Northwind Health' }, results);

console.log('\ntailored resume');
const R = require(path.join(root, 'scripts', 'recruiter_view.js'));
const withheld = R.withheldStrings(corpus).filter((s) => resume.includes(s));
console.log(`  ${withheld.length === 0 ? 'ok  ' : 'FAIL'}  carries no withheld text (${R.withheldStrings(corpus).length} checked)`);
if (withheld.length) fail++;

const invented = /\b(led a team of|increased|decreased|improved)\b/i.test(resume)
  && !view.claims.some((c) => /\b(led a team of|increased|decreased|improved)\b/i.test(c.bullet || ''));
console.log(`  ${!invented ? 'ok  ' : 'FAIL'}  no verbs that do not appear in the record`);
if (invented) fail++;

const gapLine = resume.includes('does not evidence');
console.log(`  ${gapLine ? 'ok  ' : 'FAIL'}  states its own gaps rather than papering over them`);
if (!gapLine) fail++;

fs.writeFileSync(path.join(import.meta.dirname, 'tailored-sample.md'), resume);
console.log(fail ? `\n${fail} failure(s).` : '\nall agree.');
process.exit(fail ? 1 : 0);
