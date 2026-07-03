// GET /.netlify/functions/admin-client-seo-history?email=&days=&blogId=  (admin)
// Per-site SEO score over time for a given client, for the admin Real-data view.
import { userFromRequest, json } from '../lib/auth.mjs';
import { ngConfig, resolveClientId, fetchSeoHistory } from '../lib/netgrid.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);
  const { base, key } = ngConfig();
  if (!base || !key) return json({ configured: false, sites: [] });

  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').toLowerCase();
  const days = url.searchParams.get('days') || '';
  const blogId = url.searchParams.get('blogId') || '';
  if (!email) return json({ configured: true, ok: false, sites: [] });

  try {
    const id = await resolveClientId(base, key, email);
    if (!id) return json({ configured: true, ok: true, sites: [] });
    const r = await fetchSeoHistory(base, key, id, { days, blogId });
    return json({ configured: true, ok: r.ok, sites: r.sites });
  } catch (e) {
    return json({ configured: true, ok: false, sites: [], error: String((e && e.message) || e).slice(0, 200) });
  }
};
