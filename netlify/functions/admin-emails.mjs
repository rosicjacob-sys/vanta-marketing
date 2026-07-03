// /.netlify/functions/admin-emails   (Bearer token, admin role)
//   GET -> { emails: [...] }   recent outbound email attempts (newest first)
import { userFromRequest, json } from '../lib/auth.mjs';
import { listEmails } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);
  return json({ emails: await listEmails(200) });
};
