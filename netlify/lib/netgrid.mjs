// Shared helpers for the netgrid Marketing API proxies.
// Env: NETGRID_API_URL, NETGRID_API_KEY. Server-to-server only.
export function ngConfig() {
  return {
    base: (process.env.NETGRID_API_URL || '').replace(/\/$/, ''),
    key: process.env.NETGRID_API_KEY || '',
  };
}

export async function resolveClientId(base, key, email) {
  const r = await fetch(base + '/api/v1/clients?email=' + encodeURIComponent(email || ''), {
    headers: { authorization: 'Bearer ' + key },
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => ({}));
  const c = (d.clients || [])[0];
  return c ? c.id : null;
}

// Views/clicks bucketed over time for a client (day|week granularity).
export async function fetchTraffic(base, key, id, opts) {
  opts = opts || {};
  const g = opts.granularity === 'week' ? 'week' : 'day';
  const q = 'granularity=' + g + (opts.days ? '&days=' + encodeURIComponent(opts.days) : '');
  const r = await fetch(base + '/api/v1/clients/' + encodeURIComponent(id) + '/traffic?' + q, {
    headers: { authorization: 'Bearer ' + key },
  });
  if (!r.ok) return { ok: false, status: r.status, granularity: g, series: [] };
  const d = await r.json().catch(() => ({}));
  const series = (d.series || []).map(p => ({ date: p.date, views: Number(p.views) || 0, clicks: Number(p.clicks) || 0 }));
  return { ok: true, granularity: d.granularity || g, series };
}
