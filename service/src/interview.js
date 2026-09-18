/**
 * The interrogation proxy.
 *
 * Three properties hold this together, and all three are security properties as much as
 * product ones:
 *
 *   1. The Anthropic key never leaves the Worker. The client authenticates with its own
 *      session token. A key that reaches a device can be read out of memory or the network,
 *      and then a stranger's inference is on your card.
 *
 *   2. The server owns the system prompt. The client sends conversation turns and nothing
 *      else. If a client could supply the system prompt, this would be a free general-purpose
 *      Claude proxy with your key behind it.
 *
 *   3. The static prefix is cached. It is resent on every turn and it is most of the bill:
 *      see docs/unit-economics.md. A broken cache turns a $1.70 session into $16.
 */

import { PROTOCOL } from './protocol.js';
import { costMicros } from './pricing.js';
import { uid } from './auth.js';

const ANTHROPIC = 'https://api.anthropic.com/v1/messages';

/**
 * Everything stable, in one block, cached. Nothing per-request, per-user, or time-varying may
 * appear here: one changed byte invalidates the prefix and quintuples the cost of the session.
 */
function systemBlocks() {
  return [{
    type: 'text',
    text: PROTOCOL,
    cache_control: { type: 'ephemeral' },
  }];
}

/** Reject anything that is not a plain user/assistant transcript. */
function validateTurns(turns, maxTurns) {
  if (!Array.isArray(turns) || !turns.length) return 'Send a messages array.';
  if (turns.length > maxTurns) return `This session has passed ${maxTurns} turns.`;
  for (const m of turns) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      return 'Only user and assistant turns are accepted.';
    }
    if (typeof m.content !== 'string') return 'Turn content must be a string.';
    if (m.content.length > 20_000) return 'That turn is too long.';
  }
  if (turns[turns.length - 1].role !== 'user') return 'The last turn must be from the user.';
  return null;
}

/**
 * Passes the stream through untouched while reading usage out of it.
 *
 * Usage arrives in two places: message_start carries the input and cache counts, message_delta
 * carries the running output count. Buffering the whole response to read them would cost the
 * streaming UX, so the bytes are forwarded as they arrive and parsed alongside.
 */
function teeUsage(upstream, onUsage) {
  const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const decoder = new TextDecoder();
  let buffer = '';

  const transform = new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);                       // forward first, parse second
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let event;
        try { event = JSON.parse(payload); } catch { continue; }

        if (event.type === 'message_start' && event.message?.usage) {
          const u = event.message.usage;
          usage.input_tokens += u.input_tokens || 0;
          usage.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
          usage.cache_read_input_tokens += u.cache_read_input_tokens || 0;
        } else if (event.type === 'message_delta' && event.usage?.output_tokens) {
          usage.output_tokens = event.usage.output_tokens;   // cumulative, not incremental
        }
      }
    },
    flush() { onUsage(usage); },
  });

  return upstream.pipeThrough(transform);
}

export async function startInterview(env, user) {
  if (user.credits < 1) return { error: 'no_credits', status: 402 };

  const since = Date.now() - 86_400_000;
  const { count } = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM interviews WHERE user_id = ? AND created_at > ?')
    .bind(user.id, since).first();
  if (count >= Number(env.DAILY_SESSION_CAP || 3)) {
    return { error: 'daily_cap', status: 429 };
  }

  const id = uid('int');
  // The credit is held now. Settling on completion would let an abandoned session run free.
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0')
      .bind(user.id),
    env.DB.prepare(
      'INSERT INTO ledger (id, user_id, delta, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(uid('led'), user.id, -1, 'interview', id, Date.now()),
    env.DB.prepare('INSERT INTO interviews (id, user_id, created_at) VALUES (?, ?, ?)')
      .bind(id, user.id, Date.now()),
  ]);
  return { id };
}

export async function turn(env, user, body, ctx) {
  const interview = await env.DB.prepare(
    'SELECT * FROM interviews WHERE id = ? AND user_id = ?')
    .bind(body.interview_id || '', user.id).first();

  if (!interview) return { error: 'unknown_interview', status: 404 };
  if (interview.state !== 'open') return { error: 'interview_closed', status: 409 };

  const maxTurns = Number(env.MAX_TURNS_PER_SESSION || 120);
  const problem = validateTurns(body.messages, maxTurns);
  if (problem) return { error: problem, status: 400 };
  if (interview.turns >= maxTurns) {
    await env.DB.prepare("UPDATE interviews SET state = 'closed' WHERE id = ?")
      .bind(interview.id).run();
    return { error: 'turn_cap', status: 429 };
  }

  const upstream = await fetch(ANTHROPIC, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.MODEL || 'claude-opus-5',
      max_tokens: Number(env.MAX_TOKENS_PER_TURN || 8000),
      stream: true,
      system: systemBlocks(),
      thinking: { type: 'adaptive' },
      messages: body.messages,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    // Never surface the upstream body: it can echo request content and provider detail.
    console.error('anthropic error', upstream.status, detail.slice(0, 500));
    return { error: 'upstream_failed', status: 502 };
  }

  const stream = teeUsage(upstream.body, (usage) => {
    // Settle after the response has been delivered, so metering never delays the user.
    ctx.waitUntil(record(env, interview.id, usage, env.MODEL || 'claude-opus-5'));
  });

  return { stream };
}

async function record(env, interviewId, usage, model) {
  const micros = costMicros(usage, model);
  await env.DB.prepare(
    `UPDATE interviews
        SET turns = turns + 1,
            input_tokens = input_tokens + ?,
            output_tokens = output_tokens + ?,
            cache_write = cache_write + ?,
            cache_read = cache_read + ?,
            cost_micros = cost_micros + ?
      WHERE id = ?`)
    .bind(usage.input_tokens, usage.output_tokens, usage.cache_creation_input_tokens,
          usage.cache_read_input_tokens, micros, interviewId)
    .run();
}

export async function closeInterview(env, user, interviewId) {
  await env.DB.prepare(
    "UPDATE interviews SET state = 'closed' WHERE id = ? AND user_id = ?")
    .bind(interviewId, user.id).run();
  return env.DB.prepare(
    `SELECT id, turns, input_tokens, output_tokens, cache_write, cache_read, cost_micros, state
       FROM interviews WHERE id = ? AND user_id = ?`).bind(interviewId, user.id).first();
}
