// Phase B runner: V1-V3 on Fireworks (low) and Gemini, V4 (= V3 prompt, effort medium) on Fireworks. One call per card per variant, serial, no retry.
import fs from 'node:fs';
import { key, redact } from '../aud-1/lib.mjs';
import { variantMessages } from './variants-prompts.mjs';
const D = 'C:/s/sprint2-evidence/aud-2/';
const cards = JSON.parse(fs.readFileSync(D + 'cards.json', 'utf8'));
const TRIAL = [1, 4, 5, 6, 7, 9, 10, 11, 12];
const GK = key('GEMINI_API_KEY'), FK = key('FIREWORKS_API_KEY'), keys = [GK, FK];
const MODELS = {
  fireworks: { url: 'https://api.fireworks.ai/inference/v1/chat/completions', model: 'accounts/fireworks/models/gpt-oss-120b', key: FK, max_tokens: 6000, price: [0.15, 0.6] },
  gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-3.5-flash-lite', key: GK, max_tokens: 4000, price: [0.3, 2.5] },
};
const MODE = process.argv[2] || 'v1-v4', OUT = D + (MODE === 'v5' ? 'variants-v5.json' : MODE === 'v6' ? 'variants-v6.json' : 'variants.json');
const PLAN = MODE === 'v5' ? [['fireworks', 'V5', 'low'], ['gemini', 'V5', 'low']] : MODE === 'v6' ? [['gemini', 'V6', 'low']] : [['fireworks', 'V1', 'low'], ['fireworks', 'V2', 'low'], ['fireworks', 'V3', 'low'], ['fireworks', 'V4', 'medium'], ['gemini', 'V1', 'low'], ['gemini', 'V2', 'low'], ['gemini', 'V3', 'low']];
async function call(m, messages, effort) {
  const body = { model: m.model, max_tokens: m.max_tokens, reasoning_effort: effort, messages,
    response_format: { type: 'json_schema', json_schema: { name: 'audio_script', strict: false, schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } } } };
  const t0 = Date.now();
  const r = await fetch(m.url, { method: 'POST', headers: { Authorization: `Bearer ${m.key}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-audit/1' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  return { http: r.status, ms: Date.now() - t0, text: redact(await r.text(), keys) };
}
const out = []; let usd = 0;
for (const [provider, variant, effort] of PLAN) for (const n of TRIAL) {
  const card = cards[n - 1], m = MODELS[provider];
  let res; try { res = await call(m, variantMessages(variant === 'V4' ? 'V3' : variant, card), effort); } catch (e) { res = { http: 0, ms: 0, text: redact(String(e), keys) }; }
  let script = null, usage = null, finish = null, error = null, answered = null;
  try { const j = JSON.parse(res.text); usage = j.usage ?? null; finish = j.choices?.[0]?.finish_reason ?? null; answered = j.model ?? null; const content = j.choices?.[0]?.message?.content ?? '';
    try { script = JSON.parse(content).script; } catch { error = 'unparsable content: ' + content.slice(0, 200); } if (j.error || (Array.isArray(j) && j[0]?.error)) error = JSON.stringify(j.error ?? j[0].error).slice(0, 300); } catch { error = res.text.slice(0, 300); }
  const cost = usage ? (usage.prompt_tokens * m.price[0] + (usage.completion_tokens ?? 0) * m.price[1]) / 1e6 : 0; usd += cost;
  out.push({ provider, variant, effort, n, id: card.id, depthLabel: card.depthLabel, http: res.http, ms: res.ms, answered, finish, usage, reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens ?? null, usd: +cost.toFixed(6), words: script ? script.trim().split(/\s+/).length : 0, script, error });
  console.log(provider, variant, n, card.id, res.http, script ? script.trim().split(/\s+/).length + 'w' : 'NONE', finish, error ? 'ERR ' + error.slice(0, 80) : '');
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
}
console.log('variants spend USD', usd.toFixed(5), 'calls', out.length);
