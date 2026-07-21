const { userFromAuth } = require('../lib/auth');

module.exports = (req, res) => {
  const u = userFromAuth(req);
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  return res.status(200).json({ name: u.name, email: u.email, credits: u.credits });
};
