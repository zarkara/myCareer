'use strict';
/**
 * myCareer validator. No dependencies.
 *
 *   node scripts/validate_corpus.js <corpus.json> [rendered.txt ...]
 *
 * Structural checks always run. If rendered text files are given (pdftotext output,
 * or the docx text), the trace check runs too: every figure printed in a document must
 * resolve to a confirmed, sourceable figure, and no rejected claim may appear anywhere.
 *
 * This turns "every figure traces to the ledger" from a human promise into a check.
 */
const fs = require('fs');
const M = require('./mycareer');

const errors = [], warnings = [];
const err = (code, msg) => errors.push({ code, msg });
const warn = (code, msg) => warnings.push({ code, msg });

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function structural(corpus) {
  const byId = M.index(corpus);
  const seen = new Set();

  for (const c of M.COLLECTIONS) {
    for (const e of corpus[c]) {
      if (!e.id) { err('E001', `${c}: entity without an id`); continue; }
      if (seen.has(e.id)) err('E002', `duplicate id: ${e.id}`);
      seen.add(e.id);
    }
  }

  // Every *_id / *_ids reference resolves.
  const walkRefs = (obj, path) => {
    for (const [k, v] of Object.entries(obj || {})) {
      if (k === 'id' || k === '_collection') continue;
      if (/_id$/.test(k) && typeof v === 'string') {
        if (!byId.has(v)) err('E003', `${path}.${k} -> unknown id "${v}"`);
      } else if (/_ids$/.test(k) && Array.isArray(v)) {
        v.forEach(r => { if (!byId.has(r)) err('E003', `${path}.${k} -> unknown id "${r}"`); });
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        walkRefs(v, `${path}.${k}`);
      }
    }
  };
  for (const c of M.COLLECTIONS) corpus[c].forEach(e => walkRefs(e, `${c}[${e.id}]`));

  // --- Claims -------------------------------------------------------------
  for (const c of corpus.claims) {
    if (c.status === 'confirmed') {
      if (!c.confirmed_detail || c.confirmed_detail.trim().length < 12)
        err('E010', `${c.id}: confirmed without a confirming detail. Recognition requires a particular the scaffold did not supply.`);
      if (!c.agency)
        err('E011', `${c.id}: confirmed without agency (completed / scoped / enabled).`);
      if (!c.narrative_long)
        err('E012', `${c.id}: confirmed without narrative_long. Capture must sit above every output format.`);
      if (c.bullet && !c.narrative_long)
        err('E013', `${c.id}: has a bullet but no narrative. Compression is one-directional.`);
      if (!c.constraint)
        warn('W010', `${c.id}: no constraint recorded. Achievements read as transformation leadership without one.`);
      if (!(c.job_families || []).length)
        warn('W011', `${c.id}: no job_families, so it renders for every target.`);
    }
    if (c.status === 'open' && (c.bullet || c.narrative_short))
      warn('W012', `${c.id}: open but already has render-ready prose. Open material must not reach a draft.`);
  }

  // --- DO-NOT-CLAIM is permanent -----------------------------------------
  const rejected = corpus.rejections.map(r => ({ id: r.id, n: norm(r.text) })).filter(r => r.n.length > 20);
  for (const c of corpus.claims) {
    if (c.status === 'rejected') continue;
    const n = norm(c.text);
    for (const r of rejected)
      if (n.includes(r.n) || r.n.includes(n))
        err('E020', `${c.id}: restates rejected claim ${r.id}. Rejected candidates never come back.`);
  }

  // --- Figures ------------------------------------------------------------
  const figById = new Map(corpus.figures.map(f => [f.id, f]));
  for (const f of corpus.figures) {
    if (f.composite_of?.length) {
      const parts = f.composite_of.map(id => figById.get(id)).filter(Boolean);
      if (parts.length !== f.composite_of.length) { err('E030', `${f.id}: composite references a missing figure.`); continue; }
      const units = new Set(parts.map(p => p.unit));
      if (units.size > 1 || !units.has(f.unit)) {
        warn('W030', `${f.id}: composite mixes units (${[...units].join(', ')} vs ${f.unit}); arithmetic not checked.`);
      } else {
        const sum = parts.reduce((a, p) => a + p.value, 0);
        if (Math.abs(sum - f.value) > 1e-9)
          err('E031', `${f.id}: composite does not decompose. Stated ${f.value}, parts sum to ${sum}.`);
      }
      if (parts.some(p => !p.sourceable))
        err('E032', `${f.id}: composite includes an unsourceable component, so the headline number cannot be defended.`);
    }
    if (f.headline && !f.sourceable)
      err('E033', `${f.id}: headline figure is not sourceable. Unsourceable numbers are omitted, not softened.`);
    if (!f.baseline) warn('W031', `${f.id}: no baseline. A number without one is decoration.`);
    if (!f.instrument) warn('W032', `${f.id}: no instrument, so "how was it measured" has no answer.`);
  }

  // --- Verification: tiers must be earned ---------------------------------
  const recById = new Map(corpus.records.map(r => [r.id, r]));
  const attById = new Map(corpus.attestations.map(a => [a.id, a]));

  const checkVerification = (owner, v, label) => {
    if (!v) return;
    const per = Object.entries(v.by_fact_type || {});
    if (per.length) {
      const min = per.reduce((lo, [, t]) => (M.tierRank(t) < M.tierRank(lo) ? t : lo), per[0][1]);
      if (v.tier !== min)
        err('E040', `${label}: tier is ${v.tier} but the weakest fact type is ${min}. A claim is only as verified as its weakest rendered component.`);
    }

    const covered = new Set();
    for (const rid of v.record_ids || []) (recById.get(rid)?.verifies || []).forEach(ft => covered.add(ft));
    for (const aid of v.attestation_ids || []) {
      const a = attById.get(aid);
      if (!a) continue;
      if (a.status === 'received' && a.strength !== 'hearsay') (a.establishes || []).forEach(ft => covered.add(ft));
    }

    for (const [ft, t] of per) {
      if (M.tierRank(t) >= M.tierRank('T3') && !covered.has(ft))
        err('E041', `${label}: claims ${t} for "${ft}" but no received attestation or record establishes that fact type. This is the check that stops verification theater.`);
    }

    if (M.tierRank(v.tier) >= M.tierRank('T4') && !(v.record_ids || []).length)
      err('E042', `${label}: T4 requires an independent record.`);
    if (v.tier === 'T3' && !(v.attestation_ids || []).some(id => attById.get(id)?.status === 'received' && attById.get(id)?.strength !== 'hearsay'))
      err('E043', `${label}: T3 requires a received attestation from someone who witnessed or participated. Hearsay never raises a tier.`);
  };

  corpus.claims.forEach(c => checkVerification(c, c.verification, `claim ${c.id}`));
  corpus.roles.forEach(r => checkVerification(r, r.verification, `role ${r.id}`));

  // --- Records: what they can and cannot establish ------------------------
  const EMPLOYMENT_ONLY = new Set(['irs_wage_transcript', 'w2', '1099', 'payroll']);
  const ACCOMPLISHMENT = /^(accomplishment|scope)\./;
  for (const r of corpus.records) {
    if (EMPLOYMENT_ONLY.has(r.type)) {
      const overreach = (r.verifies || []).filter(ft => ACCOMPLISHMENT.test(ft));
      if (overreach.length)
        err('E050', `${r.id}: type "${r.type}" cannot establish ${overreach.join(', ')}. Payroll records prove employment, never what you built.`);
    }
    if (r.sensitivity !== 'restricted' && EMPLOYMENT_ONLY.has(r.type))
      warn('W050', `${r.id}: payroll-derived records should be marked restricted.`);
    if (r.conflicts?.length) {
      const linked = corpus.open_questions.some(q => (q.blocks_claim_ids || []).some(id => (r.covers_claim_ids || []).includes(id)) || norm(q.question).includes(norm(r.id)));
      if (!linked) warn('W051', `${r.id}: records a conflict but no open question tracks it. Record conflicts produce questions, never silent overwrites.`);
    }
  }

  // --- Attestations -------------------------------------------------------
  for (const a of corpus.attestations) {
    if ((a.claim_ids || []).length > 5)
      err('E060', `${a.id}: too broad. Narrow requests get answered; broad ones get ignored and are worth less anyway.`);
    if (a.status === 'received' && !a.scope)
      warn('W060', `${a.id}: received without a stated scope, so it is unclear what this person can actually speak to.`);
    if (a.status === 'received' && !a.statement)
      warn('W061', `${a.id}: received without a statement.`);
  }

  // --- Open questions must be closable ------------------------------------
  for (const q of corpus.open_questions)
    if (!q.close_action || /think|remember|recall more/i.test(q.close_action))
      err('E070', `${q.id}: close_action must name a document, a person, or a system, not more reflection.`);

  // --- Disclosure limits --------------------------------------------------
  const limitIds = new Set(corpus.disclosure_limits.map(d => d.id));
  for (const c of corpus.claims)
    for (const d of c.disclosure_limit_ids || [])
      if (!limitIds.has(d)) err('E080', `${c.id}: unknown disclosure limit ${d}`);
  for (const o of corpus.orgs)
    if (o.nameable === false && !o.public_name)
      err('E081', `${o.id}: not nameable but no public_name to render instead.`);

  // --- Positioning --------------------------------------------------------
  for (const t of corpus.positioning?.targets || []) {
    if (!t.tagline) warn('W090', `target ${t.key}: no tagline.`);
    if (t.fit === 'thin' && !t.objection_answer)
      warn('W091', `target ${t.key}: fit is thin and no objection answer is prepared.`);
    for (const id of [...(t.carries || []), ...(t.suppress || [])])
      if (!corpus.claims.some(c => c.id === id)) err('E090', `target ${t.key}: references unknown claim ${id}`);
  }
}

