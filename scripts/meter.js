'use strict';
/**
 * What a hosted deep dive costs, and what to charge for it.
 *
 *   node scripts/meter.js estimate            projected cost per session, by model
 *   node scripts/meter.js price usage.json    actual cost from recorded usage
 *
 * Two jobs. `estimate` models a session before it is built, so pricing is set from
 * arithmetic rather than a guess. `price` reads the usage objects the API returns and
 * computes what a real session cost, which is what margin monitoring runs on.
 *
 * The decisive fact is in the estimate output: prompt caching is the difference between
 * a viable unit and one that costs four times the price on the page.
 */

// Anthropic first-party rates, USD per million tokens. Cached 2026-06-24: re-check before
// any pricing change ships, and treat a stale table as a bug rather than a rounding error.
const PRICES = {
  'claude-opus-5':   { in: 5.00, out: 25.00 },
  'claude-sonnet-5': { in: 2.00, out: 10.00 },
  'claude-haiku-4-5': { in: 1.00, out: 5.00 },
};

// Cache writes cost about 1.25x the input rate; cache reads about 0.1x.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.10;

/**
 * The shape of one interrogation. These are the numbers to revise once real sessions exist;
 * everything downstream is arithmetic over them.
 */
const SESSION = {
  // Static prefix resent on every turn: the protocol, the adjacency data, the rules.
  // This is what caching is for, and it is most of the bill without it.
  staticPrefixTokens: 20_000,
  turns: 50,
  userTokensPerTurn: 300,
  assistantTokensPerTurn: 400,
  // The corpus emitted at the end, plus the readable summary.
  finalOutputTokens: 6_000,
};

const usd = (n) => `$${n.toFixed(2)}`;

/** Cost of a session with no caching: the full prefix is re-read at full price every turn. */
function withoutCaching(model, s = SESSION) {
  const rate = PRICES[model];
  let inputTokens = 0;
  for (let turn = 1; turn <= s.turns; turn++) {
    const history = (turn - 1) * (s.userTokensPerTurn + s.assistantTokensPerTurn);
    inputTokens += s.staticPrefixTokens + history + s.userTokensPerTurn;
  }
  const outputTokens = s.turns * s.assistantTokensPerTurn + s.finalOutputTokens;
  return {
    inputTokens, outputTokens,
    cost: (inputTokens / 1e6) * rate.in + (outputTokens / 1e6) * rate.out,
  };
}

/**
 * Cost with prompt caching. The static prefix is written once and read thereafter. History
 * is cached incrementally, so most of it is read at the cache rate rather than full price.
 */
function withCaching(model, s = SESSION) {
  const rate = PRICES[model];
  const cacheWrite = s.staticPrefixTokens;
  let cacheRead = 0;
  let freshInput = 0;

  for (let turn = 1; turn <= s.turns; turn++) {
    const history = (turn - 1) * (s.userTokensPerTurn + s.assistantTokensPerTurn);
    // Prefix plus everything already cached is a cache read; only this turn's new text
    // is fresh input, plus the previous turn's reply which has not been cached yet.
    cacheRead += s.staticPrefixTokens + Math.max(0, history - s.assistantTokensPerTurn);
    freshInput += s.userTokensPerTurn + (turn > 1 ? s.assistantTokensPerTurn : 0);
  }

  const outputTokens = s.turns * s.assistantTokensPerTurn + s.finalOutputTokens;
  const cost =
      (cacheWrite / 1e6) * rate.in * CACHE_WRITE_MULTIPLIER
    + (cacheRead / 1e6) * rate.in * CACHE_READ_MULTIPLIER
    + (freshInput / 1e6) * rate.in
    + (outputTokens / 1e6) * rate.out;

  return { cacheWrite, cacheRead, freshInput, outputTokens, cost };
}

