// In-memory data store.
//
// This is intentionally simple so the app runs with zero external services.
// Serverless functions on Vercel do NOT share memory across cold invocations,
// so for durable multi-user production use, swap these Maps for Vercel KV,
// Upstash Redis, or Postgres (the call sites already treat reads/writes as
// the only interface). For local dev and warm-instance demos this is enough.

const users = new Map(); // email -> { name, email, password, credits }
const tokens = new Map(); // token -> email
const designs = new Map(); // id -> { createdAt, files:{ jscad, circuit, firmware, bom, instructions } }
const payments = new Map(); // reference -> { email, amount, credited }

// Best-effort eviction so a long-lived local process doesn't grow forever.
const DESIGN_TTL_MS = 1000 * 60 * 60 * 24; // 24h
function reapDesigns() {
  const now = Date.now();
  for (const [id, d] of designs) {
    if (now - d.createdAt > DESIGN_TTL_MS) designs.delete(id);
  }
}

module.exports = { users, tokens, designs, payments, reapDesigns };
