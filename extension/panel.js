/**
 * The panel. Everything here runs on the candidate's machine: the page is parsed locally,
 * the match is computed locally, the record is stored locally, and nothing is transmitted.
 *
 * There is no score and no ranking. The panel reports what the record evidences, what it does
 * not, and why, and then the candidate decides what to do about it.
 */
import { extractPosting } from './lib/jobpost.mjs';
import { matchRequirement, tailoredResume } from './lib/match.mjs';
import adjacency from './lib/adjacency.json' with { type: 'json' };

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let view = null;
let lastRun = null;

const STATUS = {
  direct: { tag: 'Evidenced', cls: 'direct' },
  equivalent: { tag: 'Evidenced by equivalent work', cls: 'equivalent' },
  evidenced: { tag: 'Matched on substance', cls: 'evidenced' },
  'not evidenced': { tag: 'Not evidenced', cls: 'gap' },
};

function showError(message) {
  const e = $('error');
  e.textContent = message;
  e.hidden = false;
}

function setRecord(loaded) {
  view = loaded;
  const v = view.verification_summary || {};
  $('recordLine').textContent =
    `${(view.claims || []).length} confirmed claims · `
    + `${v.corroborated_by_a_named_colleague || 0} corroborated by a named colleague`;
  $('setup').hidden = true;
  $('actions').hidden = false;
}

/** Accepts either a recruiter view or a raw corpus, and refuses to display a raw corpus. */
function normalise(parsed) {
  if (parsed.format === 'mycareer-recruiter-view/0.1') return parsed;
  if (parsed.mycareer_version) {
    throw new Error('That is a full corpus. It holds notes that should never reach an employer. '
                  + 'Run: node scripts/recruiter_view.js corpus.json view.json, and load that.');
  }
  throw new Error('That does not look like a myCareer record.');
}

$('recordFile').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  $('error').hidden = true;
  try {
    const loaded = normalise(JSON.parse(await file.text()));
    await chrome.storage.local.set({ view: loaded });
    setRecord(loaded);
  } catch (err) {
    showError(err.message);
  }
});

$('read').addEventListener('click', async () => {
  $('error').hidden = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    const doc = new DOMParser().parseFromString(result.html, 'text/html');
    const posting = extractPosting(doc);
    if (!posting) throw new Error('No job posting found on this page. Open the posting itself '
                                + 'rather than a list of results.');
    if (!posting.title) posting.title = result.title;

    render(posting);
  } catch (err) {
    showError(err.message);
  }
});

function render(posting) {
  const requirements = [...posting.requirements.required, ...posting.requirements.preferred];
  if (!requirements.length) {
    showError('Found the posting but could not pick out any requirements from it. Some postings '
            + 'are written as prose with nothing stated as a requirement.');
    return;
  }

  const results = requirements.map((r) => matchRequirement(r, view, adjacency));
  lastRun = { posting, results };

  const head = $('posting');
  head.replaceChildren(
    el('h2', null, posting.title || 'This posting'),
    el('p', 'meta', [posting.company, posting.location].filter(Boolean).join(' · ')
      + ` · read from ${posting.source === 'json-ld' ? 'structured job data' : posting.source}`),
  );

  const count = (s) => results.filter((r) => r.status === s).length;
  const gaps = count('not evidenced');
  $('summary').textContent =
    `${results.length - gaps} of ${results.length} requirements evidenced by your record`
    + (gaps ? `, ${gaps} not` : '');

  const list = $('requirements');
  list.replaceChildren();
  for (const r of results) {
    const meta = STATUS[r.status];
    const box = el('div', `req ${meta.cls}`);
    box.append(el('div', 'tag', meta.tag), el('h3', null, r.requirement), el('p', 'why', r.why));
    if (r.ask) box.append(el('p', 'why', `Worth asking: ${r.ask}`));
    const claim = r.claims[0];
    if (claim) {
      const c = el('div', 'claim');
      c.append(el('div', null, claim.detail || claim.what));
      const facts = [];
      if (claim.agency) {
        facts.push({ completed: 'you did this', scoped: 'you scoped it and handed it off',
                     enabled: 'you enabled a team to do it' }[claim.agency]);
      }
      facts.push(({ T1: 'confirmed with a specific recollection', T2: 'documented',
                    T3: 'corroborated by a named former colleague',
                    T4: 'verified against a record' })[claim.verification] || claim.verification);
      c.append(el('div', 'meta', facts.join(' · ')));
      box.append(c);
    }
    list.append(box);
  }

  $('result').hidden = false;
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (s) => String(s || 'posting').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '').slice(0, 40);

$('dlResume').addEventListener('click', () => {
  if (!lastRun) return;
  download(`resume-${slug(lastRun.posting.company || lastRun.posting.title)}.md`,
           tailoredResume(view, lastRun.posting, lastRun.results));
});

$('dlBrief').addEventListener('click', () => {
  if (!lastRun) return;
  download(`deep-dive-${slug(lastRun.posting.company || lastRun.posting.title)}.md`,
           brief(lastRun.posting, lastRun.results));
});

/** The gaps from this posting, as an interrogation plan. Probes come from the adjacency data. */
function brief(posting, results) {
  const targets = results.filter((r) => r.status === 'not evidenced' || r.status === 'equivalent');
  const out = [`# Deep dive brief: ${posting.title}${posting.company ? ` at ${posting.company}` : ''}`, ''];

  if (!targets.length) {
    out.push('Your record already evidences every requirement on this posting.');
    return out.join('\n');
  }

  out.push('Interrogate only what is below. Everything else on this posting is already evidenced.',
           '',
           '**The rules do not relax because this is an appeal.** Nothing becomes a confirmed claim '
           + 'without a particular you supply that the question did not. Wanting to pass a filter is '
           + 'exactly what makes a flattering suggestion easy to agree with.', '', '---', '');

  for (const r of targets) {
    out.push(`## ${r.requirement}`, '', `Status: **${r.status}**. ${r.why}`, '');
    const regime = adjacency.regimes.find((g) => r.why.includes(g.name));
    if (r.ask) out.push(`1. ${r.ask}`);
    if (regime) {
      if (regime.silent_form) out.push(`1. ${regime.silent_form} Was that the situation?`);
      for (const s of (regime.role_signals || []).slice(0, 3)) {
        out.push(`1. Were you the one who ${s}? If so, what specifically, and who else was in it?`);
      }
      if (regime.observable) {
        out.push(`1. What would confirm it: ${regime.observable} Which of those existed, and could `
               + 'you still name or produce one?');
      }
    } else {
      out.push('1. Describe the system where this work lived, then scaffold from there.',
               '1. What would have broken if you had not been there?');
    }
    out.push('');
  }

  out.push('---', '', 'Run this as a session with the myCareer interview, then re-export your '
         + 'record and read this posting again.', '');
  return out.join('\n');
}

chrome.storage.local.get('view').then(({ view: stored }) => {
  if (stored) setRecord(stored);
}).catch(() => {});
