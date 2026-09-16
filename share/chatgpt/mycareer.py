#!/usr/bin/env python3
"""myCareer: corpus validation and document rendering, in one file.

    python mycareer.py validate <corpus.json> [rendered.md ...]
    python mycareer.py render   <corpus.json> <target-key> [outdir]

A single file on purpose: this runs in ChatGPT's Code Interpreter sandbox, where
one upload that imports nothing is worth more than a tidy package that might
arrive incomplete. Standard library only.

This is a port of the JavaScript implementation and must agree with it byte for
byte. `python mycareer.py selftest` is not the check that proves it; the
cross-implementation harness in share/chatgpt/crosscheck.js is.
"""

import json
import os
import re
import sys
from datetime import date

# --------------------------------------------------------------------------
# Number formatting that matches JavaScript's String(Number)
# --------------------------------------------------------------------------

def js_num(n):
    """45.0 renders as "45", not "45.0". The trace check compares these as text,
    so a stray decimal point silently breaks every whole-number match."""
    if isinstance(n, float) and n.is_integer():
        return str(int(n))
    return str(n)


# --------------------------------------------------------------------------
# Corpus
# --------------------------------------------------------------------------

COLLECTIONS = ['orgs', 'roles', 'systems', 'claims', 'figures', 'stories',
               'regimes', 'evidence', 'attestations', 'records', 'rejections',
               'open_questions', 'disclosure_limits', 'sessions']

TIER_ORDER = ['T0', 'T1', 'T2', 'T3', 'T4']


def tier_rank(t):
    return TIER_ORDER.index(t) if t in TIER_ORDER else -1


def load(path):
    with open(path, 'r', encoding='utf-8') as fh:
        corpus = json.load(fh)
    for c in COLLECTIONS:
        corpus.setdefault(c, [])
    corpus.setdefault('person', {})
    return corpus


def index(corpus):
    by_id = {}
    for c in COLLECTIONS:
        for e in corpus[c]:
            if isinstance(e, dict) and e.get('id'):
                by_id[e['id']] = dict(e, _collection=c)
    return by_id


def effective_tier(verification):
    """The minimum across rendered fact types. A claim is only as verified as its
    weakest component, never its strongest."""
    if not verification:
        return 'T0'
    per = list((verification.get('by_fact_type') or {}).values())
    if not per:
        return verification.get('tier', 'T0')
    return min(per, key=tier_rank)


def select_for_target(corpus, target_key, min_tier='T1'):
    target = next((t for t in (corpus.get('positioning') or {}).get('targets', [])
                   if t.get('key') == target_key), None)
    if not target:
        raise ValueError(f'unknown positioning target: {target_key}')

    suppressed = set(target.get('suppress') or [])
    carries = list(target.get('carries') or [])
    family = target.get('job_family')

    picked = []
    for c in corpus['claims']:
        if c.get('status') != 'confirmed':
            continue
        if c['id'] in suppressed:
            continue
        if target_key in (c.get('suppress_for') or []):
            continue
        fams = c.get('job_families') or []
        if family and fams and family not in fams:
            continue
        if tier_rank(effective_tier(c.get('verification'))) < tier_rank(min_tier):
            continue
        picked.append(c)

    # Mirrors the JS comparator: carried claims first, then tier, then figure count.
    # Python's sort is stable, as is JavaScript's, so ties keep corpus order.
    picked.sort(key=lambda c: (
        0 if c['id'] in carries else 1,
        -tier_rank(effective_tier(c.get('verification'))),
        -len(c.get('figure_ids') or []),
    ))
    return picked, target


def headline_figures(corpus, claims):
    allowed = {fid for c in claims for fid in (c.get('figure_ids') or [])}
    return [f for f in corpus['figures']
            if f.get('headline') and f.get('sourceable') and f['id'] in allowed][:6]


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

def norm(s):
    s = re.sub(r'[^a-z0-9 ]+', ' ', str(s or '').lower())
    return re.sub(r'\s+', ' ', s).strip()


