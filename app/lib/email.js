const nodemailer = require('nodemailer');

// Gmail SMTP. Requires a Gmail **App Password** (16 chars) for GMAIL_USER —
// generate one at https://myaccount.google.com/apppasswords (needs 2FA on).
// If not configured, order emails are skipped (the order is still saved to DB).
let _transport;
function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!_transport) {
    _transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return _transport;
}

function buildBody(o) {
  const lines = [
    'NEW BUILD ORDER',
    '================',
    '',
    `Device:            ${o.device_name || 'Unnamed'}`,
    `Quantity:          ${o.quantity || 1}`,
    `Design ID:         ${o.design_id || 'n/a'}`,
    `Generated at:      ${o.generated_at || 'n/a'}`,
    '',
    'CUSTOMER',
    '--------',
    `Name:              ${o.from_name || ''}`,
    `Email:             ${o.customer_email || ''}`,
    `Phone:             ${o.customer_phone || 'Not provided'}`,
    `Location:          ${o.customer_location || 'Not provided'}`,
    `Preferred contact: ${o.preferred_contact || 'email'}`,
    '',
    'SPECIAL REQUESTS',
    '----------------',
    o.special_requests || 'None',
    '',
    'ORIGINAL PROMPT (for analysis)',
    '------------------------------',
    o.original_prompt || 'n/a',
  ];
  if (o.bom) {
    lines.push('', 'BILL OF MATERIALS', '-----------------', o.bom);
  }
  return lines.join('\n');
}

async function sendOrderEmail(order) {
  const transport = getTransport();
  const to = process.env.ORDER_RECIPIENT || process.env.GMAIL_USER;
  if (!transport || !to) return { sent: false, reason: 'email not configured (set GMAIL_USER + GMAIL_APP_PASSWORD)' };

  await transport.sendMail({
    from: process.env.GMAIL_USER,
    to,
    replyTo: order.customer_email || undefined,
    subject: `New Build Order: ${order.device_name || 'device'} (x${order.quantity || 1})`,
    text: buildBody(order),
  });
  return { sent: true };
}

module.exports = { sendOrderEmail };
