/**
 * myCareer service. One Worker, one D1 database, no other infrastructure.
 *
 * Holds the Anthropic key and proxies inference. The key is never sent anywhere: clients
 * authenticate with their own bearer token and never learn that Anthropic is involved at the
 * credential level. See src/interview.js for why that is not negotiable.
 *
 * Deploy: see README.md.
 */

import {
  createSession, destroySession, emailProblem, hashPassword, passwordProblem,
  uid, userFromRequest, verifyPassword,
} from './auth.js';
import { createCheckout, handleWebhook, verifyStripeSignature } from './billing.js';
import { closeInterview, startInterview, turn } from './interview.js';
import { cacheHitRate } from './pricing.js';

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', ...cors(), ...extra },
});

const cors = () => ({
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
});

/**
 * Login and signup are where credential stuffing lands, so they get a counter keyed on
 * client IP and the current minute. One row per IP per minute per bucket, incremented
 * atomically; old rows are swept opportunistically rather than on a schedule.
 */
async function rateLimited(env, request, bucket, perMinute) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const minute = Math.floor(Date.now() / 60_000);
  const key = `${bucket}:${ip}:${minute}`;

  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, hits, created_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET hits = hits + 1
     RETURNING hits`).bind(key, Date.now()).first();

  if (row.hits === 1) {
    // Cheap sweep on the first hit of a window, so the table cannot grow without bound.
    await env.DB.prepare('DELETE FROM rate_limits WHERE created_at < ?')
      .bind(Date.now() - 300_000).run();
  }
  return row.hits > perMinute;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors() });

    try {
      // ---- Stripe webhook. Must read the raw body: a re-serialised object will not
      // reproduce the bytes Stripe signed, and the signature check will fail. ----
      if (path === '/webhook/stripe' && request.method === 'POST') {
        const raw = await request.text();
        const ok = await verifyStripeSignature(env, raw, request.headers.get('stripe-signature'));
        if (!ok) return json({ error: 'bad signature' }, 400);
        const result = await handleWebhook(env, JSON.parse(raw));
        return json({ received: true, ...result });
      }

      // ---- Accounts ----
      if (path === '/v1/signup' && request.method === 'POST') {
        if (await rateLimited(env, request, 'signup', 10)) {
          return json({ error: 'Too many attempts. Try again in a minute.' }, 429);
        }
        const { email, password } = await request.json();
        const bad = emailProblem(email) || passwordProblem(password);
        if (bad) return json({ error: bad }, 400);

        const id = uid('usr');
        const normalised = email.trim().toLowerCase();
        try {
          await env.DB.prepare(
            'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
            .bind(id, normalised, await hashPassword(password), Date.now()).run();
        } catch {
          // Do not distinguish "taken" from other failures: that is an account enumeration
          // oracle. The message is the same either way.
          return json({ error: 'Could not create that account.' }, 400);
        }
        return json({ token: await createSession(env.DB, id), email: normalised, credits: 0 });
      }

      if (path === '/v1/login' && request.method === 'POST') {
        if (await rateLimited(env, request, 'login', 10)) {
          return json({ error: 'Too many attempts. Try again in a minute.' }, 429);
        }
        const { email, password } = await request.json();
        const row = await env.DB.prepare(
          'SELECT id, email, password_hash, credits FROM users WHERE email = ?')
          .bind(String(email || '').trim().toLowerCase()).first();

        // Hash even when the user does not exist, so the response time does not reveal it.
        const stored = row?.password_hash
          || 'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        const ok = await verifyPassword(String(password || ''), stored);
        if (!row || !ok) return json({ error: 'Wrong email or password.' }, 401);

        return json({ token: await createSession(env.DB, row.id), email: row.email, credits: row.credits });
      }

      if (path === '/v1/logout' && request.method === 'POST') {
        await destroySession(env.DB, request);
        return json({ ok: true });
      }

      // ---- Everything below needs a session ----
      const user = await userFromRequest(env.DB, request);
      if (!user) return json({ error: 'Sign in first.' }, 401);

      if (path === '/v1/me') {
        const history = await env.DB.prepare(
          `SELECT id, state, turns, created_at FROM interviews
            WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`).bind(user.id).all();
        return json({ email: user.email, credits: user.credits, interviews: history.results });
      }

      if (path === '/v1/checkout' && request.method === 'POST') {
        const origin = new URL(request.url).origin;
        return json({ url: await createCheckout(env, user, env.PUBLIC_ORIGIN || origin) });
      }

      if (path === '/v1/interview' && request.method === 'POST') {
        const result = await startInterview(env, user);
        if (result.error) return json({ error: result.error }, result.status);
        return json(result);
      }

      if (path === '/v1/interview/turn' && request.method === 'POST') {
        const result = await turn(env, user, await request.json(), ctx);
        if (result.error) return json({ error: result.error }, result.status);
        return new Response(result.stream, {
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', ...cors() },
        });
      }

      if (path === '/v1/interview/close' && request.method === 'POST') {
        const { interview_id } = await request.json();
        const row = await closeInterview(env, user, interview_id);
        if (!row) return json({ error: 'unknown_interview' }, 404);
        const usage = {
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          cache_creation_input_tokens: row.cache_write,
          cache_read_input_tokens: row.cache_read,
        };
        const hit = cacheHitRate(usage);
        // Surfaced because a low hit rate has no other symptom before the bill.
        if (hit < 0.5 && row.turns > 3) {
          console.warn(`LOW CACHE HIT ${row.id} ${(hit * 100).toFixed(1)}% over ${row.turns} turns`);
        }
        return json({ ...row, cache_hit_rate: Number(hit.toFixed(3)) });
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      // Log the detail, return none of it. Error text echoes request content often enough
      // that returning it is a disclosure bug.
      console.error('unhandled', err?.stack || String(err));
      return json({ error: 'Something went wrong.' }, 500);
    }
  },
};
