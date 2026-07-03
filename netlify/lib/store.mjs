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
      await sql`CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL DEFAULT '[]'::jsonb)`;
      // subscription fields (added to the clients table if it already exists)
      await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS availed_at text`;
      await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS period text`;
      await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS claim_status text`;
      await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS claim_at bigint`;
      await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS snooze_until bigint`;
      await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS reminder_sent_for text`;
      await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS expired_notified_for text`;
      await sql`
        CREATE TABLE IF NOT EXISTS notifications (
          id         bigserial PRIMARY KEY,
          audience   text NOT NULL,
          recipient  text NOT NULL DEFAULT '',
          title      text NOT NULL DEFAULT '',
          body       text NOT NULL DEFAULT '',
          type       text NOT NULL DEFAULT '',
          read_at    bigint,
          created_at bigint
        )`;
      await sql`CREATE INDEX IF NOT EXISTS notifications_aud_idx ON notifications (audience, recipient, created_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS payment_claims (
          id         bigserial PRIMARY KEY,
          email      text NOT NULL,
          name       text NOT NULL DEFAULT '',
          plan       text NOT NULL DEFAULT '',
          status     text NOT NULL DEFAULT 'pending',
          claimed_at bigint,
          decided_at bigint
        )`;
      await sql`CREATE INDEX IF NOT EXISTS payment_claims_status_idx ON payment_claims (status, claimed_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS email_log (
          id         bigserial PRIMARY KEY,
          to_addr    text NOT NULL DEFAULT '',
          subject    text NOT NULL DEFAULT '',
          body       text NOT NULL DEFAULT '',
          status     text NOT NULL DEFAULT '',
          detail     text NOT NULL DEFAULT '',
          audience   text NOT NULL DEFAULT '',
          created_at bigint
        )`;
      await sql`ALTER TABLE email_log ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT ''`;
      await sql`CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at)`;
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
    availedAt: r.availed_at || '',
    period: r.period || '',
    claimStatus: r.claim_status || '',
    claimAt: Number(r.claim_at) || 0,
    snoozeUntil: Number(r.snooze_until) || 0,
    reminderSentFor: r.reminder_sent_for || '',
    expiredNotifiedFor: r.expired_notified_for || '',
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
    INSERT INTO clients (email, name, plan, role, pw_hash, metrics, availed_at, period,
                         claim_status, claim_at, snooze_until, reminder_sent_for, expired_notified_for,
                         created_at, updated_at)
    VALUES (${email}, ${user.name || ''}, ${user.plan || ''}, ${user.role || 'client'},
            ${user.pwHash || ''}, ${metrics}::jsonb, ${user.availedAt || ''}, ${user.period || ''},
            ${user.claimStatus || ''}, ${user.claimAt || null}, ${user.snoozeUntil || null},
            ${user.reminderSentFor || ''}, ${user.expiredNotifiedFor || ''},
            ${user.createdAt || Date.now()}, ${user.updatedAt || null})
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name, plan = EXCLUDED.plan, role = EXCLUDED.role,
      pw_hash = EXCLUDED.pw_hash, metrics = EXCLUDED.metrics,
      availed_at = EXCLUDED.availed_at, period = EXCLUDED.period,
      claim_status = EXCLUDED.claim_status, claim_at = EXCLUDED.claim_at, snooze_until = EXCLUDED.snooze_until,
      reminder_sent_for = EXCLUDED.reminder_sent_for, expired_notified_for = EXCLUDED.expired_notified_for,
      updated_at = EXCLUDED.updated_at`;
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
           (SELECT count(*) FROM chat_messages m WHERE m.cid = c.cid) AS msg_count,
           (SELECT max(created_at) FROM chat_messages m WHERE m.cid = c.cid AND m.sender = 'visitor') AS last_client_at
    FROM chat_conversations c ORDER BY c.last_at DESC NULLS LAST`;
  return rows.map(r => ({ cid: r.cid, name: r.name, email: r.email, business: r.business,
    lastAt: Number(r.last_at) || 0, last: r.last_body || '', count: Number(r.msg_count) || 0,
    lastClientAt: Number(r.last_client_at) || 0 }));
}

/* ===================== plans/settings: Postgres ===================== */
async function pgGetPlans() {
  await ensureSchema();
  const rows = await sqlc()`SELECT value FROM settings WHERE key = 'plans'`;
  const v = rows[0] && rows[0].value;
  return Array.isArray(v) ? v : [];
}
async function pgSetPlans(plans) {
  await ensureSchema();
  await sqlc()`
    INSERT INTO settings (key, value) VALUES ('plans', ${JSON.stringify(plans)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return plans;
}
async function pgGetConfig() {
  await ensureSchema();
  const rows = await sqlc()`SELECT value FROM settings WHERE key = 'config'`;
  const v = rows[0] && rows[0].value;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
async function pgSetConfig(cfg) {
  await ensureSchema();
  await sqlc()`
    INSERT INTO settings (key, value) VALUES ('config', ${JSON.stringify(cfg || {})}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return cfg;
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
    let lastClientAt = 0;
    for (const m of msgs) { if (m.sender === 'visitor' && (m.created_at || 0) > lastClientAt) lastClientAt = m.created_at || 0; }
    out.push({ cid: c.cid, name: c.name || '', email: c.email || '', business: c.business || '',
      lastAt: c.lastAt || 0, last: msgs.length ? msgs[msgs.length - 1].body : '', count: msgs.length,
      lastClientAt });
  }
  out.sort((a, b) => b.lastAt - a.lastAt);
  return out;
}

/* ===================== plans/settings: Blobs (fallback) ===================== */
function settingsStore() { return getStore({ name: 'vanta-settings', consistency: 'strong' }); }
async function blobGetPlans() {
  const v = await settingsStore().get('plans', { type: 'json' });
  return Array.isArray(v) ? v : [];
}
async function blobSetPlans(plans) { await settingsStore().setJSON('plans', plans); return plans; }
async function blobGetConfig() {
  const v = await settingsStore().get('config', { type: 'json' });
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
async function blobSetConfig(cfg) { await settingsStore().setJSON('config', cfg || {}); return cfg; }

/* ===================== notifications: Postgres ===================== */
async function pgAddNotif(n) {
  await ensureSchema();
  await sqlc()`INSERT INTO notifications (audience, recipient, title, body, type, created_at)
    VALUES (${n.audience}, ${n.recipient || ''}, ${n.title || ''}, ${n.body || ''}, ${n.type || ''}, ${Date.now()})`;
  return { ok: true };
}
async function pgListNotif(audience, recipient) {
  await ensureSchema();
  const rows = await sqlc()`SELECT id, title, body, type, read_at, created_at FROM notifications
    WHERE audience = ${audience} AND recipient = ${recipient || ''} ORDER BY created_at DESC LIMIT 50`;
  return rows.map(r => ({ id: Number(r.id), title: r.title, body: r.body, type: r.type, read: !!r.read_at, created_at: Number(r.created_at) }));
}
async function pgMarkNotif(audience, recipient) {
  await ensureSchema();
  await sqlc()`UPDATE notifications SET read_at = ${Date.now()} WHERE audience = ${audience} AND recipient = ${recipient || ''} AND read_at IS NULL`;
  return { ok: true };
}
async function pgUnread(audience, recipient) {
  await ensureSchema();
  const rows = await sqlc()`SELECT count(*) AS n FROM notifications WHERE audience = ${audience} AND recipient = ${recipient || ''} AND read_at IS NULL`;
  return Number(rows[0] && rows[0].n) || 0;
}

/* ===================== payment claims: Postgres ===================== */
async function pgAddClaim(c) {
  await ensureSchema();
  await sqlc()`INSERT INTO payment_claims (email, name, plan, status, claimed_at)
    VALUES (${normEmail(c.email)}, ${c.name || ''}, ${c.plan || ''}, 'pending', ${Date.now()})`;
  return { ok: true };
}
async function pgListClaims() {
  await ensureSchema();
  const rows = await sqlc()`SELECT id, email, name, plan, status, claimed_at, decided_at
    FROM payment_claims ORDER BY claimed_at DESC LIMIT 200`;
  return rows.map(r => ({ id: Number(r.id), email: r.email, name: r.name, plan: r.plan, status: r.status,
    claimedAt: Number(r.claimed_at) || 0, decidedAt: Number(r.decided_at) || 0 }));
}
async function pgResolveClaim(email, status) {
  await ensureSchema();
  await sqlc()`UPDATE payment_claims SET status = ${status}, decided_at = ${Date.now()}
    WHERE id = (SELECT id FROM payment_claims WHERE email = ${normEmail(email)} AND status = 'pending' ORDER BY claimed_at DESC LIMIT 1)`;
  return { ok: true };
}

/* ===================== payment claims: Blobs (fallback) ===================== */
function claimStore() { return getStore({ name: 'vanta-claims', consistency: 'strong' }); }
async function blobAddClaim(c) {
  const st = claimStore();
  const arr = (await st.get('all', { type: 'json' })) || [];
  const id = arr.length ? arr[arr.length - 1].id + 1 : 1;
  arr.push({ id, email: normEmail(c.email), name: c.name || '', plan: c.plan || '', status: 'pending', claimedAt: Date.now(), decidedAt: 0 });
  if (arr.length > 200) arr.splice(0, arr.length - 200);
  await st.setJSON('all', arr);
  return { ok: true };
}
async function blobListClaims() {
  const arr = (await claimStore().get('all', { type: 'json' })) || [];
  return arr.slice().reverse();
}
async function blobResolveClaim(email, status) {
  const st = claimStore();
  const arr = (await st.get('all', { type: 'json' })) || [];
  const e = normEmail(email);
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].email === e && arr[i].status === 'pending') { arr[i].status = status; arr[i].decidedAt = Date.now(); break; }
  }
  await st.setJSON('all', arr);
  return { ok: true };
}

/* ===================== notifications: Blobs (fallback) ===================== */
function notifStore() { return getStore({ name: 'vanta-notifications', consistency: 'strong' }); }
function notifKey(audience, recipient) { return audience + ':' + (recipient || ''); }
async function blobAddNotif(n) {
  const st = notifStore();
  const key = notifKey(n.audience, n.recipient);
  const arr = (await st.get(key, { type: 'json' })) || [];
  const id = arr.length ? arr[arr.length - 1].id + 1 : 1;
  arr.push({ id, title: n.title || '', body: n.body || '', type: n.type || '', read: false, created_at: Date.now() });
  if (arr.length > 100) arr.splice(0, arr.length - 100);
  await st.setJSON(key, arr);
  return { ok: true };
}
async function blobListNotif(audience, recipient) {
  const arr = (await notifStore().get(notifKey(audience, recipient), { type: 'json' })) || [];
  return arr.slice().reverse().slice(0, 50);
}
async function blobMarkNotif(audience, recipient) {
  const st = notifStore();
  const key = notifKey(audience, recipient);
  const arr = (await st.get(key, { type: 'json' })) || [];
  arr.forEach(function (x) { x.read = true; });
  await st.setJSON(key, arr);
  return { ok: true };
}
async function blobUnread(audience, recipient) {
  const arr = (await notifStore().get(notifKey(audience, recipient), { type: 'json' })) || [];
  return arr.filter(function (x) { return !x.read; }).length;
}

/* ===================== email log: Postgres ===================== */
async function pgLogEmail(e) {
  await ensureSchema();
  await sqlc()`INSERT INTO email_log (to_addr, subject, body, status, detail, audience, created_at)
    VALUES (${e.to || ''}, ${e.subject || ''}, ${e.body || ''}, ${e.status || ''}, ${e.detail || ''}, ${e.audience || ''}, ${Date.now()})`;
  return { ok: true };
}
async function pgListEmails(limit) {
  await ensureSchema();
  const n = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const rows = await sqlc()`SELECT id, to_addr, subject, body, status, detail, audience, created_at
    FROM email_log ORDER BY created_at DESC LIMIT ${n}`;
  return rows.map(r => ({ id: Number(r.id), to: r.to_addr, subject: r.subject, body: r.body,
    status: r.status, detail: r.detail, audience: r.audience || '', created_at: Number(r.created_at) }));
}
async function pgDeleteEmail(id) {
  await ensureSchema();
  await sqlc()`DELETE FROM email_log WHERE id = ${Number(id) || 0}`;
  return { ok: true };
}
async function pgClearEmails(audience) {
  await ensureSchema();
  if (audience) await sqlc()`DELETE FROM email_log WHERE audience = ${audience}`;
  else await sqlc()`DELETE FROM email_log`;
  return { ok: true };
}

/* ===================== email log: Blobs (fallback) ===================== */
function emailStore() { return getStore({ name: 'vanta-emails', consistency: 'strong' }); }
async function blobLogEmail(e) {
  const st = emailStore();
  const arr = (await st.get('log', { type: 'json' })) || [];
  const id = arr.length ? arr[arr.length - 1].id + 1 : 1;
  arr.push({ id, to: e.to || '', subject: e.subject || '', body: e.body || '',
    status: e.status || '', detail: e.detail || '', audience: e.audience || '', created_at: Date.now() });
  if (arr.length > 300) arr.splice(0, arr.length - 300);
  await st.setJSON('log', arr);
  return { ok: true };
}
async function blobListEmails(limit) {
  const arr = (await emailStore().get('log', { type: 'json' })) || [];
  const n = Math.min(Math.max(Number(limit) || 200, 1), 500);
  return arr.slice().reverse().slice(0, n).map(x => ({ audience: '', ...x }));
}
async function blobDeleteEmail(id) {
  const st = emailStore();
  const arr = (await st.get('log', { type: 'json' })) || [];
  const out = arr.filter(x => String(x.id) !== String(id));
  await st.setJSON('log', out);
  return { ok: true };
}
async function blobClearEmails(audience) {
  const st = emailStore();
  if (!audience) { await st.setJSON('log', []); return { ok: true }; }
  const arr = (await st.get('log', { type: 'json' })) || [];
  await st.setJSON('log', arr.filter(x => (x.audience || '') !== audience));
  return { ok: true };
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

export function getPlans()        { return usePg() ? pgGetPlans()      : blobGetPlans(); }
export function setPlans(plans)   { return usePg() ? pgSetPlans(plans) : blobSetPlans(plans); }

export function getConfig()       { return usePg() ? pgGetConfig()     : blobGetConfig(); }
export function setConfig(cfg)    { return usePg() ? pgSetConfig(cfg)  : blobSetConfig(cfg); }

export function addClaim(c)               { return usePg() ? pgAddClaim(c)      : blobAddClaim(c); }
export function listClaims()              { return usePg() ? pgListClaims()     : blobListClaims(); }
export function resolveClaim(email, s)    { return usePg() ? pgResolveClaim(email, s) : blobResolveClaim(email, s); }

export function addNotification(n)          { return usePg() ? pgAddNotif(n)        : blobAddNotif(n); }
export function listNotifications(a, r)     { return usePg() ? pgListNotif(a, r)    : blobListNotif(a, r); }
export function markNotificationsRead(a, r) { return usePg() ? pgMarkNotif(a, r)    : blobMarkNotif(a, r); }
export function unreadCount(a, r)           { return usePg() ? pgUnread(a, r)       : blobUnread(a, r); }

export function logEmail(e)                 { return usePg() ? pgLogEmail(e)        : blobLogEmail(e); }
export function listEmails(limit)           { return usePg() ? pgListEmails(limit)  : blobListEmails(limit); }
export function deleteEmail(id)             { return usePg() ? pgDeleteEmail(id)    : blobDeleteEmail(id); }
export function clearEmails(audience)       { return usePg() ? pgClearEmails(audience) : blobClearEmails(audience); }
