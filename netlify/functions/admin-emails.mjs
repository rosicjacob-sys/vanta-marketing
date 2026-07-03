// /.netlify/functions/admin-emails   (Bearer token, admin role)
//   GET                       -> { emails: [...] }   recent outbound email attempts
//   DELETE { id }             -> delete one logged email
//   DELETE { all: true, audience? } -> clear all (optionally just one audience)
import { userFromRequest, json } from '../lib/auth.mjs';
import { listEmails, deleteEmail, clearEmails } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  if (req.method === 'GET') {
    return json({ emails: await listEmails(200) });
  }

  if (req.method === 'DELETE') {
    let b = {};
    try { b = await req.json(); } catch { /* ignore */ }
    if (b && b.all) return json(await clearEmails(b.audience || ''));
    if (b && b.id != null) return json(await deleteEmail(b.id));
    return json({ error: 'missing_fields' }, 400);
  }

  return json({ error: 'method_not_allowed' }, 405);
};
