# Replacing the AI screener

Researched 18 September 2026. Sources at the bottom.

---

## 1. Do not claim screeners produce bad hires. They do not.

The instinct is to argue that AI screeners pick worse people. The evidence does not support it.
A 2026 field experiment found AI-led screening associated with **12% more offers, 18% more
starts, and 18% higher retention** at one month, among candidates who completed it.

Arguing against that is arguing against the data, and any recruiter who has read it will stop
listening.

## 2. The real failure is the half who never finish

The same body of research contains the number this product is built on. A 2026 randomised field
experiment across interview formats found one-way asynchronous interviews caused an

> **over 50% drop in application continuation**, with the steepest decline among **women and
> the most qualified candidates**.

That is the whole argument, and it is much stronger than "screeners are bad":

**The screener works on the people who tolerate it. Its problem is who refuses.** And the people
who refuse are disproportionately the ones an employer most wanted, because a senior candidate
with options does not perform to a webcam for a maybe.

So the pitch to an employer is not "your screener is inaccurate." It is: *you are losing half
your funnel, and it is not a random half.* Every one of those is someone who applied, so you
already paid to acquire them.

## 3. What candidates actually object to

Three complaints, consistently: being judged by a machine rather than a person, no ability to
ask a follow-up, and no chance to redo an answer. The sharpest summary in the field:

> The problem is not asynchronous interviews. It is asynchronous interviews with no feedback
> loop, no transparency, and no adaptability.

That sentence is a specification. All three are fixable, and none of them require live humans.

| Complaint | What we do instead |
|---|---|
| No feedback loop | The candidate receives their own match analysis, naming every requirement the record does and does not evidence |
| No transparency | Every conclusion cites the claim, the evidence, and the verification tier. No score exists to be opaque about |
| No adaptability | The interrogation is generated from the candidate's own systems and the role's actual gaps, not from a fixed question list |
| Cannot ask a follow-up | It is a conversation. The candidate can say "that is the wrong question for me" and be right |

## 4. The mechanic: apply, see why, appeal with evidence

**Stage 0. Apply normally, with a resume.** Meet people where they are. Nobody builds a corpus
to apply for one job.

**Stage 1. The candidate gets the match analysis, not just the employer.** Which requirements
their material evidences, which it does not, and why. This costs the employer nothing and is
the single largest difference from every screener on the market: today a candidate learns
nothing, ever.

**Stage 2. The candidate may appeal, by evidence.** "Your filter says I lack ISO 27001. I ran
the SOC 2 programme that produced the same control evidence. Interview me about it." That
triggers a deep dive, **scoped by the gap report from stage 1**: it interrogates precisely the
requirements the resume failed to evidence, and nothing else.

**Stage 3. A human reads an evidence packet.** Claims, provenance, verification tier, and an
explicit list of what remains unevidenced. Never a score.

The elegant part is that **stage 1's output is stage 2's interview plan.** The gap report names
the requirements; `data/adjacency.json` supplies, for each one, the confirming observable and
what someone in that seat would have done. The brief writes itself from data already in the repo.

## 5. Why this is harder to game than a resume or a screener

Unproctored asynchronous formats are the easiest thing in hiring to cheat, and the industry
knows it. An LLM will happily make a candidate sound fluent and structured on a generic
behavioural question.

It will not supply **the name of the person they argued with about log retention**. The
interrogation confirms nothing without a particular the scaffold did not provide, and figures
are not usable unless the candidate can say where the source could be produced from. Claims can
be raised to corroborated only by a named former colleague attesting in writing.

Fluency is cheap now. Provenance is not. Building the instrument around provenance is the only
durable answer to AI-assisted cheating, and it happens to be what we already built.

## 6. The legal design constraint, which you already satisfy

This is the part to get right before selling anything.

**NYC Local Law 144** applies to automated employment decision tools that **screen or rank**
candidates. Where it applies: an independent annual bias audit, published results, and ten
business days' notice to candidates, at $375 to $1,500 per violation. Compliance sits with the
**employer using the tool**, whoever built it.

**The EU AI Act** treats employment AI as high-risk, with obligations from **2 December 2027**:
risk assessment, technical documentation, bias testing, human oversight, transparency, and
continuous monitoring.

The trigger in both is **automating the decision**. And `scripts/match.js` already refuses to
produce a score or a ranking. That was a design preference about honesty; it is now the most
commercially important property in the codebase, because it means:

