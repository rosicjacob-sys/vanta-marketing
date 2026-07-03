// GET /.netlify/functions/chat-poll?cid=...&after=<ms>
// Public (no auth): a visitor polls for new messages in their own conversation.
// The random cid acts as the access key to that thread.
import { json } from '../lib/auth.mjs';
import { chatMessagesAfter } from '../lib/store.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const cid = (url.searchParams.get('cid') || '').trim().slice(0, 80);
  const after = Number(url.searchParams.get('after')) || 0;
  if (!cid) return json({ error: 'missing_cid' }, 400);
  const messages = await chatMessagesAfter(cid, after);
  const head = messages.reduce((mx, m) => Math.max(mx, m.created_at || 0), after);
  return json({ messages, head });
};
