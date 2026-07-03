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
    const sql = sqlc();
    _schema = (async () => {
      await sql`
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
      await sql`
        CREATE TABLE IF NOT EXISTS chat_conversations (
          cid        text PRIMARY KEY,
          name       text NOT NULL DEFAULT '',
          email      text NOT NULL DEFAULT '',
          business   text NOT NULL DEFAULT '',
          created_at bigint,
          last_at    bigint
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id         bigserial PRIMARY KEY,
          cid        text NOT NULL,
          sender     text NOT NULL,
          body       text NOT NULL,
          created_at bigint
        )`;
      await sql`CREATE INDEX IF NOT EXISTS chat_messages_cid_idx ON chat_messages (cid, created_at)`;
    })();
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

/* ===================== chat: Postgres ===================== */
function now() { return Date.now(); }

async function pgChatSend({ cid, name, email, business, body }) {
  await ensureSchema();
  const t = now();
  await sqlc()`
    INSERT INTO chat_conversations (cid, name, email, business, created_at, last_at)
    VALUES (${cid}, ${name || ''}, ${email || ''}, ${business || ''}, ${t}, ${t})
    ON CONFLICT (cid) DO UPDATE SET
      name = CASE WHEN chat_conversations.name = '' THEN EXCLUDED.name ELSE chat_conversations.name END,
      email = CASE WHEN chat_conversations.email = '' THEN EXCLUDED.email ELSE chat_conversations.email END,
      business = CASE WHEN chat_conversations.business = '' THEN EXCLUDED.business ELSE chat_conversations.business END,
      last_at = EXCLUDED.last_at`;
  await sqlc()`INSERT INTO chat_messages (cid, sender, body, created_at) VALUES (${cid}, 'visitor', ${body}, ${t})`;
  return { ok: true, at: t };
}
async function pgChatReply({ cid, body }) {
  await ensureSchema();
  const t = now();
  await sqlc()`INSERT INTO chat_messages (cid, sender, body, created_at) VALUES (${cid}, 'admin', ${body}, ${t})`;
  await sqlc()`UPDATE chat_conversations SET last_at = ${t} WHERE cid = ${cid}`;
  return { ok: true, at: t };
}
async function pgChatMessagesAfter(cid, after) {
  await ensureSchema();
  const rows = await sqlc()`SELECT sender, body, created_at FROM chat_messages WHERE cid = ${cid} AND created_at > ${after || 0} ORDER BY created_at ASC`;
  return rows.map(r => ({ sender: r.sender, body: r.body, created_at: Number(r.created_at) }));
}
async function pgChatList() {
  await ensureSchema();
  const rows = await sqlc()`
    SELECT c.cid, c.name, c.email, c.business, c.last_at,
           (SELECT body FROM chat_messages m WHERE m.cid = c.cid ORDER BY created_at DESC LIMIT 1) AS last_body,
           (SELECT count(*) FROM chat_messages m WHERE m.cid = c.cid) AS msg_count
    FROM chat_conversations c ORDER BY c.last_at DESC NULLS LAST`;
  return rows.map(r => ({ cid: r.cid, name: r.name, email: r.email, business: r.business,
    lastAt: Number(r.last_at) || 0, last: r.last_body || '', count: Number(r.msg_count) || 0 }));
}

/* ===================== chat: Blobs (fallback) ===================== */
function chatStore() { return getStore({ name: 'vanta-chats', consistency: 'strong' }); }
async function blobConv(cid) { return (await chatStore().get(cid, { type: 'json' })) || null; }
async function blobChatSend({ cid, name, email, business, body }) {
  const t = now();
  const c = (await blobConv(cid)) || { cid, name: '', email: '', business: '', createdAt: t, messages: [] };
  if (!c.name && name) c.name = name;
  if (!c.email && email) c.email = email;
  if (!c.business && business) c.business = business;
  c.messages.push({ sender: 'visitor', body, created_at: t });
  c.lastAt = t;
  await chatStore().setJSON(cid, c);
  return { ok: true, at: t };
}
async function blobChatReply({ cid, body }) {
  const t = now();
  const c = (await blobConv(cid)) || { cid, name: '', email: '', business: '', createdAt: t, messages: [] };
  c.messages.push({ sender: 'admin', body, created_at: t });
  c.lastAt = t;
  await chatStore().setJSON(cid, c);
  return { ok: true, at: t };
}
async function blobChatMessagesAfter(cid, after) {
  const c = await blobConv(cid);
  if (!c) return [];
  return (c.messages || []).filter(m => (m.created_at || 0) > (after || 0));
}
async function blobChatList() {
  const store = chatStore();
  const { blobs } = await store.list();
  const out = [];
  for (const b of blobs) {
    const c = await store.get(b.key, { type: 'json' });
    if (!c) continue;
    const msgs = c.messages || [];
    out.push({ cid: c.cid, name: c.name || '', email: c.email || '', business: c.business || '',
      lastAt: c.lastAt || 0, last: msgs.length ? msgs[msgs.length - 1].body : '', count: msgs.length });
  }
  out.sort((a, b) => b.lastAt - a.lastAt);
  return out;
}

/* ===================== public API (dispatches) ===================== */
export function getUser(email)  { return usePg() ? pgGet(email)  : blobGet(email); }
export function putUser(user)   { return usePg() ? pgPut(user)   : blobPut(user); }
export function deleteUser(email){ return usePg() ? pgDelete(email): blobDelete(email); }
export function listUsers()     { return usePg() ? pgList()      : blobList(); }

export function chatSend(m)             { return usePg() ? pgChatSend(m)              : blobChatSend(m); }
export function chatReply(m)            { return usePg() ? pgChatReply(m)             : blobChatReply(m); }
export function chatMessagesAfter(c, a) { return usePg() ? pgChatMessagesAfter(c, a)  : blobChatMessagesAfter(c, a); }
export function chatList()              { return usePg() ? pgChatList()               : blobChatList(); }

// Read straight from Blobs regardless of backend — used by the one-time
// migration to copy legacy records into Postgres.
export async function listBlobUsers() { return blobList(); }
