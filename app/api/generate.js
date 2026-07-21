const crypto = require('crypto');
const { userFromAuth } = require('../lib/auth');
const { generateDesign } = require('../lib/generate');
const { designs, reapDesigns } = require('../lib/store');

// Cost model mirrors the target: ~1 credit per 100 tokens, floored at 1.
function creditCost(tokensUsed) {
  return Math.max(1, Math.ceil((tokensUsed || 0) / 100));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = userFromAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const prompt = ((req.body && req.body.prompt) || '').toString().trim();
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  if (user.credits <= 0) return res.status(402).json({ error: 'Insufficient credits' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY not configured on the server' });

  let design;
  try {
    design = await generateDesign(prompt, apiKey);
  } catch (err) {
    return res.status(502).json({ error: 'Generation failed: ' + err.message });
  }

  // Deduct credits (partial deduction floored at 0, like the target).
  const cost = creditCost(design.tokens_used);
  const deducted = Math.min(cost, user.credits);
  const warning = cost > user.credits
    ? 'Partial deduction: insufficient credits for the full cost'
    : undefined;
  user.credits = Math.max(0, user.credits - cost);

  // Store artifacts for the follow-up download GETs.
  reapDesigns();
  const id = crypto.randomBytes(4).toString('hex');
  designs.set(id, { createdAt: Date.now(), files: design.files });

  const name = design.device_name;
  const base = `/api/download/${id}`;
  return res.status(200).json({
    device_name: name,
    design_id: id,
    generated_at: new Date().toISOString(),
    original_prompt: prompt,
    credits: {
      deducted,
      cost_estimate: cost,
      tokens_used: design.tokens_used,
      remaining: user.credits,
      ...(warning ? { warning } : {}),
    },
    downloads: {
      individual_files: {
        jscad: { filename: `${name}_enclosure.jscad`, content_type: 'text/javascript', url: `${base}/jscad` },
        circuit: { filename: `${name}_circuit.json`, content_type: 'application/json', url: `${base}/circuit` },
        firmware: { filename: `${name}.ino`, content_type: 'text/x-arduino', url: `${base}/firmware` },
        bom: { filename: `${name}_bom.csv`, content_type: 'text/csv', url: `${base}/bom` },
        instructions: { filename: `${name}_instructions.txt`, content_type: 'text/plain', url: `${base}/instructions` },
      },
    },
  });
};
