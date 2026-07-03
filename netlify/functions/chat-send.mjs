// POST /.netlify/functions/chat-send  { cid, name, email, business, message }
// Public (no auth): a visitor sends a chat message. Stored in the database.
import { json } from '../lib/auth.mjs';
import { chatSend } from '../lib/store.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let b = {};
  try { b = await req.json(); } catch { /* ignore */ }
  const cid = String(b.cid || '').trim().slice(0, 80);
  const body = String(b.message || '').trim().slice(0, 4000);
  if (!cid || !body) return json({ error: 'missing_fields' }, 400);
  const res = await chatSend({
    cid,
    name: String(b.name || '').slice(0, 200),
    email: String(b.email || '').slice(0, 200),
    business: String(b.business || '').slice(0, 200),
    body,
  });
  return json(res);
};
