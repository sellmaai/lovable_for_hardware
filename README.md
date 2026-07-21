# pitchaprint — Lovable for Hardware

Type a plain-English description of an electronic device and get back a complete,
internally-consistent build package:

- **3D View** — a printable two-part enclosure (parametric JSCAD program, rendered in-browser)
- **Circuit** — a wiring diagram (nodes + connections)
- **Firmware** — ready-to-flash Arduino / ESP32 `.ino` code
- **Instructions** — a step-by-step assembly guide
- **BOM** — a bill of materials (CSV)

One LLM pass produces a single coherent plan (MCU, pin map, component list) and all
five artifacts are derived from it, so GPIO assignments and part names agree across
the circuit, firmware, BOM and instructions. Accounts, credits, generated designs and
build orders are persisted in Postgres, and generation is gated by a simple credit
system. Clicking **Build** records the order and emails it to the founder for analysis.

## Architecture

The deployable app lives in [`app/`](app/):

```
app/
  public/            Static frontend (React 18 + Babel + Tailwind via CDN — no build step)
    index.html         Main app
    viewer.html        Isolated JSCAD/Three.js 3D viewer (iframe)
    about_us.html      About page
    mock-payment.html  Mock checkout confirmation
  api/               Serverless functions (Vercel-style (req, res) handlers)
    signup.js  login.js  me.js  pay.js
    verify/[ref].js
    generate.js        Calls DeepSeek, assembles the 5 artifacts, meters credits
    order.js           Saves a build order + emails the founder
    download/[id]/[kind].js
  lib/
    db.js              Postgres (pg) in prod / embedded PGlite locally
    store.js           SQL data access: users, sessions, designs, payments, orders
    auth.js            Signup, login (scrypt-hashed), bearer-token sessions
    generate.js        DeepSeek prompt + artifact assembly
    jscad.js           Parametric enclosure template
    email.js           Gmail SMTP for build-order emails
  dev-server.js      Local server that mounts the api/ handlers + serves public/
  vercel.json        Function config (60s max duration for generation)
```

The frontend is a thin shell; the real work is the generation backend.

## Data & persistence

All state lives in **Postgres**, accessed through `lib/store.js`:

- **Production**: set `DATABASE_URL` (or `POSTGRES_URL`) to a Postgres/Neon connection
  string and the app uses the `pg` driver.
- **Local dev**: leave `DATABASE_URL` empty and it falls back to **PGlite**, an embedded
  Postgres persisted to `app/.data/pg` — so accounts, credits, designs and orders survive
  restarts with zero setup. (PGlite is single-process: only the dev server should open it.)

Tables: `users`, `sessions`, `designs`, `payments`, `orders` (auto-created on first run).

## Run locally

```bash
cd app
npm install               # pg, nodemailer, @electric-sql/pglite
cp .env.example .env      # paste your DeepSeek key; DATABASE_URL can stay empty
npm run dev
# open http://localhost:3000
```

Create an account (500 starter credits), type a device description in the bottom input,
and hit send. Each generation costs ~1 credit per 100 tokens.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, import the repo and set **Root Directory** to `app`.
3. In the Vercel **Storage** tab, create a **Postgres** database — it auto-injects
   `DATABASE_URL` / `POSTGRES_URL`.
4. Add environment variables:
   - **`DEEPSEEK_API_KEY`** (and optionally `DEEPSEEK_MODEL`)
   - **`GMAIL_USER`**, **`GMAIL_APP_PASSWORD`**, **`ORDER_RECIPIENT`** (for build-order emails)
5. Deploy.

Vercel serves `app/public/` as static assets and each `app/api/*` file as a function
automatically.

## Credentials & billing

- **LLM**: DeepSeek (`deepseek-v4-pro` by default) via `DEEPSEEK_API_KEY`.
- **Database**: Postgres via `DATABASE_URL` (PGlite fallback locally).
- **Payments**: mocked — `POST /api/pay` credits the account immediately and returns a
  confirmation URL. Swap `api/pay.js` for a real Paystack/Stripe init to charge for real.
- **Build orders**: `POST /api/order` stores the order in Postgres and emails all details
  (including the original prompt) via **Gmail SMTP**. Sending requires a Gmail **App
  Password** (not your login password) — generate one at
  https://myaccount.google.com/apppasswords and set `GMAIL_APP_PASSWORD`. Without it, the
  order is still saved; only the email is skipped.

## Recon

[`recon/`](recon/) documents the reverse-engineered target this project replicates
(`RECON.md`, saved frontend, captured artifact samples).
