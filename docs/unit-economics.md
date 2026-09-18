# Hosted inference: what it costs, what to charge, what not to break

Rates cached 2026-06-24. Re-check before any pricing change ships; a stale price table is a
bug, not a rounding error. Run `node scripts/meter.js estimate` for current arithmetic.

---

## 1. The numbers

One deep dive, modelled as a 50 turn interrogation over a 20k token static prefix (the
protocol, the adjacency data, the rules), ending in a corpus and a summary:

| Model | No caching | With caching | Saved | At 3x markup |
|---|---|---|---|---|
| Opus 5 | $10.01 | **$1.87** | 81% | $5.60 |
| Sonnet 5 | $4.00 | **$0.75** | 81% | $2.24 |
| Haiku 4.5 | $2.00 | **$0.37** | 81% | $1.12 |

So "a couple of dollars" was almost exactly right, on the best model, **provided caching
works**. Without it the same session costs $10 and the business does not.

## 2. Prompt caching is not an optimisation. It decides whether the unit exists.

The static prefix is re-sent on every single turn. Over 50 turns that is 1.8M input tokens of
the same bytes. Cached, they are read at a tenth of the input rate; uncached, at full price.

The failure mode is that caching **silently stops working**. A timestamp in the system prompt,
a non-deterministic JSON key order, a tool list that varies by turn: any byte change anywhere
in the prefix invalidates everything after it, no error is raised, and the session still
completes normally. Measured through the meter:

```
healthy session                   cost $1.70   cache hit rate 97.1%
same session, prefix invalidated  cost $16.04  cache hit rate  0.0%
```

A 9x cost swing with no symptom other than the bill. So:

- **Order the prefix by stability.** Protocol, adjacency data, and rules first and frozen;
  anything varying goes after the last cache breakpoint.
- **Serialise deterministically.** Sorted keys, no timestamps, no per-request ids in the prefix.
- **Alert on hit rate, not on cost.** `scripts/meter.js price` reads the `usage` objects the
  API returns and warns below 50%. Wire that into whatever runs sessions, and treat a drop as
  an incident.
- **Use mid-conversation system messages** for anything that has to change mid-session.
  Appending a `system` role message to `messages` preserves the cached prefix; editing the
  top-level `system` field destroys it.

## 3. Meter tokens internally. Sell a unit externally.

Nobody wants a token meter they cannot predict, and "your interview cost $4.12 because you
were chatty" is a terrible customer experience for a product about someone's career.

- **The customer buys a deep dive.** One price, stated up front, whatever it takes.
- **You meter tokens** per session and watch the distribution, because that is how you find
  the cache regression and the pathological session.
- **Absorb the variance.** Price against the 90th percentile session, not the mean, and the
  long tail is a cost of doing business rather than a surprise on someone's card.

Usage-based markup belongs in your margin model. It does not belong on the invoice.

## 4. Cost controls that have to exist before the first paying session

- **A hard token ceiling per session.** `task_budget` inside `output_config` gives the model a
  ceiling it can see and pace against, so it finishes gracefully instead of being cut off.
  Separately cap `max_tokens` per call.
- **A turn cap.** The protocol is 7 phases; a session at 200 turns is a loop, not an interview.
- **A per-account daily cap.** The first abuse case is someone scripting the endpoint.
- **A kill switch per session id**, because the first runaway will happen at 3am.

## 5. Where the model belongs, and where it must not go

Adding inference does not mean adding it everywhere. Two places stay deterministic, and both
are load-bearing.

| Task | Model? | Why |
|---|---|---|
| The interrogation conversation | **Yes** | This is the product, and it needs judgement |
| Detecting a hedge versus a real particular | **Yes** | Bounded, and the discipline depends on it |
| Compressing narrative to paragraph to bullet | **Yes** | Cheap, and a smaller model is fine |
| Matching prose requirements | **Yes** | The limitation named in `extension/README.md` |
| **Proposing regimes and adjacency candidates** | **No** | Retrieval from `data/adjacency.json`, always. A plausible but wrong candidate can implant a memory the person then sincerely believes. This is the whole anti-fabrication thesis |
| **Scoring or ranking a candidate** | **No** | An automated employment decision tool, with the audit obligations in `docs/screening.md`. Not a cost question, a classification one |

The cheap-model question resolves by task, not globally: the interrogation earns Opus, the
compression does not. Split it and the blended cost falls without touching what the customer
notices.

## 6. The thing hosted inference quietly breaks

Everything so far has been able to say **nothing leaves your machine**. A hosted tier ends
that for the people who use it, and the claim has to change with it.

This is not a marketing problem. The iOS app currently declares **Data Not Collected** on its
App Store privacy label, and that declaration is true because there is no network code in it.
If a hosted deep dive ships inside that same app, the label is false and the submission is
misrepresented.

So:

- **Keep the boundary at the product edge, not inside a settings toggle.** The local app stays
  local. The hosted run is a separate surface with its own privacy policy and its own label.
- **Say plainly what the hosted tier does with career data**: what is sent, how long it is
  retained, whether it trains anything (it must not), and how to delete it.
- **Retention should be none by default.** The corpus comes back to the user; there is no
  product reason to keep the transcript, and every reason not to hold someone's unguarded
  account of their own career.
- **The free path stays free and local.** It is the reason the pricing page can honestly say
  nobody pays to be considered.

## 7. Recommended shape

- **Opus 5 with caching for the interrogation**, around $1.87 a session. A smaller model for
  compression and prose matching, which pulls the blend under $1.50.
- **Price at $6 to $9 per record**, once, not per application, per `docs/pricing.md`. That is a
  3x to 5x markup, which covers the long tail, refunds, failed sessions, and the free tier.
  Three dollars is defensible on Sonnet but leaves nothing for the session that runs long.
- **Charge at record creation.** Never per application; the classification argument in
  `docs/pricing.md` depends on it.
- **Refund on request, no questions.** At this price it costs almost nothing and removes the
  only complaint that could escalate.
- **Publish the arithmetic.** A pricing page that says what the compute actually costs is an
  unusual and durable trust signal in a market full of $10,000 guarantees.

---

## Tools

```bash
node scripts/meter.js estimate          # projected cost per session, by model
node scripts/meter.js price usage.json  # actual cost from recorded API usage
```

`price` takes `{ model, usage: [...] }` where each entry is the `usage` object from a response:
`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`.
Log those per call from the first session onward. They are the only reliable signal that the
economics still work.