# Explicit ASCII classes rather than \w: Python's \w is Unicode-aware and
# JavaScript's is not, and the two disagree on accented characters.
NUM_RE = re.compile(r'(?<![A-Za-z0-9_.])(\$?)(\d[\d,]*(?:\.\d+)?)\s?(%|[KMBkmb])?(?![A-Za-z0-9_])')

STRUCTURAL = [
    re.compile(r'\b\d{1,3}[-\s]second\b', re.IGNORECASE | re.ASCII),
    re.compile(r'\bfirst \d{1,3} days\b', re.IGNORECASE | re.ASCII),
    re.compile(r'\b\d{1,3}[-\s]day (plan|approach)\b', re.IGNORECASE | re.ASCII),
]

EMPLOYMENT_ONLY = {'irs_wage_transcript', 'w2', '1099', 'payroll'}
ACCOMPLISHMENT_RE = re.compile(r'^(accomplishment|scope)\.')


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def err(self, code, msg):
        self.errors.append((code, msg))

    def warn(self, code, msg):
        self.warnings.append((code, msg))


def structural(corpus, rep):
    by_id = index(corpus)
    seen = set()

    for c in COLLECTIONS:
        for e in corpus[c]:
            if not e.get('id'):
                rep.err('E001', f'{c}: entity without an id')
                continue
            if e['id'] in seen:
                rep.err('E002', f"duplicate id: {e['id']}")
            seen.add(e['id'])

    def walk_refs(obj, path):
        for k, v in (obj or {}).items():
            if k in ('id', '_collection'):
                continue
            if k.endswith('_id') and isinstance(v, str):
                if v not in by_id:
                    rep.err('E003', f'{path}.{k} -> unknown id "{v}"')
            elif k.endswith('_ids') and isinstance(v, list):
                for r in v:
                    if r not in by_id:
                        rep.err('E003', f'{path}.{k} -> unknown id "{r}"')
            elif isinstance(v, dict):
                walk_refs(v, f'{path}.{k}')

    for c in COLLECTIONS:
        for e in corpus[c]:
            walk_refs(e, f"{c}[{e.get('id')}]")

    # --- claims ---
    for c in corpus['claims']:
        if c.get('status') == 'confirmed':
            detail = (c.get('confirmed_detail') or '').strip()
            if len(detail) < 12:
                rep.err('E010', f"{c['id']}: confirmed without a confirming detail. "
                                'Recognition requires a particular the scaffold did not supply.')
            if not c.get('agency'):
                rep.err('E011', f"{c['id']}: confirmed without agency (completed / scoped / enabled).")
            if not c.get('narrative_long'):
                rep.err('E012', f"{c['id']}: confirmed without narrative_long. "
                                'Capture must sit above every output format.')
            if c.get('bullet') and not c.get('narrative_long'):
                rep.err('E013', f"{c['id']}: has a bullet but no narrative. Compression is one-directional.")
            if not c.get('constraint'):
                rep.warn('W010', f"{c['id']}: no constraint recorded. "
                                 'Achievements read as transformation leadership without one.')
            if not (c.get('job_families') or []):
                rep.warn('W011', f"{c['id']}: no job_families, so it renders for every target.")
        if c.get('status') == 'open' and (c.get('bullet') or c.get('narrative_short')):
            rep.warn('W012', f"{c['id']}: open but already has render-ready prose. "
                             'Open material must not reach a draft.')

    # --- do-not-claim is permanent ---
    rejected = [(r['id'], norm(r.get('text'))) for r in corpus['rejections']]
    rejected = [(i, n) for i, n in rejected if len(n) > 20]
    for c in corpus['claims']:
        if c.get('status') == 'rejected':
            continue
        n = norm(c.get('text'))
        for rid, rn in rejected:
            if n and (rn in n or n in rn):
                rep.err('E020', f"{c['id']}: restates rejected claim {rid}. "
                                'Rejected candidates never come back.')

    # --- figures ---
    fig_by_id = {f['id']: f for f in corpus['figures']}
    for f in corpus['figures']:
        parts_ids = f.get('composite_of') or []
        if parts_ids:
            parts = [fig_by_id[i] for i in parts_ids if i in fig_by_id]
            if len(parts) != len(parts_ids):
                rep.err('E030', f"{f['id']}: composite references a missing figure.")
                continue
            units = {p.get('unit') for p in parts}
            if len(units) > 1 or f.get('unit') not in units:
                rep.warn('W030', f"{f['id']}: composite mixes units "
                                 f"({', '.join(sorted(str(u) for u in units))} vs {f.get('unit')}); "
                                 'arithmetic not checked.')
            else:
                total = sum(p['value'] for p in parts)
                if abs(total - f['value']) > 1e-9:
                    rep.err('E031', f"{f['id']}: composite does not decompose. "
                                    f"Stated {js_num(f['value'])}, parts sum to {js_num(total)}.")
            if any(not p.get('sourceable') for p in parts):
                rep.err('E032', f"{f['id']}: composite includes an unsourceable component, "
                                'so the headline number cannot be defended.')
        if f.get('headline') and not f.get('sourceable'):
            rep.err('E033', f"{f['id']}: headline figure is not sourceable. "
                            'Unsourceable numbers are omitted, not softened.')
        if not f.get('baseline'):
            rep.warn('W031', f"{f['id']}: no baseline. A number without one is decoration.")
        if not f.get('instrument'):
            rep.warn('W032', f"{f['id']}: no instrument, so \"how was it measured\" has no answer.")

    # --- verification tiers must be earned ---
    rec_by_id = {r['id']: r for r in corpus['records']}
    att_by_id = {a['id']: a for a in corpus['attestations']}

    def check_verification(v, label):
        if not v:
            return
        per = list((v.get('by_fact_type') or {}).items())
        if per:
            lowest = min((t for _, t in per), key=tier_rank)
            if v.get('tier') != lowest:
                rep.err('E040', f"{label}: tier is {v.get('tier')} but the weakest fact type is "
                                f'{lowest}. A claim is only as verified as its weakest rendered component.')

        covered = set()
        for rid in (v.get('record_ids') or []):
            covered.update(rec_by_id.get(rid, {}).get('verifies') or [])
        for aid in (v.get('attestation_ids') or []):
            a = att_by_id.get(aid)
            if a and a.get('status') == 'received' and a.get('strength') != 'hearsay':
                covered.update(a.get('establishes') or [])

        for ft, t in per:
            if tier_rank(t) >= tier_rank('T3') and ft not in covered:
                rep.err('E041', f'{label}: claims {t} for "{ft}" but no received attestation or '
                                'record establishes that fact type. This is the check that stops '
                                'verification theater.')

        if tier_rank(v.get('tier', 'T0')) >= tier_rank('T4') and not (v.get('record_ids') or []):
            rep.err('E042', f'{label}: T4 requires an independent record.')
        if v.get('tier') == 'T3':
            ok = any(att_by_id.get(i, {}).get('status') == 'received'
                     and att_by_id.get(i, {}).get('strength') != 'hearsay'
                     for i in (v.get('attestation_ids') or []))
            if not ok:
                rep.err('E043', f'{label}: T3 requires a received attestation from someone who '
                                'witnessed or participated. Hearsay never raises a tier.')

    for c in corpus['claims']:
        check_verification(c.get('verification'), f"claim {c['id']}")
    for r in corpus['roles']:
        check_verification(r.get('verification'), f"role {r['id']}")

    # --- records: what they can and cannot establish ---
    for r in corpus['records']:
        if r.get('type') in EMPLOYMENT_ONLY:
            over = [ft for ft in (r.get('verifies') or []) if ACCOMPLISHMENT_RE.match(ft)]
            if over:
                rep.err('E050', f"{r['id']}: type \"{r['type']}\" cannot establish "
                                f"{', '.join(over)}. Payroll records prove employment, "
                                'never what you built.')
            if r.get('sensitivity') != 'restricted':
                rep.warn('W050', f"{r['id']}: payroll-derived records should be marked restricted.")
        if r.get('conflicts'):
            linked = any(
                any(cid in (r.get('covers_claim_ids') or []) for cid in (q.get('blocks_claim_ids') or []))
                or norm(r['id']) in norm(q.get('question'))
                for q in corpus['open_questions'])
            if not linked:
                rep.warn('W051', f"{r['id']}: records a conflict but no open question tracks it. "
                                 'Record conflicts produce questions, never silent overwrites.')

    # --- attestations ---
    for a in corpus['attestations']:
        if len(a.get('claim_ids') or []) > 5:
            rep.err('E060', f"{a['id']}: too broad. Narrow requests get answered; broad ones get "
                            'ignored and are worth less anyway.')
        if a.get('status') == 'received' and not a.get('scope'):
            rep.warn('W060', f"{a['id']}: received without a stated scope, so it is unclear what "
                             'this person can actually speak to.')
        if a.get('status') == 'received' and not a.get('statement'):
            rep.warn('W061', f"{a['id']}: received without a statement.")

    # --- open questions must be closable ---
    for q in corpus['open_questions']:
        action = q.get('close_action') or ''
        if not action or re.search(r'think|remember|recall more', action, re.IGNORECASE):
            rep.err('E070', f"{q['id']}: close_action must name a document, a person, or a system, "
                            'not more reflection.')

    # --- disclosure limits ---
    limit_ids = {d['id'] for d in corpus['disclosure_limits']}
    for c in corpus['claims']:
        for d in (c.get('disclosure_limit_ids') or []):
            if d not in limit_ids:
                rep.err('E080', f"{c['id']}: unknown disclosure limit {d}")
    for o in corpus['orgs']:
        if o.get('nameable') is False and not o.get('public_name'):
            rep.err('E081', f"{o['id']}: not nameable but no public_name to render instead.")

    # --- positioning ---
    for t in (corpus.get('positioning') or {}).get('targets', []):
        if not t.get('tagline'):
            rep.warn('W090', f"target {t.get('key')}: no tagline.")
        if t.get('fit') == 'thin' and not t.get('objection_answer'):
            rep.warn('W091', f"target {t.get('key')}: fit is thin and no objection answer is prepared.")
        for cid in list(t.get('carries') or []) + list(t.get('suppress') or []):
            if not any(c['id'] == cid for c in corpus['claims']):
                rep.err('E090', f"target {t.get('key')}: references unknown claim {cid}")