/**
 * Numbers that belong to document structure rather than to a claim: the 30-second spoken
 * version, the first-90-days paragraph. Matched in context, so the bare digits are still
 * checked everywhere else. Keep this list short and specific.
 */
const STRUCTURAL = [
  /\b\d{1,3}[-\s]second\b/gi,
  /\bfirst \d{1,3} days\b/gi,
  /\b\d{1,3}[-\s]day (plan|approach)\b/gi,
];

/** Numbers a document is allowed to print, drawn only from confirmed sourceable material. */
function allowedNumbers(corpus) {
  const ok = new Set();
  const push = n => { if (n !== undefined && n !== null && n !== '') ok.add(String(n)); };
  const figById = new Map(corpus.figures.map(f => [f.id, f]));
  const rendered = new Set(corpus.claims.filter(c => c.status === 'confirmed').flatMap(c => c.figure_ids || []));

  // A rendered composite licenses its components: narratives legitimately cite the parts
  // a headline figure decomposes to, and the validator already proved the arithmetic.
  for (const id of [...rendered]) (figById.get(id)?.composite_of || []).forEach(p => rendered.add(p));

  for (const f of corpus.figures) {
    if (!f.sourceable || !rendered.has(f.id)) continue;
    push(f.value);
    push(Math.round(f.value));
    if (f.value >= 1000) push(f.value / 1000);
    if (f.value % 1 === 0 && f.value >= 1e6) push(f.value / 1e6);
  }
  for (const r of corpus.roles) {
    for (const d of [r.dates?.start, r.dates?.end]) if (d) { push(d.slice(0, 4)); push(d); }
    for (const k of ['direct_reports', 'matrixed', 'dotted_line', 'total_org']) push(r.scope?.[k]);
  }
  for (const e of corpus.person?.education || []) push(e.year);
  return ok;
}

