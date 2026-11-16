// FLAG-1 check. node flag1-live-check.mjs [--send]. Offline control always; --send makes ONE call per provider, no retries. Keys are read by name, never printed or written.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const SRC = 'file:///C:/s/flag1/packages/control-plane/src/';
const { prepareArtifactAuthorRequest } = await import(SRC + 'learn-artifact.js');
const { stepRequest } = await import(SRC + 'explanation-fast-chain.js');
const { planFromAnswers } = await import(SRC + 'explanation-planner.js');
const OUT = 'C:/s/sprint2-evidence/flag-1/';
const base = { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' };
const kind = 'coordinate-plot';
const plan = { ...planFromAnswers({ visualType: { choice: 'diagram', confidence: 0.95, probabilities: { diagram: 0.95 } }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9 } },
  depthTreatment: { choice: 'mechanism', confidence: 0.8, probabilities: {} }, needsPlot: { noul: 0.05 }, isPhysical: { noul: 0.02 }, needsWorkedExample: { noul: 0.1 } }), ms: 100 };
const args = 'how do heavier tailed curves compare with the normal curve?';
const build = flag => prepareArtifactAuthorRequest(flag ? { ...base, EXPLANATION_FORMULA_SAMPLER: 'on' } : base, { command: 'explanation', args, depth: 'standard', planned: true, plan });
const props = s => (!s || typeof s !== 'object' ? 0 : Object.keys(s.properties ?? {}).length + Object.values(s).reduce((n, c) => n + props(c), 0));
const steps = { google: { provider: 'google', model: 'gemini-3.5-flash-lite' }, cerebras: { provider: 'cerebras', model: 'gpt-oss-120b' } };
const urls = { google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', cerebras: 'https://api.cerebras.ai/v1/chat/completions' };
const keyNames = { google: 'GEMINI_API_KEY', cerebras: 'CEREBRAS_API_KEY' };
const prices = { google: [0.3, 2.5], cerebras: [0.35, 0.75] }; // USD per M tokens, packages/control-plane/src/pricing-registry.js
// find series items schema (first object with an 'items' that has anyOf containing a formula property) for the control
const findSeries = s => { if (!s || typeof s !== 'object') return null; if (s.properties?.series?.items) return s.properties.series.items; for (const v of Object.values(s)) { const r = findSeries(v); if (r) return r; } return null; };

const on = build(true), off = build(false);
const control = {};
const bodies = {};
for (const [p, step] of Object.entries(steps)) {
  const bOn = stepRequest(step, 'low', on.body), bOff = stepRequest(step, 'low', off.body);
  const sOn = JSON.stringify(bOn.response_format.json_schema.schema);
  const items = findSeries(bOn.response_format.json_schema.schema), itemsOff = findSeries(bOff.response_format.json_schema.schema);
  control[p] = { model: step.model, planned_kind: kind, flag_on_has_formula_string: sOn.includes('"formula"'), flag_on_series_items_has_anyOf: !!items?.anyOf, flag_on_series_items_keys: items ? Object.keys(items) : null,
    flag_off_series_items_plain_object: !!itemsOff && !itemsOff.anyOf && itemsOff.type === 'object', flag_off_series_items_keys: itemsOff ? Object.keys(itemsOff) : null,
    property_count_flag_on: props(bOn.response_format.json_schema.schema), property_count_flag_off: props(bOff.response_format.json_schema.schema), gemini_limit: 362,
    flag_off_has_formula_string: JSON.stringify(bOff.response_format.json_schema.schema).includes('"formula"'), body_bytes: JSON.stringify(bOn).length, original_max_tokens: bOn.max_tokens, stream: bOn.stream };
  bodies[p] = { ...bOn, max_tokens: 400, stream: false };
}
fs.writeFileSync(OUT + 'control.json', JSON.stringify(control, null, 2));
console.log(JSON.stringify(control, null, 2));
if (!process.argv.includes('--send')) process.exit(0);

const envText = fs.readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
const getKey = name => { const m = envText.split(/\n/).map(l => l.replace(/\r$/, '')).find(l => l.startsWith(name + '=')); return m ? m.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : ''; };
const results = [];
for (const p of ['google', 'cerebras']) {
  const key = getKey(keyNames[p]);
  const r = { provider: p, model: steps[p].model, key_name: keyNames[p], url: urls[p], max_tokens_sent: 400 };
  if (!key) { r.skipped = 'key name absent or empty in .env'; results.push(r); continue; }
  const redact = t => String(t).split(key).join('[REDACTED]');
  try {
    const res = await fetch(urls[p], { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-flag1-check' }, body: JSON.stringify(bodies[p]) });
    const text = await res.text();
    r.http_status = res.status; r.accepted = res.status === 200 ? 'yes' : 'no';
    let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    if (res.status !== 200) r.error_text = redact(text).slice(0, 3000);
    else { const u = j?.usage ?? {}; r.finish_reason = j?.choices?.[0]?.finish_reason; r.input_tokens = u.prompt_tokens; r.output_tokens = u.completion_tokens; r.total_tokens = u.total_tokens; r.content_head = redact(String(j?.choices?.[0]?.message?.content ?? '')).slice(0, 300);
      const out = Math.max(u.completion_tokens ?? 0, (u.total_tokens ?? 0) - (u.prompt_tokens ?? 0)); r.estimated_usd = +(((u.prompt_tokens ?? 0) * prices[p][0] + out * prices[p][1]) / 1e6).toFixed(6); }
  } catch (e) { r.accepted = 'no'; r.error_text = redact(e?.message ?? e); }
  results.push(r);
}
fs.writeFileSync(OUT + 'live-check.json', JSON.stringify({ date: '2026-11-16', approved_cap_usd: 0.05, calls_per_provider: 1, retries: 0, flag: 'EXPLANATION_FORMULA_SAMPLER=on', commit: '72a6bf353', results, control }, null, 2));
console.log(JSON.stringify(results, null, 2));