def allowed_numbers(corpus):
    ok = set()

    def push(n):
        if n is None or n == '':
            return
        ok.add(js_num(n) if isinstance(n, (int, float)) else str(n))

    fig_by_id = {f['id']: f for f in corpus['figures']}
    rendered = {fid for c in corpus['claims'] if c.get('status') == 'confirmed'
                for fid in (c.get('figure_ids') or [])}
    # A rendered composite licenses its components: narratives legitimately cite the
    # parts a headline figure decomposes to, and the arithmetic is already proven.
    for fid in list(rendered):
        for p in (fig_by_id.get(fid, {}).get('composite_of') or []):
            rendered.add(p)

    for f in corpus['figures']:
        if not f.get('sourceable') or f['id'] not in rendered:
            continue
        v = f['value']
        push(v)
        push(round(v))
        if v >= 1000:
            push(v / 1000)
        if float(v).is_integer() and v >= 1e6:
            push(v / 1e6)

    for r in corpus['roles']:
        dates = r.get('dates') or {}
        for d in (dates.get('start'), dates.get('end')):
            if d:
                push(d[:4])
                push(d)
        scope = r.get('scope') or {}
        for k in ('direct_reports', 'matrixed', 'dotted_line', 'total_org'):
            push(scope.get(k))

    for e in (corpus.get('person') or {}).get('education', []) or []:
        push(e.get('year'))

    return ok


