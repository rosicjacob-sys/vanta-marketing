// GET /.netlify/functions/admin-netgrid   (Bearer token, admin role)
// Server-side proxy: resolves each Vanta client to their netgrid client by
// email and returns a { email -> stats } map for the admin Clients table.
// Env: NETGRID_API_URL, NETGRID_API_KEY.
import { userFromRequest, json } from '../lib/auth.mjs';
import { listUsers } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const base = (process.env.NETGRID_API_URL || '').replace(/\/$/, '');
  const key = process.env.NETGRID_API_KEY || '';
  if (!base || !key) return json({ configured: false, clients: {} });

  const headers = { authorization: 'Bearer ' + key };
  let users = [];
  try { users = await listUsers(); } catch (e) { users = []; }
  const emails = users
    .filter(c => !c.role || c.role === 'client')
    .map(c => c.email)
    .filter(Boolean)
    .slice(0, 100); // no pagination on netgrid yet; cap the fan-out

  const out = {};
  await Promise.all(emails.map(async (email) => {
    try {
      const r = await fetch(base + '/api/v1/clients?email=' + encodeURIComponent(email), { headers });
      if (!r.ok) return;
      const d = await r.json().catch(() => ({}));
      const c = (d.clients || [])[0];
      if (c) out[email] = {
        status: c.status || null,
        blogCount: c.blogCount != null ? c.blogCount : null,
        avgSeoScore: c.avgSeoScore != null ? c.avgSeoScore : null,
        lastPostAt: c.lastPostAt || null,
      };
    } catch (e) { /* skip this client */ }
  }));

  return json({ configured: true, clients: out });
};
