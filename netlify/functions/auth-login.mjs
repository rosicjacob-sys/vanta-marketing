// POST /.netlify/functions/auth-login  { email, password }
// -> { token, role, name }   Admin comes from env; clients come from Blobs.
import { verifyPassword, signToken, json } from '../lib/auth.mjs';
import { getUser, normEmail, publicUser } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const secret = process.env.SESSION_SECRET;
  if (!secret) return json({ error: 'server_not_configured' }, 500);

  let body = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const email = normEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password) return json({ error: 'missing_credentials' }, 400);

  const adminEmail = normEmail(process.env.ADMIN_EMAIL);
  const adminHash = process.env.ADMIN_PW_HASH;

  // Admin: verified against env, never stored in the repo or exposed to the browser.
  if (adminEmail && email === adminEmail) {
    if (adminHash && verifyPassword(password, adminHash)) {
      const token = signToken({ sub: email, role: 'admin' }, secret);
      return json({ token, role: 'admin', name: 'Admin', email });
    }
    return json({ error: 'invalid_credentials' }, 401);
  }

  // Client: looked up in Blobs.
  const user = await getUser(email);
  if (!user || !verifyPassword(password, user.pwHash)) {
    return json({ error: 'invalid_credentials' }, 401);
  }
  const token = signToken({ sub: email, role: 'client' }, secret);
  return json({ token, role: 'client', name: user.name || '', email, user: publicUser(user) });
};
