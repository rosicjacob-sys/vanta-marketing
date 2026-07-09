// POST /.netlify/functions/lead-notify   (public - called from the marketing
// lead form). Saves the lead to the database (the source of truth now) and
// emails the admin + drops an in-app alert when a new lead comes in.
import { json } from '../lib/auth.mjs';
import { notifyAdmin } from '../lib/notify.mjs';
import { addLead } from '../lib/store.mjs';

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

  // Persist the lead (source of truth). Extra outreach fields go into meta.
  try {
    await addLead({
      name, business, email, phone, service, message,
      source: clip(b.page || b.source || b.type, 80),
      status: 'new',
      meta: {
        nb_restaurants: clip(b.nb_restaurants, 40), nb_sites: clip(b.nb_sites, 40),
        contact_pref: clip(b.contact_pref, 40), langue: clip(b.langue, 12),
        focus: clip(b.focus, 2000), enrolled: clip(b.enrolled, 12),
      },
    });
  } catch (e) { /* best effort - don't fail the visitor's submit */ }

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
