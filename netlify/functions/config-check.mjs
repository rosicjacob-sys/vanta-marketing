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

  return json({
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasAdminEmail: !!process.env.ADMIN_EMAIL,
    hasAdminPwHash: !!hash,
    adminPwHashLooksValid: hash.startsWith('scrypt$') && hash.split('$').length === 3,
    storageBackend: backend,
    hasDatabaseUrl: hasDb,
    dbConnected,
    dbError,
    ready: !!process.env.SESSION_SECRET && !!process.env.ADMIN_EMAIL &&
           hash.startsWith('scrypt$') && hash.split('$').length === 3 &&
           (!hasDb || dbConnected),
  });
};
