// GET /.netlify/functions/client-netgrid   (Bearer token, client role)
// Server-side proxy to the netgrid Marketing API. Resolves the signed-in
// client to their netgrid client by email, then returns their sites + SEO
// scores. The API key stays server-side (netgrid sets no CORS headers).
// Env: NETGRID_API_URL, NETGRID_API_KEY.
import { userFromRequest, json } from '../lib/auth.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);

  const base = (process.env.NETGRID_API_URL || '').replace(/\/$/, '');
  const key = process.env.NETGRID_API_KEY || '';
  if (!base || !key) return json({ configured: false, client: null, sites: [] });

  const headers = { authorization: 'Bearer ' + key };
  const email = u.sub || u.email || '';
  const days = (new URL(req.url).searchParams.get('days') || '').trim();
  const win = days ? '?days=' + encodeURIComponent(days) : '';

  try {
    // 1. Resolve the logged-in client to their netgrid client by email.
    const listRes = await fetch(base + '/api/v1/clients?email=' + encodeURIComponent(email) + (days ? '&days=' + encodeURIComponent(days) : ''), { headers });
    if (!listRes.ok) return json({ configured: true, ok: false, status: listRes.status, client: null, sites: [] });
    const list = await listRes.json().catch(() => ({}));
    const found = (list.clients || [])[0];
    if (!found) return json({ configured: true, ok: true, client: null, sites: [] });

    // 2. Pull that client's sites + SEO scores (traffic windowed by ?days).
    const detRes = await fetch(base + '/api/v1/clients/' + encodeURIComponent(found.id) + win, { headers });
    if (!detRes.ok) return json({ configured: true, ok: false, status: detRes.status, client: found, sites: [] });
    const d = await detRes.json().catch(() => ({}));

    const pick = (a, b) => (a != null ? a : (b != null ? b : null));
    const client = {
      name: d.name || found.name || '', niche: d.niche || null, status: d.status || null,
      blogCount: d.blogCount != null ? d.blogCount : (found.blogCount || 0),
      activeBlogCount: d.activeBlogCount != null ? d.activeBlogCount : null,
      avgSeoScore: pick(d.avgSeoScore, found.avgSeoScore),
      lastPostAt: d.lastPostAt || null,
      postCount: pick(d.postCount, found.postCount),
      postsLast30Days: d.postsLast30Days != null ? d.postsLast30Days : null,
      views: pick(d.views, found.views),
      clicks: pick(d.clicks, found.clicks),
    };
    const sites = (d.sites || []).map(s => ({
      id: s.id, domain: s.domain || '', platform: s.platform || null, status: s.status || null,
      seoScore: s.seoScore != null ? s.seoScore : null,
      lastPostAt: s.lastPostAt || null, lastPostTitle: s.lastPostTitle || null, lastScanAt: s.lastScanAt || null,
    }));
    return json({ configured: true, ok: true, client, sites });
  } catch (e) {
    return json({ configured: true, ok: false, error: String((e && e.message) || e).slice(0, 200), client: null, sites: [] });
  }
};
