// Core subscription sweep: send renewal reminders before expiry and an expiry
// notice once a plan lapses. Idempotent per billing cycle (won't re-fire for
// the same expiry date). Shared by the daily cron and the admin "Run now".
import { listUsers, putUser } from './store.mjs';
import { notifyClient, notifyAdmin } from './notify.mjs';

const DAY = 24 * 60 * 60 * 1000;

function pad(n) { return String(n).padStart(2, '0'); }
function toStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function expiryOf(user) {
  if (!user.availedAt) return null;
  const start = new Date(user.availedAt + 'T00:00:00');
  if (isNaN(start.getTime())) return null;
  const exp = new Date(start.getTime());
  if (user.period === 'yearly') exp.setFullYear(exp.getFullYear() + 1);
  else exp.setMonth(exp.getMonth() + 1);
  return exp;
}

export async function runReminders() {
  const lead = Number(process.env.REMINDER_LEAD_DAYS) || 3;
  const clients = await listUsers();
  let scanned = 0, reminders = 0, expiries = 0;

  for (const c of clients) {
    if (c.role && c.role !== 'client') continue;
    const exp = expiryOf(c);
    if (!exp) continue;
    scanned++;
    const ymd = toStr(exp);
    const days = Math.ceil((exp.getTime() - Date.now()) / DAY);
    let changed = false;

    // renewal reminder in the lead window (once per cycle)
    if (days > 0 && days <= lead && c.reminderSentFor !== ymd) {
      try {
        await notifyClient(c.email, 'Your plan renews soon',
          'Your ' + (c.plan || 'plan') + ' renews on ' + ymd + ' (' + days + ' day' + (days === 1 ? '' : 's') + ' left).',
          'renewal_reminder');
        await notifyAdmin('Client renewal soon', (c.name || c.email) + ' renews on ' + ymd + '.', 'renewal_reminder');
      } catch (e) { /* best effort */ }
      c.reminderSentFor = ymd; changed = true; reminders++;
    }

    // expiry notice (once per cycle)
    if (days <= 0 && c.expiredNotifiedFor !== ymd) {
      try {
        await notifyClient(c.email, 'Your plan has expired',
          'Your ' + (c.plan || 'plan') + ' expired on ' + ymd + '. Log in to renew.', 'expired');
        await notifyAdmin('Client plan expired', (c.name || c.email) + "'s plan expired on " + ymd + '.', 'expired');
      } catch (e) { /* best effort */ }
      c.expiredNotifiedFor = ymd; changed = true; expiries++;
    }

    if (changed) { try { await putUser(c); } catch (e) { /* best effort */ } }
  }

  return { ok: true, scanned, reminders, expiries };
}
