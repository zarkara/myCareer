---
name: mycareer-documents
description: "Render a verified career document set (resume, LinkedIn profile, elevator pitch, career autobiography, executive introduction letter, KSA letter, professional bio) as print-ready PDF and editable DOCX from a myCareer corpus, or from a person's resume and career history when no corpus exists yet."
---

# myCareer Documents

Renders one verified career record into the documents that make a candidate's level, outcomes, and business value readable in the first 30 to 60 seconds. Use when a recruiter, search firm, or the candidate asks for a resume, LinkedIn profile, elevator pitch, autobiography, correspondence or introduction letter, KSA letter, or professional bio, or says the resume "buries" the candidate's value.

**This skill is the compile layer.** The source of truth is a **myCareer corpus** — see `${CLAUDE_PLUGIN_ROOT}/docs/mycareer.md`. If a corpus exists, render from it and never invent around it. If one does not, build the fact ledger from source documents as described below, and treat that ledger as a corpus in miniature: same rules, same discipline, worse coverage. When the person has time, run the recognition harness in the mycareer-interview skill first; documents rendered from an interrogated corpus are better in every dimension, and they are verifiable.

## Core concept

1. **The 30-to-60-second test.** Decision-makers skim. Every document must answer three questions early:
   - **What you lead:** the scale and complexity of the leadership (people, teams, applications, revenue or volume, regulated scope).
   - **What you have changed:** measurable outcomes (investment secured, cost removed, reliability, modernization, transactions closed).
   - **Why you are valuable at the executive level:** the business problems you solve beyond technical skill (P&L, board and owner communication, M&A, risk).
2. **One record, many renders.** Every document draws from the same verified facts. They differ in voice (first vs third person), length, and use, never in facts. A correction is made in the corpus and re-rendered, never patched in an output.
3. **Compression is one-directional.** Render from `narrative_long` down to `narrative_short` down to `bullet`. Never expand a bullet into prose; that is where invention re-enters.
4. **Headline figures.** Pick 4 to 6 numbers that carry the story and put them in the first 25% of every document. Use only figures with `sourceable: true`. Composite figures (for example $45M + $9M = $54M) must decompose cleanly to sourced parts.
5. **Target selection, not rewriting.** Executive scope is an asset for a CTO search and a liability for a hands-on IC role. Pick the positioning target and let `suppress_for` and `job_families` filter the corpus; do not rewrite claims to fit.
6. **Accuracy beats impressiveness.** An inflated claim that a former employer or interviewer can puncture costs more than a modest true one.

## The documents

| Document | Purpose | Length | Voice | Structure |
|---|---|---|---|---|
| Resume | The document every process still asks for | 2 pages | Implied first person, no pronouns | Positioning tagline; headline figure line; reverse-chronological roles with City, ST and dates; 3 to 6 `bullet` fields per role, ranked by `carries` then verification tier; education and credentials footer. Renders only claims passing the target filter |
| LinkedIn Profile | Inbound discovery and recruiter search | Delivered as text blocks | First person | Headline (220 char limit, drawn from the target tagline plus the differentiator); About section of 3 short paragraphs from `narrative_short`, front-loading the headline figures in the first 2 lines because the rest is behind a fold; per-role blocks; skills list drawn only from claims that evidence them |
| Elevator Pitch | Who you are, your level, your value | 1 page | First person letter | Hook paragraph; three bold lead-in paragraphs: What I lead / What I have changed / Why it matters at the executive level; one-line ask; shaded box with a 30-second spoken version (~75 words, contractions OK) |
| Career Autobiography | Connects the progression (e.g. engineering to architecture to executive) and explains the trajectory | 2 pages | First person letter | Opening thesis ("each role added one layer of accountability"); one short headed section per career chapter with City, ST in the heading; each section ends in the lesson or capability it added; closing "what comes next" naming the target seats |
| Executive Introduction (Correspondence) | Targeted outreach to a hiring executive plus follow-up | 1 page | First person business letter | Date and address block placeholders; opening sentence tied to the company's current moment (placeholder with guidance); 3 bold lead-in bullets of proof; owner/business-value paragraph; 90-day approach in one sentence; follow-up date; below a rule, a 60 to 80 word follow-up email with subject line |
| KSA Letter | Maps knowledge, skills, and abilities to senior leadership requirements with evidence | 2 pages | First person | Brief intro; 6 to 8 numbered requirement headings typical of the target role; one evidence paragraph each (claim, then specific results); closing line; small education and credentials footer |
| Professional Bio | Consistent narrative for introductions, boards, speaker and profile use | 1 page | Third person | Full bio (3 paragraphs: identity and level, career proof, ownership/education/board service/location); short bio (~75 words); one-line bio (~25 words) |

