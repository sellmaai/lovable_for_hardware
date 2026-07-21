const crypto = require('crypto');
const { users, tokens } = require('./store');

// Credits granted to every new account (matches the target's "free starter" feel).
const START_CREDITS = 500;

function makeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function signup(name, email, password) {
  email = normEmail(email);
  if (!email || !password) return { error: 'Email and password are required' };
  if (String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  if (users.has(email)) return { error: 'An account with this email already exists' };
  users.set(email, { name: String(name || 'User').trim() || 'User', email, password: String(password), credits: START_CREDITS });
  return { ok: true };
}

function login(email, password) {
  email = normEmail(email);
  const u = users.get(email);
  if (!u || u.password !== String(password)) return { error: 'Invalid email or password' };
  const token = makeToken();
  tokens.set(token, email);
  return { token, credits: u.credits, message: 'Logged in' };
}

// Resolve the authenticated user from an Authorization: Bearer <token> header.
function userFromAuth(req) {
  const h = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const email = tokens.get(m[1].trim());
  if (!email) return null;
  return users.get(email) || null;
}

module.exports = { signup, login, userFromAuth, makeToken, START_CREDITS };
