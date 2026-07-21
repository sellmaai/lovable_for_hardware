const store = require('../../../lib/store');

const CONTENT_TYPES = {
  jscad: 'text/javascript; charset=utf-8',
  circuit: 'application/json; charset=utf-8',
  firmware: 'text/x-arduino; charset=utf-8',
  bom: 'text/csv; charset=utf-8',
  instructions: 'text/plain; charset=utf-8',
};

module.exports = async (req, res) => {
  const id = req.query && req.query.id;
  const kind = req.query && req.query.kind;

  const design = await store.getDesign(id);
  if (!design) return res.status(404).json({ detail: 'Design not found or expired' });

  const files = design.files || {};
  const content = files[kind];
  if (content == null) return res.status(404).json({ detail: 'Artifact not found' });

  res.setHeader('Content-Type', CONTENT_TYPES[kind] || 'text/plain; charset=utf-8');
  return res.status(200).send(content);
};
