const { userFromAuth } = require('../lib/auth');
const store = require('../lib/store');
const { sendOrderEmail } = require('../lib/email');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await userFromAuth(req); // optional — orders may be anonymous
  const b = req.body || {};

  if (!b.from_name || !b.customer_email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const order = {
    user_id: user ? user.id : null,
    device_name: b.device_name || 'Unnamed Device',
    prompt: b.original_prompt || b.prompt || '',
    quantity: parseInt(b.quantity, 10) || 1,
    from_name: b.from_name,
    customer_email: b.customer_email,
    customer_phone: b.customer_phone || '',
    customer_location: b.customer_location || '',
    preferred_contact: b.preferred_contact || 'email',
    special_requests: b.special_requests || '',
    files: b.bom ? { bom: b.bom } : null,
  };

  // Send email (best-effort) then persist the order for later analysis.
  let emailed = false;
  let emailNote;
  try {
    const r = await sendOrderEmail({
      ...order,
      original_prompt: order.prompt,
      design_id: b.design_id,
      generated_at: b.generated_at,
      bom: b.bom,
    });
    emailed = r.sent;
    if (!r.sent) emailNote = r.reason;
  } catch (err) {
    emailNote = 'email send failed: ' + err.message;
  }

  order.emailed = emailed;
  let id = null;
  try {
    id = await store.saveOrder(order);
  } catch (err) {
    // Don't fail the user's order over a storage hiccup if the email went out.
    if (!emailed) return res.status(500).json({ error: 'Failed to record order: ' + err.message });
  }

  return res.status(200).json({ ok: true, id, emailed, ...(emailNote ? { email_note: emailNote } : {}) });
};
