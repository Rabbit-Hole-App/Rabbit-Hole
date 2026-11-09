// Provider pre-flight (owner 2026-11-09): one probe per provider before any paid run. A failing probe makes the run INVALID (a provider outage), never FAILED (code or prompt).
// Keys are read by name from the credentials file or the stack's .dev.vars and are never printed.
import { readFileSync, existsSync } from 'node:fs';
import { QUESTIONS } from './planner.mjs';

const ENV_FILE = 'C:/Users/cyudhist/Desktop/workspace/small-deploy/.env';
const unq = s => (s || '').trim().replace(/^["']|["']$/g, '');
const named = (text, k) => unq((text.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]);
const T = 20000;

export async function preflight({ varsFile, only } = {}) {
  const cred = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
  const vars = varsFile && existsSync(varsFile) ? readFileSync(varsFile, 'utf8') : '';
  const key = k => named(vars, k) || named(cred, k);
  const redact = (s, ks) => ks.reduce((t, k) => (k ? t.split(k).join('<key>') : t), String(s)).slice(0, 160);
  const probes = {
    recraft: async k => { const r = await fetch('https://external.api.recraft.ai/v1/images/generations', { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'a red circle on white', model: 'recraftv4_1_flash', size: '1024x1024', n: 1 }), signal: AbortSignal.timeout(T) }); return [r.status, await r.text()]; },
    judge: async k => { const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 8, messages: [{ role: 'user', content: 'ok' }] }), signal: AbortSignal.timeout(T) }); return [r.status, await r.text()]; },
    fireworks: async k => { const r = await fetch('https://api.fireworks.ai/inference/v1/models?page_size=1', { headers: { Authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(T) }); return [r.status, await r.text()]; },
    gemini: async k => { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ model: 'gemini-3.5-flash-lite', messages: [{ role: 'user', content: 'Say ok.' }], max_tokens: 20 }), signal: AbortSignal.timeout(T) }); return [r.status, await r.text()]; },
    jev: async k => { const r = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', 'User-Agent': 'rabbit-hole-bench/1' }, body: JSON.stringify({ model: 'jev-latest', state: { question: 'what is a volcano', depth: 'standard', context: null }, questions: QUESTIONS }), signal: AbortSignal.timeout(T) }); return [r.status, await r.text()]; },
  };
  const keys = { recraft: 'RECRAFT_API_KEY', judge: 'ANTHROPIC_API_KEY', fireworks: 'FIREWORKS_API_KEY', gemini: 'GEMINI_API_KEY', jev: 'TYPESAFE_API_KEY' };
  const results = [];
  for (const name of Object.keys(probes).filter(n => !only || only.includes(n))) {
    const k = key(keys[name]);
    if (!k) { results.push({ name, ok: false, detail: `${keys[name]} missing` }); continue; }
    try { const [status, body] = await probes[name](k); results.push({ name, ok: status >= 200 && status < 300, detail: `http ${status}${status >= 300 ? ` ${redact(body, [k])}` : ''}` }); }
    catch (e) { results.push({ name, ok: false, detail: redact(e?.message || e, [k]) }); }
  }
  return { ok: results.every(r => r.ok), results };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('preflight.mjs')) {
  const i = process.argv.indexOf('--vars');
  const r = await preflight({ varsFile: i > 0 ? process.argv[i + 1] : null });
  for (const x of r.results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}: ${x.detail}`);
  console.log(r.ok ? 'PREFLIGHT: OK' : 'PREFLIGHT: INVALID (a provider is down; the run would be invalid, not failed)');
  process.exit(r.ok ? 0 : 4);
}
