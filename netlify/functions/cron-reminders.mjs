// Netlify Scheduled Function — runs once a day and sweeps subscriptions:
// renewal reminders before expiry + expiry notices. Idempotent per cycle.
import { runReminders } from '../lib/reminders.mjs';

export const config = { schedule: '@daily' };

export default async () => {
  const result = await runReminders();
  return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
};
