// Render web service entry point.
//
// Serves the static marketing site AND hosts the former Netlify Functions under
// the exact same "/.netlify/functions/<name>" paths the front-end already calls
// (see API const in vanta-portal.js and CHAT_API in index.html), so no client
// code changes are needed. The functions are plain Web-standard handlers
// (`export default async (Request) => Response`), so we just adapt Node's
// req/res to/from the Web Request/Response objects.
import express from 'express';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FN_DIR = join(__dirname, 'netlify', 'functions');
const PORT = process.env.PORT || 3000;

// Discover available functions once at boot. Doubles as an allow-list so the
// dynamic import below can never be tricked into path traversal.
const FUNCTIONS = new Set(
  readdirSync(FN_DIR).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)),
);

const app = express();
app.disable('x-powered-by');

// Baseline security headers (mirrors the old Netlify _headers block).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

// ---- Function host: Node req/res <-> Web Request/Response ----
async function toWebRequest(req) {
  const url = `${req.protocol}://${req.headers.host}${req.originalUrl}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v == null) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  }
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (chunks.length) body = Buffer.concat(chunks);
  }
  return new Request(url, { method: req.method, headers, body });
}

app.all('/.netlify/functions/:name', async (req, res) => {
  const name = req.params.name;
  if (!FUNCTIONS.has(name)) return res.status(404).json({ error: 'not_found' });
  try {
    const mod = await import(join(FN_DIR, name + '.mjs'));
    if (typeof mod.default !== 'function') return res.status(500).json({ error: 'no_handler' });
    const webRes = await mod.default(await toWebRequest(req));
    res.status(webRes.status);
    webRes.headers.forEach((val, key) => res.setHeader(key, val));
    res.send(Buffer.from(await webRes.arrayBuffer()));
  } catch (e) {
    console.error(`[fn:${name}]`, e);
    res.status(500).json({ error: 'function_error' });
  }
});

// Never serve server internals or source as static assets.
const BLOCKED = [
  /^\/netlify(\/|$)/, /^\/scripts(\/|$)/, /^\/node_modules(\/|$)/,
  /^\/server\.mjs$/, /^\/render\.yaml$/, /^\/package(-lock)?\.json$/, /^\/\.env/,
];
app.use((req, res, next) => {
  if (BLOCKED.some((re) => re.test(req.path))) return res.status(404).send('Not found');
  next();
});

// ---- Static site (repo root) ----
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html'],
  setHeaders(res, filePath) {
    // Immutable social art gets a long cache; everything else revalidates.
    if (filePath.endsWith('og-card.png') || filePath.endsWith('apple-touch-icon.png')) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    }
  },
}));

// The app is a hash-router (#/dashboard etc.), so any deep HTML request should
// still return the shell.
app.get('*', (req, res, next) => {
  if ((req.headers.accept || '').includes('text/html')) {
    return res.sendFile(join(__dirname, 'index.html'));
  }
  next();
});

app.listen(PORT, () => console.log(`vanta-marketing listening on :${PORT}`));
