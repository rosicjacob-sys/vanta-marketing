// /.netlify/functions/admin-payments   (Bearer token, admin role)
//   GET                                  -> { claims: [...] }  clients with a pending payment claim
//   POST { email, decision:'confirm'|'reject' }
//     confirm -> restart the subscription from today + notify the client
//     reject  -> clear the claim + notify the client
import { userFromRequest, json } from '../lib/auth.mjs';
import { getUser, putUser, normEmail, listClaims, resolveClaim } from '../lib/store.mjs';
import { notifyClient } from '../lib/notify.mjs';

function pad(n) { return String(n).padStart(2, '0'); }
function toStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayStr() { return toStr(new Date()); }
function addPeriod(dateStr, period) {
  const d = new Date(dateStr + 'T00:00:00');
  if (period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return toStr(d);
}

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  if (req.method === 'GET') {
    // full history: pending claims to review + resolved (confirmed/rejected)
    return json({ claims: await listClaims() });
  }

  if (req.method === 'POST') {
    let b = {};
    try { b = await req.json(); } catch { /* ignore */ }
    const email = normEmail(b.email);
    const decision = b.decision;
    if (!email || (decision !== 'confirm' && decision !== 'reject')) return json({ error: 'bad_request' }, 400);
    const user = await getUser(email);
    if (!user) return json({ error: 'not_found' }, 404);

    user.claimStatus = '';
    user.claimAt = 0;

    if (decision === 'confirm') {
      const today = todayStr();
      user.availedAt = today;
      user.snoozeUntil = 0;
      const newExpiry = addPeriod(today, user.period === 'yearly' ? 'yearly' : 'monthly');
      await putUser(user);
      try { await resolveClaim(email, 'confirmed'); } catch (e) { /* best effort */ }
      try {
        await notifyClient(email, 'Payment confirmed', 'Thanks! Your plan is active until ' + newExpiry + '.', 'payment_confirmed');
      } catch (e) { /* best effort */ }
      return json({ ok: true });
    }

    await putUser(user);
    try { await resolveClaim(email, 'rejected'); } catch (e) { /* best effort */ }
    try {
      await notifyClient(email, 'Payment not verified',
        "We couldn't verify your payment yet. Please try again, or reach us in the chat.", 'payment_rejected');
    } catch (e) { /* best effort */ }
    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
};
