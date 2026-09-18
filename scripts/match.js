'use strict';
/**
 * Matches a role's requirements against a candidate's recruiter view, and says why.
 *
 *   node scripts/match.js <recruiter-view.json> <role.json>
 *   node scripts/match.js <recruiter-view.json> --requirements "ISO 27001, FedRAMP, cost reduction"
 *
 * Keyword matching fails in both directions: it misses people who did the work under another
 * name, and it surfaces people who used the word without doing the work. This does neither.
 *
 * A requirement is expanded into its evidence-equivalent neighbours before matching, using the
 * shared evidence clusters in data/adjacency.json. A requirement for ISO 27001 therefore finds
 * a SOC 2 candidate, and reports that it did so because the two share twelve evidence clusters
 * including access reviews and control narratives.
 *
 * Every match cites the claim, the reason, and the verification tier. There is no score.
 */
const fs = require('fs');
const path = require('path');
const M = require('./mycareer');

const adjacency = M.loadAdjacency();
const REGIMES = adjacency.regimes;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean));

/**
 * Regime names are written differently everywhere. A job description says "ISO 27001", the
 * standard is "ISO/IEC 27001", and a corpus records the level the candidate actually held,
 * "FedRAMP Moderate". Substring matching gets all three wrong, so compare token sets: every
 * token of the shorter name has to appear in the longer one.
 *
 * This deliberately does not match "ISO 27001" to "ISO 9001", which share only "iso".
 */
function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  const shared = [...A].filter((t) => B.has(t)).length;
  if (shared < Math.min(A.size, B.size)) return 0;
  return shared / Math.max(A.size, B.size);
}

