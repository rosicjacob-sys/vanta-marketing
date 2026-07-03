// /.netlify/functions/admin-clients   (Bearer token, admin role)
//   GET    -> { clients: [...] }            list all client accounts
//   POST   { email, name, plan, password, metrics? }   create a client
//   PUT    { email, name?, plan?, password?, metrics? } update a client
//   DELETE { email }                         remove a client
import { userFromRequest, hashPassword, json } from '../lib/auth.mjs';
import {
  getUser, putUser, deleteUser, listUsers,
  normEmail, defaultMetrics, publicUser, addNotification,
} from '../lib/store.mjs';
import { notifyClient } from '../lib/notify.mjs';

function requireAdmin(req) {
  const u = userFromRequest(req);
  return u && u.role === 'admin' ? u : null;
}

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: 'forbidden' }, 403);

  const method = req.method;

  if (method === 'GET') {
    const clients = (await listUsers()).map(publicUser);
    clients.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return json({ clients });
  }

  let body = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const email = normEmail(body.email);
  if (!email) return json({ error: 'missing_email' }, 400);

  if (method === 'POST') {
    if (await getUser(email)) return json({ error: 'already_exists' }, 409);
    if (!body.password) return json({ error: 'missing_password' }, 400);
    const user = {
      email,
      name: body.name || '',
      plan: body.plan || '',
      role: 'client',
      pwHash: hashPassword(body.password),
      metrics: { ...defaultMetrics(), ...(body.metrics || {}) },
      availedAt: typeof body.availedAt === 'string' ? body.availedAt : '',
      period: body.period === 'yearly' ? 'yearly' : (body.period === 'monthly' ? 'monthly' : ''),
      visible: Array.isArray(body.visible) ? body.visible : null,
      createdAt: Date.now(),
    };
    await putUser(user);
    try {
      await notifyClient(email, 'Welcome to Vanta',
        'Your client dashboard is ready. Log in any time to see your traffic, articles and plan.', 'welcome');
      await addNotification({ audience: 'admin', recipient: '', title: 'New client added',
        body: (user.name || email) + ' was added' + (user.plan ? ' on ' + user.plan : '') + '.', type: 'client_added' });
    } catch (e) { /* notifications are best-effort */ }
    return json({ client: publicUser(user) }, 201);
  }

  if (method === 'PUT') {
    const existing = await getUser(email);
    if (!existing) return json({ error: 'not_found' }, 404);
    const updated = { ...existing };
    if (typeof body.name === 'string') updated.name = body.name;
    if (typeof body.plan === 'string') updated.plan = body.plan;
    if (typeof body.availedAt === 'string') updated.availedAt = body.availedAt;
    if (body.period === 'yearly' || body.period === 'monthly') updated.period = body.period;
    if (Array.isArray(body.visible)) updated.visible = body.visible;
    if (body.password) updated.pwHash = hashPassword(body.password);
    if (body.metrics && typeof body.metrics === 'object') {
      updated.metrics = { ...defaultMetrics(), ...existing.metrics, ...body.metrics };
    }
    updated.updatedAt = Date.now();
    await putUser(updated);
    return json({ client: publicUser(updated) });
  }

  if (method === 'DELETE') {
    await deleteUser(email);
    return json({ ok: true });
  }

  return json({ error: 'method_not_allowed' }, 405);
};
