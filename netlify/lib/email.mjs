// Minimal email sender via Resend. No-ops safely when RESEND_API_KEY is unset
// (so notifications keep working in-app before email is configured).
// Every attempt is recorded to the email log so the admin can review what went
// out (or why it didn't). Env: RESEND_API_KEY, EMAIL_FROM
// (e.g. "Vanta <noreply@vantamarketing.io>").
import { logEmail } from './store.mjs';

export async function sendEmail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Vanta <onboarding@resend.dev>';
  let result;
  if (!key) result = { sent: false, reason: 'no_key' };
  else if (!to) result = { sent: false, reason: 'no_recipient' };
  else {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject: subject || '', text: text || '', html: html || undefined }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        result = { sent: false, reason: 'http_' + res.status, detail: String(detail).slice(0, 200) };
      } else {
        result = { sent: true };
      }
    } catch (e) {
      result = { sent: false, reason: 'error', detail: String((e && e.message) || e).slice(0, 200) };
    }
  }

  // Record the attempt (best-effort; must never break the send path).
  const status = result.sent ? 'sent'
    : (result.reason === 'no_key' || result.reason === 'no_recipient') ? 'skipped'
    : 'failed';
  try {
    await logEmail({ to: to || '', subject: subject || '', body: text || '', status,
      detail: result.detail || result.reason || '' });
  } catch (e) { /* logging is best-effort */ }

  return result;
}