function traceCheck(corpus, files) {
  const ok = allowedNumbers(corpus);
  const forbidden = M.forbiddenText(corpus).map(norm).filter(t => t.length > 20);

  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const text = STRUCTURAL.reduce((s, re) => s.replace(re, m => ' '.repeat(m.length)), original);
    const n = norm(original);

    for (const f of forbidden)
      if (n.includes(f)) err('E100', `${file}: contains rejected claim text -- "${f.slice(0, 60)}..."`);

    if (/—/.test(original)) err('E101', `${file}: contains an em dash. House style forbids them.`);

    // The currency prefix and magnitude suffix are part of the token. Without them
    // "$5M" slips past a plain digit scan entirely, which is exactly the kind of
    // inflation this check exists to catch.
    const NUM = /(?<![\w.])(\$?)(\d[\d,]*(?:\.\d+)?)\s?(%|[KMBkmb])?(?![\w])/g;
    const seen = new Set();
    for (const m of text.matchAll(NUM)) {
      const [full, dollar, digits, suffix] = m;
      if (seen.has(full)) continue;
      seen.add(full);
      const raw = digits.replace(/,/g, '');
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;

      // A currency or magnitude marker means the number is a claim, never a list marker,
      // so the small-integer exemption does not apply to it.
      const marked = !!dollar || !!suffix;
      if (!marked && v <= 12 && Number.isInteger(v)) continue;
      if (ok.has(raw) || ok.has(String(v))) continue;
      warn('W100', `${file}: prints "${full.trim()}" which does not resolve to a confirmed sourceable figure. Confirm or remove.`);
    }
  }
}

function main() {
  const [corpusFile, ...rendered] = process.argv.slice(2);
  if (!corpusFile) {
    console.error('usage: node scripts/validate_corpus.js <corpus.json> [rendered.txt ...]');
    process.exit(2);
  }
  const corpus = M.load(corpusFile);
  structural(corpus);
  if (rendered.length) traceCheck(corpus, rendered);

  const stats = {
    claims: corpus.claims.length,
    confirmed: corpus.claims.filter(c => c.status === 'confirmed').length,
    open: corpus.claims.filter(c => c.status === 'open').length,
    rejected: corpus.rejections.length,
    corroborated: corpus.claims.filter(c => M.tierRank(M.effectiveTier(c.verification)) >= M.tierRank('T3')).length,
  };
  console.log(`myCareer: ${stats.claims} claims (${stats.confirmed} confirmed, ${stats.open} open), ` +
    `${stats.corroborated} corroborated or better, ${stats.rejected} on the do-not-claim list.`);

  for (const w of warnings) console.log(`  warn  ${w.code}  ${w.msg}`);
  for (const e of errors) console.log(`  ERROR ${e.code}  ${e.msg}`);

  if (errors.length) { console.log(`\n${errors.length} error(s). Do not render.`); process.exit(1); }
  console.log(`\nOK${warnings.length ? ` (${warnings.length} warning(s))` : ''}.`);
}

if (require.main === module) main();
module.exports = { structural, traceCheck, allowedNumbers, errors, warnings };