def trace_check(corpus, files, rep):
    ok = allowed_numbers(corpus)
    forbidden = [n for n in (norm(r.get('text')) for r in corpus['rejections']) if len(n) > 20]

    for path in files:
        with open(path, 'r', encoding='utf-8') as fh:
            original = fh.read()
        text = original
        for pat in STRUCTURAL:
            text = pat.sub(lambda m: ' ' * len(m.group(0)), text)
        n = norm(original)
        name = os.path.basename(path)

        for f in forbidden:
            if f in n:
                rep.err('E100', f'{name}: contains rejected claim text -- "{f[:60]}..."')

        if '—' in original:
            rep.err('E101', f'{name}: contains an em dash. House style forbids them.')

        seen = set()
        for m in NUM_RE.finditer(text):
            full, dollar, digits, suffix = m.group(0), m.group(1), m.group(2), m.group(3)
            if full in seen:
                continue
            seen.add(full)
            raw = digits.replace(',', '')
            try:
                v = float(raw)
            except ValueError:
                continue
            # A currency or magnitude marker means the number is a claim, never a
            # list marker, so the small-integer exemption does not apply to it.
            marked = bool(dollar) or bool(suffix)
            if not marked and v <= 12 and float(v).is_integer():
                continue
            if raw in ok or js_num(v) in ok:
                continue
            rep.warn('W100', f'{name}: prints "{full.strip()}" which does not resolve to a '
                             'confirmed sourceable figure. Confirm or remove.')


