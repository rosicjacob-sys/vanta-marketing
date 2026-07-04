// POST /.netlify/functions/lead-notify   (public - called from the marketing
// lead form alongside the Google Sheet post). Emails the admin + drops an
// in-app alert when a new lead comes in. The Sheet stays the source of truth;
// this is just a heads-up so the admin doesn't have to watch the Sheet.
import { json } from '../lib/auth.mjs';
import { notifyAdmin } from '../lib/notify.mjs';

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let b = {};
  try { b = await req.json(); } catch { /* ignore */ }

  const name = clip(b.nom || b.name || b.owner, 200);
  const email = clip(b.courriel || b.email, 200);
  const business = clip(b.business || b.restaurant, 200);
  const phone = clip(b.telephone || b.phone, 60);
  const service = clip(b.service || b.topic || b.plan, 200);
  const message = clip(b.message || b.msg, 2000);

  // Ignore obviously empty/junk posts quietly (no error, no email).
  if (!name && !email && !phone) return json({ ok: false });

  const lines = [];
  if (business) lines.push('Business: ' + business);
  if (email) lines.push('Email: ' + email);
  if (phone) lines.push('Phone: ' + phone);
  if (service) lines.push('Interested in: ' + service);
  if (message) lines.push('Message: ' + message);

  try {
    await notifyAdmin('New form submission from ' + (name || email || phone), lines.join('\n'), 'lead');
  } catch (e) { /* best effort */ }

  return json({ ok: true });
};
