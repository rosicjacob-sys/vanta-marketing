// Data access over Netlify Blobs (the "database").
// One store, "vanta-users", keyed by lowercased email. Each record holds the
// client's profile + the metrics the admin enters for their dashboard.
import { getStore } from '@netlify/blobs';

function usersStore() {
  return getStore({ name: 'vanta-users', consistency: 'strong' });
}

export function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// A fresh set of metrics so a new client's dashboard isn't empty.
export function defaultMetrics() {
  return {
    views: 0,
    viewsChangePct: 0,
    profileClicks: 0,
    aiCitations: 0,
    articlesPublished: 0,
    articlesUpcoming: 0,
    series: [],        // monthly views, e.g. [{ label: 'Jan', value: 120 }]
    sources: [],       // AI/discovery sources, e.g. [{ label: 'ChatGPT', value: 40 }]
    articles: [],      // [{ title, status: 'published'|'upcoming', url }]
    note: '',
  };
}

export async function getUser(email) {
  const rec = await usersStore().get(normEmail(email), { type: 'json' });
  return rec || null;
}

export async function putUser(user) {
  const email = normEmail(user.email);
  await usersStore().setJSON(email, { ...user, email });
  return { ...user, email };
}

export async function deleteUser(email) {
  await usersStore().delete(normEmail(email));
}

export async function listUsers() {
  const store = usersStore();
  const { blobs } = await store.list();
  const out = [];
  for (const b of blobs) {
    const rec = await store.get(b.key, { type: 'json' });
    if (rec) out.push(rec);
  }
  return out;
}

// Strip secrets before sending a record to the browser.
export function publicUser(user) {
  if (!user) return null;
  const { pwHash, ...safe } = user;
  return safe;
}
