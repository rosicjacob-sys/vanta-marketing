// /.netlify/functions/admin-settings   (Bearer token, admin role)
//   GET             -> { settings: {...} }   current settings (with defaults)
//   PUT { ...fields }-> { settings: {...} }   save + return effective settings
import { userFromRequest, json } from '../lib/auth.mjs';
import { loadSettings, saveSettings } from '../lib/settings.mjs';

export default async (req) => {
  const u = userFromRequest(req);
  if (!u || u.role !== 'admin') return json({ error: 'forbidden' }, 403);

  if (req.method === 'GET') {
    return json({ settings: await loadSettings() });
  }

  if (req.method === 'PUT') {
    let b = {};
    try { b = await req.json(); } catch { /* ignore */ }
    return json({ settings: await saveSettings(b) });
  }

  return json({ error: 'method_not_allowed' }, 405);
};
