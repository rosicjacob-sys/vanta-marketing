// GET /.netlify/functions/admin-client-netgrid-raw?email=<client email>  (admin)
// Diagnostic: returns netgrid's UNTOUCHED API response for a client, so we can
// compare the exact fields/values netgrid's API returns against what its own
// dashboard UI shows. No mapping, no field renaming - raw passthrough.
// Env: NETGRID_API_URL, NETGRID_API_KEY.
import { userFromRequest, json } from '../lib/auth.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const base = (process.env.NETGRID_API_URL || '').replace(/\/$/, '');
  const key = process.env.NETGRID_API_KEY || '';
  if (!base || !key) return json({ configured: false });

  const sp = new URL(req.url).searchParams;
  const email = (sp.get('email') || '').trim();
  if (!email) return json({ configured: true, ok: false, error: 'missing_email' });
  const days = (sp.get('days') || '').trim();
  const win = days ? '?days=' + encodeURIComponent(days) : '';

  const headers = { authorization: 'Bearer ' + key };
  try {
    // 1. The list match (what /clients?email= returns for this email).
    const listUrl = base + '/api/v1/clients?email=' + encodeURIComponent(email) + (days ? '&days=' + encodeURIComponent(days) : '');
    const listRes = await fetch(listUrl, { headers });
    const listBody = await listRes.json().catch(() => ({}));
    const matches = listBody.clients || [];
    const found = matches[0];
    if (!found) {
      return json({ configured: true, ok: true, email, listUrl, matchCount: matches.length, listMatches: matches, detail: null });
    }

    // 2. The full detail record (what /clients/{id} returns) - untouched.
    const detUrl = base + '/api/v1/clients/' + encodeURIComponent(found.id) + win;
    const detRes = await fetch(detUrl, { headers });
    const detail = await detRes.json().catch(() => ({}));

    return json({
      configured: true, ok: true, email,
      matchCount: matches.length,      // >1 means the email resolves to multiple netgrid clients
      resolvedId: found.id,
      listUrl, detUrl,
      detailStatus: detRes.status,
      listMatches: matches,            // every client the email matched (raw)
      detail,                          // raw /clients/{id} body (all fields netgrid returns)
    });
  } catch (e) {
    return json({ configured: true, ok: false, error: String((e && e.message) || e).slice(0, 300) });
  }
};
