// POST /.netlify/functions/admin-migrate   (Bearer token, admin role)
// One-time migration: copy any client records still in Netlify Blobs into the
// Postgres database. Safe to run more than once (upserts by email). No-op if
// the database isn't configured yet.
import { userFromRequest, json } from '../lib/auth.mjs';
import { listBlobUsers, putUser } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);
  if (!process.env.NETLIFY_DATABASE_URL) return json({ error: 'no_database' }, 400);

  let legacy = [];
  try {
    legacy = await listBlobUsers();
  } catch (e) {
    return json({ error: 'blobs_unavailable', detail: String((e && e.message) || e).slice(0, 140) }, 200);
  }

  let migrated = 0;
  const failed = [];
  for (const rec of legacy) {
    try { await putUser(rec); migrated++; }
    catch (e) { failed.push(rec.email); }
  }
  return json({ found: legacy.length, migrated, failed });
};
