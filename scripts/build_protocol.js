'use strict';
/**
 * Regenerates service/src/protocol.js from the shared instruction text.
 *
 *   node scripts/build_protocol.js
 *
 * The hosted service, the Claude skill, and the ChatGPT project must all run the same rules.
 * Generating rather than copying is what stops them drifting.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'share', 'chatgpt', 'project-instructions.txt');
const dest = path.join(root, 'service', 'src', 'protocol.js');

const rules = fs.readFileSync(src, 'utf8').trim();
const header = `/**
 * The interrogation protocol, served as the cached system prefix.
 *
 * Generated from share/chatgpt/project-instructions.txt by scripts/build_protocol.js so the
 * hosted service, the Claude skill, and the ChatGPT project cannot drift apart.
 *
 * NOTHING per-request, per-user, or time-varying may be added to this string. It is the
 * cached prefix: one changed byte invalidates the cache and quintuples the cost of a session.
 */
`;
fs.writeFileSync(dest, header + 'export const PROTOCOL = ' + JSON.stringify(rules) + ';\n');
console.log(`${path.relative(root, dest)}  ${(rules.length / 1024).toFixed(1)} KB of cached prefix`);