KSA letters originate in U.S. federal hiring; for private executive searches they work best as a tight competency-evidence document, not an essay set.

## Workflow

### 1. Gather inputs
- **A myCareer corpus if one exists.** Validate it before reading anything else: `node ${CLAUDE_PLUGIN_ROOT}/scripts/validate_corpus.js <corpus.json>`. Do not render from a corpus with errors.
- All resume versions, LinkedIn text, career notes, and any recruiter or job-description text.
- Target level and seats (e.g. CTO, Chief Architect, VP Architecture). One positioning line should cover them; do not list three titles in the letterhead.
- Contact block, credentials suffix (e.g. MBA), and city/state for each role.
- Framing constraints the person has set (how to describe a business they own, roles to de-emphasize, sensitive departures).
- House style if they have one; otherwise use the defaults under Build.

If inputs conflict (different titles, dates, or figures across resume versions), prefer the most recent executive version and list the conflict for confirmation.

### 2. Build the fact ledger

**With a corpus:** the ledger is a derived view, not new work. Select for the target and let the library do the filtering:

```js
const M = require(process.env.CLAUDE_PLUGIN_ROOT + '/scripts/mycareer');
const corpus = M.load('corpus.json');
const claims = M.selectForTarget(corpus, 'architect_director');   // confirmed, unsuppressed, T1+
const figures = M.headlineFigures(corpus, claims);                 // sourceable only
const forbidden = M.forbiddenText(corpus);                         // DO-NOT-CLAIM, permanent
```

Everything below still applies, because the corpus already encodes it: `agency` is the did / led / enabled distinction, `sourceable` is the provenance gate, and `rejections` is the list that must never resurface.

**Without a corpus:** list every claim you intend to use before drafting.

| Claim | Figure | Source doc | What the person personally did | Allowed phrasing | Confirm? |

Ledger rules:
- Never add a technology, metric, framework, or title that is not in the sources. When uncertain, flag it rather than infer.
- Distinguish **did** vs **led a team that did** vs **enabled / supported** vs **scoped and handed off**. A supporting role is written as supporting ("provided the reliability foundation for").
- Investment cases and board money asks are rarely solo work. Default to "secured on cases built with executive teams" unless the person says they authored it alone.
- Standards adoption always costs teams something. Do not claim adoption "without sprint impact"; say it was built on conventional tooling so adoption was plug and play.
- Use past tense for roles that have ended; avoid end dates or phrasing that invites questions about a departure.
- Concurrent or part-time roles are disclosed as such in the long-form documents.
- Composite headline figures must list their components in the ledger.

### 3. Choose headline figures and positioning
- 4 to 6 headline figures, each mapped to the three questions.
- One positioning tagline for the letterhead, e.g. `Enterprise Technology Executive | Architecture, AI & Cloud Modernization | Fintech & Payments`.

### 4. Draft
Follow the document specs above and these writing rules:
- **Front-load impact.** Strongest differentiators in the first 25% of each document.
- **Constraint-grounded storytelling.** Frame achievements around the constraint that made them necessary ("the organization was designed from a system plan before the funding existed").
- **One fact once per document.** Repetition across documents is fine; within a document it is filler. The spoken 30-second box is the only allowed restatement.
- **Bold lead-ins** on key paragraphs and bullets; bold the headline figures sparingly.
- **Placeholders** in `[Square Brackets]` for anything per-recipient: `[Name]`, `[Company]`, `[date]`, `[initiative]`, and guidance placeholders such as `[Open with one sentence on the company's current moment...]`.
- **Cities and states** in autobiography chapter headings; bio ends with home city.
- **Punctuation:** no em dashes; use colons, semicolons, commas, or plain hyphens. En dashes only in date ranges.
- Plain, confident sentences. No "passionate", "results-driven", "proven track record", or other filler adjectives; let the numbers carry it.

### 5. Build print-ready files
Node.js with the `docx` package, rendered to PDF with LibreOffice, verified by rasterizing pages.

```bash
npm install docx                                                  # once, in the working directory
node ${CLAUDE_PLUGIN_ROOT}/scripts/build_letters.js corpus.json <target-key> out        # renders from the corpus
node ${CLAUDE_PLUGIN_ROOT}/scripts/docx_text.js --write out/*.docx                      # text + rough page estimate
cd out && soffice --headless --convert-to pdf *.docx              # delivery PDFs (needs LibreOffice)
for f in *.pdf; do pdfinfo "$f" | grep Pages; pdftoppm -r 60 -png "$f" "img_${f%.pdf}"; done
```

