# myCareer browser extension

Read a job posting against your verified career record, on the page where you found it. See
what it evidences, what it does not, and why. Download a resume built only from claims you
confirmed, and a brief for interrogating the gaps.

**Load it:** Chrome or Edge, `chrome://extensions`, Developer mode on, **Load unpacked**, pick
this folder. Click the toolbar button on any job posting.

---

## Why a browser extension and not a Workday or Indeed integration

Those are two completely different products.

An **integration** (Workday Extend, an Indeed partner API, a Greenhouse or Lever marketplace
app) is employer-side. It needs a partnership, a review process, and a contract, and it sells
to the employer.

An **extension** is candidate-side. It runs in the candidate's own browser, on the page they
are already looking at, and needs permission from nobody. It also keeps the product on the
right side of the line in [docs/pricing.md](../docs/pricing.md): a tool the candidate owns and
points at whatever they like, rather than a service sold against one employer's decision.

Ship the extension. Consider the integration only once employers are asking.

## What it will not do

The category this sits in is full of extensions that auto-apply in bulk. This does not, and
should not, for three separate reasons:

- **It breaks the product.** The appeal mechanic works because a deep dive is a costly signal.
  Mass application is the cheapest possible signal and employers discount it accordingly.
- **It gets users banned.** Job boards terminate accounts for automated submission, and the
  user carries that loss, not us.
- **It makes the problem worse.** Flooding employers with applications is what produced the
  keyword filters this project exists to replace.

It also never collects postings in the background, never crawls, and never submits anything.

## Permissions, and why there are so few

```json
"permissions": ["activeTab", "scripting", "storage", "sidePanel"]
```

No `host_permissions`. `activeTab` grants access to a page **only when the user clicks the
button**, and only that page, and only until they navigate away. The extension is structurally
incapable of reading a page in the background, which is both the honest design and the reason
store review is straightforward.

Everything stays on the machine: the record lives in `chrome.storage.local`, the page is parsed
locally, the match runs locally, downloads are generated locally. There is no server.

## How it reads a posting

In order, stopping at the first that works:

1. **schema.org `JobPosting` in JSON-LD.** Google for Jobs requires this markup, so Indeed,
   LinkedIn, Greenhouse, Lever and most Workday-hosted career sites publish it. Reading a
   published standard survives redesigns; per-site CSS selectors do not.
2. **Microdata**, the older form of the same vocabulary.
3. **Heuristics** over the visible text, as a last resort.

Requirements are then pulled from bullets under a requirements heading, with the years-of-
experience preamble stripped, so `8+ years of hands-on experience with ISO 27001 audits`
becomes `ISO 27001 audits and certification` and can actually be matched.

## The tailored resume is a selection, not a rewrite

Every other tailoring tool edits your resume to echo the job description. That is keyword
stuffing, it is what produced the filters, and it puts words in your mouth you cannot defend.

This **selects** from claims you already confirmed, orders them by what the employer asked for,
and states at the bottom what your record does not evidence rather than papering over it. The
cross-check test asserts the output carries no withheld text and no verbs absent from the
record.

## Tests

```bash
node extension/test/extract.test.mjs   # posting extraction against page fixtures
node extension/test/crosscheck.mjs     # browser matcher against the CLI matcher
```

`scripts/match.js` is the reference implementation. `lib/match.mjs` is the browser port, and
the cross-check asserts the two agree on every requirement, so the extension and the CLI can
never quietly disagree about whether someone is a fit. Writing these found three extraction
bugs and one matching bug before the extension was ever loaded in a browser.

## Known limits, stated plainly

- **Plain-language requirements are matched on word overlap.** "Reduce infrastructure cost"
  does not currently match a claim about removing $2.4M of annual run rate, because they share
  only one word. Regime matching is deterministic and data-backed; prose matching is not, and
  pretending otherwise would be the same dishonesty this project objects to elsewhere. The
  right fix is to hand prose requirements to the candidate's own AI rather than to fake
  semantics with a thesaurus.
- **Evidence equivalence means shared operational evidence, not equivalent obligation.** A
  FedRAMP programme genuinely produces much of what GDPR asks for, and none of GDPR's
  subject-rights work. That is why an equivalent match always renders as a question to ask,
  never as a claim that the requirement is met.
- **Postings written as prose with no stated requirements** yield nothing, and the panel says so
  rather than inventing requirements to fill the screen.
- **Not tested in a real browser yet.** The modules are exercised in Node against page fixtures;
  the panel wiring has not been clicked through in Chrome.
