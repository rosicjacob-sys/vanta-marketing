// GET /.netlify/functions/admin-client-posts?email=&limit=&blogId=   (admin)
// Recent posts for a given client, for the admin Real-data view.
import { userFromRequest, json } from '../lib/auth.mjs';
import { ngConfig, resolveClientId, fetchPosts } from '../lib/netgrid.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);
  const { base, key } = ngConfig();
  if (!base || !key) return json({ configured: false, posts: [] });

  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').toLowerCase();
  const limit = url.searchParams.get('limit') || '';
  const blogId = url.searchParams.get('blogId') || '';
  if (!email) return json({ configured: true, ok: false, posts: [] });

  try {
    const id = await resolveClientId(base, key, email);
    if (!id) return json({ configured: true, ok: true, posts: [] });
    const r = await fetchPosts(base, key, id, { limit, blogId });
    return json({ configured: true, ok: r.ok, posts: r.posts });
  } catch (e) {
    return json({ configured: true, ok: false, posts: [], error: String((e && e.message) || e).slice(0, 200) });
  }
};
