// /.netlify/functions/admin-test-email   (Bearer token, admin role)
//   POST -> sends a test email to ADMIN_EMAIL so the admin can verify that
//           RESEND_API_KEY + EMAIL_FROM are configured and delivering.
import { userFromRequest, json } from '../lib/auth.mjs';
import { sendEmail } from '../lib/email.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  const to = process.env.ADMIN_EMAIL || u.email || '';
  if (!to) return json({ ok: false, result: { sent: false, reason: 'no_recipient' }, to: '' });

  const result = await sendEmail({
    to,
    subject: 'Vanta — test email',
    text: 'This is a test email from your Vanta admin dashboard.\n\n'
      + 'If you received this, email delivery is working: RESEND_API_KEY and EMAIL_FROM '
      + 'are set and your sending domain is verified.',
    audience: 'admin',
  });

  return json({ ok: !!result.sent, result, to });
};