def cmd_validate(argv):
    if not argv:
        print('usage: python mycareer.py validate <corpus.json> [rendered.md ...]')
        return 2
    corpus = load(argv[0])
    rep = Report()
    structural(corpus, rep)
    if argv[1:]:
        trace_check(corpus, argv[1:], rep)

    claims = corpus['claims']
    confirmed = sum(1 for c in claims if c.get('status') == 'confirmed')
    open_n = sum(1 for c in claims if c.get('status') == 'open')
    corrob = sum(1 for c in claims
                 if tier_rank(effective_tier(c.get('verification'))) >= tier_rank('T3'))
    print(f'myCareer: {len(claims)} claims ({confirmed} confirmed, {open_n} open), '
          f"{corrob} corroborated or better, {len(corpus['rejections'])} on the do-not-claim list.")

    for code, msg in rep.warnings:
        print(f'  warn  {code}  {msg}')
    for code, msg in rep.errors:
        print(f'  ERROR {code}  {msg}')

    if rep.errors:
        print(f'\n{len(rep.errors)} error(s). Do not render.')
        return 1
    print('\nOK' + (f' ({len(rep.warnings)} warning(s))' if rep.warnings else '') + '.')
    return 0


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

KSA_REQUIREMENTS = {
    'architect': [
        'Architecture of systems operating under external regulatory assessment',
        'Translating control requirements into implemented technical capability',
        'Analysis of alternatives and defensible technology decisions',
        'Cost and operating economics of platform decisions',
        'Leading technical work across teams without direct authority',
        'Communicating technical risk to executives and external assessors'],
    'engineer': [
        'Distributed system design and failure analysis',
        'Deployment, monitoring, and operational ownership',
        'Cost and performance engineering',
        'Technical decision making under constraint',
        'Working across teams without direct authority',
        'Communicating technical risk clearly'],
}


