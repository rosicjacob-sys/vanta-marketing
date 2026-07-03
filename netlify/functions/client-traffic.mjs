// GET /.netlify/functions/client-traffic?days=&granularity=   (client)
// Views/clicks over time for the signed-in client (for the trend charts).
import { userFromRequest, json } from '../lib/auth.mjs';
import { ngConfig, resolveClientId, fetchTraffic } from '../lib/netgrid.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);
  const { base, key } = ngConfig();
  if (!base || !key) return json({ configured: false, series: [] });

  const url = new URL(req.url);
  const days = url.searchParams.get('days') || '';
  const granularity = url.searchParams.get('granularity') || 'day';
  const email = (u.sub || u.email || '').toLowerCase();

  try {
    const id = await resolveClientId(base, key, email);
    if (!id) return json({ configured: true, ok: true, series: [] });
    const tr = await fetchTraffic(base, key, id, { days, granularity });
    return json({ configured: true, ok: tr.ok, granularity: tr.granularity, series: tr.series });
  } catch (e) {
    return json({ configured: true, ok: false, series: [], error: String((e && e.message) || e).slice(0, 200) });
  }
};
