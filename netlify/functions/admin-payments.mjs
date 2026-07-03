// /.netlify/functions/admin-payments   (Bearer token, admin role)
//   GET                                  -> { claims: [...] }  clients with a pending payment claim
//   POST { email, decision:'confirm'|'reject' }
//     confirm -> restart the subscription from today + notify the client
//     reject  -> clear the claim + notify the client
import { userFromRequest, json } from '../lib/auth.mjs';
import { getUser, putUser, listUsers, publicUser, addNotification, normEmail } from '../lib/store.mjs';

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
    const clients = await listUsers();
    const claims = clients.filter(c => c.claimStatus === 'pending')
      .map(publicUser).sort((a, b) => (b.claimAt || 0) - (a.claimAt || 0));
    return json({ claims });
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
      try {
        await addNotification({ audience: 'client', recipient: email, title: 'Payment confirmed',
          body: 'Thanks! Your plan is active until ' + newExpiry + '.', type: 'payment_confirmed' });
      } catch (e) { /* best effort */ }
      return json({ ok: true, client: publicUser(user) });
    }

    await putUser(user);
    try {
      await addNotification({ audience: 'client', recipient: email, title: 'Payment not verified',
        body: "We couldn't verify your payment yet. Please try again, or reach us in the chat.", type: 'payment_rejected' });
    } catch (e) { /* best effort */ }
    return json({ ok: true, client: publicUser(user) });
  }

  return json({ error: 'method_not_allowed' }, 405);
};
