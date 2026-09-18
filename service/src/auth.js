/**
 * Accounts and sessions. Web Crypto only, no dependencies.
 *
 * Passwords are PBKDF2-SHA256 at 210,000 iterations with a random salt. Session tokens are
 * random 32-byte values; only their SHA-256 hash is stored, so a database dump does not hand
 * out live sessions.
 */

const ITERATIONS = 210_000;
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
export const uid = (prefix) => `${prefix}_${b64url(crypto.getRandomValues(new Uint8Array(12)))}`;

export async function sha256(text) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** Constant time comparison. String equality on a secret leaks its prefix through timing. */
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return b64url(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${hash}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const computed = await pbkdf2(password, unb64url(salt), Number(iterations));
  return timingSafeEqual(computed, hash);
}

/**
 * Deliberately mild: enough to stop the worst reuse, not a policy that pushes people toward
 * a password manager they do not have. Length does the work.
 */
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password must be at least 10 characters.';
  }
  if (password.length > 512) return 'Password is too long.';
  if (/^[0-9]+$/.test(password)) return 'Password cannot be only digits.';
  return null;
}

export function emailProblem(email) {
  if (typeof email !== 'string') return 'Email is required.';
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length < 5 || trimmed.length > 254) return 'That email does not look right.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'That email does not look right.';
  return null;
}

const SESSION_DAYS = 30;

export async function createSession(db, userId) {
  const token = randomToken();
  const now = Date.now();
  await db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 86_400_000)
    .run();
  return token;
}

/** Resolves a bearer token to a user, or null. Expired sessions are cleaned up as found. */
export async function userFromRequest(db, request) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return null;

  const hash = await sha256(token);
  const row = await db.prepare(
    `SELECT u.id, u.email, u.credits, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`).bind(hash).first();

  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return null;
  }
  return { id: row.id, email: row.email, credits: row.credits };
}

export async function destroySession(db, request) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
}
