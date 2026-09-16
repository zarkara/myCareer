'use strict';
/**
 * Renders a myCareer corpus into the document set as Markdown.
 *
 *   node scripts/render_markdown.js <corpus.json> <target-key> [outdir]
 *
 * Markdown rather than DOCX on purpose: this runs in Claude's code sandbox with no
 * package installs and no network. Every sentence of substance comes from the corpus;
 * this script supplies structure, connective tissue, and per-recipient placeholders.
 */
const fs = require('fs');
const path = require('path');
const M = require('./mycareer');

const [corpusFile, targetKey, outDirArg] = process.argv.slice(2);
if (!corpusFile || !targetKey) {
  console.error('usage: node scripts/render_markdown.js <corpus.json> <target-key> [outdir]');
  console.error('\ntargets in this corpus:');
  try {
    for (const t of M.load(corpusFile).positioning?.targets || []) console.error(`  ${t.key}`);
  } catch { /* no corpus to read */ }
  process.exit(2);
}

const out = outDirArg || 'documents';
fs.mkdirSync(out, { recursive: true });

const corpus = M.load(corpusFile);
const target = (corpus.positioning?.targets || []).find(t => t.key === targetKey);
if (!target) throw new Error(`unknown target "${targetKey}". Known: ${(corpus.positioning?.targets || []).map(t => t.key).join(', ')}`);

const claims = M.selectForTarget(corpus, targetKey);
if (!claims.length) throw new Error(`no confirmed claims survive the filter for "${targetKey}". Nothing can be rendered honestly.`);
const headline = M.headlineFigures(corpus, claims);
const byId = M.index(corpus);

// Compression runs one direction, so a missing short form falls back to the flat neutral
// sentence rather than to a truncated narrative.
const line = c => c.bullet || c.narrative_short || c.text;
const prose = c => c.narrative_short || c.text;

const orgName = id => { const o = byId.get(id); return !o ? '' : (o.nameable === false ? o.public_name : o.name); };
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ym = s => (s ? (s.length > 4 ? `${MONTHS[Number(s.slice(5, 7))]} ${s.slice(0, 4)}` : s) : 'Present');
const span = d => `${ym(d.start)} to ${d.ongoing ? 'Present' : ym(d.end)}`;
const family = (target.job_family || 'the work described here').replace(/_/g, ' ');
const seniority = target.seniority || 'senior';

function money(f) {
  if (!f) return '';
  if (f.unit === 'USD_millions') return `$${f.value}M`;
  if (f.unit === 'USD') return `$${f.value.toLocaleString('en-US')}`;
  if (f.unit === 'percent') return `${f.value}%`;
  return `${f.value} ${f.unit.replace(/_/g, ' ')}`;
}

const rolesWithClaims = corpus.roles
  .filter(r => claims.some(c => c.role_id === r.id))
  .sort((a, b) => (b.dates.start || '').localeCompare(a.dates.start || ''))
  .map(r => ({ role: r, claims: claims.filter(c => c.role_id === r.id) }));

const credentials = (corpus.person.education || [])
  .filter(e => !(e.suppress_for || []).includes(targetKey))
  .map(e => `${e.credential}, ${e.institution}${e.year ? `, ${e.year}` : ''}`);

const contact = [corpus.person.location, corpus.person.contact?.phone,
                 corpus.person.contact?.email, corpus.person.contact?.linkedin].filter(Boolean).join(' · ');

// The blank line before the rule matters: without it Markdown reads the contact line
// plus "---" as a setext heading rather than as a horizontal rule.
const letterhead = () => {
  const o = [`# ${corpus.person.name}`, '', `**${target.tagline}**`, ''];
  if (contact) o.push(contact, '');
  o.push('---', '');
  return o;
};
const shortName = corpus.person.name.replace(/,.*$/, '').replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase());
const surname = shortName.split(' ').slice(-1)[0];

// ------------------------------------------------------------------ documents ---
const DOCS = {};

DOCS['Resume.md'] = () => {
  const o = [...letterhead()];
  if (headline.length) {
    o.push(headline.map(f => `**${money(f)}** ${f.kind.replace(/_/g, ' ')}`).join('  ·  '), '');
  }
  o.push('## Experience', '');
  for (const { role, claims: rc } of rolesWithClaims) {
    o.push(`### ${role.title}, ${orgName(role.org_id)}`);
    o.push(`*${[role.location, span(role.dates)].filter(Boolean).join(' · ')}${role.concurrent ? ' · concurrent role' : ''}*`, '');
    if (role.scope?.span) o.push(role.scope.span, '');
    rc.slice(0, 6).forEach(c => o.push(`- ${line(c)}`));
    o.push('');
  }
  if (credentials.length) o.push('## Education and Credentials', '', ...credentials.map(c => `- ${c}`), '');
  return o;
};

