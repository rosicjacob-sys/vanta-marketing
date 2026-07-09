// Render Cron Job entry: run the daily subscription reminder sweep.
// Replaces the old Netlify Scheduled Function (netlify/functions/cron-reminders.mjs,
// which ran on '@daily'). Same logic, invoked as a one-shot process by Render.
import { runReminders } from '../netlify/lib/reminders.mjs';

try {
  const result = await runReminders();
  console.log('[reminders]', JSON.stringify(result));
  process.exit(0);
} catch (e) {
  console.error('[reminders] failed', e);
  process.exit(1);
}
