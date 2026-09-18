/**
 * Pulls a job posting out of whatever page the candidate is looking at.
 *
 * Strategy, in order:
 *
 *   1. schema.org JobPosting in JSON-LD. Google for Jobs requires this markup, so Indeed,
 *      LinkedIn, Greenhouse, Lever, and most Workday-hosted career sites emit it. Reading a
 *      published standard is far more durable than per-site CSS selectors, which break the
 *      week a site ships a redesign.
 *   2. Microdata, the older itemtype form of the same vocabulary.
 *   3. Heuristics over the visible text, as a last resort.
 *
 * This reads only the page already on screen, only when the candidate asks. It does not
 * crawl, does not collect postings in the background, and does not submit anything.
 */

const REQUIREMENT_HEADINGS = [
  'requirements', 'qualifications', 'what you bring', 'what you will bring',
  'what we are looking for', 'what we look for', 'about you', 'your experience',
  'minimum qualifications', 'basic qualifications', 'required', 'must have',
  'skills and experience', 'you have', 'who you are',
];

const NICE_HEADINGS = [
  'nice to have', 'preferred', 'bonus', 'preferred qualifications',
  'desirable', 'a plus', 'nice-to-have',
];

const STOP_HEADINGS = [
  'benefits', 'perks', 'compensation', 'salary', 'equal opportunity', 'eeo',
  'about us', 'about the company', 'how to apply', 'our values', 'diversity',
  'what we offer', 'why join',
];

