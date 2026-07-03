// GET /.netlify/functions/client-chat   (Bearer token, client)
// Returns the signed-in client's stable conversation id + past messages, so
// the floating chat can auto-load their history (even on a new browser).
// The cid is an HMAC of the client's email so it's stable but unguessable.
import { userFromRequest, json } from '../lib/auth.mjs';
import { chatMessagesAfter } from '../lib/store.mjs';
import { createHmac } from 'node:crypto';

export function clientChatCid(email, secret) {
  return 'c-' + createHmac('sha256', secret || 'vanta').update('chat:' + String(email || '').toLowerCase()).digest('hex').slice(0, 32);
}

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);
  const email = (u.sub || u.email || '').toLowerCase();
  if (!email) return json({ cid: '', messages: [] });
  const cid = clientChatCid(email, process.env.SESSION_SECRET || '');
  const messages = await chatMessagesAfter(cid, 0); // all messages for this conversation
  return json({ cid, messages });
};