`build_letters.js` supplies structure, connective tissue, and per-recipient placeholders. It never supplies a fact: every sentence of substance is a corpus field.

Default house style: Calibri (LibreOffice substitutes metric-compatible Carlito), navy `1F3864` and blue `2E74B5`, justified body, 10.5 to 11.5 pt body, US Letter, 0.75 in side margins, letterhead with name, tagline, contact line, and a navy rule. Placeholders render blue italic so they are easy to find.

Shared library: `${CLAUDE_PLUGIN_ROOT}/scripts/letter_lib.js`, parameterized by a profile object. Use it directly rather than pasting a copy; two copies drift.

```js
const L = require('./letter_lib');
L.setProfile({ name, tagline, contact });   // letterhead identity
L.setBody(21);                              // half-points, per document
// Builders: letterhead() docTitle(title, sub) para(text) plain(text) heading(text)
//           bullet(text) box(label, text) signature(closing) rule()
// Inline markup inside any text: **bold** renders navy bold, [placeholder] renders blue italic.
await L.write(children, 'Title', 'out/Name.docx');
```

Build script pattern (`build_letters.js`):

```js
const L = require('./letter_lib');
L.setProfile({ name: 'JANE DOE, MBA', tagline: 'Enterprise Technology Executive | ...', contact: 'City, ST  •  phone  •  email  •  linkedin' });
// Define each document as a FUNCTION so setBody() applies at build time
const pitch = () => [...L.letterhead(), ...L.docTitle('Elevator Pitch', 'Who I am, the level I lead at, and the value I bring'),
  L.plain('Dear [Name],', { after: 130 }), L.para('...'), L.para('**What I lead.** ...'), /* ... */ ...L.signature(),
  ...L.box('The 30-second spoken version', '...')];
(async () => {
  const out = process.argv[2] || '.';
  L.setBody(23); await L.write(pitch(), 'Elevator Pitch', `${out}/Elevator_Pitch.docx`);
  L.setBody(21); await L.write(auto(),  'Career Autobiography', `${out}/Career_Autobiography.docx`);
  // corr(), ksa() at 21; bio() at 22
})();
```

Gotchas:
- Content arrays built at module load freeze the font size; wrap each document in a function.
- Never type bullet characters into text; use the numbering config.
- Use `ShadingType.CLEAR` for fills (SOLID renders black).
- One paragraph per line; no `\n` inside a TextRun.
- Size up body text on 1-page documents with spare room (11 to 11.5 pt) rather than leaving half a page empty.

### 6. Verify before delivery

**With a corpus, the fact check is automated.** Extract the text and run the trace check. Extraction reads the .docx directly, so this works before any PDF step and needs no LibreOffice:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/docx_text.js --write out/*.docx
node ${CLAUDE_PLUGIN_ROOT}/scripts/validate_corpus.js corpus.json out/*.txt
```

It asserts that every number printed in a document resolves to a confirmed, sourceable figure, that no rejected claim text appears anywhere, and that no em dashes survived. Anything it flags is confirmed or removed, never softened. This is the guarantee the documents are sold on, so it runs every time, not just when something feels wrong.

Then by hand:
- **Facts (no corpus):** every figure and title traces to the ledger; composite figures decompose; nothing new was invented while drafting.
- **Style:** placeholders are all bracketed; no filler adjectives crept in.
- **Layout:** page counts match targets (resume 2, pitch 1, autobiography 2, correspondence 1, KSA 2, bio 1); view rasterized pages for orphaned headings, crowding, or large blank areas.
- **Disclosure:** any org with `nameable: false` renders as its `public_name` everywhere, including headers and footers.

### 7. Deliver
- The PDFs plus a zip of the editable DOCX files, and the LinkedIn blocks as plain text ready to paste.
- **The updated corpus.** It is the asset; the documents are disposable renders of it. Save it, plus the build scripts, where the person keeps career materials so later corrections are made once and everything rebuilds.
- In the reply, keep it short: what each document is for, the confirmation list (claims whose phrasing depends on the person's exact role), and any issues spotted in the resume that was sent (duplicated sections, repeated skills lines, duplicate headings), since recruiter feedback about "duplicated experience" usually points at those.
- Name the open questions that would most improve the next version, and the two or three people worth asking for a narrow attestation. A corroborated claim outranks a better-worded one.

## Advisory note
Emails that offer a "candid assessment" of a resume and then recommend a package of extra career documents are sometimes a paid resume-writing upsell. If the person mentions a fee request, point out calmly that they now have the documents and do not need to pay for them, without asserting the sender is a scammer.