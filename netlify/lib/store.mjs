// Data access for client accounts + their dashboard metrics.
//
// Uses Netlify DB (Neon Postgres) when NETLIFY_DATABASE_URL is set, and falls
// back to Netlify Blobs otherwise. This lets us provision the database and flip
// over with zero downtime: until the DB exists, login keeps working on Blobs;
// once NETLIFY_DATABASE_URL appears, the same functions use Postgres.
import { getStore } from '@netlify/blobs';
import { neon } from '@netlify/neon';

function usePg() { return !!process.env.NETLIFY_DATABASE_URL; }

export function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// A fresh set of metrics so a new client's dashboard isn't empty.
export function defaultMetrics() {
  return {
    views: 0, viewsChangePct: 0, profileClicks: 0, aiCitations: 0,
    articlesPublished: 0, articlesUpcoming: 0,
    series: [], sources: [], articles: [], note: '',
  };
}

// Strip secrets before sending a record to the browser.
export function publicUser(user) {
  if (!user) return null;
  const { pwHash, ...safe } = user;
  return safe;
}

/* ===================== Postgres (Netlify DB) ===================== */
let _sql;
function sqlc() { if (!_sql) _sql = neon(); return _sql; } // reads NETLIFY_DATABASE_URL
export function __setSql(fn) { _sql = fn; } // test seam

let _schema;
function ensureSchema() {
  if (!_schema) {
    _schema = sqlc()`
      CREATE TABLE IF NOT EXISTS clients (
        email       text PRIMARY KEY,
        name        text   NOT NULL DEFAULT '',
        plan        text   NOT NULL DEFAULT '',
        role        text   NOT NULL DEFAULT 'client',
        pw_hash     text   NOT NULL DEFAULT '',
        metrics     jsonb  NOT NULL DEFAULT '{}'::jsonb,
        created_at  bigint,
        updated_at  bigint
      )`;
  }
  return _schema;
}

function rowToUser(r) {
  if (!r) return null;
  return {
    email: r.email,
    name: r.name || '',
    plan: r.plan || '',
    role: r.role || 'client',
    pwHash: r.pw_hash || '',
    metrics: r.metrics || {},
    createdAt: Number(r.created_at) || 0,
    updatedAt: Number(r.updated_at) || 0,
  };
}

async function pgGet(email) {
  await ensureSchema();
  const rows = await sqlc()`SELECT * FROM clients WHERE email = ${normEmail(email)}`;
  return rowToUser(rows[0]);
}
async function pgPut(user) {
  await ensureSchema();
  const email = normEmail(user.email);
  const metrics = JSON.stringify(user.metrics || {});
  await sqlc()`
    INSERT INTO clients (email, name, plan, role, pw_hash, metrics, created_at, updated_at)
    VALUES (${email}, ${user.name || ''}, ${user.plan || ''}, ${user.role || 'client'},
            ${user.pwHash || ''}, ${metrics}::jsonb, ${user.createdAt || Date.now()}, ${user.updatedAt || null})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name, plan = EXCLUDED.plan, role = EXCLUDED.role,
      pw_hash = EXCLUDED.pw_hash, metrics = EXCLUDED.metrics, updated_at = EXCLUDED.updated_at`;
  return { ...user, email };
}
async function pgDelete(email) {
  await ensureSchema();
  await sqlc()`DELETE FROM clients WHERE email = ${normEmail(email)}`;
}
async function pgList() {
  await ensureSchema();
  const rows = await sqlc()`SELECT * FROM clients ORDER BY created_at DESC NULLS LAST`;
  return rows.map(rowToUser);
}

/* ===================== Blobs (fallback) ===================== */
function blobStore() { return getStore({ name: 'vanta-users', consistency: 'strong' }); }
async function blobGet(email) {
  return (await blobStore().get(normEmail(email), { type: 'json' })) || null;
}
async function blobPut(user) {
  const email = normEmail(user.email);
  await blobStore().setJSON(email, { ...user, email });
  return { ...user, email };
}
async function blobDelete(email) { await blobStore().delete(normEmail(email)); }
async function blobList() {
  const store = blobStore();
  const { blobs } = await store.list();
  const out = [];
  for (const b of blobs) { const rec = await store.get(b.key, { type: 'json' }); if (rec) out.push(rec); }
  return out;
}

/* ===================== public API (dispatches) ===================== */
export function getUser(email)  { return usePg() ? pgGet(email)  : blobGet(email); }
export function putUser(user)   { return usePg() ? pgPut(user)   : blobPut(user); }
export function deleteUser(email){ return usePg() ? pgDelete(email): blobDelete(email); }
export function listUsers()     { return usePg() ? pgList()      : blobList(); }

// Read straight from Blobs regardless of backend — used by the one-time
// migration to copy legacy records into Postgres.
export async function listBlobUsers() { return blobList(); }
