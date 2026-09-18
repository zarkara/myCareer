/**
 * Cost of a call, in millionths of a dollar. Integers, because floating point money in a
 * ledger is a bug waiting for a reconciliation.
 *
 * Rates cached 2026-06-24, USD per million tokens. Mirrors scripts/meter.js; if they drift,
 * the meter is the reference. Re-check before any pricing change ships.
 */
const PRICES = {
  'claude-opus-5':    { in: 5.00, out: 25.00 },
  'claude-sonnet-5':  { in: 2.00, out: 10.00 },
  'claude-haiku-4-5': { in: 1.00, out: 5.00 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.10;

export function costMicros(usage, model) {
  const rate = PRICES[model] || PRICES['claude-opus-5'];
  const perToken = (tokens, usd) => (tokens / 1e6) * usd * 1e6;
  return Math.round(
      perToken(usage.input_tokens || 0, rate.in)
    + perToken(usage.cache_creation_input_tokens || 0, rate.in * CACHE_WRITE_MULTIPLIER)
    + perToken(usage.cache_read_input_tokens || 0, rate.in * CACHE_READ_MULTIPLIER)
    + perToken(usage.output_tokens || 0, rate.out));
}

/** Share of billable input served from cache. Below 0.5 across a session is an incident. */
export function cacheHitRate(usage) {
  const billable = (usage.input_tokens || 0)
                 + (usage.cache_creation_input_tokens || 0)
                 + (usage.cache_read_input_tokens || 0);
  return billable ? (usage.cache_read_input_tokens || 0) / billable : 0;
}

export { PRICES };
