# myCareer service

Accounts, Stripe payment, and the inference proxy. One Cloudflare Worker and one D1 database.
No containers, no servers, no other infrastructure. Deploys with a single command.

---

## The one architectural rule

**The Anthropic key never leaves this Worker.** Not baked into a client, and not handed to one
at runtime either. A key that reaches a device can be read out of memory or off the wire, and
then a stranger's inference is on your card.

The client authenticates with its own bearer token and posts conversation turns. This service
holds the key, owns the system prompt, calls Anthropic, streams the answer back, and records
what it cost. `grep ANTHROPIC_API_KEY src/` returns exactly one line: the outbound request.

Two consequences that are easy to miss and expensive to get wrong:

- **The client cannot supply a system prompt.** It sends `user` and `assistant` turns and
  nothing else. If a caller could set the system prompt, this would be a free general-purpose
  Claude proxy with your key behind it, and you would find out from the bill.
- **Credits are granted only by the Stripe webhook.** A client that reports its own successful
  payment is a client that can mint credits.

## Deploy

Five minutes, assuming a Cloudflare account and a Stripe account.

```bash
cd service
npm install
npx wrangler login
```

**1. Create the database** and paste the printed `database_id` into `wrangler.toml`:

```bash
npx wrangler d1 create mycareer
```

**2. Apply the schema:**

```bash
npx wrangler d1 execute mycareer --remote --file=schema.sql
```

**3. Set the secrets.** These are stored by Cloudflare, outside the repository and outside the
bundle. Never put them in `wrangler.toml`, which is committed:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

**4. Deploy:**

```bash
npx wrangler deploy
```

**5. Point Stripe at the webhook.** In the Stripe dashboard, add an endpoint at
`https://<your-worker>.workers.dev/webhook/stripe` subscribed to `checkout.session.completed`,
then put its signing secret in `STRIPE_WEBHOOK_SECRET` and redeploy.

Local development: copy `.dev.vars.example` to `.dev.vars`, run `npm run db:local` once, then
`npm run dev`. `.dev.vars` is gitignored and must stay that way.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/signup` | `{email, password}` -> `{token, email, credits}` |
| POST | `/v1/login` | `{email, password}` -> `{token, email, credits}` |
| POST | `/v1/logout` | invalidates the bearer token |
| GET | `/v1/me` | balance and recent interviews |
| POST | `/v1/checkout` | -> `{url}`, a Stripe Checkout page |
| POST | `/v1/interview` | spends one credit, -> `{id}` |
| POST | `/v1/interview/turn` | `{interview_id, messages}` -> an SSE stream |
| POST | `/v1/interview/close` | -> usage, cost, and cache hit rate |
| POST | `/webhook/stripe` | Stripe only, signature verified |

Everything except signup, login, and the webhook needs `Authorization: Bearer <token>`.

## What the money does

`wrangler.toml` carries the knobs: `PRICE_USD_CENTS` (default 700),
`CREDITS_PER_PURCHASE`, `MODEL`, and the caps.

A credit is **held when an interview starts**, not when it finishes. Settling at the end would
let an abandoned session run for free, and abandoned sessions are the common case.

Charging happens at record creation and never per application. That distinction is the whole
argument in [docs/pricing.md](../docs/pricing.md) and it is not cosmetic: a fee tied to one
employer's decision reads as a job placement service, which is a licensed activity in much of
the United States.

## Cost control

Caching is the difference between a $1.87 session and a $10 one, so:

- The interrogation protocol is served as a **single cached system block**. Nothing
  per-request, per-user, or time-varying may be added to it. One changed byte invalidates the
  prefix and the session costs five times as much, with no error and no symptom but the bill.
- `protocol.js` is **generated** by `node scripts/build_protocol.js` from the same instruction
  text the Claude skill and the ChatGPT project use, so the three cannot drift apart.
- `/v1/interview/close` returns the session's `cache_hit_rate`, and anything under 50% past a
  few turns is logged as a warning. Watch that number; it has no other symptom.
- Hard caps ship in `wrangler.toml`: `MAX_TOKENS_PER_TURN`, `MAX_TURNS_PER_SESSION`, and
  `DAILY_SESSION_CAP` per user. The first abuse case is someone scripting the endpoint.

## Security notes

- Passwords: PBKDF2-SHA256, 210,000 iterations, random per-user salt.
- Session tokens: 32 random bytes; only the SHA-256 hash is stored, so a database dump does
  not hand out live sessions.
- Login hashes a dummy password when the account does not exist, so response time does not
  reveal which emails are registered, and signup returns the same message on every failure
  rather than confirming an address is taken.
- Stripe webhooks verify the HMAC over the **raw** body with a 300-second freshness window.
  Re-serialising the parsed JSON would not reproduce the signed bytes.
- Stripe event ids are recorded, so a redelivered webhook grants credits once.
- Errors are logged in full and returned as a generic message. Upstream error bodies routinely
  echo request content, and returning them is a disclosure bug.

## Privacy, which hosted inference changes

Everything else in this project can say *nothing leaves your machine*. This service cannot, and
the honest version of that is worth stating rather than glossing:

- Interview turns pass through this Worker to Anthropic. **Transcripts are not stored.** Only
  token counts, cost, and turn counts are, because that is all the metering needs.
- Retention should stay none by default. The corpus goes back to the user; there is no product
  reason to keep someone's unguarded account of their own career.
- **This must not ship inside the iOS app.** That app declares *Data Not Collected* on its App
  Store privacy label, and that declaration is true only while it contains no network code.
  Hosted runs are a separate surface with their own policy and their own label.

## Tests

```bash
npm test
```

Covers the parts where a bug is a security or margin problem rather than a broken page:
password hashing and verification, Stripe signature verification including forged, tampered,
and replayed requests, the cost arithmetic, and the cached prefix. An unknown model falls back
to the most expensive rate rather than under-billing, which is the safe direction to be wrong in.

## Not built yet

- **Email verification and password reset.** Both need an email sender; nothing here sends mail.
  Until then a forgotten password is a support request.
- **The free bring-your-own-key path.** It stays in the client, is the reason the pricing page
  can honestly say nobody pays to be considered, and must not be removed when this ships.
- **Refund endpoint.** `refund()` exists in `billing.js` and has no route; at this price,
  refunding on request costs almost nothing and removes the only complaint that escalates.
