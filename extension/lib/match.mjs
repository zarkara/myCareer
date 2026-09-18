/**
 * Requirement matching, browser build.
 *
 * A port of the pure matching core in scripts/match.js. The CommonJS version is the
 * reference; extension/test/crosscheck.mjs asserts the two agree on every requirement,
 * so drift shows up as a test failure rather than as two products quietly disagreeing.
 *
 * No score, no ranking, here or anywhere. See docs/screening.md.
 */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean));

/** Every token of the shorter name must appear in the longer one. See the CJS original. */
export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  const shared = [...A].filter((t) => B.has(t)).length;
  if (shared < Math.min(A.size, B.size)) return 0;
  return shared / Math.max(A.size, B.size);
}

/**
 * Does a requirement line MENTION a regime? Requirement text carries trailing words a
 * canonical name does not: "ISO 27001 audits and certification" against "ISO/IEC 27001".
 * Token-set equality fails there, so also measure how much of the regime NAME the
 * requirement covers, and demand at least one distinctive token so that a shared "the"
 * or a lone "2" cannot carry a match on its own.
 */
const DISTINCTIVE = (t) => t.length >= 4 || /[0-9]/.test(t);
function mentions(requirement, name) {
  const R = tokens(requirement), N = tokens(name);
  if (!R.size || !N.size) return 0;
  const shared = [...N].filter((t) => R.has(t));
  if (!shared.some(DISTINCTIVE)) return 0;
  const coverage = shared.length / N.size;
  return coverage >= 0.5 ? coverage : 0;
}

export function resolveRegime(requirement, regimes) {
  let best = null, bestScore = 0;
  for (const r of regimes) {
    const score = Math.max(similarity(requirement, r.name), mentions(requirement, r.name));
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

function findHeld(view, name) {
  let best = null, bestScore = 0;
  for (const r of view.regimes || []) {
    const score = similarity(name, r.name);
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best;
}

export function equivalents(regime, regimes, minShared = 5) {
  const clusters = new Set(regime.clusters || []);
  return regimes
    .filter((r) => r.id !== regime.id)
    .map((r) => ({ regime: r, shared: (r.clusters || []).filter((c) => clusters.has(c)) }))
    .filter((x) => x.shared.length >= minShared)
    .sort((a, b) => b.shared.length - a.shared.length);
}

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
export const humanCluster = (k) => CLUSTER_LABEL[k] || k.replace(/_/g, ' ');

export function matchRequirement(requirement, view, adjacency) {
  const regimes = adjacency.regimes;
  const claimText = (c) => norm([c.what, c.detail, c.bullet, c.constraint,
                                 (c.regimes || []).join(' ')].join(' '));
  const claimsNaming = (name) =>
    (view.claims || []).filter((c) => (c.regimes || []).some((n) => similarity(n, name) > 0));

  const required = resolveRegime(requirement, regimes);

  const direct = required ? findHeld(view, required.name) : findHeld(view, requirement);
  if (direct) {
    return {
      requirement, status: 'direct',
      why: `Holds ${direct.name} directly, as ${direct.accountability || 'a participant'}.`
         + (direct.observable ? ` Observable: ${direct.observable}` : ''),
      claims: claimsNaming(direct.name),
    };
  }

  if (required) {
    for (const { regime, shared } of equivalents(required, regimes)) {
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

  const words = norm(requirement).split(' ').filter((w) => w.length > 3);
  const hits = (view.claims || [])
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
    ask: 'Ask directly. Absence from a record means it was not interrogated, which is not the '
       + 'same as never done.',
    claims: [],
  };
}

/**
 * A resume for one posting. This SELECTS from confirmed claims; it never rewrites a claim to
 * fit the wording of a job description. That is the entire difference between this and every
 * keyword-tailoring tool on the market, and it is why the output survives a reference check.
 */
export function tailoredResume(view, posting, results) {
  const used = new Set();
  const ordered = [];
  // Claims that answer a stated requirement come first, in the order the employer asked.
  for (const r of results) {
    for (const c of r.claims) {
      if (!used.has(c.id)) { used.add(c.id); ordered.push(c); }
    }
  }
  for (const c of view.claims || []) {
    if (!used.has(c.id)) { used.add(c.id); ordered.push(c); }
  }

  const byRole = new Map();
  for (const c of ordered) {
    if (!byRole.has(c.role_id)) byRole.set(c.role_id, []);
    byRole.get(c.role_id).push(c);
  }

  const out = [];
  const p = view.candidate || {};
  out.push(`# ${p.name || ''}`);
  if (p.positioning) out.push('', `**${p.positioning}**`);
  const contact = [p.location, p.contact?.email, p.contact?.linkedin].filter(Boolean).join(' · ');
  if (contact) out.push('', contact);
  out.push('', '---', '');

  out.push(`*Prepared for ${posting.title}${posting.company ? ` at ${posting.company}` : ''}. `
         + 'Every line below is a claim from a verified record, selected for this posting. '
         + 'Nothing was reworded to match the job description.*', '');

  out.push('## Experience', '');
  for (const role of view.roles || []) {
    const claims = byRole.get(role.id);
    if (!claims || !claims.length) continue;
    out.push(`### ${role.title}, ${role.organization || ''}`.replace(/, $/, ''));
    const meta = [role.location, role.dates?.start
      ? `${role.dates.start} to ${role.dates.ongoing ? 'present' : role.dates.end || 'present'}`
      : null].filter(Boolean).join(' · ');
    if (meta) out.push(`*${meta}*`);
    out.push('');
    for (const c of claims.slice(0, 6)) out.push(`- ${c.bullet || c.detail || c.what}`);
    out.push('');
  }

  if ((p.credentials || []).length) {
    out.push('## Education and Credentials', '');
    for (const e of p.credentials) {
      out.push(`- ${[e.credential, e.institution, e.year].filter(Boolean).join(', ')}`);
    }
    out.push('');
  }

  const gaps = results.filter((r) => r.status === 'not evidenced');
  if (gaps.length) {
    out.push('---', '',
      `*This record does not evidence: ${gaps.map((g) => g.requirement).join('; ')}. `
      + 'Stated here rather than papered over.*', '');
  }

  return out.join('\n');
}
