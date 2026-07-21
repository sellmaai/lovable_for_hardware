# pitchaprint — Reverse-Engineering Recon Log

Target: https://blankdesign-peach.vercel.app/
Product name: **pitchaprint** — "design hardware from text" (AI Hardware Design)
Tagline: "tunajua uko blank , uliza ; - P" (Swahili: roughly "we know you're blank, ask")
Recon date: 2026-07-20

---

## 1. What the product does (from first principles)

It's a **text-to-hardware generator**. You type a natural-language description of an
electronic device ("temperature sensor with OLED on an ESP32") and it returns a complete
buildable design package:

- **3D View** — a printable enclosure (3D model, JSCAD or STL)
- **Circuit** — a wiring/connection diagram (nodes + connections)
- **Firmware** — Arduino/C++ `.ino` source code
- **Instructions** — assembly guide
- **BOM** — bill of materials (CSV of components)

You can then **"Build"** (submit an order for physical fulfillment via an email form) or
download each artifact. It's gated by **credits** (paid via Paystack, priced in KES —
Kenyan Shillings), and generation costs credits based on tokens used.

This is conceptually "Lovable/v0 for hardware" — an LLM turns a prompt into a full
multi-artifact hardware project instead of a web app.

---

## 2. Tech stack (the whole frontend is ONE static HTML file)

The entire app is a single `index.html` (~99 KB, ~1164 lines) with **no build step**.
Everything is loaded from CDNs at runtime:

| Concern | Choice |
|---|---|
| UI framework | React 18 (UMD, `react.production.min.js` from unpkg) |
| JSX compile | **Babel Standalone** in-browser (`<script type="text/babel">`) |
| Styling | **Tailwind CSS via CDN** (`cdn.tailwindcss.com`) + custom `<style>` block |
| Font | Inter (Google Fonts) |
| 3D rendering | **Three.js r128** + STLLoader + OrbitControls |
| Editable 3D | JSCAD, rendered inside an **iframe** (`viewer.html`) via postMessage |
| Circuit diagram | **JointJS 3.7.5** (+ jQuery, lodash, Backbone as its deps) |
| Code editor | **Monaco Editor 0.44** (the VS Code editor, read-only, C++ mode) |
| Local storage | **IndexedDB** (`pitchaprint_db_v2`, store `designs`) for history |
| Order email | **EmailJS** (browser-side transactional email) |
| Payments | **Paystack** (via backend; opens hosted checkout in new tab) |
| Analytics | Google Analytics (gtag `G-FY9JR6VHMG`), Vercel Analytics, Crazy Egg |
| Hosting | **Vercel** (`*-peach.vercel.app`) — static hosting only |

Because Babel compiles JSX in the browser, there's a "Loading app..." spinner
(`#babel-loading`) that hides itself once React mounts (with an 8s failsafe timeout).

Notable: two `<base target="_blank">` tags — all links open in new tabs.

---

## 3. Architecture: three separate backends

The frontend is static; all real work is done by **two/three external services**,
declared in `window.ENV` and in the App component:

1. **Auth + Payments + Profile backend (`API_URL`)**
   `https://haas-with-payment.onrender.com` (Render-hosted, likely FastAPI; cold-starts)
   Endpoints observed / referenced in code:
   - `POST /signup`  {name, email, password}
   - `POST /login`   {email, password} → `{ token, credits, message }`
   - `GET  /me`      (Bearer token) → `{ name, email, credits }`
   - `POST /pay`     {amount} → `{ authorization_url, reference }`  (Paystack init)
   - `GET  /verify/:reference` → `{ credited, new_balance, amount_added, message }`
   Auth = opaque bearer token (NOT a JWT), stored in `localStorage['pitchaprint_token']`.

