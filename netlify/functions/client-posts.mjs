// GET /.netlify/functions/client-posts?limit=&blogId=   (client)
// Recent posts (articles) for the signed-in client — feeds the posts list
// and the publishing-cadence chart.
import { userFromRequest, json } from '../lib/auth.mjs';
import { ngConfig, resolveClientId, fetchPosts } from '../lib/netgrid.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u) return json({ error: 'unauthorized' }, 401);
  const { base, key } = ngConfig();
  if (!base || !key) return json({ configured: false, posts: [] });

  const url = new URL(req.url);
  const limit = url.searchParams.get('limit') || '';
  const blogId = url.searchParams.get('blogId') || '';
  const email = (u.sub || u.email || '').toLowerCase();

  try {
    const id = await resolveClientId(base, key, email);
    if (!id) return json({ configured: true, ok: true, posts: [] });
    const r = await fetchPosts(base, key, id, { limit, blogId });
    return json({ configured: true, ok: r.ok, posts: r.posts });
  } catch (e) {
    return json({ configured: true, ok: false, posts: [], error: String((e && e.message) || e).slice(0, 200) });
  }
};
