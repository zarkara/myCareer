---
name: mycareer-interview
description: "Run a career interrogation that reconstructs what someone actually did, at autobiography depth, into a verified myCareer corpus. A recognition harness: it describes the terrain the person worked in and has them triage it, rather than asking them to recall a career cold. Use when someone wants to build or extend their myCareer record, recover forgotten work from a past role or system, find regulatory work they did but never named, audit claims on an existing resume for provenance, or prepare verifiable material before writing any career document."
---

# myCareer Interview

Reconstructs one role, one system, or one claim set until every fact is confirmed, attributed, and mapped to the job families it actually supports. Output is entries in a **myCareer corpus**, the high-fidelity record every career document is compressed from.

Do not write a resume in this session. Do not sell the person on themselves. Build the record.

## Before starting

1. Read the full protocol: `${CLAUDE_PLUGIN_ROOT}/skills/mycareer-interview/interrogation-prompt.md`. Follow it as written; it is the skill, not a summary of one.
2. Read `${CLAUDE_PLUGIN_ROOT}/docs/mycareer.md` for the verification model, and `${CLAUDE_PLUGIN_ROOT}/schema/mycareer.schema.json` for the output shape.
3. Load `${CLAUDE_PLUGIN_ROOT}/data/adjacency.json`. Phase 2 candidates are **derived from it**, not generated. `trigger_conditions` maps what the person describes in Phase 1 onto candidate regimes; shared evidence clusters give the neighbors.
4. Ask for an existing corpus. If one exists, read it first and never re-propose anything in `rejections`.

## The rules that matter most

- **Everything you generate is a CANDIDATE.** It becomes a fact only when the person confirms it in their own words with **a particular you did not supply**: a person, a date, an artifact name, a number, an argument, a thing that went wrong. Echoing your sentence back is recognition of your sentence, not of their history. Ask once more for the particular, then record it as open.
- **Write long first.** Capture `narrative_long` before anything shorter exists, then derive `narrative_short`, then `bullet`. Never expand a short line back into narrative.
- **Four different claims:** completed / scoped / enabled, and direct / matrixed / dotted-line / vendor authority. Never let one drift into another.
- **Every number gets a provenance question.** Unsourceable numbers are omitted, not softened.
- **Ask who could confirm it**, by name and narrow scope, for every claim worth rendering. Corroboration outranks better wording.
- **A rejected candidate is rejected permanently.** Keep it verbatim in `rejections`.
- One focused question at a time or a short numbered batch. Never a wall. No compliments on the answers.

## Finishing

Emit both parts of Phase 7: the readable summary for the person, and the corpus JSON. Merge into their existing corpus, then validate before anyone renders anything from it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/validate_corpus.js" corpus.json
```

Fix every error. Errors mean the record claims more than the evidence supports, which is the one failure this system exists to prevent.

Then tell them the two or three highest-payoff open questions, and who is worth asking for a narrow attestation. To render documents, use the **mycareer-documents** skill.
