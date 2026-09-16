# Rendering documents from a corpus

The corpus is the record. Documents are disposable renders of it. A correction is made in the
corpus and re-rendered, never patched into an output.

## Always, before rendering

```bash
node scripts/validate_corpus.js corpus.json
```

Errors mean the record claims more than the evidence supports. Do not render past an error.
Warnings are worth reading aloud to the person but do not block.

## Pick a target, do not rewrite

A corpus carries positioning targets under `positioning.targets`. Each one knows which claims
carry it (`carries`) and which hurt it (`suppress`, plus each claim's own `suppress_for`).

This is the mechanism that resolves the central tension in career documents: **executive scope
is an asset for a leadership search and a liability for a hands-on individual contributor
role.** The same corpus renders both. Never rewrite a claim to fit a target; filter instead.

If the person has not named a target, ask which role they are aiming at before rendering. If
the corpus has no matching target, add one rather than rendering something generic.

## Render

```bash
node scripts/render_markdown.js corpus.json <target-key> documents
```

Produces `Resume.md`, `LinkedIn.md`, `Elevator_Pitch.md`, `Career_Autobiography.md`,
`Executive_Introduction.md`, `KSA_Letter.md`, `Professional_Bio.md`.

## Verify, every time

```bash
node scripts/validate_corpus.js corpus.json documents/*.md
```

Every number above a small-integer threshold must resolve to a confirmed sourceable figure,
no rejected claim text may appear anywhere, and no em dashes may survive. Anything flagged
gets confirmed or removed. Never softened into vagueness.

## Writing by hand

If code execution is off, or the person wants prose the script does not produce, the same
rules apply and you enforce them yourself:

- **Front-load.** The strongest differentiators belong in the first quarter of any document.
- **Constraint-grounded.** Frame an achievement by the pressure that produced it (a budget
  cut, an audit finding, a regulatory gate), not as transformation leadership.
- **One fact once per document.** Repetition across documents is fine; inside one it is filler.
- **Supporting roles are written as supporting.** "Provided the reliability foundation for"
  is not the same sentence as "delivered."
- **No em dashes.** Colons, semicolons, commas, or plain hyphens. En dashes only in date ranges.
- **No filler adjectives.** No "passionate", "results-driven", "proven track record". The
  numbers carry it, or nothing does.
- **Headline figures:** four to six, each `sourceable: true`, in the first 25% of the document.
  Composite figures must decompose to their sourced parts.

## Handing over

Tell the person three things, briefly:

1. What each document is for.
2. Which claims are carrying it, and any whose phrasing depends on their exact role.
3. The two or three open questions that would most improve the next version, and who is worth
   asking for a narrow attestation. A corroborated claim outranks a better-worded one.
