// /.netlify/functions/admin-plans   (Bearer token, admin role)
//   GET               -> { plans: [...] }        the list of plan names
//   PUT { plans: [] } -> save the list
import { userFromRequest, json } from '../lib/auth.mjs';
import { getPlans, setPlans } from '../lib/store.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  if (req.method === 'GET') {
    return json({ plans: await getPlans() });
  }

  if (req.method === 'PUT') {
    let b = {};
    try { b = await req.json(); } catch { /* ignore */ }
    const plans = Array.isArray(b.plans)
      ? b.plans.map(p => String(p || '').trim()).filter(Boolean).slice(0, 100)
      : [];
    await setPlans(plans);
    return json({ plans });
  }

  return json({ error: 'method_not_allowed' }, 405);
};
