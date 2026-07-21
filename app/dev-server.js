// Local dev server.
//
// Vercel runs each file in api/ as a serverless function and serves public/ as
// static assets. This script reproduces that locally in one long-lived process,
// so `npm run dev` works exactly like the deployed app (and in-memory state
// actually persists between requests, which is convenient for a demo).

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.PORT || 3000;

// ---- Minimal .env loader (no dependency) --------------------------------
(function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Route table maps a request path to an api/ handler module + extracted params.
function resolveApiHandler(pathname) {
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return null;

  // /api/download/:id/:kind
  if (parts[0] === 'download' && parts.length === 3) {
    return { file: 'api/download/[id]/[kind].js', query: { id: parts[1], kind: parts[2] } };
  }
  // /api/verify/:ref
  if (parts[0] === 'verify' && parts.length === 2) {
    return { file: 'api/verify/[ref].js', query: { ref: parts[1] } };
  }
  // /api/<name>
  if (parts.length === 1) {
    const file = `api/${parts[0]}.js`;
    if (fs.existsSync(path.join(ROOT, file))) return { file, query: {} };
  }
  return null;
}

// Build an Express/Vercel-like res on top of the raw Node response.
function makeRes(nodeRes) {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { nodeRes.setHeader(k, v); return this; },
    json(obj) {
      if (!nodeRes.headersSent) nodeRes.setHeader('Content-Type', 'application/json; charset=utf-8');
      nodeRes.writeHead(this.statusCode);
      nodeRes.end(JSON.stringify(obj));
    },
    send(data) {
      nodeRes.writeHead(this.statusCode);
      nodeRes.end(data);
    },
    end(data) { nodeRes.writeHead(this.statusCode); nodeRes.end(data); },
  };
}

function serveStatic(pathname, nodeRes) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) { nodeRes.writeHead(403); return nodeRes.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { nodeRes.writeHead(404); return nodeRes.end('Not found'); }
    nodeRes.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    nodeRes.end(data);
  });
}

const server = http.createServer((req, nodeRes) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/') || pathname === '/api') {
    const route = resolveApiHandler(pathname);
    if (!route) { nodeRes.writeHead(404, { 'Content-Type': 'application/json' }); return nodeRes.end(JSON.stringify({ error: 'Not found' })); }

    let bodyChunks = [];
    req.on('data', (c) => bodyChunks.push(c));
    req.on('end', () => {
      let body = {};
      const raw = Buffer.concat(bodyChunks).toString('utf8');
      if (raw) { try { body = JSON.parse(raw); } catch { body = {}; } }

      req.body = body;
      req.query = { ...parsed.query, ...route.query };

      // Fresh require each call would defeat shared in-memory state, so cache it.
      const handler = require(path.join(ROOT, route.file));
      const res = makeRes(nodeRes);
      try {
        Promise.resolve(handler(req, res)).catch((err) => {
          if (!nodeRes.headersSent) res.status(500).json({ error: 'Server error: ' + err.message });
        });
      } catch (err) {
        if (!nodeRes.headersSent) res.status(500).json({ error: 'Server error: ' + err.message });
      }
    });
    return;
  }

  serveStatic(pathname, nodeRes);
});

server.listen(PORT, () => {
  console.log(`\n  pitchaprint (local)  →  http://localhost:${PORT}`);
  console.log(`  DeepSeek key: ${process.env.DEEPSEEK_API_KEY ? 'loaded' : 'MISSING (set DEEPSEEK_API_KEY in .env)'}\n`);
});
