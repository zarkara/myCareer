'use strict';
/**
 * Builds the projection of a corpus that a candidate can safely send to a recruiter.
 *
 *   node scripts/recruiter_view.js <corpus.json> [out.json] [--target <key>] [--include-open]
 *
 * ALLOWLIST, NOT DENYLIST. Every field that reaches the output is named here. A field the
 * schema gains later is withheld until someone adds it on purpose. The opposite design, a
 * list of things to strip, leaks by default the day the schema grows.
 *
 * The corpus holds material the candidate needs and a recruiter must not have: who could
 * contradict a claim, what went wrong, how a departure is framed, the do-not-claim list,
 * reference contact details, and wage records. See docs/recruiter.md.
 */
const fs = require('fs');
const M = require('./mycareer');

// Fields the candidate keeps. Named here so the reason is recorded next to the decision,
// and so the leak test has something to assert against.
const WITHHELD = {
  'stories[].contradiction_risk': 'hands the other side the attack before the interview',
  'stories[].what_went_wrong': 'volunteered failure without the context that makes it a strength',
  'roles[].departure_framing': 'answers a question nobody asked',
  'rejections[]': 'everything they considered claiming and decided they could not defend',
  'open_questions[]': 'reads as a list of holes in their history (opt in with --include-open)',
  'attestations[].attester': 'references contacted before the candidate authorised it',
  'records[]': 'wage transcripts, payroll, compensation',
  'figures[].source': 'names internal systems and documents of a former employer',
  'claims[].narrative_long': 'the long form is for the candidate; the short form is the pitch',
  'disclosure_limits[].scope': 'describing what cannot be said can reveal the thing itself',
};

function project(corpus, { targetKey = null, includeOpen = false } = {}) {
  const byId = M.index(corpus);
  const figById = new Map(corpus.figures.map((f) => [f.id, f]));

  const orgName = (id) => {
    const o = byId.get(id);
    if (!o) return null;
    return o.nameable === false ? o.public_name : o.name;
  };

  // Only confirmed claims, and only those the candidate has not suppressed for this target.
  let claims = corpus.claims.filter((c) => c.status === 'confirmed');
  let target = null;
  if (targetKey) {
    [claims, target] = [M.selectForTarget(corpus, targetKey),
      (corpus.positioning?.targets || []).find((t) => t.key === targetKey)];
  }

  const figure = (id) => {
    const f = figById.get(id);
    if (!f || !f.sourceable) return null;   // an unsourceable number is not evidence
    return {
      value: f.value,
      unit: f.unit,
      measures: f.kind || null,
      baseline: f.baseline || null,
      window: f.window || null,
      how_measured: f.instrument || null,
      // f.source is withheld: it names a former employer's internal systems.
      corroborated: M.tierRank(M.effectiveTier(f.verification)) >= M.tierRank('T3'),
    };
  };

  const view = {
    format: 'mycareer-recruiter-view/0.1',
    generated: new Date().toISOString().slice(0, 10),
    note: 'A projection of a verified career record, generated and shared by the candidate. '
        + 'Every claim here is one they confirmed with a specific recollection. Figures without '
        + 'a producible source were removed rather than softened.',

    candidate: {
      name: corpus.person.name,
      location: corpus.person.location || null,
      contact: corpus.person.contact || null,
      credentials: (corpus.person.education || [])
        .filter((e) => !targetKey || !(e.suppress_for || []).includes(targetKey))
        .map((e) => ({ credential: e.credential, institution: e.institution || null, year: e.year || null })),
      open_to: target ? [target.job_family].filter(Boolean)
                      : [...new Set(claims.flatMap((c) => c.job_families || []))],
      positioning: target ? target.tagline : null,
    },

    roles: corpus.roles
      .filter((r) => claims.some((c) => c.role_id === r.id))
      .sort((a, b) => (b.dates.start || '').localeCompare(a.dates.start || ''))
      .map((r) => ({
        id: r.id,
        title: r.public_title || r.title,
        organization: orgName(r.org_id),
        industry: byId.get(r.org_id)?.industry || null,
        location: r.location || null,
        dates: { start: r.dates.start, end: r.dates.end || null, ongoing: !!r.dates.ongoing },
        employment_type: r.employment_type || null,
        concurrent: !!r.concurrent,
        scope: r.scope ? {
          direct_reports: r.scope.direct_reports ?? null,
          matrixed: r.scope.matrixed ?? null,
          dotted_line: r.scope.dotted_line ?? null,
          total_org: r.scope.total_org ?? null,
          owned: r.scope.span || null,
        } : null,
        // r.chapter is the autobiography narrative; it is the candidate's voice and theirs
        // to send, but it is not part of an automated projection.
        // r.departure_framing is withheld.
      })),

    systems: corpus.systems
      .filter((s) => claims.some((c) => c.system_id === s.id))
      .map((s) => ({
        name: s.name,
        purpose: s.purpose || null,
        data_classes: s.data_classes || [],
        deployment: s.deployment || null,
        seat: s.seat || null,
        regimes: (s.regime_ids || []).map((id) => byId.get(id)?.name).filter(Boolean),
      })),

    regimes: corpus.regimes
      .filter((r) => r.status === 'confirmed')
      .map((r) => ({
        name: r.name,
        accountability: r.accountability || null,
        cadence: r.cadence || null,
        revision: r.revision_known || null,
        observable: r.observable || null,
      })),

    claims: claims.map((c) => ({
      id: c.id,
      role_id: c.role_id || null,
      what: c.text,
      detail: c.narrative_short || null,
      bullet: c.bullet || null,
      // Agency and authority are the point. A resume collapses these into one sentence.
      agency: c.agency || null,
      authority: c.authority || null,
      constraint: c.constraint || null,
      dates: c.dates || null,
      regimes: (c.regime_ids || []).map((id) => byId.get(id)?.name).filter(Boolean),
      figures: (c.figure_ids || []).map(figure).filter(Boolean),
      verification: M.effectiveTier(c.verification),
      knowledge_currency: c.knowledge_currency || null,
    })),

    verification_summary: (() => {
      const tier = (c) => M.tierRank(M.effectiveTier(c.verification));
      return {
        claims_shown: claims.length,
        self_confirmed: claims.filter((c) => tier(c) >= M.tierRank('T1')).length,
        documented: claims.filter((c) => tier(c) >= M.tierRank('T2')).length,
        corroborated_by_a_named_colleague: claims.filter((c) => tier(c) >= M.tierRank('T3')).length,
        record_verified: claims.filter((c) => tier(c) >= M.tierRank('T4')).length,
        note: 'Corroborated means a named former colleague has attested to the claim in writing. '
            + 'Their identity and contact details are held by the candidate and released when '
            + 'they authorise a reference check.',
      };
    })(),

    constraints: corpus.disclosure_limits.map((d) => ({
      // The scope is withheld; only the permitted substitute is shared, so a recruiter knows
      // why a name is generic without learning what the name is.
      kind: d.kind,
      render_as: d.workaround || 'withheld',
    })),
  };

  if (includeOpen) {
    view.candidate_would_need_to_check = corpus.open_questions
      .filter((q) => q.payoff === 'high')
      .map((q) => ({ question: q.question, how_to_close: q.close_action }));
  }

  return view;
}

