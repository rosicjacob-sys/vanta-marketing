// GET /.netlify/functions/client-data   (Bearer token, client role)
// Returns the signed-in client's own profile + metrics. Never trusts an email
// from the query string — only the identity baked into the verified token.
import { userFromRequest, json } from '../lib/auth.mjs';
import { getUser, publicUser, getPlans } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);

  const user = await getUser(u.sub);
  if (!user) return json({ error: 'not_found' }, 404);

  // attach the client's plan buy-link/price so the dashboard can offer "Renew"
  let planLink = '', planPrice = '';
  if (user.plan) {
    try {
      const plans = await getPlans();
      const match = (plans || []).find(p => (typeof p === 'string' ? p : p.name) === user.plan);
      if (match && typeof match === 'object') { planLink = match.link || ''; planPrice = match.price || ''; }
    } catch (e) { /* ignore */ }
  }
  return json({ user: publicUser(user), planLink, planPrice });
};
