// POST /.netlify/functions/admin-migrate   (Bearer token, admin role)
// One-time migration: copy legacy data still in Netlify Blobs into Postgres —
// clients, plans, and chat conversations. Safe to run more than once
// (clients upsert by email; chats skip if already present).
import { userFromRequest, json } from '../lib/auth.mjs';
import { listBlobUsers, putUser, getBlobPlans, setPlans, listBlobChatsFull, importChat } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);
  if (!process.env.NETLIFY_DATABASE_URL) return json({ error: 'no_database' }, 400);

  const result = { clients: 0, plans: 0, chats: 0, errors: [] };

  // clients
  try {
    const users = await listBlobUsers();
    for (const rec of users) {
      try { await putUser(rec); result.clients++; }
      catch (e) { result.errors.push('client:' + (rec.email || '?')); }
    }
  } catch (e) { result.errors.push('clients_read'); }

  // plans
  try {
    const plans = await getBlobPlans();
    if (plans && plans.length) { await setPlans(plans); result.plans = plans.length; }
  } catch (e) { result.errors.push('plans'); }

  // chats
  try {
    const chats = await listBlobChatsFull();
    for (const conv of chats) {
      try { const r = await importChat(conv); if (!r.skipped) result.chats++; }
      catch (e) { result.errors.push('chat:' + (conv.cid || '?')); }
    }
  } catch (e) { result.errors.push('chats_read'); }

  return json({ ok: true, ...result });
};
