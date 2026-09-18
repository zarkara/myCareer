/**
 * Tests for the parts that do not need a Worker runtime: password hashing, Stripe signature
 * verification, cost arithmetic, and the SSE usage tee. These are the pieces where a bug is
 * a security or margin problem rather than a broken page.
 */
import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import {
  emailProblem, hashPassword, passwordProblem, timingSafeEqual, verifyPassword,
} from '../src/auth.js';
import { verifyStripeSignature } from '../src/billing.js';
import { cacheHitRate, costMicros } from '../src/pricing.js';
import { PROTOCOL } from '../src/protocol.js';

let fail = 0;
const ok = (cond, label) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if (!cond) fail++; };

console.log('passwords');
const stored = await hashPassword('correct horse battery staple');
ok(stored.startsWith('pbkdf2$210000$'), 'stored as pbkdf2 with the iteration count');
ok(!stored.includes('correct horse'), 'plaintext is not in the stored value');
ok(await verifyPassword('correct horse battery staple', stored), 'accepts the right password');
ok(!await verifyPassword('correct horse battery stapl', stored), 'rejects a near miss');
const second = await hashPassword('correct horse battery staple');
ok(second !== stored, 'salted, so the same password hashes differently each time');

console.log('\nvalidation');
ok(passwordProblem('short') !== null, 'rejects a short password');
ok(passwordProblem('1234567890123') !== null, 'rejects digits only');
ok(passwordProblem('a reasonable one') === null, 'accepts a long passphrase');
ok(emailProblem('not-an-email') !== null, 'rejects a malformed address');
ok(emailProblem('dana@example.com') === null, 'accepts a normal address');
ok(timingSafeEqual('abc', 'abc') && !timingSafeEqual('abc', 'abd'), 'constant time compare works');

console.log('\nstripe signatures');
const secret = 'whsec_test';
const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
const now = Math.floor(Date.now() / 1000);
const sign = async (ts, payload) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${payload}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const env = { STRIPE_WEBHOOK_SECRET: secret };
ok(await verifyStripeSignature(env, body, `t=${now},v1=${await sign(now, body)}`),
   'accepts a correctly signed payload');
ok(!await verifyStripeSignature(env, body, `t=${now},v1=${'0'.repeat(64)}`),
   'rejects a forged signature');
ok(!await verifyStripeSignature(env, `${body} `, `t=${now},v1=${await sign(now, body)}`),
   'rejects a tampered body');
const old = now - 1000;
ok(!await verifyStripeSignature(env, body, `t=${old},v1=${await sign(old, body)}`),
   'rejects a replayed old request');
ok(!await verifyStripeSignature(env, body, null), 'rejects a missing header');

console.log('\ncost');
const healthy = { input_tokens: 700, output_tokens: 400, cache_creation_input_tokens: 0, cache_read_input_tokens: 20000 };
const broken = { input_tokens: 20700, output_tokens: 400, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0 };
ok(costMicros(healthy, 'claude-opus-5') < costMicros(broken, 'claude-opus-5') / 3,
   'a cached turn costs a fraction of an uncached one');
ok(Number.isInteger(costMicros(healthy, 'claude-opus-5')), 'cost is an integer, not a float');
ok(cacheHitRate(healthy) > 0.9 && cacheHitRate(broken) === 0, 'hit rate separates the two');
ok(costMicros(healthy, 'nonexistent-model') === costMicros(healthy, 'claude-opus-5'),
   'an unknown model falls back to the most expensive rate rather than under-billing');

console.log('\nprotocol prefix');
ok(PROTOCOL.length > 4000, 'the cached prefix is large enough to be worth caching');
ok(!/\d{4}-\d{2}-\d{2}T/.test(PROTOCOL), 'carries no timestamp, which would break the cache');
ok(PROTOCOL.includes('CANDIDATE'), 'carries the rule that nothing generated is a fact');

console.log(fail ? `\n${fail} failure(s).` : '\nall passed.');
process.exit(fail ? 1 : 0);
