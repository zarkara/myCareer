# myCareer

**A better version of a résumé: the verified, high-fidelity record every career document
gets compressed from.**

A résumé is an unverified assertion, written to a page limit, aimed at one audience, and
rewritten from scratch whenever any of that changes. myCareer inverts all four. It is captured
at autobiography depth through a structured interrogation, corroborated by named people and
independent records, and rendered on demand into whatever the moment needs.

```
  skills/mycareer-interview               data/adjacency.json
  the recognition harness       ─────►    regimes, triggers, shared evidence
  scaffold, triage, re-scaffold           (makes the scaffold retrieval, not invention)
              │
              ▼
      ┌───────────────────┐
      │  myCareer corpus  │   claims · figures · stories · roles · systems
      │  schema/*.json    │   attestations · records · rejections · positioning
      └───────────────────┘
              │
              ├──► scripts/validate_corpus.js   provenance and verification checks
              │
              ▼
  skills/mycareer-documents ─────►  résumé · LinkedIn · elevator pitch · autobiography
        the compile layer   introduction letter · KSA letter · bio · interview answers
```

## The four ideas

**Recognition, not recall.** Nobody remembers a twenty-year career on demand. The interrogation
describes the terrain you were standing on and asks you to triage it, because recognition memory
vastly outperforms free recall. Every generated item is a CANDIDATE until you confirm it in your
own words **with a particular the scaffold did not supply** — that last clause is what keeps a
memory aid from becoming a suggestion you adopt as a memory.

**Capture above every output format.** Claims are written long first, then compressed to a
paragraph, then to a bullet. Compression runs one direction only; expanding a bullet back into
prose is where invention re-enters.

**Verification is per fact type, never per person.** An IRS wage transcript proves employer,
dates, and compensation. It proves nothing about what you built — only a person who was there can
attest to that. The corpus records what each piece of evidence actually establishes, and the
validator refuses to let evidence raise a claim it does not cover. No "verified" badge that
quietly implies more than the evidence supports.

**Renders are disposable; the record is the asset.** Corrections are made once, in the corpus.
Targeting a different role is a filter, not a rewrite: executive scope carries a CTO search and
sinks a hands-on IC application, so each claim knows which targets it serves and which it hurts.

## Layout

```
.claude-plugin/plugin.json         plugin manifest
.claude-plugin/marketplace.json    marketplace manifest, so this repo is its own distribution
skills/mycareer-interview/         the recognition harness (SKILL.md + interrogation-prompt.md)
skills/mycareer-documents/         the compile layer (SKILL.md)
scripts/                           mycareer.js · validate_corpus.js · build_letters.js
                                   docx_text.js · letter_lib.js
schema/                            mycareer.schema.json · mycareer.example.json
data/adjacency.json                regimes, trigger conditions, shared evidence clusters
docs/mycareer.md                   the specification
```

## Install as a plugin

The repo is both the plugin and its marketplace, so GitHub is the only hosting required.

```bash
claude plugin marketplace add zarkara/myCareer
claude plugin install mycareer@mycareer
```

Then `/mycareer-interview` to build the record and `/mycareer-documents` to render from it.
The document renderer needs `docx`: run `npm install docx` once in the folder where career
materials are kept.

## Use it

```bash
npm install docx
node scripts/validate_corpus.js schema/mycareer.example.json
```

Run `/mycareer-interview`, merge what it emits into your corpus, validate, then render:

```bash
node scripts/validate_corpus.js corpus.json
node scripts/build_letters.js corpus.json architect_director out
```

And verify the output against the record before anything is sent:

```bash
node scripts/docx_text.js --write out/*.docx && node scripts/validate_corpus.js corpus.json out/*.txt
```

That last command is the point of the whole system. Every number a document prints, above a
small-integer threshold and outside a short list of structural phrases, must resolve to a
confirmed sourceable figure, and nothing on the do-not-claim list may survive into a draft. No
résumé can make that claim about itself.

Text extraction reads the .docx directly, so verification needs no LibreOffice and no PDF step.
Converting to PDF for delivery does: `soffice --headless --convert-to pdf out/*.docx`.

## For recruiters

A recruiter never receives a corpus. It holds material the candidate needs and a recruiter must
not have: who could contradict a claim, what went wrong, how a departure is framed, the
do-not-claim list, reference contact details, wage records. They receive a **projection**,
generated by allowlist so a schema change cannot silently leak, with the leak check running on
every generation.

```bash
node scripts/recruiter_view.js corpus.json view.json --target architect_director
node scripts/match.js view.json --requirements "ISO 27001, FedRAMP, cost reduction"
```

Matching runs the adjacency map in reverse. A requirement for ISO 27001 finds someone whose
record says SOC 2, and reports that it did so because the two share twelve evidence clusters:
one programme produces the evidence for both. Every match cites the claim, the reason, and the
verification tier, and the report names what the record does **not** evidence. There is no score.

See [docs/recruiter.md](docs/recruiter.md) for the projection and matching design,
[docs/screening.md](docs/screening.md) for replacing one-way AI screeners, and
[docs/pricing.md](docs/pricing.md) for what can be charged and for what.

## Browser extension

`extension/` reads the job posting on whatever page you are looking at, matches it against
your record, and offers a resume built only from claims you confirmed. Candidate-side, so it
needs permission from no job board. `activeTab` only, no host permissions, no server: it
cannot read a page you did not click the button on.

It never auto-applies. Mass application is the cheapest possible signal and is what produced
the keyword filters this project exists to replace.

Postings are read from schema.org `JobPosting` structured data first, which survives site
redesigns in a way CSS selectors do not. See [extension/README.md](extension/README.md).

## iOS app

`ios/` holds a companion iPhone app: a career autobiography written long-form with the
interrogation prompts beside the text field, stored as one JSON file, exported to Markdown.
642 lines of Swift, no dependencies, no network. See [ios/README.md](ios/README.md) and
[store/CHECKLIST.md](store/CHECKLIST.md) for the submission package.

```bash
npm test                                              # golden-file tests, no Mac needed
node scripts/app_to_corpus.js mycareer.json corpus.json   # phone capture into the corpus
```

## Where this goes

Peer attestation and record ingestion are modeled in the schema and enforced by the validator, but
the request flows are not built yet. Both are designed so the record accumulates: each session adds
to the corpus rather than starting over, corroboration raises tiers over time, and the next search
starts at eighty percent instead of zero.
