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
the circuit, firmware, BOM and instructions. Generation is gated by a simple credit
system.

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
    download/[id]/[kind].js
  lib/
    store.js           In-memory users / tokens / designs / payments
    auth.js            Signup, login, bearer-token auth
    generate.js        DeepSeek prompt + artifact assembly
    jscad.js           Parametric enclosure template
  dev-server.js      Local server that mounts the api/ handlers + serves public/
  vercel.json        Function config (60s max duration for generation)
```

The frontend is a thin shell; the real work is the generation backend.

## Run locally

```bash
cd app
cp .env.example .env      # then paste your DeepSeek key into .env
npm run dev               # no dependencies to install — Node 18+ only
# open http://localhost:3000
```

Create an account (you get 500 starter credits), type a device description in the
bottom input, and hit send. Each generation costs ~1 credit per 100 tokens.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, import the repo and set **Root Directory** to `app`.
3. Add an environment variable **`DEEPSEEK_API_KEY`** (and optionally `DEEPSEEK_MODEL`).
4. Deploy.

Vercel serves `app/public/` as static assets and each `app/api/*` file as a function
automatically — no extra config beyond `vercel.json`.

### Production note on state

`lib/store.js` keeps users, sessions and generated designs in memory. That is perfect
for local dev and warm-instance demos, but serverless functions don't share memory
across cold starts, so a durable multi-user deployment should swap those Maps for a
shared store (Vercel KV / Upstash Redis / Postgres). Every call site already treats the
store as the only interface, so it's a contained change.

## Credentials & billing

- **LLM**: DeepSeek (`deepseek-v4-pro` by default) via `DEEPSEEK_API_KEY`.
- **Payments**: mocked — `POST /api/pay` credits the account immediately and returns a
  confirmation URL. Swap `api/pay.js` for a real Paystack/Stripe init to charge for real.
- **Build orders**: the frontend "Build" form still posts to EmailJS with the original
  target's public keys; wire in your own EmailJS credentials in `public/index.html` if
  you want those emails to reach you.

## Recon

[`recon/`](recon/) documents the reverse-engineered target this project replicates
(`RECON.md`, saved frontend, captured artifact samples).
