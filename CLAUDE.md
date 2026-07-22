# CLAUDE.md

Guidance for working in this repo. Read `README.md` for the user-facing overview;
this file is the working map for making changes.

## What this is

**pitchaprint** — a "Lovable/v0 for hardware." A user types a plain-English device
description; one DeepSeek pass produces a single coherent plan (MCU, pin map, component
list) and five cross-consistent artifacts are derived from it: a 3D enclosure (JSCAD),
a circuit diagram (JSON), ESP32/Arduino firmware (`.ino`), a BOM (CSV), and assembly
instructions. Gated by a credit system. This is a rebuild of a reverse-engineered target
(see `recon/RECON.md`).

The frontend is a thin shell; the value is the generation backend keeping all five
artifacts agreeing with each other.

## Layout

The deployable app is in **`app/`** (Vercel Root Directory = `app`). Repo root also holds
`recon/` (reverse-engineering notes + captured samples) and `docs/` (screenshots).

```
app/
  public/            Static frontend — single-file React 18 + Babel + Tailwind via CDN (no build)
    index.html         Main app (AuthProvider, generate flow, tabs, IndexedDB history)
    viewer.html        Isolated JSCAD/Three.js 3D viewer (iframe, modern deps)
    about_us.html      About page
    mock-payment.html  Mock checkout confirmation page
  api/               Vercel serverless functions — module.exports = (req, res) handlers
    signup.js login.js me.js pay.js
    verify/[ref].js            req.query.ref
    generate.js                DeepSeek call -> deduct credits -> persist design
    order.js                   save build order + email founder
    download/[id]/[kind].js    req.query.id, req.query.kind
  lib/
    db.js              Postgres (pg) in prod / embedded PGlite locally; connection auto-detect + schema migrate
    store.js           SQL data access (async): users, sessions, designs, payments, orders
    auth.js            signup/login (scrypt-hashed pw), userFromAuth(req) bearer-token
    generate.js        DeepSeek prompt + parse plan -> assemble artifacts
    jscad.js           buildEnclosure(dims) -> parametric enclosure program text
    email.js           Gmail SMTP (nodemailer) for build-order emails
  dev-server.js      Local server: mounts api/ handlers + serves public/ (no framework)
  vercel.json        api/generate.js maxDuration 60s
```

## Run / test locally

```bash
cd app
npm install
# .env already holds the DeepSeek key + Gmail creds locally (git-ignored)
npm run dev          # http://localhost:3000
```

- Restart after changing anything in `lib/` or `api/` (dev-server caches required modules).
- Kill the server before running a separate Node script that opens the DB —
  **PGlite is single-process**; concurrent opens of `app/.data/pg` corrupt it.
- Fresh local DB: `rm -rf app/.data` then restart.
- Browser E2E via Playwright MCP; clear a stale lock with
  `pkill -f ms-playwright-mcp` if navigate says "browser already in use".

## Key contracts (don't break these — the frontend depends on them)

- `POST /api/generate {prompt}` (Bearer token) → `{ device_name, design_id, generated_at,
  original_prompt, credits:{deducted,cost_estimate,tokens_used,remaining,warning?},
  downloads:{ individual_files:{ jscad, circuit, firmware, bom, instructions:
  {filename, content_type, url} } } }`. Returns **402** when out of credits, **401** on bad token.
- The frontend then GETs each `url` (`/api/download/:id/:kind`) and caches contents in IndexedDB.
- **jscad** must be a runnable program (`require('@jscad/modeling')`, exports `main`/
  `getParameterDefinitions`, returns `[base, lid]`). The viewer executes it. `jscad.js`
  bakes dims into a proven template so the 3D tab always renders — don't hand the raw LLM
  JSCAD to the viewer.
- **circuit** JSON: `{ nodes:[{id,label(\n-separated),x,y,...}], connections:[{source,target,label}] }`.
  Frontend only uses id/label/x/y + source/target/label.
- Credit cost ≈ `ceil(tokens_used / 100)`, floored at 0 (partial-deduction warning).

## Backends & config

- **LLM**: DeepSeek, `DEEPSEEK_API_KEY` (+ optional `DEEPSEEK_MODEL`, default `deepseek-v4-pro`).
  Endpoint `https://api.deepseek.com/v1/chat/completions`, `response_format: json_object`.
- **DB**: `lib/db.js` `resolveConnectionString()` tries `DATABASE_URL`, `POSTGRES_URL`, then
  any `*_POSTGRES_URL`/`*_DATABASE_URL` (prefers pooled) — so Vercel's Neon integration works
  whatever prefix it uses. No `DATABASE_URL` → PGlite at `app/.data/pg`. Tables auto-create.
- **Payments**: mocked. `POST /api/pay` credits immediately + returns a confirmation URL.
  Swap `api/pay.js` for real Paystack/Stripe.
- **Build emails**: `api/order.js` saves the order and calls `lib/email.js` (Gmail SMTP).
  Needs `GMAIL_USER` + `GMAIL_APP_PASSWORD` (a Google **App Password**, not the login pw) +
  `ORDER_RECIPIENT`. Missing creds → order still saved, email skipped (best-effort).

## Deploy (Vercel)

Repo is `github.com/sellmaai/lovable_for_hardware`, pushed to `main` (auto-deploys).
Vercel project root = `app`. Neon Postgres connected via the Storage integration (injects
`DATABASE_URL`/`POSTGRES_URL`). Env vars set in the Vercel dashboard: `DEEPSEEK_API_KEY`,
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `ORDER_RECIPIENT`. Share the stable `*.vercel.app`
production alias (Domains tab), not the per-deployment hashed URL.

## Conventions

- Handlers are plain async `(req, res)` (Vercel style); `dev-server.js` shims the same
  interface locally. Keep new endpoints in that shape and route them in `dev-server.js`'s
  `resolveApiHandler` if they use dynamic segments.
- All persistence goes through `lib/store.js` — never touch `db.js`/SQL from a handler.
- Secrets live only in `app/.env` (git-ignored). Never commit keys/passwords.
