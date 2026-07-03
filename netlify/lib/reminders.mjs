// Core subscription sweep: send renewal reminders before expiry and an expiry
// notice once a plan lapses. Idempotent per billing cycle (won't re-fire for
// the same expiry date). Shared by the daily cron and the admin "Run now".
import { listUsers, putUser, getPlans } from './store.mjs';
import { notifyClient, notifyAdmin } from './notify.mjs';
import { loadSettings, fillTemplate } from './settings.mjs';

const DAY = 24 * 60 * 60 * 1000;

// The client's plan checkout link ({link} in templates), or the login page
// as a safe fallback so the email never has an empty/broken link.
function renewLink(client, plans, loginUrl) {
  const match = (plans || []).find(p => (typeof p === 'string' ? p : p.name) === client.plan);
  const link = match && typeof match === 'object' ? (match.link || '') : '';
  return link || loginUrl;
}

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
  const settings = await loadSettings();
  const lead = Number(settings.reminderLeadDays) || Number(process.env.REMINDER_LEAD_DAYS) || 3;
  let plans = [];
  try { plans = await getPlans(); } catch (e) { plans = []; }
  const siteUrl = (process.env.URL || 'https://vantamarketing.io').replace(/\/$/, '');
  const loginUrl = siteUrl + '/#/login';
  const clients = await listUsers();
  let scanned = 0, reminders = 0, expiries = 0;

  for (const c of clients) {
    if (c.role && c.role !== 'client') continue;
    const exp = expiryOf(c);
    if (!exp) continue;
    scanned++;
    const ymd = toStr(exp);
    const days = Math.ceil((exp.getTime() - Date.now()) / DAY);
    const vars = {
      name: c.name || c.email, plan: c.plan || 'plan', date: ymd,
      days: days + ' day' + (days === 1 ? '' : 's'), brand: settings.brandName || 'Vanta',
      link: renewLink(c, plans, loginUrl),
    };
    let changed = false;

    // renewal reminder in the lead window (once per cycle)
    if (days > 0 && days <= lead && c.reminderSentFor !== ymd) {
      try {
        await notifyClient(c.email, fillTemplate(settings.renewalSubject, vars),
          fillTemplate(settings.renewalBody, vars), 'renewal_reminder');
        await notifyAdmin('Client renewal soon', (c.name || c.email) + ' renews on ' + ymd + '.', 'renewal_reminder');
      } catch (e) { /* best effort */ }
      c.reminderSentFor = ymd; changed = true; reminders++;
    }

    // expiry notice (once per cycle)
    if (days <= 0 && c.expiredNotifiedFor !== ymd) {
      try {
        await notifyClient(c.email, fillTemplate(settings.expiredSubject, vars),
          fillTemplate(settings.expiredBody, vars), 'expired');
        await notifyAdmin('Client plan expired', (c.name || c.email) + "'s plan expired on " + ymd + '.', 'expired');
      } catch (e) { /* best effort */ }
      c.expiredNotifiedFor = ymd; changed = true; expiries++;
    }

    if (changed) { try { await putUser(c); } catch (e) { /* best effort */ } }
  }

  return { ok: true, scanned, reminders, expiries };
}
