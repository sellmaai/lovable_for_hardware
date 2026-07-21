const { userFromAuth } = require('../../lib/auth');
const { payments } = require('../../lib/store');

module.exports = (req, res) => {
  const ref = req.query && req.query.ref;
  const p = payments.get(ref);
  if (!p) return res.status(404).json({ error: 'Reference not found' });

  const u = userFromAuth(req);
  return res.status(200).json({
    credited: true,
    amount_added: p.amount,
    new_balance: u ? u.credits : undefined,
    message: `Added ${p.amount} credits`,
  });
};
