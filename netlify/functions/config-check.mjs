// GET /.netlify/functions/config-check
// Safe diagnostic: reports WHICH auth env vars are configured, never their values.
// Use this to confirm a deployment has the environment set up correctly.
import { json } from '../lib/auth.mjs';

export default async () => {
  const hash = process.env.ADMIN_PW_HASH || '';
  return json({
    hasSessionSecret: !!process.env.SESSION_SECRET,
    hasAdminEmail: !!process.env.ADMIN_EMAIL,
    hasAdminPwHash: !!hash,
    // structural hints (not secrets) to catch a bad paste:
    adminPwHashLooksValid: hash.startsWith('scrypt$') && hash.split('$').length === 3,
    adminPwHashLength: hash.length,
    ready: !!process.env.SESSION_SECRET && !!process.env.ADMIN_EMAIL &&
           hash.startsWith('scrypt$') && hash.split('$').length === 3,
  });
};
