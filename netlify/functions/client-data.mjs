// GET /.netlify/functions/client-data   (Bearer token, client role)
// Returns the signed-in client's own profile + metrics. Never trusts an email
// from the query string — only the identity baked into the verified token.
import { userFromRequest, json } from '../lib/auth.mjs';
import { getUser, publicUser } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);

  const user = await getUser(u.sub);
  if (!user) return json({ error: 'not_found' }, 404);
  return json({ user: publicUser(user) });
};
