// /.netlify/functions/admin-chats   (Bearer token, admin role)
//   GET                      -> { conversations: [...] }        list all threads
//   GET ?cid=...&after=<ms>  -> { messages: [...], head }       one thread
//   POST { cid, message }    -> post an admin reply
import { userFromRequest, json } from '../lib/auth.mjs';
import { chatList, chatMessagesAfter, chatReply } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const cid = (url.searchParams.get('cid') || '').trim();
    if (cid) {
      const after = Number(url.searchParams.get('after')) || 0;
      const messages = await chatMessagesAfter(cid, after);
      const head = messages.reduce((mx, m) => Math.max(mx, m.created_at || 0), after);
      return json({ messages, head });
    }
    return json({ conversations: await chatList() });
  }

  if (req.method === 'POST') {
    let b = {};
    try { b = await req.json(); } catch { /* ignore */ }
    const cid = String(b.cid || '').trim();
    const body = String(b.message || '').trim().slice(0, 4000);
    if (!cid || !body) return json({ error: 'missing_fields' }, 400);
    return json(await chatReply({ cid, body }));
  }

  return json({ error: 'method_not_allowed' }, 405);
};
