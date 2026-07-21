const { signup } = require('../lib/auth');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { name, email, password } = req.body || {};
  const result = signup(name, email, password);
  if (result.error) return res.status(400).json(result);
  return res.status(200).json({ message: 'Account created' });
};