/** Every string in the corpus that must not survive into a projection. */
function withheldStrings(corpus) {
  const out = [];
  const push = (s) => { if (typeof s === 'string' && s.trim().length > 15) out.push(s.trim()); };

  for (const s of corpus.stories) { push(s.contradiction_risk); push(s.what_went_wrong); }
  for (const r of corpus.roles) push(r.departure_framing);
  for (const r of corpus.rejections) { push(r.text); push(r.detail); }
  for (const q of corpus.open_questions) { push(q.question); push(q.close_action); }
  for (const a of corpus.attestations) {
    push(a.attester?.name); push(a.attester?.contact_ref); push(a.statement); push(a.scope);
  }
  for (const r of corpus.records) { push(r.document_ref); push(r.hash); push(r.issuer); }
  for (const f of corpus.figures) push(f.source);
  for (const c of corpus.claims) { push(c.narrative_long); push(c.confirmed_detail); }
  for (const d of corpus.disclosure_limits) push(d.scope);
  for (const r of corpus.roles) push(r.chapter);
  return out;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positional = args.filter((a) => !a.startsWith('--'));
  const targetIdx = args.indexOf('--target');
  const targetKey = targetIdx >= 0 ? args[targetIdx + 1] : null;
  const [corpusFile, outFile] = positional.filter((p) => p !== targetKey);

  if (!corpusFile) {
    console.error('usage: node scripts/recruiter_view.js <corpus.json> [out.json] '
                + '[--target <key>] [--include-open]');
    process.exit(2);
  }

  const corpus = M.load(corpusFile);
  const view = project(corpus, { targetKey, includeOpen: flags.has('--include-open') });
  const json = JSON.stringify(view, null, 2);

  // The leak check runs on every generation, not only in tests. A projection that
  // carries withheld text is never written to disk.
  const leaks = withheldStrings(corpus).filter((s) => json.includes(s));
  if (leaks.length) {
    console.error('REFUSING TO WRITE. Withheld text reached the projection:');
    for (const l of leaks) console.error(`  "${l.slice(0, 80)}..."`);
    process.exit(1);
  }

  const dest = outFile || corpusFile.replace(/\.json$/, '') + '.recruiter.json';
  fs.writeFileSync(dest, json, 'utf8');

  const v = view.verification_summary;
  console.log(dest);
  console.log(`  ${view.claims.length} claims · ${view.roles.length} roles · `
            + `${view.regimes.length} regimes${targetKey ? ` · target "${targetKey}"` : ''}`);
  console.log(`  ${v.corroborated_by_a_named_colleague} corroborated by a named colleague, `
            + `${v.documented} documented`);
  console.log(`  withheld: ${Object.keys(WITHHELD).length} field groups, leak check passed`);
}

module.exports = { project, withheldStrings, WITHHELD };
