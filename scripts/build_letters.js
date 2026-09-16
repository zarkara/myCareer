'use strict';
/**
 * Renders a myCareer corpus into the document set.
 *
 *   node scripts/build_letters.js <corpus.json> <positioning-target> [outdir]
 *
 * Every sentence of substance comes from the corpus. This script supplies structure,
 * connective tissue, and the per-recipient placeholders; it never supplies a fact.
 */
const fs = require('fs');
const path = require('path');
const L = require('./letter_lib');
const M = require('./mycareer');

const [corpusFile, targetKey, outDirArg] = process.argv.slice(2);
if (!corpusFile || !targetKey) {
  console.error('usage: node scripts/build_letters.js <corpus.json> <target-key> [outdir]');
  process.exit(2);
}
const out = outDirArg || 'out';
fs.mkdirSync(out, { recursive: true });

const corpus = M.load(corpusFile);
const target = corpus.positioning.targets.find(t => t.key === targetKey);
if (!target) throw new Error(`unknown target: ${targetKey}`);

const claims = M.selectForTarget(corpus, targetKey);

// job_family and seniority are optional in the schema, so they are never dereferenced
// bare: a corpus converted from the iOS app carries a target with only a key and a tagline.
const family = (target.job_family || 'the work described above').replace(/_/g, ' ');
const seniority = target.seniority || 'senior';
const headline = M.headlineFigures(corpus, claims);
const byId = M.index(corpus);
const orgName = id => { const o = byId.get(id); return o.nameable === false ? o.public_name : o.name; };
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ym = s => (s ? (s.length > 4 ? `${MONTHS[Number(s.slice(5, 7))]} ${s.slice(0, 4)}` : s) : 'Present');
const span = d => `${ym(d.start)} – ${d.ongoing ? 'Present' : ym(d.end)}`;

// Compression runs one direction, so a missing short form falls back to the flat neutral
// sentence rather than to a truncated narrative. A corpus straight out of the iOS app has
// only narrative_long and text; the documents skill fills the middle in later.
const line = c => c.bullet || c.narrative_short || c.text;
const prose = c => c.narrative_short || c.text;

function money(f) {
  if (!f) return '';
  if (f.unit === 'USD_millions') return `$${f.value}M`;
  if (f.unit === 'USD') return `$${f.value.toLocaleString('en-US')}`;
  if (f.unit === 'percent') return `${f.value}%`;
  return `${f.value} ${f.unit.replace(/_/g, ' ')}`;
}

/** Roles that survived the target filter, newest first, with their selected claims. */
const rolesWithClaims = corpus.roles
  .filter(r => claims.some(c => c.role_id === r.id))
  .sort((a, b) => (b.dates.start || '').localeCompare(a.dates.start || ''))
  .map(r => ({ role: r, claims: claims.filter(c => c.role_id === r.id) }));

const headlineLine = headline.map(f => `**${money(f)}** ${f.kind.replace(/_/g, ' ')}`).join('  ·  ');
const credentials = (corpus.person.education || [])
  .filter(e => !(e.suppress_for || []).includes(targetKey))
  .map(e => `${e.credential}, ${e.institution}${e.year ? `, ${e.year}` : ''}`);

L.setProfile({
  name: corpus.person.name,
  tagline: target.tagline,
  contact: [corpus.person.location, corpus.person.contact?.phone, corpus.person.contact?.email, corpus.person.contact?.linkedin]
    .filter(Boolean).join('  •  '),
});

// ---------------------------------------------------------------- resume ---
const resume = () => {
  const kids = [...L.letterhead()];
  if (headlineLine) kids.push(L.para(headlineLine, { align: 'center', after: 160 }));
  kids.push(...L.docTitle('Experience'));
  for (const { role, claims: rc } of rolesWithClaims) {
    kids.push(L.heading(`${role.title}, ${orgName(role.org_id)}`));
    kids.push(L.plain(`${role.location}  ·  ${span(role.dates)}${role.concurrent ? '  ·  concurrent role' : ''}`, { italics: true, after: 60 }));
    if (role.scope?.span) kids.push(L.plain(role.scope.span, { after: 70 }));
    rc.slice(0, 6).forEach(c => kids.push(L.bullet(line(c))));
  }
  if (credentials.length) {
    kids.push(...L.docTitle('Education and Credentials'));
    credentials.forEach(c => kids.push(L.plain(c, { after: 40 })));
  }
  return kids;
};

