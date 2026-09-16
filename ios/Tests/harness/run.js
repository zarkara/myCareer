'use strict';
/**
 * Golden-file test runner. Works on any machine with Node, no Xcode required.
 *
 *   node ios/Tests/harness/run.js            check every fixture against its golden
 *   node ios/Tests/harness/run.js --update   rewrite the goldens from current output
 *
 * The goldens are the contract shared with MyCareerTests.swift, which renders the same
 * fixtures through Markdown.swift and asserts identical bytes. Run both suites after any
 * change to the renderer; passing here alone only proves the port agrees with itself.
 */
const fs = require('fs');
const path = require('path');
const { render } = require('./render');

// Fixed so output does not change between days.
const DATE = '2026-01-01';

const root = path.join(__dirname, '..');
const fixtureDir = path.join(root, 'Fixtures');
const goldenDir = path.join(root, 'Golden');
const update = process.argv.includes('--update');

fs.mkdirSync(goldenDir, { recursive: true });

const fixtures = fs.readdirSync(fixtureDir).filter((f) => f.endsWith('.json')).sort();
let failed = 0;

for (const file of fixtures) {
  const name = path.basename(file, '.json');
  const corpus = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8'));
  const actual = render(corpus, DATE);
  const goldenPath = path.join(goldenDir, `${name}.md`);

  if (update) {
    fs.writeFileSync(goldenPath, actual, 'utf8');
    console.log(`  updated  ${name}.md  (${actual.split('\n').length} lines)`);
    continue;
  }

  if (!fs.existsSync(goldenPath)) {
    console.log(`  MISSING  ${name}.md  run with --update to create it`);
    failed++;
    continue;
  }

  const expected = fs.readFileSync(goldenPath, 'utf8');
  if (actual === expected) {
    console.log(`  ok       ${name}`);
  } else {
    failed++;
    console.log(`  FAIL     ${name}`);
    const a = actual.split('\n'), b = expected.split('\n');
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        console.log(`    line ${i + 1}`);
        console.log(`      expected: ${JSON.stringify(b[i] ?? null)}`);
        console.log(`      actual:   ${JSON.stringify(a[i] ?? null)}`);
        break;
      }
    }
  }
}

// Checks that hold for every rendered document, independent of the goldens.
if (!update) {
  for (const file of fixtures) {
    const name = path.basename(file, '.json');
    const out = render(JSON.parse(fs.readFileSync(path.join(fixtureDir, file), 'utf8')), DATE);
    const problems = [];
    if (out.includes('—')) problems.push('contains an em dash');
    if (/\n{3,}/.test(out)) problems.push('contains a triple newline');
    if (out.includes('undefined') || out.includes('[object Object]')) problems.push('contains a stringification bug');
    if (/\|[^\n|]*(?<!\\)\|[^\n|]*\|.*\n(?!\|)/.test('')) problems.push('unreachable');
    for (const p of problems) { console.log(`  FAIL     ${name}: ${p}`); failed++; }
  }
}

console.log(update ? '\ngoldens rewritten. Re-run the Swift tests on a Mac to confirm they still match.'
                   : `\n${fixtures.length - failed} of ${fixtures.length} passed.`);
process.exit(failed ? 1 : 0);