DOCS['LinkedIn.md'] = () => {
  const head = `${target.tagline} | ${corpus.person.location || ''}`.trim().slice(0, 220);
  const skills = [...new Set(claims.flatMap(c => (c.regime_ids || []).map(id => byId.get(id)?.name)).filter(Boolean))];
  const o = ['# LinkedIn profile blocks', '', 'Paste each block into the matching field.', '',
    '## Headline', '', head, '',
    '## About', '',
    'The first two lines are all most people see before the fold, so the strongest material is there.', '',
    prose(claims[0]), '',
    claims.slice(1, 3).map(prose).join(' '), '',
    `What I am looking for: ${target.tagline.split('|').slice(1).join(' and ').trim() || family}.`, '',
    '## Experience', ''];
  for (const { role, claims: rc } of rolesWithClaims) {
    o.push(`**${role.title}, ${orgName(role.org_id)}**`, `${span(role.dates)}${role.location ? ` · ${role.location}` : ''}`, '');
    rc.slice(0, 5).forEach(c => o.push(`- ${line(c)}`));
    o.push('');
  }
  if (skills.length) o.push('## Skills', '', 'Only those a confirmed claim actually evidences.', '', skills.join(' · '), '');
  if (credentials.length) o.push('## Education', '', ...credentials.map(c => `- ${c}`), '');
  return o;
};

DOCS['Elevator_Pitch.md'] = () => {
  const lead = claims[0];
  const changed = claims.find(c => c.figure_ids?.length && c !== lead) || claims[1] || lead;
  const scope = rolesWithClaims[0]?.role.scope;
  const top = rolesWithClaims[0]?.role;
  return [...letterhead(), '## Elevator Pitch', '',
    '*Who I am, the level I work at, and the value I bring*', '',
    'Dear [Name],', '',
    'I am writing because [one sentence on why this seat, this company, now]. What follows is the short version.', '',
    `**What I lead.** ${top ? `${top.title} at ${orgName(top.org_id)}: ${scope?.span || 'the platform and its delivery'}` : family}${scope?.total_org ? `, in an organization of ${scope.total_org}` : ''}${scope?.direct_reports ? ` with ${scope.direct_reports} direct reports` : ''}.`, '',
    `**What I have changed.** ${prose(lead)}`, '',
    `**Why it matters at this level.** ${changed !== lead ? prose(changed) : ''}`, '',
    'I would welcome a short conversation about [initiative].', '',
    'Respectfully,', '', corpus.person.name, '', '---', '',
    '### The 30 second spoken version', '',
    `> ${shortName} here. ${target.tagline.split('|')[0].trim()}. ${lead.text} ${changed !== lead ? changed.text : ''} What I want next is the ${seniority === 'ic' ? 'design problem' : 'accountability'}, not the title.`, ''];
};

DOCS['Career_Autobiography.md'] = () => {
  const o = [...letterhead(), '## Career Autobiography', '',
    'Each role added one layer of accountability. What follows is that progression, chapter by chapter, with what each one taught me that the next one needed.', ''];
  for (const { role } of [...rolesWithClaims].reverse()) {
    o.push(`### ${role.title}, ${orgName(role.org_id)}: ${role.location || ''}`.replace(/: $/, ''));
    o.push(`*${span(role.dates)}*`, '');
    if (role.chapter) o.push(role.chapter, '');
  }
  o.push('### What comes next', '',
    `I am looking for a ${seniority === 'ic' ? 'senior individual contributor' : seniority} seat in ${family}. ${target.objection_answer || ''}`.trim(), '');
  return o;
};

