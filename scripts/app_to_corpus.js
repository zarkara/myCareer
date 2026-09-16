'use strict';
/**
 * Converts the iOS app's JSON document into a myCareer corpus.
 *
 *   node scripts/app_to_corpus.js <mycareer.json> [corpus.json]
 *
 * The phone is the capture surface; the corpus is what the document renderer reads.
 * The conversion is conservative on purpose: an entry is only marked confirmed when it
 * carries a real confirming detail and a narrative. Everything else arrives as open,
 * which keeps it out of every rendered document until the person closes the gap.
 */
const fs = require('fs');

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error('usage: node scripts/app_to_corpus.js <mycareer.json> [corpus.json]');
  process.exit(2);
}

const app = JSON.parse(fs.readFileSync(input, 'utf8'));

const slug = (s, fallback) => {
  const out = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || fallback;
};
const ym = (s) => (/^\d{4}(-\d{2})?$/.test(s || '') ? s : undefined);

/** "$2.4M" -> {value: 2.4, unit: "USD_millions"}. "18 months" -> {18, "months"}. */
function parseFigure(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^\$?\s*([\d,]+(?:\.\d+)?)\s*([A-Za-z%µ]*)/);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const suffix = (m[2] || '').trim();
  const dollars = s.startsWith('$');

  if (dollars && /^m$/i.test(suffix)) return { value, unit: 'USD_millions' };
  if (dollars && /^k$/i.test(suffix)) return { value: value / 1000, unit: 'USD_millions' };
  if (dollars && !suffix) return { value, unit: 'USD' };
  if (suffix === '%') return { value, unit: 'percent' };
  return { value, unit: suffix ? suffix.toLowerCase() : 'count' };
}

const corpus = {
  mycareer_version: '0.1',
  person: {
    name: app.person?.name || 'Unnamed',
    location: app.person?.location || undefined,
  },
  orgs: [], roles: [], claims: [], figures: [], rejections: [], open_questions: [],
  positioning: { targets: [] },
  sessions: [{ id: 'ses.import', date: new Date().toISOString().slice(0, 7), subject: 'Imported from the iOS app', variant: 'autobiography_pass' }],
};

const seenOrg = new Map();
let n = 0;
const headlineBudget = { left: 4 };

for (const role of app.roles || []) {
  n++;
  const orgName = role.org || 'Undisclosed organization';
  let orgId = seenOrg.get(orgName);
  if (!orgId) {
    orgId = `org.${slug(orgName, `org${n}`)}`;
    seenOrg.set(orgName, orgId);
    corpus.orgs.push({ id: orgId, name: orgName });
  }

  const roleId = `role.${slug(`${role.title}-${orgName}`, `role${n}`)}-${n}`;
  corpus.roles.push({
    id: roleId,
    org_id: orgId,
    title: role.title || 'Untitled role',
    dates: { start: ym(role.start) || '1900', end: ym(role.end), ongoing: !role.end || undefined },
    location: role.location || undefined,
    chapter: role.chapter || undefined,
    verification: { tier: 'T1' },
  });

  for (const entry of role.entries || []) {
    if (!entry.text && !entry.narrative) continue;
    n++;

    const figureIds = [];
    for (const f of entry.figures || []) {
      const parsed = parseFigure(f.value);
      if (!parsed) continue;
      n++;
      const id = `fig.${slug(f.what, `f${n}`)}-${n}`;
      const headline = f.sourceable && headlineBudget.left > 0;
      if (headline) headlineBudget.left--;
      corpus.figures.push({
        id,
        value: parsed.value,
        unit: parsed.unit,
        kind: f.what ? slug(f.what, 'measure').replace(/-/g, '_') : undefined,
        baseline: f.baseline || undefined,
        instrument: f.source || undefined,
        source: f.source || undefined,
        sourceable: !!f.sourceable,
        headline: headline || undefined,
      });
      figureIds.push(id);
    }

    // Confirmed requires a real confirming detail plus a narrative. The app cannot
    // know whether the detail was volunteered or suggested, so this is the floor,
    // not a substitute for an interrogation session.
    const detail = (entry.confirmedDetail || '').trim();
    const confirmed = detail.length >= 12 && !!entry.narrative && !!entry.agency;

    const claim = {
      id: `clm.${slug(entry.text, `c${n}`).slice(0, 60)}-${n}`,
      status: confirmed ? 'confirmed' : 'open',
      text: entry.text || (entry.narrative || '').split('. ')[0] + '.',
      role_id: roleId,
      figure_ids: figureIds.length ? figureIds : undefined,
      dates: { start: ym(role.start) || '1900', end: ym(role.end) },
      source_session_id: 'ses.import',
    };

    if (confirmed) {
      claim.narrative_long = entry.narrative;
      claim.confirmed_detail = detail;
      claim.agency = entry.agency;
      claim.constraint = entry.constraint || undefined;
      claim.verification = { tier: 'T1' };
      if (entry.couldConfirm) {
        corpus.open_questions.push({
          id: `oq.attest-${n}`,
          question: `Ask for a narrow attestation: ${entry.couldConfirm}`,
          kind: 'partial',
          close_action: `Contact the person named and ask them to confirm only this claim: ${claim.text}`,
          blocks_claim_ids: [claim.id],
          payoff: 'high',
        });
      }
    } else {
      corpus.open_questions.push({
        id: `oq.detail-${n}`,
        question: `"${claim.text}" has no confirming detail, so it cannot be rendered.`,
        kind: 'partial',
        close_action: 'Name the particular that pins it down: a person, a date, an artifact, a number, or an argument.',
        blocks_claim_ids: [claim.id],
        payoff: 'high',
      });
    }

    corpus.claims.push(claim);
  }
}

corpus.positioning.targets.push({
  key: 'default',
  tagline: app.person?.tagline || 'Set a positioning line before rendering',
  carries: corpus.claims.filter((c) => c.status === 'confirmed').slice(0, 3).map((c) => c.id),
  suppress: [],
  fit: 'moderate',
});

// Strip undefined so the output stays readable and the schema stays happy.
const clean = JSON.parse(JSON.stringify(corpus));
const dest = output || input.replace(/\.json$/, '') + '.corpus.json';
fs.writeFileSync(dest, JSON.stringify(clean, null, 2), 'utf8');

const confirmed = clean.claims.filter((c) => c.status === 'confirmed').length;
console.log(`${dest}`);
console.log(`  ${clean.roles.length} roles · ${clean.claims.length} claims (${confirmed} confirmed, ${clean.claims.length - confirmed} open) · ${clean.figures.length} figures · ${clean.open_questions.length} open questions`);
console.log(`\nValidate before rendering:  node scripts/validate_corpus.js ${dest}`);