- The output is **evidence for a human to read**, not a selection decision.
- Adopting it does not add a ranking tool to an employer's stack.
- It provides exactly what regulators are asking for anyway: transparency, explanation, human
  oversight, and a route for a candidate to contest an outcome.

**Keep it that way.** The moment this emits a fit percentage or sorts a candidate list, it
becomes the regulated thing it was built to replace, and every employer customer inherits an
audit obligation. If a customer asks for a score, the answer is no, and the reason is a feature.

*This is design guidance, not legal advice. Anyone deploying this in hiring needs counsel,
particularly on adverse impact under the EEOC Uniform Guidelines.*

## 7. The honest risks

**Employers must actually read the appeals.** If a deep dive lands in a queue nobody opens, the
product is theatre and candidates will work that out within a month. The saving grace is
self-selection: a 40-minute interrogation is a costly signal, so only people who genuinely
believe the filter is wrong will do it. Volume stays low enough to honour.

**Who pays for the deep dive.** The candidate can, and there is a good argument that they
should, but only if it is priced and framed as **buying an asset they keep**.

The deep dive costs real compute, on the order of a couple of dollars. Charging for it does
three useful things at once:

- **It is a costly signal.** Paying filters out speculative applicants more effectively than any
  algorithm, and it is what makes the appeal credible. An appeal that costs nothing is worth
  nothing, and employers will treat it accordingly.
- **It keeps ownership with the candidate.** Whoever pays has a claim on the output. If the
  employer funds the interrogation, the employer is commissioning an assessment of a person.
  If the candidate funds it, they own a record they can send to anyone, forever.
- **It removes the two-sided adoption problem.** No employer has to sign anything for a
  candidate to produce a deep dive and attach it to an application.

Two rules keep this from becoming pay-to-be-seen, and both are load-bearing:

1. **It is charged once, not per application.** The corpus is durable. The second application
   costs nothing, the twentieth costs nothing. This is the difference between buying a tool and
   paying a toll at every door, and it has to be obvious on the pricing page.
2. **There is always a free path.** The interrogation runs on the candidate's own Claude or
   ChatGPT subscription, or entirely on-device through Apple's Foundation Models, at no
   marginal cost to anyone. The fee buys convenience and a hosted run, never access. Nobody
   is ever required to pay to be considered, and saying so plainly is part of the product.

Framed that way the sentence is "three dollars for a verified career record you own and reuse,"
not "three dollars to have your application read." The first is a tool. The second would poison
the positioning, and in some US states fee-charging employment agencies are separately
regulated, so the distinction is worth getting right with counsel before any money moves.

Employer-sponsored codes are the obvious release valve: an employer who wants the signal on
candidates their filter was about to lose can cover it, which costs them far less than the
acquisition they already paid for.

**This could become a better filter rather than a better process.** Richer signal in a rejection
machine is not progress. What prevents it is that the candidate generates the projection,
reads their own analysis, and initiates the appeal. Remove any one of those and it has become
the thing it replaced.

**Adverse impact still has to be measured.** A tool that measures documented work history with
provenance is far more defensible as job-related than one scoring speech fluency, which is a
real advantage. It is not an exemption.

---

## Sources

[AI interviews in 2026 and why candidates dislike them](https://www.jobleads.com/us/blog/job-interviews/ai-interview) ·
[Interview trends 2026: AI screeners, take-home tests, structured hiring](https://venture-lab.org/2026/interview-trends-2026/) ·
[Conversational AI interview versus one-way video](https://brighthire.com/blog/conversational-ai-interview-vs-one-way-video/) ·
[NYC Local Law 144 compliance](https://www.nycbiasaudit.com/blog/how-to-comply-with-the-nyc-bias-audit-law) ·
[Automated Employment Decision Tools, NYC Rules](https://rules.cityofnewyork.us/rule/automated-employment-decision-tools-updated/) ·
[State Comptroller audit of Local Law 144 enforcement](https://www.osc.ny.gov/state-agencies/audits/2025/12/02/enforcement-local-law-144-automated-employment-decision-tools) ·
[EU AI Act: high-risk AI in employment](https://www.eversheds-sutherland.com/en/united-states/insights/eu-ai-act-high-risk-ai-systems-in-employment) ·
[AI and HR in the EU, 2026 legal overview](https://www.crowell.com/en/insights/client-alerts/artificial-intelligence-and-human-resources-in-the-eu-a-2026-legal-overview)
