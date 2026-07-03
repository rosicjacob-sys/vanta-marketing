// GET /.netlify/functions/config-check
// Safe diagnostic: reports WHICH auth env vars are configured + whether the
// database is reachable. Never returns secret values.
import { json } from '../lib/auth.mjs';
import { neon } from '@netlify/neon';

export default async () => {
  const hash = process.env.ADMIN_PW_HASH || '';
  const hasDb = !!process.env.NETLIFY_DATABASE_URL;

  let backend = 'blobs';
  let dbConnected = false;
  let dbError = null;
  if (hasDb) {
    backend = 'postgres';
    try {
      const sql = neon();
      await sql`SELECT 1`;
      dbConnected = true;
    } catch (e) {
      dbError = String((e && e.message) || e).slice(0, 140);
    }
  }

  // netgrid: are the env vars set, and can we actually reach the API with the key?
  const netgridConfigured = !!(process.env.NETGRID_API_URL && process.env.NETGRID_API_KEY);
  let netgridOk = false;
  let netgridStatus = null;
  let netgridError = null;
  if (netgridConfigured) {
    try {
      const base = process.env.NETGRID_API_URL.replace(/\/$/, '');
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(base + '/api/v1', {
        headers: { authorization: 'Bearer ' + process.env.NETGRID_API_KEY },
        signal: ctrl.signal,
      });
      clearTimeout(to);
      netgridStatus = r.status; // 200 = wired; 401 = wrong key; 503 = key missing on netgrid
      netgridOk = r.ok;
    } catch (e) {
      netgridError = String((e && e.message) || e).slice(0, 140);
    }
  }

  return json({
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasAdminEmail: !!process.env.ADMIN_EMAIL,
    hasAdminPwHash: !!hash,
    adminPwHashLooksValid: hash.startsWith('scrypt$') && hash.split('$').length === 3,
    storageBackend: backend,
    hasDatabaseUrl: hasDb,
    dbConnected,
    dbError,
    emailEnabled: !!process.env.RESEND_API_KEY,
    hasEmailFrom: !!process.env.EMAIL_FROM,
    netgridConfigured,
    netgridOk,
    netgridStatus,
    netgridError,
    ready: !!process.env.SESSION_SECRET && !!process.env.ADMIN_EMAIL &&
           hash.startsWith('scrypt$') && hash.split('$').length === 3 &&
           (!hasDb || dbConnected),
  });
};