// ------------------------------------------------------- elevator pitch ---
const pitch = () => {
  const lead = claims[0], changed = claims.find(c => c.figure_ids?.length && c !== lead) || claims[1];
  const exec = claims.find(c => (c.job_families || []).includes('executive')) || claims[claims.length - 1];
  const scope = rolesWithClaims[0]?.role.scope;
  return [
    ...L.letterhead(),
    ...L.docTitle('Elevator Pitch', 'Who I am, the level I lead at, and the value I bring'),
    L.plain('Dear [Name],', { after: 130 }),
    L.para(`I am writing because [one sentence on why this seat, this company, now]. What follows is the short version of what I bring and at what level.`),
    L.para(`**What I lead.** ${rolesWithClaims[0]?.role.title} at ${orgName(rolesWithClaims[0]?.role.org_id)}: ${scope?.span || 'the platform and its delivery'}${scope?.total_org ? `, in an organization of ${scope.total_org}` : ''}${scope?.direct_reports ? ` with ${scope.direct_reports} direct reports` : ''}.`),
    L.para(`**What I have changed.** ${prose(lead)}`),
    L.para(`**Why it matters at this level.** ${changed && changed !== lead ? prose(changed) : prose(exec)}`),
    L.para(`I would welcome a short conversation about [initiative].`),
    ...L.signature(),
    ...L.box('The 30-second spoken version',
      `I am ${corpus.person.name.replace(/,.*$/, '').replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())}. ` +
      `${target.tagline.split('|')[0].trim()}. ${lead.text} ${changed && changed !== lead ? changed.text : ''} ` +
      `What I want next is the ${seniority === 'ic' ? 'design problem' : 'accountability'}, not the title.`),
  ];
};

// ------------------------------------------------------- autobiography ---
const autobiography = () => {
  const kids = [
    ...L.letterhead(),
    ...L.docTitle('Career Autobiography', 'How the progression fits together, and what each step added'),
    L.para(`Each role added one layer of accountability. What follows is that progression, chapter by chapter, with what each one taught me that the next one needed.`),
  ];
  for (const { role } of [...rolesWithClaims].reverse()) {
    kids.push(L.heading(`${role.title}, ${orgName(role.org_id)}: ${role.location}`, { before: 180 }));
    kids.push(L.plain(span(role.dates), { italics: true, after: 70 }));
    if (role.chapter) kids.push(L.para(role.chapter));
  }
  kids.push(L.heading('What comes next', { before: 180 }));
  kids.push(L.para(`I am looking for a ${seniority === 'ic' ? 'senior individual contributor' : seniority} seat in ${family}: ${target.tagline.split('|').slice(1).join(' and ').trim() || 'the work described above'}. ${target.objection_answer || ''}`));
  return kids;
};

// ------------------------------------------------------ correspondence ---
const correspondence = () => [
  ...L.letterhead(),
  L.plain('[Date]', { after: 60 }),
  L.plain('[Name], [Title]', { after: 20 }),
  L.plain('[Company]', { after: 20 }),
  L.plain('[City, ST]', { after: 160 }),
  L.plain('Dear [Name],', { after: 130 }),
  L.para(`[Open with one sentence on the company's current moment: a funding round, an acquisition, a regulatory milestone, a platform rebuild. Make it specific enough that it could not be sent to another company.]`),
  ...claims.slice(0, 3).map(c => L.bullet(`**${c.text.replace(/\.$/, '')}.** ${prose(c)}`)),
  L.para(`What an owner gets from that is straightforward: ${claims[0].constraint ? `the work above was done under ${claims[0].constraint.charAt(0).toLowerCase()}${claims[0].constraint.slice(1).replace(/\.$/, '')}` : 'outcomes delivered under real constraint'}, which is the condition [Company] is operating in now.`),
  L.para(`In the first 90 days I would expect to [one sentence: what you would assess, decide, or stabilize first].`),
  L.para(`I will follow up on [date]. If there is someone else this should reach, I would appreciate the redirect.`),
  ...L.signature(),
  L.rule(),
  L.plain('Follow-up email', { after: 60 }),
  L.plain(`Subject: Following up on [initiative]`, { italics: true, after: 70 }),
  L.para(`[Name], following up on my note about [initiative]. The short version: ${claims[0].text} If the problem on your side is ${claims[0].constraint ? claims[0].constraint.replace(/\.$/, '').toLowerCase() : 'the one described'}, that is the work I have done. Fifteen minutes would tell us both whether it is worth more. ${corpus.person.name.replace(/,.*$/, '')}`),
];

