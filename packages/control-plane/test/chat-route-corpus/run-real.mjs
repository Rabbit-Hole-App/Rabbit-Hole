// CR-1: runs the frozen corpus once against the real configured JEV, through the server's own route decision (decideChat
// with the real askJev), from Node, no browser. Paid (about $0.00004 a case). Not part of node --test.
//   node test/chat-route-corpus/run-real.mjs <path to .env>   -> results.json next to the corpus
// Keys are read by name from the .env and never printed. SMALL_ENV=test: this process has no D1, so the platform spend
// ledger is skipped here; the run is recorded by hand in the Motion spend log instead. The Motion orchestrator URL is a
// placeholder so Motion counts as available: routing never calls it (the unit tests prove no fetch beyond JEV).
import { readFileSync, writeFileSync } from 'node:fs';
import { decideChat } from '../../src/chat-capability-route.js';
import { askJev } from '../../src/learn-grade-jev.js';
import { jevTransport } from '../../src/learn-inline.js';

const dir = new URL('.', import.meta.url);
const corpus = JSON.parse(readFileSync(new URL('corpus.json', dir), 'utf8'));
const keys = Object.fromEntries(readFileSync(process.argv[2], 'utf8').split(/\r?\n/).map(line => line.match(/^\s*(VERCEL_TYPESAFE_API_KEY|TYPESAFE_API_KEY)\s*=\s*"?([^"\r\n]*)"?\s*$/)).filter(Boolean).map(m => [m[1], m[2]]));
const base = { SMALL_ENV: 'test', INLINE_DECISION_KEY: 'corpus-run-local-signing-key-only', ...keys, MOTION_ORCHESTRATOR_URL: 'https://orchestrator.invalid/', MOTION_ORCHESTRATOR_TOKEN: 'placeholder-never-called-'.padEnd(48, 'x') };
const rows = [];
for (const c of corpus.cases) {
  const env = c.motionPaused ? { ...base, MOTION_GENERATION_PAUSED: '1' } : base;
  let raw = null;
  const ask = async (...args) => { const out = await askJev(...args); raw = out; return out; };
  const started = Date.now();
  const d = await decideChat(env, { email: 'corpus@example.test', app: 'canvas-corpus', requestId: `corpus-${c.id}`, fields: { app: 'canvas-corpus', text: c.text, mode: 'auto', selection: c.selection || null, source_refs: null, motion: null }, capability: null, enabled: null }, { ask });
  const answer = raw?.body?.answers?.route;
  rows.push({ id: c.id, family: c.family, owner: !!c.owner, text: c.text, expect: c.expect, route: d.route, flow: d.flow, via: d.via, agree: d.route === c.expect,
    jev_choice: answer?.choice ?? null, probability: d.probability, confidence: d.confidence, probabilities: answer?.probabilities ?? null,
    clarification: d.clarification, message: d.message, code: d.code,
    model: raw?.model ?? null, version: raw?.body?.model ?? null, transport: d.meta?.transport ?? jevTransport(env), latency_ms: raw?.ms ?? Date.now() - started, retries: raw?.retries ?? null,
    usage: raw?.body?.usage ?? null, cost_usd: raw?.cost ?? (Number.isInteger(raw?.inputTokens) ? raw.inputTokens * 0.042 / 1e6 : null) });
  console.log(`${c.id} ${rows.at(-1).agree ? 'ok  ' : 'MISS'} ${d.route} (expect ${c.expect}) p=${d.probability} c=${d.confidence} ${rows.at(-1).latency_ms} ms`);
}
const agree = rows.filter(r => r.agree).length, cost = rows.reduce((s, r) => s + (r.cost_usd || 0), 0);
const summary = { corpus: corpus.version, ran_at: new Date().toISOString(), cases: rows.length, agree, rate: agree / rows.length, owner_agree: rows.filter(r => r.owner && r.agree).length, owner_cases: rows.filter(r => r.owner).length, jev_calls: rows.filter(r => r.model).length, cost_usd: cost, misses: rows.filter(r => !r.agree).map(r => r.id) };
writeFileSync(new URL('results.json', dir), JSON.stringify({ summary, rows }, null, 2) + '\n');
console.log(JSON.stringify(summary));
