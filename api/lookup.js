// This runs on Vercel's servers, never in the user's browser.
// The API key lives in an environment variable, so it's never exposed.

const SYSTEM_PROMPT = `You are a veterinary pharmaceutical reference assistant for cats and dogs.

Task: given a medicine name (brand or generic, possibly misspelled), return structured factual data about it.

Constraints:
- Do not provide medical advice.
- Do not provide dosage instructions.
- Do not invent or guess medicines, ingredients, or brands. If uncertain, use "unknown".
- Prefer "unknown" over speculation.
- Only include well-established equivalences.

Respond with ONLY a single JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "medicine": { "brand": "string|unknown", "generic": "string|unknown", "type": "veterinary|human|both|unknown" },
  "active_ingredients": ["string"],
  "equivalent_products": {
    "veterinary_brands": ["string|unknown"],
    "human_equivalents": ["string|unknown"],
    "note": "string"
  },
  "human_use": { "used_in_humans": "yes|no|unknown", "context": "string|unknown" },
  "safety_notes": ["string"]
}

If the input does not look like a real medicine name at all, set all fields to "unknown" / empty arrays and add a safety_notes entry saying the name wasn't recognized.`;

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { medicineName } = req.body || {};
  if (!medicineName || typeof medicineName !== 'string' || !medicineName.trim()) {
    res.status(400).json({ error: 'Missing medicineName' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server is not configured with an API key yet.' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Medicine name: ${medicineName.trim()}` }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(502).json({ error: 'Upstream API error', detail: errText });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: 'No text in model response' });
      return;
    }

    let clean = textBlock.text.trim()
      .replace(/^```json/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      res.status(502).json({ error: 'Could not parse model output as JSON' });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: String(err) });
  }
};
