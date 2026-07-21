// Data-access layer over Postgres (see db.js). Every handler goes through here,
// so swapping the backing store never touches call sites.

const crypto = require('crypto');
const { getDb } = require('./db');

// ---- password hashing (scrypt, no external dep) -------------------------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, credits: row.credits };
}

// ---- users --------------------------------------------------------------
async function createUser(name, email, password) {
  const db = await getDb();
  try {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, pass) VALUES ($1, $2, $3)
       RETURNING id, name, email, credits`,
      [String(name || 'User').trim() || 'User', email, hashPassword(password)]
    );
    return publicUser(rows[0]);
  } catch (err) {
    if (String(err.message || '').includes('duplicate') || err.code === '23505') {
      return { error: 'exists' };
    }
    throw err;
  }
}

async function verifyLogin(email, password) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
  const row = rows[0];
  if (!row || !verifyPassword(password, row.pass)) return null;
  return publicUser(row);
}

async function getUserById(id) {
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT id, name, email, credits FROM users WHERE id = $1`, [id]);
  return publicUser(rows[0]);
}

// ---- sessions -----------------------------------------------------------
async function createSession(userId) {
  const db = await getDb();
  const token = crypto.randomBytes(24).toString('hex');
  await db.query(`INSERT INTO sessions (token, user_id) VALUES ($1, $2)`, [token, userId]);
  return token;
}

async function userFromToken(token) {
  if (!token) return null;
  const db = await getDb();
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.credits
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1`, [token]);
  return publicUser(rows[0]);
}

// ---- credits ------------------------------------------------------------
async function addCredits(userId, amount) {
  const db = await getDb();
  const { rows } = await db.query(
    `UPDATE users SET credits = credits + $2 WHERE id = $1 RETURNING credits`,
    [userId, amount]);
  return rows[0] ? rows[0].credits : null;
}

// Deduct cost, flooring at 0, reporting partial deduction (matches the target).
// A CTE captures the pre-update balance so deducted/remaining are exact.
async function deductCredits(userId, cost) {
  const db = await getDb();
  const { rows } = await db.query(
    `WITH before AS (SELECT credits AS c FROM users WHERE id = $1)
     UPDATE users
        SET credits = GREATEST(0, credits - $2)
      WHERE id = $1
      RETURNING credits AS remaining, (SELECT c FROM before) AS before_balance`,
    [userId, cost]);
  const remaining = rows[0].remaining;
  const beforeBalance = rows[0].before_balance;
  const deducted = beforeBalance - remaining;
  const warning = cost > beforeBalance
    ? 'Partial deduction: insufficient credits for the full cost'
    : undefined;
  return { deducted, remaining, warning };
}

// ---- designs ------------------------------------------------------------
async function saveDesign(id, userId, deviceName, prompt, files) {
  const db = await getDb();
  await db.query(
    `INSERT INTO designs (id, user_id, device_name, prompt, files)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, deviceName, prompt, JSON.stringify(files)]);
}

async function getDesign(id) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM designs WHERE id = $1`, [id]);
  return rows[0] || null;
}

// ---- payments -----------------------------------------------------------
async function savePayment(reference, userId, amount) {
  const db = await getDb();
  await db.query(
    `INSERT INTO payments (reference, user_id, amount, credited)
     VALUES ($1, $2, $3, true)`,
    [reference, userId, amount]);
}

async function getPayment(reference) {
  const db = await getDb();
  const { rows } = await db.query(`SELECT * FROM payments WHERE reference = $1`, [reference]);
  return rows[0] || null;
}

// ---- orders -------------------------------------------------------------
async function saveOrder(order) {
  const db = await getDb();
  const { rows } = await db.query(
    `INSERT INTO orders
      (user_id, device_name, prompt, quantity, from_name, customer_email,
       customer_phone, customer_location, preferred_contact, special_requests, files, emailed)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [order.user_id || null, order.device_name, order.prompt, order.quantity,
     order.from_name, order.customer_email, order.customer_phone, order.customer_location,
     order.preferred_contact, order.special_requests,
     order.files ? JSON.stringify(order.files) : null, !!order.emailed]);
  return rows[0].id;
}

async function markOrderEmailed(id) {
  const db = await getDb();
  await db.query(`UPDATE orders SET emailed = true WHERE id = $1`, [id]);
}

module.exports = {
  createUser, verifyLogin, getUserById,
  createSession, userFromToken,
  addCredits, deductCredits,
  saveDesign, getDesign,
  savePayment, getPayment,
  saveOrder, markOrderEmailed,
};