/** Actual cost from the usage objects the API returns. This is the margin monitor. */
function priceUsage(records, model) {
  const rate = PRICES[model];
  if (!rate) throw new Error(`no price on file for ${model}. Update the table in meter.js.`);

  const total = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  for (const u of records) {
    total.input += u.input_tokens || 0;
    total.output += u.output_tokens || 0;
    total.cacheWrite += u.cache_creation_input_tokens || 0;
    total.cacheRead += u.cache_read_input_tokens || 0;
  }

  const cost =
      (total.input / 1e6) * rate.in
    + (total.cacheWrite / 1e6) * rate.in * CACHE_WRITE_MULTIPLIER
    + (total.cacheRead / 1e6) * rate.in * CACHE_READ_MULTIPLIER
    + (total.output / 1e6) * rate.out;

  const billable = total.input + total.cacheWrite + total.cacheRead;
  return {
    ...total, cost,
    cacheHitRate: billable ? total.cacheRead / billable : 0,
    calls: records.length,
  };
}

function estimate() {
  console.log('One deep dive: a 50 turn interrogation over a 20k token static prefix,');
  console.log('ending in a corpus and a summary.\n');
  console.log('model              no caching    with caching    saved   charge at 3x');
  console.log('-----------------------------------------------------------------------');

  for (const model of Object.keys(PRICES)) {
    const raw = withoutCaching(model);
    const cached = withCaching(model);
    const saved = 1 - cached.cost / raw.cost;
    console.log(
      `${model.padEnd(19)}${usd(raw.cost).padStart(9)}${usd(cached.cost).padStart(16)}`
      + `${(saved * 100).toFixed(0).padStart(8)}%${usd(cached.cost * 3).padStart(15)}`);
  }

  const o = withCaching('claude-opus-5');
  console.log('\nWhere the tokens go on Opus 5 with caching:');
  console.log(`  cache writes   ${o.cacheWrite.toLocaleString().padStart(10)} tokens   (once)`);
  console.log(`  cache reads    ${o.cacheRead.toLocaleString().padStart(10)} tokens   (at a tenth of the input rate)`);
  console.log(`  fresh input    ${o.freshInput.toLocaleString().padStart(10)} tokens`);
  console.log(`  output         ${o.outputTokens.toLocaleString().padStart(10)} tokens`);

  const raw = withoutCaching('claude-opus-5');
  console.log(`\nWithout caching the same session reads ${raw.inputTokens.toLocaleString()} input tokens`);
  console.log(`instead of ${(o.cacheWrite + o.cacheRead + o.freshInput).toLocaleString()}, and costs `
            + `${(raw.cost / o.cost).toFixed(1)}x as much.`);
  console.log('\nCaching is not an optimisation here. It decides whether the unit works.');
}

if (require.main === module) {
  const [cmd, file] = process.argv.slice(2);

  if (cmd === 'price') {
    if (!file) { console.error('usage: node scripts/meter.js price <usage.json>'); process.exit(2); }
    const data = JSON.parse(require('fs').readFileSync(file, 'utf8'));
    const model = data.model || 'claude-opus-5';
    const r = priceUsage(data.usage || data, model);
    console.log(`${r.calls} calls on ${model}`);
    console.log(`  fresh input   ${r.input.toLocaleString().padStart(10)}`);
    console.log(`  cache writes  ${r.cacheWrite.toLocaleString().padStart(10)}`);
    console.log(`  cache reads   ${r.cacheRead.toLocaleString().padStart(10)}`);
    console.log(`  output        ${r.output.toLocaleString().padStart(10)}`);
    console.log(`\n  cost ${usd(r.cost)}   cache hit rate ${(r.cacheHitRate * 100).toFixed(1)}%`);
    if (r.cacheHitRate < 0.5 && r.calls > 3) {
      console.log('\n  WARNING: a hit rate this low across several calls means something is');
      console.log('  invalidating the prefix on every turn. A timestamp in the system prompt and');
      console.log('  non-deterministic JSON key order are the usual causes. Fix before shipping;');
      console.log('  it is the difference between the unit working and not.');
    }
  } else {
    estimate();
  }
}

module.exports = { PRICES, SESSION, withCaching, withoutCaching, priceUsage };
