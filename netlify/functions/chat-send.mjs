// POST /.netlify/functions/chat-send  { cid, name, email, business, message }
// Public (no auth): a visitor sends a chat message. Stored in the database.
import { json } from '../lib/auth.mjs';
import { chatSend } from '../lib/store.mjs';
import { notifyAdmin } from '../lib/notify.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let b = {};
  try { b = await req.json(); } catch { /* ignore */ }
  const cid = String(b.cid || '').trim().slice(0, 80);
  const body = String(b.message || '').trim().slice(0, 4000);
  if (!cid || !body) return json({ error: 'missing_fields' }, 400);
  const name = String(b.name || '').slice(0, 200);
  const email = String(b.email || '').slice(0, 200);
  const business = String(b.business || '').slice(0, 200);
  const res = await chatSend({ cid, name, email, business, body });

  // Alert the admin: email on the first message of a new conversation,
  // in-app bell alert only for follow-ups (so a back-and-forth doesn't spam).
  try {
    const who = name || email || 'A visitor';
    const from = who + (business ? ' (' + business + ')' : '');
    await notifyAdmin('New chat message from ' + from, body.slice(0, 300), 'chat', { email: !!res.firstMessage });
  } catch (e) { /* best effort */ }

  return json(res);
};