/** Find the regime a requirement names, preferring the closest fit rather than the longest. */
function resolveRegime(requirement) {
  let best = null, bestScore = 0;
  for (const r of REGIMES) {
    const score = similarity(requirement, r.name);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

/** The candidate's own name for a regime, if they hold something the requirement names. */
function findHeld(view, name) {
  let best = null, bestScore = 0;
  for (const r of view.regimes || []) {
    const score = similarity(name, r.name);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

/**
 * The inversion. Given a required regime, every regime that shares enough evidence clusters
 * with it counts as adjacent, and the shared clusters are the explanation.
 */
function equivalents(regime, minShared = 5) {
  const clusters = new Set(regime.clusters || []);
  return REGIMES
    .filter((r) => r.id !== regime.id)
    .map((r) => ({ regime: r, shared: (r.clusters || []).filter((c) => clusters.has(c)) }))
    .filter((x) => x.shared.length >= minShared)
    .sort((a, b) => b.shared.length - a.shared.length);
}

function matchRequirement(requirement, view) {
  const claimText = (c) => norm([c.what, c.detail, c.bullet, c.constraint,
                                 (c.regimes || []).join(' ')].join(' '));
  const claimsNaming = (name) =>
    view.claims.filter((c) => (c.regimes || []).some((n) => similarity(n, name) > 0));

  const required = resolveRegime(requirement);

  // 1. Held outright. The candidate's name for it may be more specific than the
  //    requirement's ("FedRAMP Moderate" against a requirement for "FedRAMP").
  const direct = required ? findHeld(view, required.name) : findHeld(view, requirement);
  if (direct) {
    return {
      requirement, status: 'direct',
      why: `Holds ${direct.name} directly, as ${direct.accountability || 'a participant'}.`
         + (direct.observable ? ` Observable: ${direct.observable}` : ''),
      claims: claimsNaming(direct.name),
    };
  }

  // 2. Held by an evidence-equivalent neighbour. This is the part keyword search cannot do.
  if (required) {
    for (const { regime, shared } of equivalents(required)) {
      const r = findHeld(view, regime.name);
      if (r) {
        return {
          requirement, status: 'equivalent',
          why: `No ${required.name} on the record, but ${r.name} shares ${shared.length} `
             + `evidence clusters with it, including ${shared.slice(0, 3).map(humanCluster).join(', ')}. `
             + `One programme produces the evidence for both.`,
          ask: `Did the same evidence, team, or quarter also serve ${required.name}?`,
          claims: claimsNaming(r.name),
          held_instead: r.name,
        };
      }
    }
  }

  // 3. Plain language requirement, matched against claim text.
  const words = norm(requirement).split(' ').filter((w) => w.length > 3);
  const hits = view.claims
    .map((c) => ({ c, n: words.filter((w) => claimText(c).includes(w)).length }))
    .filter((x) => x.n >= Math.max(1, Math.ceil(words.length / 2)))
    .sort((a, b) => b.n - a.n);

  if (hits.length) {
    return {
      requirement, status: 'evidenced',
      why: `Matched against the substance of ${hits.length} claim(s), not a skills list.`,
      claims: hits.map((h) => h.c),
    };
  }

  return {
    requirement, status: 'not evidenced',
    why: required
      ? `Nothing on the record evidences ${required.name}, and no regime they hold is close enough `
        + 'to imply the same control work.'
      : 'No claim on the record speaks to this.',
    ask: `Ask directly. Absence from a record means it was not interrogated, which is not the `
       + `same as never done.`,
    claims: [],
  };
}

// The cluster descriptions are written as lists, so taking the first comma-segment gives
// things like "ir plan". The key itself reads better; a few need a real name.
const CLUSTER_LABEL = {
  bcdr: 'backup and disaster recovery',
  crypto_key_mgmt: 'encryption and key management',
  pen_test: 'penetration testing',
  awareness_training: 'security awareness training',
  incident_response: 'incident response',
  control_narratives: 'written control narratives',
  continuous_monitoring: 'continuous monitoring',
  customer_security_review: 'customer security questionnaires',
  validation_qualification: 'validation and qualification',
  retention_deletion: 'retention and deletion',
  subject_rights: 'data subject rights',
  data_flow_mapping: 'data flow mapping',
  asset_inventory: 'asset inventory',
  policy_governance: 'policy governance',
  accessibility_testing: 'accessibility testing',
};
const humanCluster = (k) => CLUSTER_LABEL[k] || k.replace(/_/g, ' ');

const TIER_LABEL = {
  T0: 'asserted', T1: 'confirmed with a specific recollection', T2: 'documented',
  T3: 'corroborated by a named former colleague', T4: 'verified against an independent record',
};

function report(view, requirements) {
  const results = requirements.map((r) => matchRequirement(r, view));
  const out = [];
  const c = view.candidate;

  out.push(`# Fit report: ${c.name}`, '');
  out.push(`${view.claims.length} confirmed claims across ${view.roles.length} role(s). `
         + `${view.verification_summary.corroborated_by_a_named_colleague} corroborated by a named `
         + `former colleague.`, '');
  if (c.positioning) out.push(`The candidate positions themselves as: ${c.positioning}`, '');

  const bucket = (s) => results.filter((r) => r.status === s);
  const counts = ['direct', 'equivalent', 'evidenced', 'not evidenced']
    .map((s) => `${bucket(s).length} ${s}`).join(' · ');
  out.push(`**${counts}**`, '');

  for (const r of results) {
    const mark = { direct: 'MET', equivalent: 'MET BY EQUIVALENT', evidenced: 'EVIDENCED',
                   'not evidenced': 'NOT EVIDENCED' }[r.status];
    out.push(`## ${r.requirement}`, '', `**${mark}.** ${r.why}`, '');
    if (r.ask) out.push(`*Ask:* ${r.ask}`, '');
    for (const cl of r.claims.slice(0, 3)) {
      out.push(`- ${cl.what}`);
      const facts = [];
      if (cl.agency) facts.push(`they ${{ completed: 'did this', scoped: 'scoped it and handed it off',
                                          enabled: 'enabled a team to do it' }[cl.agency]}`);
      if (cl.authority && cl.authority !== 'none') facts.push(`authority: ${cl.authority.replace(/_/g, ' ')}`);
      facts.push(TIER_LABEL[cl.verification] || cl.verification);
      out.push(`  - ${facts.join(' · ')}`);
      if (cl.constraint) out.push(`  - Constraint: ${cl.constraint}`);
      for (const f of cl.figures || []) {
        out.push(`  - ${f.value} ${f.unit.replace(/_/g, ' ')}${f.measures ? ` (${f.measures.replace(/_/g, ' ')})` : ''}`
               + `${f.baseline ? `, from a baseline of ${f.baseline.toLowerCase()}` : ''}`
               + `${f.how_measured ? `. Measured by: ${f.how_measured.toLowerCase()}` : ''}`);
      }
    }
    out.push('');
  }

  const gaps = bucket('not evidenced');
  out.push('## What this record does not tell you', '');
  if (gaps.length) {
    out.push('These requirements are unevidenced. That is not the same as unmet: a corpus records '
           + 'what was interrogated, and anything never asked about is simply absent.', '');
    for (const g of gaps) out.push(`- ${g.requirement}`);
  } else {
    out.push('Every requirement is evidenced or has an evidence-equivalent on the record.');
  }
  out.push('');

  if (view.constraints?.length) {
    out.push('The candidate is under disclosure limits for some of this work. Where an employer or '
           + 'customer is described generically, that is deliberate:', '');
    for (const d of view.constraints) out.push(`- ${d.kind.replace(/_/g, ' ')}: rendered as "${d.render_as.replace(/^Render as /i, '').replace(/.$/, '')}"`);
    out.push('');
  }

  out.push('## Opening a conversation', '');
  const strongest = results.find((r) => r.status === 'direct' && r.claims.length)
                 || results.find((r) => r.claims.length);
  if (strongest && strongest.claims[0]) {
    const cl = strongest.claims[0];
    out.push('Lead with the specific thing they did, not with the category it belongs to. From '
           + 'this record, the strongest opening is:', '');
    out.push(`> ${cl.detail || cl.what}`, '');
    out.push('Every detail above traces to a claim the candidate confirmed with a specific '
           + 'recollection. Do not embellish it; the point of contacting them this way is that '
           + 'you did not have to.', '');
  }
  const equiv = bucket('equivalent');
  if (equiv.length) {
    out.push(`Worth asking about ${equiv.length === 1 ? 'one thing' : `${equiv.length} things`} the `
           + 'record implies but does not name:', '');
    for (const e of equiv) out.push(`- ${e.ask}`);
  }

  return out.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const viewFile = args[0];
  let requirements = [];

  const reqIdx = args.indexOf('--requirements');
  if (reqIdx >= 0) {
    requirements = (args[reqIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  } else if (args[1]) {
    const role = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    requirements = role.requirements || [];
  }

  if (!viewFile || !requirements.length) {
    console.error('usage: node scripts/match.js <recruiter-view.json> <role.json>');
    console.error('       node scripts/match.js <recruiter-view.json> --requirements "a, b, c"');
    process.exit(2);
  }

  const view = JSON.parse(fs.readFileSync(viewFile, 'utf8'));
  if (view.format !== 'mycareer-recruiter-view/0.1') {
    console.error(`refusing to read ${path.basename(viewFile)}: not a recruiter view. `
                + 'Match against the projection, never against a raw corpus.');
    process.exit(1);
  }
  console.log(report(view, requirements));
}

module.exports = { matchRequirement, equivalents, resolveRegime, similarity, humanCluster, report };
