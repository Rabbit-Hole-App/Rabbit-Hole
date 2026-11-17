// Step 1+3: write prompt.txt, probe the Gemini key once, then 12 serial script calls (one each, no retry).
import fs from 'node:fs';
import { key, redact } from '../aud-1/lib.mjs';
import { SYSTEM, userMessage } from './prompt.mjs';
const D = 'C:/s/sprint2-evidence/aud-2/';
const cards = JSON.parse(fs.readFileSync(D + 'cards.json', 'utf8'));
fs.writeFileSync(D + 'prompt.txt', `=== SYSTEM ===\n${SYSTEM}\n\n=== USER (template; filled per card from cards.json) ===\n${userMessage({ depthLabel: '<Brief|Balanced|Detailed>', question: '<learner question>', title: '<card title>', body: '<card body prose, visual fences removed>', visualLabels: ['<visual label>', '<visual label>'] })}\n`);

const GK = key('GEMINI_API_KEY'), FK = key('FIREWORKS_API_KEY');
const keys = [GK, FK];
const GOOGLE = { provider: 'google', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-3.5-flash-lite', key: GK, max_tokens: 4000, price: [0.3, 2.5] };
const FIRE = { provider: 'fireworks', url: 'https://api.fireworks.ai/inference/v1/chat/completions', model: 'accounts/fireworks/models/gpt-oss-120b', key: FK, max_tokens: 6000, price: [0.15, 0.6] };

async function call(step, messages) {
  const body = { model: step.model, max_tokens: step.max_tokens, reasoning_effort: 'low', messages,
    response_format: { type: 'json_schema', json_schema: { name: 'audio_script', strict: false, schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } } } };
  const t0 = Date.now();
  const r = await fetch(step.url, { method: 'POST', headers: { Authorization: `Bearer ${step.key}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-audit/1' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const text = await r.text();
  return { http: r.status, ms: Date.now() - t0, text: redact(text, keys) };
}

// probe: one tiny call on the Gemini key (same response_format), no retry
let step = GOOGLE, probe;
try { probe = await call(GOOGLE, [{ role: 'user', content: 'Return {"script":"ok"}' }]); } catch (e) { probe = { http: 0, ms: 0, text: redact(String(e), keys) }; }
console.log('probe', probe.http, probe.text.slice(0, 200));
let fellBack = false;
if (probe.http === 429) { step = FIRE; fellBack = true; }
else if (probe.http !== 200) { console.log('probe failed with non-429; stopping, not falling back'); fs.writeFileSync(D + 'probe.json', JSON.stringify(probe, null, 1)); process.exit(1); }
fs.writeFileSync(D + 'probe.json', JSON.stringify({ probe, fellBack, using: step.provider + ' ' + step.model }, null, 1));

const out = [];
let usd = 0;
for (const c of cards) {
  let res;
  try { res = await call(step, [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMessage(c) }]); } catch (e) { res = { http: 0, ms: 0, text: redact(String(e), keys) }; }
  let script = null, usage = null, model = null, finish = null, err = null;
  try { const j = JSON.parse(res.text); usage = j.usage ?? null; model = j.model ?? null; finish = j.choices?.[0]?.finish_reason ?? null;
    const content = j.choices?.[0]?.message?.content ?? ''; try { script = JSON.parse(content).script; } catch { err = 'unparsable content: ' + content.slice(0, 300); }
    if (j.error || (Array.isArray(j) && j[0]?.error)) err = JSON.stringify(j.error ?? j[0].error).slice(0, 400); } catch { err = res.text.slice(0, 400); }
  if (res.http !== 200 && !err) err = 'HTTP ' + res.http;
  const words = script ? script.trim().split(/\s+/).length : 0;
  const cost = usage ? (usage.prompt_tokens * step.price[0] + (usage.completion_tokens ?? 0) * step.price[1]) / 1e6 : 0;
  usd += cost;
  out.push({ n: c.n, id: c.id, title: c.title, question: c.question, depth: c.depth, depthLabel: c.depthLabel, provider: step.provider, requestedModel: step.model, answeredModel: model, http: res.http, ms: res.ms, finish, usage, usd: +cost.toFixed(6), words, script, error: err });
  console.log(c.n, c.id, c.depthLabel, res.http, res.ms + 'ms', words + 'w', err ? 'ERR ' + err.slice(0, 120) : '');
}
fs.writeFileSync(D + 'scripts.json', JSON.stringify(out, null, 1));
console.log('script spend USD', usd.toFixed(5), 'provider', step.provider);
