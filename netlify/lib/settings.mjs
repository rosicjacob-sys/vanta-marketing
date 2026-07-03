// Admin-configurable settings (stored in the `settings` table under 'config').
// Defaults keep the system working before the admin ever opens the Settings page.
import { getConfig, setConfig } from './store.mjs';

export const DEFAULTS = {
  // How many days before a plan expires to send the renewal reminder.
  reminderLeadDays: 3,
  // Brand name used in email templates via {brand}.
  brandName: 'Vanta',
  // Renewal reminder email. Placeholders: {name} {plan} {date} {days} {brand} {link}
  renewalSubject: 'Your plan renews soon',
  renewalBody: 'Hi {name}, your {plan} renews on {date} ({days} left). Renew in one tap: {link} — thanks for being with {brand}!',
  // Expiry notice email. Placeholders: {name} {plan} {date} {brand} {link}
  expiredSubject: 'Your plan has expired',
  expiredBody: 'Hi {name}, your {plan} expired on {date}. Renew here to pick back up: {link}',
};

// Only these keys are accepted from the client (ignore anything else).
export const KEYS = Object.keys(DEFAULTS);

export async function loadSettings() {
  let cfg = {};
  try { cfg = (await getConfig()) || {}; } catch (e) { cfg = {}; }
  const out = { ...DEFAULTS };
  for (const k of KEYS) {
    if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') out[k] = cfg[k];
  }
  out.reminderLeadDays = Math.min(Math.max(parseInt(out.reminderLeadDays, 10) || DEFAULTS.reminderLeadDays, 1), 90);
  return out;
}

export async function saveSettings(input) {
  const clean = {};
  for (const k of KEYS) {
    if (input && input[k] !== undefined) clean[k] = input[k];
  }
  if (clean.reminderLeadDays !== undefined) {
    clean.reminderLeadDays = Math.min(Math.max(parseInt(clean.reminderLeadDays, 10) || DEFAULTS.reminderLeadDays, 1), 90);
  }
  for (const k of ['brandName', 'renewalSubject', 'renewalBody', 'expiredSubject', 'expiredBody']) {
    if (clean[k] !== undefined) clean[k] = String(clean[k]).slice(0, 4000);
  }
  await setConfig(clean);
  return loadSettings();
}

// Replace {name}, {plan}, … placeholders. Unknown placeholders are left as-is.
export function fillTemplate(tpl, vars) {
  return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
