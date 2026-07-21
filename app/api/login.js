const { login } = require('../lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { email, password } = req.body || {};
  const result = await login(email, password);
  if (result.error) return res.status(401).json(result);
  return res.status(200).json(result);
};
