const { buildEnclosure } = require('./jscad');

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';

// One LLM pass emits a single coherent plan, then all five artifacts are derived
// from it — so the pin map, component list and wiring agree across the circuit,
// firmware, BOM and instructions. That cross-consistency is the whole point.
const SYSTEM_PROMPT = `You are an expert embedded hardware and firmware engineer.
Given a natural-language description of an electronic device, design a complete,
buildable, internally-consistent hardware project and return it as a SINGLE JSON
object. Pick a concrete microcontroller (prefer an ESP32 or Arduino-class board),
a concrete pin map, and a concrete component list, then make EVERY artifact agree
with those exact choices (same GPIO numbers, same part names everywhere).

Return ONLY a JSON object with EXACTLY these keys:

{
  "device_name": "short_snake_case_name",
  "enclosure": { "width": <mm>, "depth": <mm>, "height": <mm>, "wallThickness": <mm> },
  "circuit": {
    "nodes": [
      { "id": "N1", "label": "Line1\\nLine2\\nLine3", "x": <int>, "y": <int>,
        "type": "power_input|controller|sensor|display|passive|actuator|connector",
        "pins": { "PINNAME": "description" } }
    ],
    "connections": [
      { "source": "N1", "target": "N2", "label": "SIGNAL (GPIOxx)",
        "type": "power|signal|ground|data" }
    ]
  },
  "firmware": "<complete compilable Arduino/ESP32 .ino source as one string>",
  "bom": "<CSV starting with header: Item,Designator,Type,Part Number,Quantity,Price USD,Notes>",
  "instructions": "<multi-line plain-text assembly guide>"
}

Rules:
- enclosure dimensions in millimeters; width >= 40, depth >= 30, height >= 12.
- circuit: 4-8 nodes. label lines separated by \\n (name, role, one-line note).
  Lay nodes left-to-right: power on the left (x~40), controller center (x~160),
  peripherals right (x~280), y between 20 and 120. Use integer x/y.
- firmware: real, complete code with pin #defines, setup(), loop(); no placeholders.
- bom: valid CSV; quote any field containing a comma or quote.
- instructions: numbered steps — components, wiring (matching the circuit),
  flashing, assembly, and a safety note.
- Do NOT include markdown code fences. Output raw JSON only.`;

async function callDeepseek(prompt, apiKey) {
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
    max_tokens: 8000,
  };
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

function safeSnake(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'custom_device';
}

async function generateDesign(prompt, apiKey) {
  const data = await callDeepseek(prompt, apiKey);
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content : '';
  const tokensUsed = (data && data.usage && data.usage.total_tokens) || 0;

  let plan;
  try {
    plan = JSON.parse(content);
  } catch (e) {
    // Fallback: strip fences / extract the first {...} block.
    const m = String(content).match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model did not return valid JSON');
    plan = JSON.parse(m[0]);
  }

  const deviceName = safeSnake(plan.device_name);

  const circuit = plan.circuit && Array.isArray(plan.circuit.nodes)
    ? { nodes: plan.circuit.nodes, connections: plan.circuit.connections || [], layout_metadata: { signal_flow: 'left-to-right' } }
    : { nodes: [], connections: [] };

  const files = {
    jscad: buildEnclosure(plan.enclosure || {}),
    circuit: JSON.stringify(circuit, null, 2),
    firmware: String(plan.firmware || '// firmware unavailable'),
    bom: String(plan.bom || 'Item,Designator,Type,Part Number,Quantity,Price USD,Notes'),
    instructions: String(plan.instructions || 'Assembly instructions unavailable.'),
  };

  return { device_name: deviceName, tokens_used: tokensUsed, files };
}

module.exports = { generateDesign };
