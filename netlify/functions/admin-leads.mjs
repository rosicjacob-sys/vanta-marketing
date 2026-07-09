// /.netlify/functions/admin-leads   (Bearer token, admin role)
//   GET                    -> { leads: [...] }     all leads, newest first
//   POST   { ...fields }   -> { ok, id }           create a lead manually
//   PUT    { id, ...fields }-> { ok }              update a lead
//   DELETE { id }          -> { ok }               delete a lead
import { userFromRequest, json } from '../lib/auth.mjs';
import { listLeads, addLead, updateLead, deleteLead } from '../lib/store.mjs';

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

function pickLead(b) {
  return {
    name: clip(b.name, 200), business: clip(b.business, 200), email: clip(b.email, 200),
    phone: clip(b.phone, 60), service: clip(b.service, 200), message: clip(b.message, 4000),
    source: clip(b.source, 80), status: clip(b.status || 'new', 20),
    meta: (b.meta && typeof b.meta === 'object' && !Array.isArray(b.meta)) ? b.meta : {},
  };
}

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  if (req.method === 'GET') return json({ leads: await listLeads() });

  let b = {};
  try { b = await req.json(); } catch { /* ignore */ }

  if (req.method === 'POST') {
    return json(await addLead(pickLead(b)));
  }
  if (req.method === 'PUT') {
    const id = Number(b.id) || 0;
    if (!id) return json({ error: 'missing_id' }, 400);
    return json(await updateLead(id, pickLead(b)));
  }
  if (req.method === 'DELETE') {
    const id = Number(b.id) || 0;
    if (!id) return json({ error: 'missing_id' }, 400);
    return json(await deleteLead(id));
  }
  return json({ error: 'method_not_allowed' }, 405);
};
