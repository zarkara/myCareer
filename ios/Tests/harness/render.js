'use strict';
/**
 * A transliteration of ios/MyCareer/Markdown.swift, statement for statement.
 *
 * It exists so the export logic can be tested on a machine without Xcode. It is NOT
 * the source of truth: Markdown.swift is. The golden files under Tests/Golden are the
 * contract between them, and MyCareerTests.swift asserts the Swift produces exactly
 * the same bytes. If this port drifts, the Swift test fails and says so.
 *
 * Keep edits here mechanical. Any change to Markdown.swift gets mirrored here, the
 * goldens get regenerated on a Mac, and both suites are run.
 */

const LABEL = {
  completed: 'I did it',
  scoped: 'I scoped it and handed it off',
  enabled: 'I enabled a team to do it',
};

const span = (r) => {
  const from = r.start ? r.start : '?';
  return r.end ? `${from} to ${r.end}` : `${from} to present`;
};

const heading = (r) => [r.title, r.org].filter((s) => s).join(', ');

const cell = (s) => (!s ? ' ' : s.replace(/\|/g, '\\|'));

const isEmpty = (e) =>
  !e.text && !e.narrative && !e.constraint && !e.confirmedDetail &&
  !e.whatWentWrong && !e.couldConfirm && (e.figures || []).every((f) => !f.value);

function entry(e) {
  const out = [];
  out.push(`### ${e.text ? e.text : 'Untitled'}`);
  out.push('');
  out.push(`*${LABEL[e.agency]}.*`);
  out.push('');

  if (e.narrative) { out.push(e.narrative); out.push(''); }
  if (e.constraint) { out.push(`**The constraint.** ${e.constraint}`); out.push(''); }
  if (e.confirmedDetail) { out.push(`**The detail that pins it down.** ${e.confirmedDetail}`); out.push(''); }
  if (e.whatWentWrong) { out.push(`**What went wrong.** ${e.whatWentWrong}`); out.push(''); }
  if (e.couldConfirm) { out.push(`**Who could confirm it.** ${e.couldConfirm}`); out.push(''); }

  const figures = (e.figures || []).filter((f) => f.value);
  if (figures.length) {
    out.push('| Figure | Measures | Before | Source | Sourceable |');
    out.push('|---|---|---|---|---|');
    for (const f of figures) {
      out.push(`| ${cell(f.value)} | ${cell(f.what)} | ${cell(f.baseline)} | ${cell(f.source)} | ${f.sourceable ? 'yes' : '**no**'} |`);
    }
    out.push('');
  }
  return out;
}

/**
 * @param {object} c    the corpus
 * @param {string} date yyyy-MM-dd, injected so output is deterministic under test
 */
function render(c, date) {
  const out = [];
  out.push(c.person.name ? `# Career Autobiography: ${c.person.name}` : '# Career Autobiography');
  if (c.person.tagline) out.push(`*${c.person.tagline}*`);
  if (c.person.location) out.push(c.person.location);
  out.push('');

  // Mirrors the explicit tiebreak in Markdown.swift. Swift's sort is unstable, so
  // roles sharing a start date are ordered by id there, and must be here too.
  const ordered = [...c.roles].sort((a, b) =>
    a.start === b.start ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.start > b.start ? -1 : 1);
  for (const role of ordered) {
    out.push(`## ${heading(role) ? heading(role) : 'Untitled chapter'}`);
    const meta = [role.location, span(role)].filter((s) => s).join(' · ');
    if (meta) out.push(`*${meta}*`);
    out.push('');

    if (role.chapter) { out.push(role.chapter); out.push(''); }

    for (const e of role.entries || []) {
      if (!isEmpty(e)) out.push(...entry(e));
    }
  }

  const unsourced = (c.roles || [])
    .flatMap((r) => r.entries || [])
    .flatMap((e) => e.figures || [])
    .filter((f) => !f.sourceable && f.value);

  if (unsourced.length) {
    out.push('## Numbers that still need a source');
    out.push('');
    out.push('These are not ready to put in front of anyone. A number you cannot produce a source for gets omitted, not softened.');
    out.push('');
    for (const f of unsourced) {
      out.push(`- **${f.value}**${f.what ? `, ${f.what}` : ''}${f.source ? ` (claimed source: ${f.source})` : ''}`);
    }
    out.push('');
  }

  out.push('---');
  out.push('');
  out.push(`Exported ${date} from myCareer.`);

  return out.join('\n').split('\n\n\n').join('\n\n');
}

module.exports = { render };
