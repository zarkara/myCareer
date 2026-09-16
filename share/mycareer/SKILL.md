---
name: myCareer
description: Reconstruct a work history into a verified record, then render resumes, LinkedIn profiles and executive letters from it. Use for career writing, resume help, or interview prep.
---

# myCareer

Most people do not have a resume problem. They have a **recall problem**. Twenty years of
work compresses, in memory, into six bullets that could describe anyone.

This skill fixes the record first, then renders documents from it. Two modes:

| The person wants | Do this |
|---|---|
| To reconstruct what they actually did | **Build the record.** Read `INTERVIEW.md` and run it. |
| Documents, and a corpus already exists | **Render.** Read `RENDER.md`. |
| Documents, and no corpus exists | Say the record has to come first, offer a short session, and build what you can. |

## The rules, in every mode

1. **Nothing you generate is a fact.** Everything the assistant proposes is a CANDIDATE until
   the person confirms it in their own words **with a particular you did not supply**: a
   person, a date, an artifact name, a number, an argument, a thing that went wrong. Echoing
   your sentence back is recognition of your sentence, not of their history.
2. **Only confirmed material renders.** Anything partial, half-remembered, or hedged is
   `open` and stays out of every document until the gap is closed.
3. **Write long first.** Capture `narrative_long`, then compress to `narrative_short`, then to
   `bullet`. Never expand a short line back into prose; that is where invention re-enters.
4. **Three claims, never one.** `completed` (did it), `scoped` (scoped it and handed it off),
   `enabled` (enabled a team to do it). Never let one drift into another.
5. **Every number gets a provenance question.** A figure the person cannot source today is
   marked `sourceable: false` and is omitted from documents, not softened.
6. **Rejected is permanent.** A candidate the person rejects goes in `rejections` verbatim and
   is never proposed again.

## Files

- `INTERVIEW.md` — the full interrogation protocol. Read it before running a session.
- `RENDER.md` — how to produce documents from a corpus.
- `reference/mycareer.schema.json` — the corpus shape.
- `reference/adjacency.json` — regulatory regimes, triggers, shared evidence clusters. The
  interview derives candidates from this rather than inventing them.
- `reference/sample-corpus.json` — a worked corpus, useful for demonstrating rendering.
- `scripts/validate_corpus.js` — checks the record. Run it before rendering anything.
- `scripts/render_markdown.js` — renders the document set as Markdown.

## Scripts

Node, no dependencies, no network. Requires code execution to be enabled.

```bash
node scripts/validate_corpus.js corpus.json
node scripts/render_markdown.js corpus.json <target-key> documents
node scripts/validate_corpus.js corpus.json documents/*.md
```

That last command is the point of the whole thing: it asserts every number printed in a
document resolves to a confirmed, sourceable figure, and that nothing on the do-not-claim
list survived into a draft.

If code execution is unavailable, do the same work by hand: follow `RENDER.md`, and before
handing anything over, check each number against the corpus yourself and say which claims are
carrying the document.