def render(corpus, target_key, outdir):
    claims, target = select_for_target(corpus, target_key)
    if not claims:
        raise ValueError(f'no confirmed claims survive the filter for "{target_key}". '
                         'Nothing can be rendered honestly.')
    headline = headline_figures(corpus, claims)
    by_id = index(corpus)
    person = corpus['person']

    def org_name(oid):
        o = by_id.get(oid)
        if not o:
            return ''
        return o.get('public_name', '') if o.get('nameable') is False else o.get('name', '')

    def ym(s):
        if not s:
            return 'Present'
        return f'{MONTHS[int(s[5:7])]} {s[:4]}' if len(s) > 4 else s

    def span(d):
        return f"{ym(d.get('start'))} to {'Present' if d.get('ongoing') else ym(d.get('end'))}"

    def line(c):
        return c.get('bullet') or c.get('narrative_short') or c.get('text') or ''

    def prose(c):
        return c.get('narrative_short') or c.get('text') or ''

    def money(f):
        if not f:
            return ''
        u, v = f.get('unit'), f['value']
        if u == 'USD_millions':
            return f'${js_num(v)}M'
        if u == 'USD':
            return f'${v:,}'
        if u == 'percent':
            return f'{js_num(v)}%'
        return f"{js_num(v)} {u.replace('_', ' ')}"

    family = (target.get('job_family') or 'the work described here').replace('_', ' ')
    seniority = target.get('seniority') or 'senior'
    tagline = target.get('tagline', '')

    roles_with = []
    for r in sorted(corpus['roles'], key=lambda r: (r.get('dates') or {}).get('start') or '',
                    reverse=True):
        rc = [c for c in claims if c.get('role_id') == r['id']]
        if rc:
            roles_with.append((r, rc))

    credentials = [
        f"{e['credential']}, {e.get('institution', '')}" + (f", {e['year']}" if e.get('year') else '')
        for e in (person.get('education') or [])
        if target_key not in (e.get('suppress_for') or [])]

    contact = ' · '.join(x for x in [
        person.get('location'),
        (person.get('contact') or {}).get('phone'),
        (person.get('contact') or {}).get('email'),
        (person.get('contact') or {}).get('linkedin')] if x)

    def letterhead():
        o = [f"# {person.get('name', '')}", '', f'**{tagline}**', '']
        if contact:
            o += [contact, '']
        o += ['---', '']
        return o

    short_name = re.sub(r',.*$', '', person.get('name', ''))
    short_name = re.sub(r'\b(\w)(\w*)', lambda m: m.group(1) + m.group(2).lower(), short_name)
    surname = short_name.split(' ')[-1] if short_name else ''

    docs = {}

    # --- resume ---
    o = letterhead()
    if headline:
        o += ['  ·  '.join(f"**{money(f)}** {f['kind'].replace('_', ' ')}" for f in headline), '']
    o += ['## Experience', '']
    for r, rc in roles_with:
        o.append(f"### {r.get('title', '')}, {org_name(r.get('org_id'))}")
        meta = ' · '.join(x for x in [r.get('location'), span(r.get('dates') or {})] if x)
        o.append(f"*{meta}{' · concurrent role' if r.get('concurrent') else ''}*")
        o.append('')
        if (r.get('scope') or {}).get('span'):
            o += [r['scope']['span'], '']
        o += [f'- {line(c)}' for c in rc[:6]]
        o.append('')
    if credentials:
        o += ['## Education and Credentials', ''] + [f'- {c}' for c in credentials] + ['']
    docs['Resume.md'] = o

    # --- linkedin ---
    head = f"{tagline} | {person.get('location', '')}".strip()[:220]
    skills = []
    for c in claims:
        for rid in (c.get('regime_ids') or []):
            nm = by_id.get(rid, {}).get('name')
            if nm and nm not in skills:
                skills.append(nm)
    o = ['# LinkedIn profile blocks', '', 'Paste each block into the matching field.', '',
         '## Headline', '', head, '', '## About', '',
         'The first two lines are all most people see before the fold, so the strongest '
         'material is there.', '', prose(claims[0]), '',
         ' '.join(prose(c) for c in claims[1:3]), '',
         f"What I am looking for: {' and '.join(tagline.split('|')[1:]).strip() or family}.", '',
         '## Experience', '']
    for r, rc in roles_with:
        o += [f"**{r.get('title', '')}, {org_name(r.get('org_id'))}**",
              f"{span(r.get('dates') or {})}" + (f" · {r['location']}" if r.get('location') else ''), '']
        o += [f'- {line(c)}' for c in rc[:5]]
        o.append('')
    if skills:
        o += ['## Skills', '', 'Only those a confirmed claim actually evidences.', '',
              ' · '.join(skills), '']
    if credentials:
        o += ['## Education', ''] + [f'- {c}' for c in credentials] + ['']
    docs['LinkedIn.md'] = o

    # --- elevator pitch ---
    lead = claims[0]
    changed = next((c for c in claims if c.get('figure_ids') and c is not lead),
                   claims[1] if len(claims) > 1 else lead)
    top = roles_with[0][0] if roles_with else None
    scope = (top.get('scope') or {}) if top else {}
    lead_line = (f"{top.get('title', '')} at {org_name(top.get('org_id'))}: "
                 f"{scope.get('span') or 'the platform and its delivery'}") if top else family
    docs['Elevator_Pitch.md'] = letterhead() + [
        '## Elevator Pitch', '', '*Who I am, the level I work at, and the value I bring*', '',
        'Dear [Name],', '',
        'I am writing because [one sentence on why this seat, this company, now]. What follows '
        'is the short version.', '',
        f"**What I lead.** {lead_line}"
        + (f", in an organization of {scope['total_org']}" if scope.get('total_org') else '')
        + (f" with {scope['direct_reports']} direct reports" if scope.get('direct_reports') else '')
        + '.', '',
        f'**What I have changed.** {prose(lead)}', '',
        f"**Why it matters at this level.** {prose(changed) if changed is not lead else ''}", '',
        'I would welcome a short conversation about [initiative].', '',
        'Respectfully,', '', person.get('name', ''), '', '---', '',
        '### The 30 second spoken version', '',
        f"> {short_name} here. {tagline.split('|')[0].strip()}. {lead.get('text', '')} "
        f"{changed.get('text', '') if changed is not lead else ''} What I want next is the "
        f"{'design problem' if seniority == 'ic' else 'accountability'}, not the title.", '']

    # --- autobiography ---
    o = letterhead() + ['## Career Autobiography', '',
                        'Each role added one layer of accountability. What follows is that '
                        'progression, chapter by chapter, with what each one taught me that the '
                        'next one needed.', '']
    for r, _ in reversed(roles_with):
        heading = f"### {r.get('title', '')}, {org_name(r.get('org_id'))}: {r.get('location', '')}"
        o.append(re.sub(r': $', '', heading))
        o += [f"*{span(r.get('dates') or {})}*", '']
        if r.get('chapter'):
            o += [r['chapter'], '']
    o += ['### What comes next', '',
          (f"I am looking for a {'senior individual contributor' if seniority == 'ic' else seniority}"
           f" seat in {family}. {target.get('objection_answer', '')}").strip(), '']
    docs['Career_Autobiography.md'] = o

    # --- correspondence ---
    c0 = claims[0]
    owner = ('the work above was done under '
             + c0['constraint'][0].lower() + c0['constraint'][1:].rstrip('.')) \
        if c0.get('constraint') else 'outcomes delivered under real constraint'
    docs['Executive_Introduction.md'] = letterhead() + [
        '[Date]', '', '[Name], [Title]  ', '[Company]  ', '[City, ST]', '', 'Dear [Name],', '',
        "[Open with one sentence on the company's current moment: a funding round, an "
        'acquisition, a regulatory milestone, a platform rebuild. Make it specific enough that '
        'it could not be sent to another company.]', ''] + [
        f"- **{c.get('text', '').rstrip('.')}.** {prose(c)}" for c in claims[:3]] + ['',
        f'What an owner gets from that is straightforward: {owner}, which is the condition '
        '[Company] is operating in now.', '',
        'In the first 90 days I would expect to [one sentence: what you would assess, decide, '
        'or stabilize first].', '',
        'I will follow up on [date]. If there is someone else this should reach, I would '
        'appreciate the redirect.', '',
        'Respectfully,', '', person.get('name', ''), '', '---', '',
        '### Follow-up email', '', '**Subject:** Following up on [initiative]', '',
        f"[Name], following up on my note about [initiative]. The short version: "
        f"{c0.get('text', '')} If the problem on your side is "
        f"{c0['constraint'].rstrip('.').lower() if c0.get('constraint') else 'the one described'}, "
        f'that is the work I have done. Fifteen minutes would tell us both whether it is worth '
        f'more. {short_name}', '']

    # --- KSA ---
    reqs = KSA_REQUIREMENTS.get(target.get('job_family'), KSA_REQUIREMENTS['architect'])
    o = letterhead() + ['## Knowledge, Skills and Abilities', '',
                        f'*Evidence against the requirements typical of a {seniority} {family} seat*', '',
                        'Each requirement below is answered with specific work rather than a '
                        'description of capability. Where a result is measured, the measurement '
                        'and its source are named.', '']
    for i, r in enumerate(reqs):
        c = claims[i % len(claims)]
        o += [f'### {i + 1}. {r}', '']
        tail = (f" The constraint was {c['constraint'][0].lower()}{c['constraint'][1:]}"
                if c.get('constraint') else '')
        o += [f'{prose(c)}{tail}', '']
    o += ['I am glad to walk any of these through in detail, including what did not work.', '']
    if credentials:
        o += [f"*{' · '.join(credentials)}*", '']
    docs['KSA_Letter.md'] = o

    # --- bio ---
    role0 = tagline.split('|')[0].strip().lower()
    r0 = roles_with[0][0] if roles_with else None
    centers = (r0.get('scope') or {}).get('span', '').lower() if r0 else ''
    article = 'an' if role0[:1] in 'aeiou' else 'a'
    tail = ((f"{surname} holds {' and '.join(credentials)}. " if credentials else '')
            + (f'{surname} lives in {person["location"]}.' if person.get('location') else '')).strip()
    docs['Professional_Bio.md'] = letterhead() + [
        '## Professional Bio', '', '*Three lengths, one narrative*', '', '### Full bio', '',
        f"{short_name} is {article} {role0} whose work centers on {centers or family}.", '',
        ' '.join(prose(c) for c in claims[:2]), '', tail, '',
        '### Short bio', '',
        f"{short_name} is {role0}. {prose(claims[0])}"
        + (f' {surname} lives in {person["location"]}.' if person.get('location') else ''), '',
        '### One line', '',
        f"{short_name}, {role0}" + (f", {person['location']}" if person.get('location') else '') + '.', '']

    os.makedirs(outdir, exist_ok=True)
    written = []
    for name, lines in docs.items():
        text = '\n'.join(lines)
        text = re.sub(r'\n{3,}', '\n\n', text).replace('—', ',')
        with open(os.path.join(outdir, name), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(text)
        written.append((name, len(text.split('\n'))))
    return written, claims, headline, head, target_key


def cmd_render(argv):
    if len(argv) < 2:
        print('usage: python mycareer.py render <corpus.json> <target-key> [outdir]')
        return 2
    corpus = load(argv[0])
    outdir = argv[2] if len(argv) > 2 else 'documents'
    written, claims, headline, head, key = render(corpus, argv[1], outdir)
    for name, n in written:
        print(f'  {name}  ({n} lines)')
    print(f'\nLinkedIn headline is {len(head)} of the 220 characters allowed.')
    print(f'target "{key}" · {len(claims)} of {len(corpus["claims"])} claims rendered · '
          f'{len(headline)} headline figures')
    print(f'\nVerify before sending:  python mycareer.py validate {argv[0]} {outdir}/*.md')
    return 0


def main(argv):
    if not argv or argv[0] in ('-h', '--help', 'help'):
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    if cmd == 'validate':
        return cmd_validate(rest)
    if cmd == 'render':
        return cmd_render(rest)
    print(f'unknown command: {cmd}')
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
