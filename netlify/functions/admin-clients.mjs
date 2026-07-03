// /.netlify/functions/admin-clients   (Bearer token, admin role)
//   GET    -> { clients: [...] }            list all client accounts
//   POST   { email, name, plan, password, metrics? }   create a client
//   PUT    { email, name?, plan?, password?, metrics? } update a client
//   DELETE { email }                         remove a client
import { userFromRequest, hashPassword, json } from '../lib/auth.mjs';
import {
  getUser, putUser, deleteUser, listUsers,
  normEmail, defaultMetrics, publicUser,
} from '../lib/store.mjs';

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
      createdAt: Date.now(),
    };
    await putUser(user);
    return json({ client: publicUser(user) }, 201);
  }

  if (method === 'PUT') {
    const existing = await getUser(email);
    if (!existing) return json({ error: 'not_found' }, 404);
    const updated = { ...existing };
    if (typeof body.name === 'string') updated.name = body.name;
    if (typeof body.plan === 'string') updated.plan = body.plan;
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
