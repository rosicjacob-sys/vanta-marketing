// GET /.netlify/functions/client-seo-history?days=&blogId=   (client)
// Per-site overall SEO score over time for the signed-in client - feeds the
// SEO-score trend line and the per-site authority panel.
import { userFromRequest, json } from '../lib/auth.mjs';
import { ngConfig, resolveClientId, fetchSeoHistory } from '../lib/netgrid.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);
  const { base, key } = ngConfig();
  if (!base || !key) return json({ configured: false, sites: [] });

  const url = new URL(req.url);
  const days = url.searchParams.get('days') || '';
  const blogId = url.searchParams.get('blogId') || '';
  const email = (u.sub || u.email || '').toLowerCase();

  try {
    const id = await resolveClientId(base, key, email);
    if (!id) return json({ configured: true, ok: true, sites: [] });
    const r = await fetchSeoHistory(base, key, id, { days, blogId });
    return json({ configured: true, ok: r.ok, sites: r.sites });
  } catch (e) {
    return json({ configured: true, ok: false, sites: [], error: String((e && e.message) || e).slice(0, 200) });
  }
};
