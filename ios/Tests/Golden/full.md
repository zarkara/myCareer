# Career Autobiography: Dana Whitfield
*Enterprise architect, regulated cloud*
Tampa, FL

## Chief Architect, Helix Data Systems
*Tampa, FL · 2018-11 to 2022-07*

I joined as principal engineer eight months after the company had promised a government edition to two agencies and had no boundary, no control narratives, and no one who had read a NIST baseline end to end. The platform itself was healthy: it scanned petabyte-scale unstructured stores and classified sensitive data in place. What did not exist was any account of how it would survive an assessment. My first year was reconstructing the architecture as a describable system rather than a working one, which meant drawing the boundary honestly, cutting two integrations that could not be defended inside it, and learning to write in the language an assessor reads. The title changed to Chief Architect in the second year, mostly because someone had to be accountable in writing. What this chapter added was the habit of designing for the conversation with the auditor, not only for the load.

### Led the architecture and control implementation that produced a FedRAMP Moderate authorization for the government edition of the discovery platform.

*I did it.*

When I took this on there was a sales commitment and nothing behind it. The first real decision was where to draw the boundary, and the honest answer excluded two SaaS integrations the enterprise edition depended on, which meant telling product that the government edition would ship with less. I drew the boundary diagram, wrote the initial system security plan sections covering architecture and data flow, and then walked roughly forty controls from requirement to an implemented capability with the engineers who owned each one. The 3PAO came back with fourteen findings. Nine were documentation gaps I closed in six weeks. Three were real design problems, mostly around key custody and log integrity, and I redesigned key handling to use the platform KMS rather than our own wrapper. Two were risk-accepted by the sponsoring agency's authorizing official, over my recommendation on one of them. Authorization landed eighteen months after kickoff, and the monthly continuous monitoring package became a standing obligation my team owned from that point on.

**The constraint.** A sales commitment to two agencies had been made eight months before any boundary, control documentation, or baseline work existed.

**The detail that pins it down.** Fourteen 3PAO findings; the two risk-accepted ones went to the agency AO over my objection on log retention.

**What went wrong.** The boundary call came four months later than it should have; engineers had already built half an integration into the shared codebase.

**Who could confirm it.** Former CTO: the boundary decision and the assessment findings. Not compensation.

| Figure | Measures | Before | Source | Sourceable |
|---|---|---|---|---|
| 18 months | time to authorization | No boundary or control documentation existed at start | Authorization letter and the original program plan | yes |

### Consolidated three hosting environments into two and removed 2.4 million dollars of annual run rate.

*I enabled a team to do it.*

We were paying for a legacy environment nobody would decommission because two customers were still on it, plus a staging environment that had quietly become a second production. I did not do the migration work; two teams did, and one of them had to rewrite a deployment pipeline that had never been in version control. What I did was the analysis that showed the legacy environment cost more annually than the revenue from the customers on it, and then the design for the migration path that let those customers move without a contract renegotiation. Finance measured the saving against the FY2020 hosting lines. The number is defensible but it is a run-rate figure, not cash recovered in year one, and I say so when I use it.

**The constraint.** A cost reduction target set after a funding round came in below plan.

**The detail that pins it down.** The staging environment had become a second production; the pipeline for it was never in version control.

| Figure | Measures | Before | Source | Sourceable |
|---|---|---|---|---|
| $2.4M | cost removed | Annual run rate for the two retired hosting environments | Finance quarterly report, Q4 FY2021 | yes |

### Contributed the technical case to a board-approved 54 million dollar capital and operating plan for the platform program.

*I scoped it and handed it off.*

This was not my case alone and I do not present it as such. The CFO built the model and the CEO carried it. I owned the technical section: what the platform would need to become to serve government and healthcare buyers at the same time, what that cost in engineering years, and what we would have to stop doing. The part that mattered in the room was the sequencing argument, that the boundary work had to precede the classification engine rewrite or we would pay for the rewrite twice. The board asked one hard question about whether the authorization timeline was credible, and I gave them a range rather than the date sales wanted.

**The constraint.** The classification engine rewrite and the authorization boundary work competed for the same engineering capacity.

**The detail that pins it down.** The board's hard question was on authorization timeline credibility; I answered with a range, not the date sales wanted.

| Figure | Measures | Before | Source | Sourceable |
|---|---|---|---|---|
| $54M | investment secured | No dedicated program funding before the case | Board deck, February 2020 | yes |
| 3.5 petabytes | largest environment scanned |   | Product telemetry, no longer accessible | **no** |

## Numbers that still need a source

These are not ready to put in front of anyone. A number you cannot produce a source for gets omitted, not softened.

- **3.5 petabytes**, largest environment scanned (claimed source: Product telemetry, no longer accessible)

---

Exported 2026-01-01 from myCareer.