# The recruiter side

Keyword matching fails in both directions. It misses people who did the work under a different
name, and it surfaces people who used the word without doing the work. A corpus fixes both,
because it records what someone actually did, what evidence backs it, and what the work was
neighbouring.

But the corpus was built for a different purpose, and shipping it to a recruiter as-is would be
a serious mistake.

---

## 1. The corpus is not a shareable artifact

The interrogation deliberately captures things a candidate needs and a recruiter must never see.
This is not a privacy afterthought; it is a consequence of the design working.

| Field | Why it exists | Why a recruiter must not have it |
|---|---|---|
| `stories[].contradiction_risk` | who could contradict this and what they would say | hands the other side the attack before the interview |
| `stories[].what_went_wrong` | absence of failure is what makes an answer sound rehearsed | volunteered failure, stripped of the context that makes it a strength |
| `roles[].departure_framing` | agreed phrasing for why a role ended | the question was not asked; answering it unprompted invites it |
| `rejections[]` | the permanent do-not-claim list | a list of everything the candidate considered claiming and decided they could not defend |
| `open_questions[]` | what to go and verify next | reads as a list of holes in their history |
| `attestations[].attester.contact_ref` | who can corroborate what | references contacted before the candidate authorised it |
| `records[]` | wage transcripts, payroll, compensation | never, under any circumstance |

**So the recruiter never receives a corpus. They receive a projection of one.**

The projection is generated, not hand-edited, so a candidate cannot leak by forgetting. Fields
are opt-in by name: anything the schema gains later is withheld until someone decides it should
be shared. `scripts/recruiter_view.js` implements this, and its test asserts that no withheld
string appears anywhere in the output.

## 2. What the projection carries that a resume cannot

This is the pitch to a recruiter, and it is all structure a resume throws away:

- **Agency.** `completed` / `scoped` / `enabled`. You can finally tell whether a candidate did
  the thing, scoped it and handed it off, or enabled a team to do it. On a resume these are the
  same sentence.
- **Authority.** Direct reports, matrixed, dotted line, vendor. Four different claims about
  leadership, distinguished.
- **Constraint.** What conditions the work happened under: a headcount freeze, an audit
  finding, a regulatory gate. Delivering under constraint is the signal; a resume erases it.
- **Figures with provenance.** Value, baseline, instrument, and whether the candidate can still
  produce the source. A number with a baseline is a measurement. Without one it is decoration,
  and now you can tell them apart.
- **Verification tier.** How many claims are corroborated by a named former colleague, without
  exposing who. "Three claims corroborated, contacts released on request" is a statement no
  resume can make.
- **Systems and regimes.** What they built and what regulatory ground it stood on, as structured
  data rather than an acronym soup in a skills section.
- **Job families and suppressions.** The candidate has already said which roles this material
  supports and which it does not. That is a fit signal given voluntarily.

## 3. Matching, in reverse

The adjacency map already inverts. Today a recruiter searches `ISO 27001` and misses everyone
who did the identical control work under SOC 2, HITRUST, or a HIPAA Security Rule programme.

`scripts/match.js` expands a requirement into its evidence-equivalent neighbours before
matching, using the same shared evidence clusters the interrogation uses. A requirement for ISO
27001 finds a SOC 2 candidate and **says why**: twelve shared evidence clusters, including
access reviews, control narratives, and vendor risk.

Three properties follow, and all three are the opposite of keyword scoring:

- **Explainable.** Every match cites the claim, the evidence cluster, and the verification tier.
  There is no opaque percentage.
- **Auditable.** The adjacency is data in `data/adjacency.json`, so a wrong match is a fixable
  row, not a mysterious model.
- **Honest about gaps.** The report names what the corpus does *not* evidence, and what to ask.
  A tool that only reports matches is a tool that flatters.

## 4. The outreach problem

The reason senior candidates ignore recruiter mail is that it demonstrates no comprehension. A
projection makes a specific first message possible: not "your background in cloud security,"
but the actual boundary decision, the fourteen findings, the two integrations cut.

The rule for generated outreach is the same rule the rest of the system runs on: **every
specific in the message must trace to a confirmed claim in the projection.** An outreach draft
that embellishes is the same failure as a resume that embellishes, pointed the other way. The
trace check applies unchanged.

## 5. The things worth getting right before building more

**Consent has to be per-share, not global.** A candidate shares a projection with one recruiter,
for one role, and can see what was shared. A pooled, searchable database of corpora is a
different product, and a worse one: it recreates the resume-black-hole with richer data and no
consent. If this ever becomes "recruiters browse a pool," it has become the thing it replaced.

**The candidate side must stand alone.** Two-sided products die waiting for the other side.
The candidate tool is already useful with zero recruiters: it produces documents and it verifies
them. The recruiter side starts as something a candidate *attaches to an application*, not as a
marketplace that needs supply before it works.

**The business model inverts, and that is good news.** Recruiters pay for signal; candidates
should not pay to be found. The candidate tool can be free precisely because the recruiter side funds it.

**Watch for the failure mode where this becomes a better filter.** Richer signal in the hands
of a rejection machine is not obviously an improvement for candidates. The thing that keeps it
honest is that the candidate generates and controls the projection, and can see exactly what it
says. Keep that property or lose the reason anyone would participate.
