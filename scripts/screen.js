'use strict';
/**
 * The candidate's side of a screen: what a role asks for, what their record evidences,
 * and what a deep dive would have to establish.
 *
 *   node scripts/screen.js <role.json> [recruiter-view.json]
 *   node scripts/screen.js <role.json> <view.json> --brief    the deep-dive interview plan
 *
 * Two outputs from one analysis:
 *
 *   The ANALYSIS goes to the candidate. Every screener on the market tells the candidate
 *   nothing; this tells them which requirements their record evidences, which it does not,
 *   and why. A candidate who is filtered out at least learns what to fix.
 *
 *   The BRIEF is generated from the gaps. It names, for each unevidenced requirement, the
 *   observable that would confirm it and what someone in that seat would have done, drawn
 *   from data/adjacency.json rather than invented. Stage one's gap report is stage two's
 *   interview plan.
 *
 * This never produces a score or a ranking, and it never will. A tool that ranks candidates
 * is an automated employment decision tool, with the audit obligations that follow. This
 * produces evidence for a person to read. See docs/screening.md.
 */
const fs = require('fs');
const M = require('./mycareer');
const { matchRequirement, resolveRegime, equivalents, humanCluster } = require('./match');

const adjacency = M.loadAdjacency();

const TIER_LABEL = {
  T0: 'asserted only', T1: 'confirmed with a specific recollection', T2: 'documented',
  T3: 'corroborated by a named former colleague', T4: 'verified against an independent record',
};

/**
 * What a deep dive would have to establish for one requirement, and how to go after it.
 * Everything here is retrieval from the adjacency data. Nothing is invented, because a
 * plausible but wrong probe can implant a memory the candidate then sincerely believes.
 */
function probesFor(result) {
  const regime = resolveRegime(result.requirement);
  const probes = [];

  if (!regime) {
    probes.push(`Describe the system or programme where this work would have lived, then let the `
              + `interrogation scaffold from there.`);
    probes.push(`What would have broken if you had not been there?`);
    return { regime: null, probes, evidence: null };
  }

  const evidence = regime.observable || null;

  if (result.status === 'equivalent' && result.held_instead) {
    const shared = (equivalents(regime).find((e) => e.regime.name === result.held_instead)
                 || { shared: [] }).shared;
    probes.push(`You named ${result.held_instead}. Did the same evidence, the same team, or the `
              + `same quarter also serve ${regime.name}?`);
    if (shared.length) {
      probes.push(`Specifically: the ${shared.slice(0, 3).map(humanCluster).join(', ')} work. Was `
                + `any of it reused, mapped, or submitted under ${regime.name}?`);
    }
  }

  if (regime.silent_form) {
    probes.push(`${regime.silent_form} Was that the situation?`);
  }

  for (const signal of (regime.role_signals || []).slice(0, 3)) {
    probes.push(`Were you the one who ${signal}? If so, what specifically, and who else was in it?`);
  }

  if (evidence) {
    probes.push(`The observable that would confirm it: ${evidence} Which of those existed, and `
              + `could you still name or produce one?`);
  }

  return { regime, probes, evidence };
}

function analysis(role, view, results) {
  const out = [];
  const met = results.filter((r) => r.status === 'direct' || r.status === 'equivalent');
  const evidenced = results.filter((r) => r.status === 'evidenced');
  const gaps = results.filter((r) => r.status === 'not evidenced');

  out.push(`# Your match analysis: ${role.title}${role.company ? ` at ${role.company}` : ''}`, '');
  out.push('This is the same analysis the employer sees. There is no score, because a score '
         + 'would tell you nothing about what to do next.', '');

  if (view) {
    out.push(`Your record carries ${view.claims.length} confirmed claims across `
           + `${view.roles.length} role(s), `
           + `${view.verification_summary.corroborated_by_a_named_colleague} of them corroborated `
           + `by a named former colleague.`, '');
  } else {
    out.push('You have no record on file yet, so nothing below is evidenced. That is not a '
           + 'judgement about your experience; it is a statement about what has been written '
           + 'down and checked.', '');
  }

  out.push(`**${met.length} evidenced by your record · ${evidenced.length} matched on substance · `
         + `${gaps.length} not evidenced**`, '');

  if (met.length) {
    out.push('## What your record already establishes', '');
    for (const r of met) {
      out.push(`**${r.requirement}.** ${r.why}`);
      const c = r.claims[0];
      if (c) {
        out.push(`> ${c.detail || c.what}`);
        out.push(`> Recorded as: ${TIER_LABEL[c.verification] || c.verification}.`);
      }
      out.push('');
    }
  }

  if (evidenced.length) {
    out.push('## Matched on substance rather than wording', '');
    out.push('These were not found by keyword. They were matched against what your claims '
           + 'actually describe.', '');
    for (const r of evidenced) out.push(`- **${r.requirement}** — ${r.claims.length} claim(s)`);
    out.push('');
  }

  if (gaps.length) {
    out.push('## What is not evidenced, and what that means', '');
    out.push('**Unevidenced is not the same as untrue.** A record only contains what has been '
           + 'interrogated. If you did this work and it is not here, it is because nobody asked '
           + 'you about it properly, which is the specific failure this exists to fix.', '');
    for (const r of gaps) {
      const { regime, evidence } = probesFor(r);
      out.push(`**${r.requirement}**`);
      if (evidence) {
        out.push(`What would settle it: ${evidence}`);
      }
      if (regime && regime.silent_form) {
        out.push(`Worth knowing: ${regime.silent_form}`);
      }
      out.push('');
    }
  }

  out.push('---', '');
  if (gaps.length || met.some((r) => r.status === 'equivalent')) {
    out.push('## If you think this is wrong', '');
    out.push('You can ask to be interviewed about exactly the gaps above. It takes about forty '
           + 'minutes, it asks about your systems rather than reading you a list of behavioural '
           + 'questions, and it produces a record you keep and reuse for every future '
           + 'application, whatever happens with this one.', '');
    out.push('Nothing in it can be confirmed by agreeing with the interviewer. Every claim needs '
           + 'a particular you supply and it does not: a person, a date, an artifact, an '
           + 'argument. That is what makes it worth an employer reading.', '');
  } else {
    out.push('Your record evidences every requirement on this role. Nothing further is needed '
           + 'from you.', '');
  }

  return out.join('\n');
}

