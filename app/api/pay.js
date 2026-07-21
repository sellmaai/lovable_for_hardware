const crypto = require('crypto');
const { userFromAuth } = require('../lib/auth');
const { payments } = require('../lib/store');

// Mock billing. The real target uses Paystack (KES). Here we skip the hosted
// checkout and credit the account immediately, returning an authorization_url
// to a local confirmation page so the existing frontend flow works unchanged.
// Swap this handler for a real Paystack/Stripe init to charge for real.
module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const u = userFromAuth(req);
  if (!u) return res.status(401).json({ error: 'Please login first' });

  const amount = parseInt((req.body && req.body.amount), 10);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });

  const reference = crypto.randomBytes(6).toString('hex');
  u.credits += amount; // 1 KES -> 1 credit (mock)
  payments.set(reference, { email: u.email, amount, credited: true });

  return res.status(200).json({
    authorization_url: `/mock-payment.html?ref=${reference}&amount=${amount}`,
    reference,
    message: 'payment initialized (mock)',
  });
};
