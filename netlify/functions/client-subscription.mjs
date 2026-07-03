// POST /.netlify/functions/client-subscription  (Bearer token, client)
//   { action: 'paid' }   -> file a payment claim (admin will verify)
//   { action: 'snooze' } -> remind me later (snooze the expiry popup 24h)
import { userFromRequest, json } from '../lib/auth.mjs';
import { getUser, putUser, addNotification } from '../lib/store.mjs';

const DAY = 24 * 60 * 60 * 1000;

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const u = userFromRequest(req);
  if (!u || u.role !== 'client') return json({ error: 'unauthorized' }, 401);

  const user = await getUser(u.sub);
  if (!user) return json({ error: 'not_found' }, 404);

  let b = {};
  try { b = await req.json(); } catch { /* ignore */ }

  if (b.action === 'snooze') {
    user.snoozeUntil = Date.now() + DAY;
    await putUser(user);
    return json({ ok: true, snoozeUntil: user.snoozeUntil });
  }

  if (b.action === 'paid') {
    user.claimStatus = 'pending';
    user.claimAt = Date.now();
    await putUser(user);
    try {
      await addNotification({ audience: 'admin', recipient: '', title: 'Payment claim to verify',
        body: (user.name || user.email) + ' says they paid' + (user.plan ? ' for ' + user.plan : '') + '. Verify in Payments.',
        type: 'payment_claim' });
    } catch (e) { /* best effort */ }
    return json({ ok: true, claimStatus: 'pending' });
  }

  return json({ error: 'bad_request' }, 400);
};
