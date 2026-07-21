const store = require('./store');

function normEmail(email) {
  return String(email || '').toLowerCase().trim();
}

async function signup(name, email, password) {
  email = normEmail(email);
  if (!email || !password) return { error: 'Email and password are required' };
  if (String(password).length < 6) return { error: 'Password must be at least 6 characters' };
  const result = await store.createUser(name, email, password);
  if (result && result.error === 'exists') return { error: 'An account with this email already exists' };
  return { ok: true };
}

async function login(email, password) {
  email = normEmail(email);
  const user = await store.verifyLogin(email, password);
  if (!user) return { error: 'Invalid email or password' };
  const token = await store.createSession(user.id);
  return { token, credits: user.credits, message: 'Logged in' };
}

// Resolve the authenticated user from an Authorization: Bearer <token> header.
async function userFromAuth(req) {
  const h = (req.headers && (req.headers['authorization'] || req.headers['Authorization'])) || '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return store.userFromToken(m[1].trim());
}

module.exports = { signup, login, userFromAuth };