const stripTags = (html) => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
  .replace(/<li[^>]*>/gi, '\n- ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const firstOf = (v) => (Array.isArray(v) ? v[0] : v);

function fromJsonLd(doc) {
  const nodes = [...doc.querySelectorAll('script[type="application/ld+json"]')];
  for (const node of nodes) {
    let parsed;
    try {
      parsed = JSON.parse(node.textContent);
    } catch {
      continue;   // a malformed block on the page is not a reason to give up on the page
    }
    // A page may ship one object, an array, or an @graph wrapper.
    const candidates = [parsed, ...(parsed['@graph'] || []), ...(Array.isArray(parsed) ? parsed : [])];
    for (const c of candidates.flat()) {
      if (!c || typeof c !== 'object') continue;
      const type = firstOf(c['@type']);
      if (type !== 'JobPosting') continue;

      const org = c.hiringOrganization;
      const loc = firstOf(c.jobLocation);
      return {
        source: 'json-ld',
        title: c.title || null,
        company: (typeof org === 'string' ? org : org?.name) || null,
        location: loc?.address?.addressLocality
          ? [loc.address.addressLocality, loc.address.addressRegion].filter(Boolean).join(', ')
          : (c.jobLocationType === 'TELECOMMUTE' ? 'Remote' : null),
        employment_type: firstOf(c.employmentType) || null,
        posted: c.datePosted || null,
        description: stripTags(c.description),
        // Some sites populate these, most do not. Used as a hint, never as the only source.
        stated_skills: [c.skills, c.qualifications, c.experienceRequirements]
          .map((v) => (typeof v === 'string' ? stripTags(v) : null)).filter(Boolean).join('\n'),
      };
    }
  }
  return null;
}

function fromMicrodata(doc) {
  const scope = doc.querySelector('[itemtype$="schema.org/JobPosting"]');
  if (!scope) return null;
  const prop = (name) => {
    const el = scope.querySelector(`[itemprop="${name}"]`);
    if (!el) return null;
    return el.getAttribute('content') || stripTags(el.innerHTML);
  };
  const description = prop('description');
  if (!description) return null;
  return {
    source: 'microdata',
    title: prop('title'),
    company: prop('hiringOrganization'),
    location: prop('jobLocation'),
    employment_type: prop('employmentType'),
    posted: prop('datePosted'),
    description,
    stated_skills: prop('skills') || '',
  };
}

/** Last resort: the largest block of text that looks like a posting. */
function fromHeuristics(doc) {
  const candidates = [...doc.querySelectorAll(
    'article, main, [class*="job-description"], [class*="jobDescription"], '
  + '[id*="job-description"], [data-automation-id*="jobPostingDescription"], [class*="description"]')];
  let best = null;
  for (const el of candidates) {
    const text = stripTags(el.innerHTML);
    if (!best || text.length > best.length) best = text;
  }
  if (!best || best.length < 200) return null;

  const h1 = doc.querySelector('h1');
  return {
    source: 'heuristic',
    title: h1 ? stripTags(h1.innerHTML) : (doc.title || null),
    company: null,
    location: null,
    employment_type: null,
    posted: null,
    description: best,
    stated_skills: '',
  };
}

export function extractPosting(doc) {
  const posting = fromJsonLd(doc) || fromMicrodata(doc) || fromHeuristics(doc);
  if (!posting) return null;
  return { ...posting, requirements: extractRequirements(posting) };
}

/**
 * A heading is short and unbulleted. Without the length cap, a bullet reading
 * "Must have experience with SOC 2" is mistaken for a "must have" section heading and the
 * requirement it names is silently dropped.
 */
const isHeading = (line, list) => {
  if (line.length > 60) return false;
  const l = line.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return list.some((h) => l === h || l === `${h} ` || l.startsWith(`${h} `) && l.length <= h.length + 12);
};

/**
 * Requirements, in priority order: bullets under a requirements heading, then any bullets,
 * then sentences carrying an obligation verb. Each is trimmed to something a matcher can
 * resolve, because "5+ years of experience with ISO 27001 audits" should match on the regime.
 */
export function extractRequirements(posting) {
  const text = [posting.description || '', posting.stated_skills || ''].join('\n');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const required = [];
  const preferred = [];
  let mode = null;

  for (const line of lines) {
    const isBullet = /^[-•*•●]/.test(line);
    const bare = line.replace(/^[-•*•●]\s*/, '').trim();

    // A bulleted line is content, never a section heading.
    if (!isBullet) {
      if (isHeading(bare, STOP_HEADINGS)) { mode = 'stop'; continue; }
      if (isHeading(bare, REQUIREMENT_HEADINGS)) { mode = 'required'; continue; }
      if (isHeading(bare, NICE_HEADINGS)) { mode = 'preferred'; continue; }
    }

    if (!isBullet || bare.length < 8) continue;
    // 'stop' means a benefits or boilerplate section. Null means no heading seen yet, where
    // treating bullets as requirements is the right guess.
    if (mode === 'stop') continue;

    (mode === 'preferred' ? preferred : required).push(bare);
  }

  // No headings and no bullets: fall back to sentences stating an obligation.
  let pool = required.length ? required : [];
  if (!pool.length) {
    pool = text.split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && s.length < 240)
      .filter((s) => /\b(must|required|require|experience (with|in)|proficien|expertise|familiar(ity)? with|background in|demonstrated)\b/i.test(s));
  }

  return {
    required: pool.map(condense).filter(Boolean).slice(0, 12),
    preferred: preferred.map(condense).filter(Boolean).slice(0, 8),
  };
}

/**
 * Trims a requirement line to the thing being asked for. A matcher resolves "ISO 27001"
 * against a regime; it cannot do anything with "5+ years of hands-on experience with".
 */
export function condense(line) {
  let s = String(line)
    .replace(/^[-•*•●]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,]+$/, '');

  // Preambles stack: "Must have strong experience with X" carries three of them. Strip
  // repeatedly until the line stops shrinking, rather than making one pass in a fixed order.
  const PREFIXES = [
    /^.*?\b\d+\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)\b(?:\s+of)?(?:\s+(?:hands-on|progressive|relevant|professional|direct|proven))?(?:\s+experience)?(?:\s+(?:with|in|as|leading|managing|working with))?\s*/i,
    /^(?:ability to|must have|must be able to|should have|you have|you will have|you bring)\s+/i,
    /^(?:strong|deep|solid|proven|demonstrated|extensive|excellent|significant|hands-on)\s+/i,
    /^(?:experience|expertise|background|knowledge|familiarity|proficiency)\s+(?:with|in|of|as)\s+/i,
    /^(?:a|an|the)\s+/i,
  ];
  for (let pass = 0; pass < 5; pass++) {
    const before = s;
    for (const re of PREFIXES) s = s.replace(re, '');
    if (s === before) break;
  }

  if (s.length < 3 || s.length > 200) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
