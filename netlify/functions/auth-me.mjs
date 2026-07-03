// GET /.netlify/functions/auth-me   (Bearer token)
// Lightweight session check used by the front-end on load to restore state.
import { userFromRequest, json } from '../lib/auth.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);
  return json({ email: u.sub, role: u.role });
};