2. **AI Generation backend (`GEN_BASE`)**
   Default: `https://thatblankengineering--ai-hardware-service-jscad-fastapi-app.modal.run`
   (**Modal**-hosted FastAPI — the naming `--...-fastapi-app` is Modal's URL convention)
   - `POST /api/generate`  {prompt}  (Bearer token)
     → returns `{ device_name, generated_at, downloads: { individual_files: {...} },
        credits: { deducted, remaining, tokens_used, warning } }`
   - Overridable via `localStorage['pitchaprint_generate_url']`.
   - Returns **402** when out of credits, **401/403** on expired session.

3. **EmailJS** (build-order fulfillment emails) — service `service_4dtamkb`,
   template `template_lp9uzeb`, public key `eEJPvAel3mOPmxCrX`.

### Generation response contract (`downloads.individual_files`)
Each artifact is a `{ url }` the frontend then fetches separately. Keys handled:
`jscad`, `scad`, `stl`, `instructions`/`instructables`, `circuit` (JSON), `firmware`,
`bom`. The frontend is defensive about **two format generations**:
- **New format:** 3D model is JSCAD text; `stl` slot may carry instructions TEXT.
- **Old format:** 3D model is a binary STL; detected by sniffing bytes (`facet normal`
  / printable-char ratio).
Circuit JSON shape: `{ nodes: [{id, label, x?, y?}], connections: [{source, target, label?}] }`.

---

## 4. Key frontend components (in the single file)

- `AuthProvider` / `useAuth` — React Context holding token/user/credits + all API calls.
- `AuthModal` — login / signup tabbed modal.
- `PaymentModal` — buy credits (KES quick-amounts 100/500/1000/5000), opens Paystack.
- `UserMenu` — avatar dropdown: credits, Buy Credits, Sign Out.
- `STLViewer` — Three.js binary-STL renderer (auto-rotate, edges, auto-fit camera).
- `Model3DViewer` — iframe wrapper to `viewer.html`, feeds STL/JSCAD via postMessage,
  retries until the iframe posts `viewer-ready` / `model-loaded`.
- `CircuitViewer` — JointJS graph with auto-layout (grid columns), zoom controls.
- `FirmwareEditor` — Monaco, read-only C++.
- `InstructionsViewer` + `buildFallbackInstructions()` — assembly guide, with a
  client-side fallback synthesized from BOM + circuit when backend gives none.
- `BOMTable` — parses CSV into a table.
- `LoadingScreen` — fake staged progress ("Understanding your prompt", "Designing the
  3D casing", "Routing the circuit", "Writing the firmware", ...) on a 2.5s timer.
- `BuildOrderModal` — order form → EmailJS.
- `App` — orchestrates history drawer, tabs, generate flow, downloads.

### Client-side data model (IndexedDB)
DB `pitchaprint_db_v2`, store `designs`, keyPath `id` (=Date.now()), indexes on
`timestamp` and `deviceName`. Each entry stores input prompt + the full resolved
`output` (all artifact contents inlined) so history works offline.

---

## 5. Observed behavior / live session

- Landing: header (hamburger→history drawer, "pitchaprint", About link, Sign In),
  centered hero "design hardware from text" + "Get Started", bottom fixed chat input,
  floating Discord/LinkedIn pills.
- Auth: signed in with provided creds → `POST /login` **200**, `GET /me` **200**.
  Account: **name "John D", 147 credits.** Token is opaque hex-like string.
  (Render backend cold-started; first login took a few seconds.)
- After login: header shows green "147" credit badge + "John" avatar menu.

### Console warnings (expected, not errors)
- `cdn.tailwindcss.com should not be used in production`
- `You are using the in-browser Babel transformer` (precompile for production)

---

## 6. Notes for replication

- The frontend is trivially copyable — it's one static file. The **hard part is the two
  backends**: the Modal generation service (the actual LLM→hardware pipeline) and the
  Render auth/credits/Paystack service. Those are the real IP.
- To replicate: rebuild (a) an auth+credits API, (b) a Paystack (or Stripe) billing loop,
  (c) the generation service that turns a prompt into {3D model, circuit JSON, firmware,
  BOM, instructions}. The frontend's response contract (section 3) is the spec for (c).
- `viewer.html` (1051 lines) and `about_us.html` (380 lines) saved locally for study.

---

## 7. Live generation — full contract (captured)

Prompt used: *"simple temperature sensor with an OLED display using an ESP32"*

`POST {GEN_BASE}/api/generate`  body `{ "prompt": "..." }`  header `Authorization: Bearer <token>`

Response (200):
```json
{
  "device_name": "esp32_temperature_monitor",
  "design_id": "9f148465",
  "generated_at": "2026-07-21T02:06:37Z",
  "expires_at": 1784685997,               // designs are EPHEMERAL on the backend
  "credits": { "deducted": 147, "cost_estimate": 174, "tokens_used": 17389,
               "remaining": 0, "warning": "Partial deduction: insufficient credits..." },
  "downloads": {
    "individual_files": {
      "jscad":        { "filename": "..._enclosure.jscad", "content_type": "text/javascript",   "url": "/api/download/9f148465/jscad" },
      "circuit":      { "filename": "..._circuit.json",     "content_type": "application/json",   "url": "/api/download/9f148465/circuit" },
      "firmware":     { "filename": "....ino",              "content_type": "text/x-arduino",     "url": "/api/download/9f148465/firmware" },
      "bom":          { "filename": "..._bom.csv",          "content_type": "text/csv",           "url": "/api/download/9f148465/bom" },
      "instructions": { "filename": "..._instructions.txt", "content_type": "text/plain",         "url": "/api/download/9f148465/instructions" }
    },
    "complete_package": { "filename": "..._complete.zip", "content_type": "application/zip", "url": "/api/download/9f148465/zip" }
  }
}
```
Notes:
- Cost model: **1 credit ≈ 100 tokens** (174 estimate ≈ 17,389 tokens). Deducts even on
  partial balance, floors remaining at 0. One generation ≈ 150–175 credits here.
- Backend stores designs temporarily (`expires_at` ~ a few days); direct `curl` of the
  download URL later returned `{"detail":"Design not found or expired"}`. The frontend
  therefore **fetches every artifact immediately** and caches the full content in IndexedDB.
- The frontend then does 5 follow-up GETs to each `url` and stores contents locally.

### Artifact schemas (all captured to `recon/artifacts/`)
- **`enclosure.jscad`** — a JSCAD program: `require('@jscad/modeling')`, exports
  `{ main, getParameterDefinitions }`. Parametric box+lid enclosure with wall thickness,
  snap-fit dowels, dowel holes, OLED/USB/sensor cutouts, pry notches; base colored red,
  lid blue. This is *code*, not a mesh — the viewer executes it to produce geometry.
- **`circuit.json`** — `{ nodes[], connections[], layout_metadata }`. Nodes carry
  `id, label(\n-separated), x, y, type, pins{}`. Connections carry `source, target, label,
  type(power|signal|ground|data), style, curve`. **The frontend only uses id/label/x/y +
  source/target/label** — the richer pin/type/curve data is generated but ignored (headroom
  for a better renderer).
- **`firmware.ino`** — complete Arduino/ESP32 C++: pin defines, TMP36 ADC→°C math, SSD1306
  I2C OLED, button ISR to toggle C/F, plus a commented "Improvements" block.
- **`bom.csv`** — `Item,Designator,Type,Part Number,Quantity,Price USD,Notes`.
- **`instructions.txt`** — long structured build guide (what you're building, components,
  breadboard wiring steps, code upload steps, safety warnings).

Observation: the LLM output is **internally consistent across artifacts** — GPIO34 analog
for TMP36, GPIO21/22 I2C for the OLED appear identically in circuit, firmware, and
instructions. That implies a single generation pass (or shared plan) feeding all five files.

---

## 8. The 3D viewer (`viewer.html`, standalone iframe, 1051 lines)

A self-contained model viewer, isolated in an iframe so it can use **modern** deps
(the parent uses old Three r128 for its own STLViewer; the iframe uses Three **0.160.0**
and `@jscad/modeling@2.12.0`, both via `esm.sh` ES modules).

- Accepts `.js/.jscad/.stl/.obj` (drag-drop or postMessage).
- **Executes JSCAD code** by `new Function(...)`-style evaluation with a stubbed
  `require` that returns the esm.sh `@jscad/modeling` module, calls `main()`, converts the
  resulting JSCAD solids into Three.js geometry.
- UI: fullscreen, **Explode** slider (separates multi-part models), **Wireframe** toggle,
  **Orbit** auto-rotate, **Reset All**, and live **Parts / Polys / Verts** stats
  (this model: 2 / 1,404 / 4,212).
- postMessage protocol with parent:
  - iframe → parent: `viewer-ready`, `model-loaded`, `stl-exported`
  - parent → iframe: `load-stl-buffer`, `load-stl-url`, `load-jscad-text`, `export-stl`
  - "Download STL" in the parent works by asking the iframe to tessellate the JSCAD model
    and post back an STL ArrayBuffer (client-side STL export — no server round-trip).

---

## 9. About page (`about_us.html`, 380 lines)

Separate static page. Title "About - **pichaprint**" (note spelling variant). Sections:
brand intro, "our mission", an **email waitlist** ("be the first to know … when we launch
our hardware fulfillment service" — so fulfillment is not fully live yet), and a contact
`mailto:` — **thatblankengineering@gmail.com**. Uses the same EmailJS creds. Company/handle:
**"thatblankengineering"** (matches the Modal deployment username in `GEN_BASE`).

---

## 10. Replication blueprint (what to build to clone this)

**Frontend (easy — ~1 day):** the whole UI is one static file you can lift directly. To
productionize: move Tailwind + JSX to a real build (Vite), keep React, keep Three/JSCAD in
an isolated viewer, keep Monaco/JointJS. The response contract in §7 is your integration spec.

**Backend A — Auth/Credits/Billing (`haas-with-payment` on Render):**
- `/signup`, `/login` (returns opaque bearer token), `/me`, `/pay` (Paystack init →
  authorization_url + reference), `/verify/:reference` (confirm + credit balance).
- Store users + credit balances; deduct credits per generation by token usage.
- Swap Paystack→Stripe if not targeting Kenya/KES.

**Backend B — Generation (`ai-hardware-service` on Modal, the real IP):**
- `POST /api/generate {prompt}` → orchestrates an LLM to emit **5 consistent artifacts**:
  1. a **parametric JSCAD enclosure program** (not a mesh — code that builds the box, with
     cutouts sized to the chosen components),
  2. **circuit JSON** (nodes+connections+pins),
  3. **ESP32/Arduino firmware**,
  4. **BOM CSV**,
  5. **assembly instructions**.
- Key design choice to replicate: **one coherent plan** (chosen MCU, pin map, component
  list) that all five artifacts are derived from, so GPIO/pin assignments match everywhere.
- Serve artifacts at ephemeral `/api/download/:id/:kind` URLs + a `.zip`. Meter tokens →
  credits.

**Services:** EmailJS (build-order + waitlist mail), Paystack (pay), GA/Vercel/Crazy Egg
(analytics), Vercel (static host), Render (API), Modal (GPU/LLM generation).

---

## 11. Remaining flows exercised (second pass)

- **All 5 result tabs rendered live:** 3D View (JSCAD in iframe), Circuit (JointJS graph —
  nodes overlap a bit; layout is crude), Firmware (Monaco, C++ highlighting), Instructions
  (full assembly guide text), BOM (table). Screenshots saved at repo root: `tab-*.png`.
- **3D viewer controls work:** toggled **Wireframe** + dragged **Explode → 100%**; the model
  visibly splits into its **2 parts (base + lid)** — confirms it's a genuine multi-part
  parametric model, not a flat mesh. Live stats: Parts 2 / Polys 1,404 / Verts 4,212.
  (`viewer-exploded-wireframe.png`)
- **Build / fulfillment modal ("Build Your Device"):** fields Name*, Email*, Phone,
  Location, Preferred Contact (Email/Phone/WhatsApp), Quantity*, Special Requests + an order
  summary ("Files included: STL, SCAD, Circuit, Firmware, BOM"). Filled with test data and
  verified valid. **Did NOT click "Place Build Order"** — that fires an EmailJS send to
  `thatblankengineering@gmail.com` (real outbound order to the founder). Left unsubmitted on
  purpose. (`build-modal.png`)
- **Buy Credits / Paystack:** opened modal (balance, KES amount, quick 100/500/1000/5000,
  "Pay with Paystack"). Clicked Pay to capture the backend contract:
  `POST /pay {amount:100}` → `{"authorization_url":"https://checkout.paystack.com/2xbsu08a21jx0l1","message":"payment initialized","reference":"tqggzwt28r"}`.
  This only *initializes* a transaction (no charge) and opens Paystack's hosted checkout in a
  new tab. **Per user instruction, did not proceed onto the Paystack pay page** — closed it.
  (`payment-modal.png`)
- **About page (`/about_us.html`):** headline "from idea to prototype." Confirms value prop
  verbatim ("no CAD, no EE degree, no friction"), a "how it works" section, a waitlist form
  (name/email/interest → EmailJS), an explicit **"currently in MVP"** badge ("we are … on our
  early stage of MVP"), contact `thatblankengineering@gmail.com`, footer "© pichaprint — the
  blank engineering research company." (`about-page.png`)

### Full external API surface (confirmed by live traffic)
| Method | URL | Purpose | Response |
|---|---|---|---|
| POST | `{API}/login` | auth | `{token, credits, message}` |
| GET  | `{API}/me` | profile | `{name, email, credits}` |
| POST | `{API}/pay` | Paystack init | `{authorization_url, reference, message}` |
| GET  | `{API}/verify/:ref` | confirm payment → credit | `{credited, new_balance, amount_added}` |
| POST | `{GEN}/api/generate` | LLM generation | `{device_name, design_id, downloads{...}, credits{...}}` |
| GET  | `{GEN}/api/download/:id/:kind` | fetch artifact | file (ephemeral, expires) |
| GET  | `{GEN}/api/download/:id/zip` | full bundle | zip |

`{API}` = `haas-with-payment.onrender.com` · `{GEN}` = `thatblankengineering--ai-hardware-service-jscad-fastapi-app.modal.run`

### The core insight
"Lovable for hardware" = an LLM that emits a **cross-consistent bundle of engineering
artifacts** from one prompt, plus **browser-side renderers** (JSCAD→3D, JointJS circuit,
Monaco code, CSV table) that make the output feel like a real CAD/EDA tool — all wrapped in
a credits paywall. The frontend is a thin, copyable shell; the moat is the generation
prompt/pipeline that keeps the 3D model, circuit, firmware, and BOM agreeing with each other.

