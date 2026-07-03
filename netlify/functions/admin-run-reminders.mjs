// POST /.netlify/functions/admin-run-reminders  (Bearer token, admin role)
// Manually run the subscription sweep — useful for testing the reminder/expiry
// notifications without waiting for the daily cron.
import { userFromRequest, json } from '../lib/auth.mjs';
import { runReminders } from '../lib/reminders.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);
  return json(await runReminders());
};
