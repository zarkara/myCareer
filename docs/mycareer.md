# myCareer — specification

**myCareer is not a résumé. It is the record a résumé is a lossy compression of.**

A résumé is an unverified assertion, written to a page limit, aimed at one audience, and rewritten
from scratch every time any of that changes. myCareer inverts all four properties: it is captured at
autobiography depth, stored once, corroborated by people and records, and rendered on demand into
whatever artifact is needed — résumé, LinkedIn, executive letters, KSA, bio, interview answers,
security-clearance history, board packet.

---

## The four principles

### 1. Capture above every output format
The corpus must hold more detail than any document that will be rendered from it. If a claim is
stored at résumé-bullet fidelity, the autobiography can never be written from it, and neither can a
KSA evidence paragraph or a 90-second interview answer. So capture is deliberately over-specified:
every claim carries a long narrative, a short narrative, and a bullet, written in that order.

### 2. Compression is one-directional
You may compress narrative into a bullet. You may never expand a bullet back into narrative — that
is precisely where invention re-enters the system. Renders are derived and disposable; the corpus is
the asset. Corrections are made in the corpus and re-rendered, never patched in the output.

### 3. Facts carry provenance, not adjectives
Every figure carries value, unit, baseline, window, instrument, source, and whether it is sourceable.
Every claim carries agency (completed / scoped / enabled) and authority (direct / matrixed /
dotted-line / vendor / none). Nothing that fails provenance gets softened into vagueness; it gets
omitted, and the reason is recorded.

### 4. Verification is per fact type, never per person
An IRS wage transcript proves employer, dates, and compensation. It proves **nothing** about what you
built. A peer attestation covers accomplishments but not payroll. Mixing these is how verification
theater happens — a "verified profile" badge that quietly implies more than the underlying evidence
supports. myCareer stores what each piece of evidence actually establishes, and the validator refuses
to let evidence raise a claim it does not cover.

---

## Verification tiers

| Tier | Name | Means | Typical evidence |
|---|---|---|---|
| **T0** | Asserted | Said once, no confirming detail | raw interview input |
| **T1** | Self-confirmed | Confirmed in the subject's own words with a particular the scaffold did not supply | the recognition harness output |
| **T2** | Documented | An artifact exists and the subject can produce it | control narrative, architecture doc, award letter, commit history, org chart |
| **T3** | Corroborated | A named person attests, with relationship and the scope they can speak to | manager, peer, direct report, customer CISO, auditor, vendor lead |
| **T4** | Record-verified | An independent record establishes it | IRS wage transcript, W-2, payroll, state registry, DD-214, license board, patent grant, SEC filing, contract award |

**T1 is the floor for anything that gets rendered.** T0 never leaves the corpus.

### What each record type can and cannot verify

| Evidence | Establishes | Does not establish |
|---|---|---|
| IRS wage transcript / W-2 / payroll | employer identity, employment dates, compensation | title, scope, accomplishments, agency |
| Contract award / SAM registration | the engagement existed, its value, the period | the individual's role in it |
| Patent grant, publication | named inventorship or authorship | relative contribution |
| License, clearance, certification | the credential and its currency | applied competence |
| Org chart, offer letter | title, reporting line, span | outcomes |
| Peer attestation | accomplishments, agency, authority, conduct | compensation, exact dates |

This table is the honest core of the product. It is also the thing to point at when a competitor
ships a "verified" badge that means a user clicked a checkbox.

---

## Attestation lifecycle

Peer validation is designed in now, even before it ships, so the UX is a straight line later:

```
draft → requested → (viewed) → received | declined | expired
```

An attestation names the attester, their relationship, the **scope they can speak to**, and their
strength: `witnessed` (saw it happen), `participated` (did part of it), or `hearsay` (heard about it).
Hearsay never raises a tier; it is recorded because knowing who has heard the story is useful for
reference planning.

Two design rules that matter:

- **Request narrow.** Ask a former manager to attest to three specific claims, not to "your career."
  Narrow requests get answered; broad ones get ignored, and a broad attestation is worth less anyway.
- **Never show the attester your preferred wording.** Send the neutral `text` field, not the polished
  bullet. An attester who is handed the marketing copy is confirming your phrasing, not your facts.

## Record ingestion, when it arrives

IRS transcripts and payroll records are the strongest employment evidence available to an individual
and among the most sensitive documents they own. Design accordingly:

- Store **derived facts plus a reference and hash**, never the document itself, in the corpus.
- Mark every record `sensitivity: restricted` and keep it out of every render by default.
- A record raises tiers only for the fact types in its `verifies` list.
- Record-verified dates that contradict stated dates produce an **open question**, not a silent
  overwrite. The record is usually right, but not always — contract-to-hire conversions, acquisitions,
  and PEO arrangements all produce legitimate mismatches.

---

## Structure

```
person ──< roles >── orgs
             │
             ├──< systems >──< regimes (adjacency graph)
             │
             ├──< claims >──< figures
             │        ├──< evidence
             │        ├──< attestations
             │        └──< records
             │
             └──< stories (autobiography depth)

rejections        — DO-NOT-CLAIM, persistent across all sessions
open_questions    — PARTIAL / DON'T RECALL, each with a close action
positioning       — job families, per-target suppression
disclosure_limits — NDA, classified, customer-name restrictions
```

Entities and fields are defined in [`schema/mycareer.schema.json`](../schema/mycareer.schema.json);
a worked instance is in [`schema/mycareer.example.json`](../schema/mycareer.example.json).

### Why `systems` is a first-class entity

The interrogation is organized around systems and programs, not around jobs, because that is how
technical memory is actually indexed. People recall the platform, the migration, the incident — then
the year, then the title. Roles are for chronology; systems are for recall. A system can also span
roles and employers, which a role-keyed model cannot express.

### Why `stories` is separate from `claims`

A claim is an assertion that can be true or false. A story is a narrative with a constraint, a
decision, a tradeoff, a failure, and a named risk of contradiction. Résumés render claims; interviews
render stories; autobiographies render both. Keeping them separate stops interview narrative from
leaking into documents as unsupported assertion.

---

## What this unlocks that a résumé cannot

- **Render any target in seconds.** Paste a job description, filter by `job_families` and
  `suppress_for`, re-rank, render. The Phase 6 tension — executive scope is an asset for a CTO search
  and a liability for a hands-on IC role — becomes a filter instead of a rewrite.
- **Verifiable claims.** "Every figure in this document is sourceable, and three of them are
  corroborated by named former colleagues" is a statement no résumé can make.
- **DO-NOT-CLAIM that persists.** A rejected candidate stays rejected across every future session and
  every future document, automatically.
- **Decay tracking.** Regulatory knowledge goes stale as frameworks revise. Claims carry date ranges,
  so "current" versus "dated" is computed, not guessed.
- **A career that accumulates.** Each interrogation session adds to the corpus rather than starting
  over. The next search starts at eighty percent.
- **Machine-checkable output.** The validator asserts that every figure in a rendered document
  resolves to a confirmed, sourceable claim, and that no rejected claim appears anywhere. That is a
  guarantee, not a promise.