DOCS['Executive_Introduction.md'] = () => [...letterhead(),
  '[Date]', '', '[Name], [Title]  ', '[Company]  ', '[City, ST]', '', 'Dear [Name],', '',
  "[Open with one sentence on the company's current moment: a funding round, an acquisition, a regulatory milestone, a platform rebuild. Make it specific enough that it could not be sent to another company.]", '',
  ...claims.slice(0, 3).map(c => `- **${c.text.replace(/\.$/, '')}.** ${prose(c)}`), '',
  `What an owner gets from that is straightforward: ${claims[0].constraint ? `the work above was done under ${claims[0].constraint.charAt(0).toLowerCase()}${claims[0].constraint.slice(1).replace(/\.$/, '')}` : 'outcomes delivered under real constraint'}, which is the condition [Company] is operating in now.`, '',
  'In the first 90 days I would expect to [one sentence: what you would assess, decide, or stabilize first].', '',
  'I will follow up on [date]. If there is someone else this should reach, I would appreciate the redirect.', '',
  'Respectfully,', '', corpus.person.name, '', '---', '',
  '### Follow-up email', '', '**Subject:** Following up on [initiative]', '',
  `[Name], following up on my note about [initiative]. The short version: ${claims[0].text} If the problem on your side is ${claims[0].constraint ? claims[0].constraint.replace(/\.$/, '').toLowerCase() : 'the one described'}, that is the work I have done. Fifteen minutes would tell us both whether it is worth more. ${shortName}`, ''];

const KSA = {
  architect: ['Architecture of systems operating under external regulatory assessment',
    'Translating control requirements into implemented technical capability',
    'Analysis of alternatives and defensible technology decisions',
    'Cost and operating economics of platform decisions',
    'Leading technical work across teams without direct authority',
    'Communicating technical risk to executives and external assessors'],
  engineer: ['Distributed system design and failure analysis',
    'Deployment, monitoring, and operational ownership',
    'Cost and performance engineering',
    'Technical decision making under constraint',
    'Working across teams without direct authority',
    'Communicating technical risk clearly'],
};

DOCS['KSA_Letter.md'] = () => {
  const reqs = KSA[target.job_family] || KSA.architect;
  const o = [...letterhead(), '## Knowledge, Skills and Abilities', '',
    `*Evidence against the requirements typical of a ${seniority} ${family} seat*`, '',
    'Each requirement below is answered with specific work rather than a description of capability. Where a result is measured, the measurement and its source are named.', ''];
  reqs.forEach((r, i) => {
    const c = claims[i % claims.length];
    o.push(`### ${i + 1}. ${r}`, '');
    o.push(`${prose(c)}${c.constraint ? ` The constraint was ${c.constraint.charAt(0).toLowerCase()}${c.constraint.slice(1)}` : ''}`, '');
  });
  o.push('I am glad to walk any of these through in detail, including what did not work.', '');
  if (credentials.length) o.push(`*${credentials.join(' · ')}*`, '');
  return o;
};

DOCS['Professional_Bio.md'] = () => {
  const r0 = rolesWithClaims[0]?.role;
  const role0 = target.tagline.split('|')[0].trim().toLowerCase();
  return [...letterhead(), '## Professional Bio', '', '*Three lengths, one narrative*', '',
    '### Full bio', '',
    `${shortName} is ${/^[aeiou]/i.test(role0) ? 'an' : 'a'} ${role0} whose work centers on ${r0?.scope?.span ? r0.scope.span.toLowerCase() : family}.`, '',
    claims.slice(0, 2).map(prose).join(' '), '',
    `${credentials.length ? `${surname} holds ${credentials.join(' and ')}. ` : ''}${corpus.person.location ? `${surname} lives in ${corpus.person.location}.` : ''}`.trim(), '',
    '### Short bio', '',
    `${shortName} is ${role0}. ${prose(claims[0])}${corpus.person.location ? ` ${surname} lives in ${corpus.person.location}.` : ''}`, '',
    '### One line', '',
    `${shortName}, ${role0}${corpus.person.location ? `, ${corpus.person.location}` : ''}.`, ''];
};

// --------------------------------------------------------------------- build ---
const written = [];
for (const [name, fn] of Object.entries(DOCS)) {
  const text = fn().join('\n').replace(/\n{3,}/g, '\n\n').replace(/—/g, ',');
  fs.writeFileSync(path.join(out, name), text, 'utf8');
  written.push(`  ${name}  (${text.split('\n').length} lines)`);
}

console.log(written.join('\n'));
const head = `${target.tagline} | ${corpus.person.location || ''}`.trim().slice(0, 220);
console.log(`\nLinkedIn headline is ${head.length} of the 220 characters allowed.`);
console.log(`target "${targetKey}" · ${claims.length} of ${corpus.claims.length} claims rendered · ${headline.length} headline figures`);
const suppressed = corpus.claims.filter(c => c.status === 'confirmed' && !claims.includes(c)).length;
if (suppressed) console.log(`${suppressed} confirmed claim(s) held back by this target's filter.`);
console.log(`\nVerify before sending:  node scripts/validate_corpus.js ${corpusFile} ${out}/*.md`);