// ------------------------------------------------------------- KSA -------
const KSA_REQUIREMENTS = {
  architect: [
    'Architecture of systems operating under external regulatory assessment',
    'Translating control requirements into implemented technical capability',
    'Analysis of alternatives and defensible technology decisions',
    'Cost and operating economics of platform decisions',
    'Leading technical work across teams without direct authority',
    'Communicating technical risk to executives and external assessors',
  ],
  engineer: [
    'Distributed system design and failure analysis',
    'Deployment, monitoring, and operational ownership',
    'Cost and performance engineering',
    'Technical decision making under constraint',
    'Working across teams without direct authority',
    'Communicating technical risk clearly',
  ],
};
const ksa = () => {
  const reqs = KSA_REQUIREMENTS[target.job_family] || KSA_REQUIREMENTS.architect;
  const kids = [
    ...L.letterhead(),
    ...L.docTitle('Knowledge, Skills and Abilities', `Evidence against the requirements typical of a ${seniority} ${family} seat`),
    L.para(`Each requirement below is answered with specific work rather than a description of capability. Where a result is measured, the measurement and its source are named.`),
  ];
  reqs.forEach((r, i) => {
    const c = claims[i % claims.length];
    kids.push(L.heading(`${i + 1}. ${r}`, { before: 150 }));
    kids.push(L.para(`${prose(c)}${c.constraint ? ` The constraint was ${c.constraint.charAt(0).toLowerCase()}${c.constraint.slice(1)}` : ''}`));
  });
  kids.push(L.para(`I am glad to walk any of these through in detail, including what did not work.`, { before: 150 }));
  if (credentials.length) kids.push(L.plain(credentials.join('  ·  '), { italics: true, before: 120 }));
  return kids;
};

// ------------------------------------------------------------- bio -------
const shortName = corpus.person.name.replace(/,.*$/, '').replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase());
const surname = shortName.split(' ').slice(-1)[0];
const bio = () => {
  const r0 = rolesWithClaims[0]?.role;
  const full = [
    `${shortName} is ${/^[aeiou]/i.test(target.tagline) ? 'an' : 'a'} ${target.tagline.split('|')[0].trim().toLowerCase()} whose work centers on ${r0?.scope?.span ? r0.scope.span.toLowerCase() : 'regulated platform delivery'}.`,
    `${claims.slice(0, 2).map(prose).join(' ')}`,
    `${credentials.length ? `${surname} holds ${credentials.join(' and ')}. ` : ''}${surname} lives in ${corpus.person.location}.`,
  ];
  return [
    ...L.letterhead(),
    ...L.docTitle('Professional Bio', 'Three lengths, one narrative'),
    L.heading('Full bio'),
    ...full.map(p => L.para(p)),
    L.heading('Short bio', { before: 170 }),
    L.para(`${shortName} is ${target.tagline.split('|')[0].trim().toLowerCase()}. ${prose(claims[0])} ${surname} lives in ${corpus.person.location}.`),
    L.heading('One line', { before: 170 }),
    L.para(`${shortName}, ${target.tagline.split('|')[0].trim().toLowerCase()}, ${corpus.person.location}.`),
  ];
};

// -------------------------------------------------------- linkedin txt ---
function linkedin() {
  const r0 = rolesWithClaims[0]?.role;
  const head = `${target.tagline} | ${corpus.person.location}`.slice(0, 220);
  const about = [
    `${prose(claims[0])}`,
    `${claims.slice(1, 3).map(c => prose(c)).join(' ')}`,
    `What I am looking for: ${target.tagline.split('|').slice(1).join(' and ').trim()}.`,
  ];
  const roles = rolesWithClaims.map(({ role, claims: rc }) =>
    [`${role.title}, ${orgName(role.org_id)}`,
     `${span(role.dates)} · ${role.location}`,
     ...rc.slice(0, 5).map(c => `• ${line(c)}`)].join('\n')).join('\n\n');
  const skills = [...new Set(claims.flatMap(c => (c.regime_ids || []).map(id => byId.get(id)?.name)).filter(Boolean))];

  return [
    `HEADLINE`, head, '',
    'ABOUT', ...about, '',
    'EXPERIENCE', roles, '',
    'SKILLS (only those evidenced by a confirmed claim)', skills.join(' · '), '',
    credentials.length ? `EDUCATION\n${credentials.join('\n')}` : '',
  ].join('\n');
}

// ------------------------------------------------------------- build -----
const DOCS = [
  ['Resume', resume, 21],
  ['Elevator_Pitch', pitch, 23],
  ['Career_Autobiography', autobiography, 21],
  ['Executive_Introduction', correspondence, 21],
  ['KSA_Letter', ksa, 21],
  ['Professional_Bio', bio, 22],
];

(async () => {
  for (const [name, fn, size] of DOCS) {
    L.setBody(size);
    await L.write(fn(), name.replace(/_/g, ' '), path.join(out, `${name}.docx`));
    console.log(`  ${name}.docx`);
  }
  fs.writeFileSync(path.join(out, 'LinkedIn_Profile.txt'), linkedin(), 'utf8');
  console.log('  LinkedIn_Profile.txt');
  console.log(`\ntarget "${targetKey}" · ${claims.length} claims rendered · ${headline.length} headline figures`);
})();
