// This runs on Vercel's servers, never in the user's browser.
// The API key lives in an environment variable, so it's never exposed.

// --- Simple in-memory rate limiter ---
// NOTE: this resets whenever the serverless function cold-starts, and isn't
// shared across multiple concurrent instances. It's a cheap first line of
// defense against accidental abuse, not a production-grade limiter. If this
// app gets real traffic, replace with Vercel KV / Upstash Redis for a
// limiter that's consistent across instances.
const requestLog = new Map(); // ip -> [timestamps]
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60 * 60 * 1000; // per hour

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT;
}

const MAX_NAME_LENGTH = 100;

function sanitizeMedicineName(raw) {
  if (typeof raw !== 'string') return null;
  let cleaned = raw.trim().slice(0, MAX_NAME_LENGTH);
  // Strip characters with no business being in a medicine name â€” reduces
  // surface area for prompt-injection-style input.
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s\-/().,%'+]/gu, '');
  return cleaned.trim() || null;
}

function log(event, details) {
  // Vercel captures console output in Function Logs automatically â€” no
  // extra service needed to at least see what's happening in production.
  console.log(JSON.stringify({ event, time: new Date().toISOString(), ...details }));
}

const SYSTEM_PROMPT = `You are a veterinary medicine information extractor.

You may ONLY use information from trusted sources (official drug labels, regulatory agencies, manufacturer documentation, established medical references). Do not guess or use general internet knowledge you are not confident in.

Rules:
- If information is not verifiable/well-established, return "unknown".
- Do NOT provide medical advice, diagnosis, or dosage instructions.
- Only list equivalents that are confirmed to share the same active ingredient(s).
- Safety notes must be general, non-dosage warnings only (e.g. known toxicity risks, species-specific dangers) â€” never doses, frequencies, or administration instructions.
- If the medicine name given is ambiguous, misspelled beyond recognition, or could refer to multiple different products, do not guess: set "clarification_needed" to a short question asking the user to confirm which product they mean, and leave the other fields as "unknown"/empty. Otherwise set "clarification_needed" to null.
- Set "data_confidence" to "ai_estimated" for every response â€” this app does not yet verify against a live regulatory database, and the UI must be honest about that. Never set it to "verified".

Respond with ONLY a single JSON object, no markdown fences, no preamble, matching exactly this shape:
{
  "clarification_needed": "string|null",
  "data_confidence": "ai_estimated|unknown",
  "medicine": {
    "brand": "string|unknown",
    "active_ingredients": ["string"],
    "type": "veterinary|human|both|unknown"
  },
  "uses": {
    "veterinary_use": "string|unknown",
    "human_use": "string|unknown"
  },
  "equivalents": {
    "other_brands_with_same_ingredients": ["string|unknown"]
  },
  "safety": ["string"]
}

If the input does not look like a real medicine name at all, set clarification_needed to ask what medicine they meant, and set all other fields to "unknown" / empty arrays.`;

module.exports = async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (isRateLimited(ip)) {
    log('rate_limited', { ip });
    res.status(429).json({ error: 'Too many requests. Please wait a while before searching again.' });
    return;
  }

  const medicineName = sanitizeMedicineName((req.body || {}).medicineName);
  if (!medicineName) {
    res.status(400).json({ error: 'Missing or invalid medicineName' });
    return;
  }

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) {
    log('missing_api_key', { ip });
    res.status(500).json({ error: 'Server is not configured with an API key yet.' });
    return;
  }

  const startedAt = Date.now();

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
        messages: [{ role: 'user', content: `Medicine name: ${medicineName}` }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      log('upstream_error', { ip, status: response.status, detail: errText.slice(0, 300) });
      res.status(502).json({ error: 'Upstream API error' });
      return;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) {
      log('empty_response', { ip, medicineName });
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
      log('parse_error', { ip, medicineName, raw: clean.slice(0, 300) });
      res.status(502).json({ error: 'Could not parse model output as JSON' });
      return;
    }

    log('lookup_success', { ip, medicineName, ms: Date.now() - startedAt });
    res.status(200).json(parsed);
  } catch (err) {
    log('server_error', { ip, medicineName, detail: String(err).slice(0, 300) });
    res.status(500).json({ error: 'Server error' });
  }
};
