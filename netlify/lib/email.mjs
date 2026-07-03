// Minimal email sender via Resend. No-ops safely when RESEND_API_KEY is unset
// (so notifications keep working in-app before email is configured).
// Env: RESEND_API_KEY, EMAIL_FROM (e.g. "Vanta <noreply@vantamarketing.io>").
export async function sendEmail({ to, subject, text, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Vanta <onboarding@resend.dev>';
  if (!key) return { sent: false, reason: 'no_key' };
  if (!to) return { sent: false, reason: 'no_recipient' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: subject || '', text: text || '', html: html || undefined }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { sent: false, reason: 'http_' + res.status, detail: String(detail).slice(0, 200) };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: 'error', detail: String((e && e.message) || e).slice(0, 200) };
  }
}
