// Notification helpers that fan out to BOTH the in-app inbox and email.
// Email is best-effort and never blocks the in-app notification.
import { addNotification } from './store.mjs';
import { sendEmail } from './email.mjs';

export async function notifyClient(email, title, body, type) {
  await addNotification({ audience: 'client', recipient: email, title, body, type });
  try { await sendEmail({ to: email, subject: title, text: body }); } catch (e) { /* best effort */ }
}

export async function notifyAdmin(title, body, type) {
  await addNotification({ audience: 'admin', recipient: '', title, body, type });
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) { try { await sendEmail({ to: adminEmail, subject: '[Vanta] ' + title, text: body }); } catch (e) { /* best effort */ } }
}
