/**
 * Stripe Checkout and the webhook that grants credits.
 *
 * No Stripe SDK. Two form-encoded API calls and an HMAC check are the whole integration, and
 * keeping the bundle dependency-free keeps the Worker small and the supply chain short.
 *
 * The client never sees the secret key, and credits are granted only by the webhook. A client
 * that reports its own successful payment is a client that can mint credits.
 */

import { uid, timingSafeEqual } from './auth.js';

const STRIPE = 'https://api.stripe.com/v1';

async function stripe(env, path, form) {
  const res = await fetch(`${STRIPE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `Stripe returned ${res.status}`);
  return body;
}

/**
 * A Checkout Session for one record. The user id rides along in metadata and in
 * client_reference_id so the webhook knows who paid without trusting the browser.
 */
export async function createCheckout(env, user, origin) {
  const session = await stripe(env, '/checkout/sessions', {
    mode: 'payment',
    success_url: `${origin}/paid?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
    client_reference_id: user.id,
    customer_email: user.email,
    'metadata[user_id]': user.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(env.PRICE_USD_CENTS || 700),
    'line_items[0][price_data][product_data][name]': 'myCareer record',
    'line_items[0][price_data][product_data][description]':
      'One deep interview and the verified career record it produces. Yours to keep and reuse '
      + 'for any application. No outcome is promised.',
  });
  return session.url;
}

/**
 * Verifies the Stripe-Signature header: HMAC-SHA256 of `${timestamp}.${rawBody}` against the
 * webhook secret, with a freshness window so a captured request cannot be replayed later.
 *
 * The raw body text must be used, not a re-serialised object. JSON.stringify of a parsed body
 * will not reproduce the bytes Stripe signed.
 */
export async function verifyStripeSignature(env, rawBody, header, toleranceSeconds = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=').map((s) => s.trim())));
  const timestamp = Number(parts.t);
  if (!timestamp || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqual(expected, parts.v1);
}

/** Grants credits, once per Stripe event id even if the webhook is redelivered. */
export async function handleWebhook(env, event) {
  if (event.type !== 'checkout.session.completed') return { ignored: event.type };

  const inserted = await env.DB.prepare(
    'INSERT OR IGNORE INTO stripe_events (id, created_at) VALUES (?, ?)')
    .bind(event.id, Date.now()).run();
  if (!inserted.meta.changes) return { duplicate: event.id };

  const session = event.data.object;
  if (session.payment_status !== 'paid') return { unpaid: session.id };

  const userId = session.metadata?.user_id || session.client_reference_id;
  if (!userId) return { error: 'no user on the checkout session' };

  const credits = Number(env.CREDITS_PER_PURCHASE || 1);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').bind(credits, userId),
    env.DB.prepare(
      'INSERT INTO ledger (id, user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(uid('led'), userId, credits, 'purchase', session.id, Date.now()),
  ]);
  return { granted: credits, user: userId };
}

/** Refunds are cheap at this price and remove the only complaint that could escalate. */
export async function refund(env, paymentIntentId) {
  return stripe(env, '/refunds', { payment_intent: paymentIntentId });
}
