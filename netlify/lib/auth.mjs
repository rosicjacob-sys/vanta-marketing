// Shared auth helpers: password hashing + signed session tokens.
// No external crypto deps — uses Node's built-in `crypto`.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

const TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

// ---- password hashing (scrypt) ----
export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const dk = scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${dk}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [scheme, salt, dk] = String(stored).split('$');
    if (scheme !== 'scrypt' || !salt || !dk) return false;
    const calc = scryptSync(String(pw), salt, 64);
    const expected = Buffer.from(dk, 'hex');
    return calc.length === expected.length && timingSafeEqual(calc, expected);
  } catch {
    return false;
  }
}

// ---- signed tokens (compact HMAC, JWT-ish) ----
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function sign(data, secret) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signToken(payload, secret, ttlSec = TOKEN_TTL_SEC) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec };
  const b = b64url(JSON.stringify(body));
  return `${b}.${sign(b, secret)}`;
}

export function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b, sig] = token.split('.');
  const expected = sign(b, secret);
  // constant-time compare
  const a = Buffer.from(sig || '');
  const e = Buffer.from(expected);
  if (a.length !== e.length || !timingSafeEqual(a, e)) return null;
  let body;
  try { body = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')); } catch { return null; }
  if (!body || (body.exp && body.exp < Math.floor(Date.now() / 1000))) return null;
  return body;
}

// Pull + verify the bearer token from a Functions v2 Request.
export function userFromRequest(req) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return verifyToken(m[1], secret);
}

export function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}