function brief(role, view, results) {
  const targets = results.filter((r) => r.status === 'not evidenced' || r.status === 'equivalent');
  const out = [];

  out.push(`# Deep dive brief: ${role.title}${role.company ? ` at ${role.company}` : ''}`, '');
  out.push('Interrogate only the requirements below. Everything else on this role is already '
         + 'evidenced by the record, and re-covering it wastes the candidate\'s time and '
         + 'weakens the session.', '');
  out.push('**The rules do not relax because this is an appeal.** Nothing becomes a confirmed '
         + 'claim without a particular the scaffold did not supply. A candidate motivated to '
         + 'pass a filter is exactly the candidate most likely to agree with a flattering '
         + 'suggestion, so the discipline matters more here, not less.', '');

  if (!targets.length) {
    out.push('Nothing to interrogate: every requirement is evidenced.');
    return out.join('\n');
  }

  out.push(`${targets.length} requirement(s) to establish.`, '', '---', '');

  for (const r of targets) {
    const { regime, probes, evidence } = probesFor(r);
    out.push(`## ${r.requirement}`, '');
    out.push(`Current status: **${r.status}**. ${r.why}`, '');

    if (regime) {
      out.push(`Resolved to **${regime.name}** (${regime.kind}). ${regime.why}`, '');
      if (evidence) out.push(`**Confirming observable.** ${evidence}`, '');
    }

    out.push('**Probes, in order.** Each is a candidate for the person to triage, never a '
           + 'statement about their history:', '');
    for (const p of probes) out.push(`1. ${p}`);
    out.push('');

    out.push('**What would count as evidence.** A named artifact they could still produce, a '
           + 'named person who was in it, a date range that matches the role, and a clear '
           + 'answer on whether they were accountable, contributing, adjacent, or merely '
           + 'present. Anything short of that is recorded as open and stays out of the packet.', '');
  }

  out.push('---', '');
  out.push('## After the session', '');
  out.push('```bash');
  out.push('node scripts/validate_corpus.js corpus.json');
  out.push('node scripts/recruiter_view.js corpus.json packet.json --target <role>');
  out.push('```');
  out.push('');
  out.push('The packet contains confirmed claims with provenance and an explicit list of what is '
         + 'still unevidenced. It does not contain a recommendation, and it never contains a '
         + 'score. A person reads it and decides.', '');

  return out.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const [roleFile, viewFile] = args.filter((a) => !a.startsWith('--'));

  if (!roleFile) {
    console.error('usage: node scripts/screen.js <role.json> [recruiter-view.json] [--brief]');
    process.exit(2);
  }

  const role = JSON.parse(fs.readFileSync(roleFile, 'utf8'));
  const requirements = role.requirements || [];
  if (!requirements.length) {
    console.error(`${roleFile} has no "requirements" array.`);
    process.exit(2);
  }

  let view = null;
  if (viewFile) {
    view = JSON.parse(fs.readFileSync(viewFile, 'utf8'));
    if (view.format !== 'mycareer-recruiter-view/0.1') {
      console.error('that is not a recruiter view. Screen against the projection, never a raw corpus.');
      process.exit(1);
    }
  }

  const empty = { claims: [], roles: [], regimes: [], candidate: {},
                  verification_summary: { corroborated_by_a_named_colleague: 0 } };
  const results = requirements.map((r) => matchRequirement(r, view || empty));

  console.log(flags.has('--brief') ? brief(role, view, results) : analysis(role, view, results));
}

module.exports = { analysis, brief, probesFor };
