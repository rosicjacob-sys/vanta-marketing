// /.netlify/functions/notifications   (Bearer token - client or admin)
//   GET                    -> { notifications: [...], unread }
//   POST { action:'read' } -> mark all of the caller's notifications read
// Audience is derived from the token: admins share one inbox; each client has
// their own keyed by email.
import { userFromRequest, json } from '../lib/auth.mjs';
import { listNotifications, markNotificationsRead, unreadCount } from '../lib/store.mjs';

function audienceOf(u) {
  return u.role === 'admin' ? { audience: 'admin', recipient: '' } : { audience: 'client', recipient: u.sub };
}

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);
  const { audience, recipient } = audienceOf(u);

  if (req.method === 'GET') {
    const notifications = await listNotifications(audience, recipient);
    const unread = await unreadCount(audience, recipient);
    return json({ notifications, unread });
  }

  if (req.method === 'POST') {
    let b = {};
    try { b = await req.json(); } catch { /* ignore */ }
    if (b.action === 'read') { await markNotificationsRead(audience, recipient); return json({ ok: true }); }
    return json({ error: 'bad_request' }, 400);
  }

  return json({ error: 'method_not_allowed' }, 405);
};
