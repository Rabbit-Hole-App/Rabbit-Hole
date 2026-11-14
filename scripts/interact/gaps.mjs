#!/usr/bin/env node
// scripts/interact/gaps.mjs (brief 19): which prompts did the fast path refuse ("This kind of scene isn't supported yet.") and what scene would they need?
// Reads docs/features/interact/benchmarks/ledger.jsonl, keeps the rows with designFallback = 'gap' (or stopReason design_gap) and groups them by NEAREST MECHANISM:
// the highest-probability non-none family of the stored pickProbabilities when it is above 0.2; otherwise (no such probability, or the pick timed out) the prompt is classified with the
// seven-criterion coverage question (JEV only, the criteria of scripts/interact/bench-coverage.mjs; key TYPESAFE_API_KEY by name from small-deploy/.env, never printed).
//   node scripts/interact/gaps.mjs [--ledger <file>] [--offline] [--json]       --offline: no classification call, rows without a usable probability group as `unclassified`
import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickFamily } from '../../packages/control-plane/src/interact-design-pick.js';
import { MECHANISMS } from './bench-coverage.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LEDGER = join(REPO, 'docs/features/interact/benchmarks/ledger.jsonl');
const FLOOR = 0.2;

export const isGap = row => row?.designFallback === 'gap' || row?.stopReason === 'design_gap';
const probsOf = row => { try { return row.pickProbabilities ? JSON.parse(row.pickProbabilities) : null; } catch { return null; } };
// The two highest probabilities, `none` included, as [id, p] pairs.
export const topTwo = probs => Object.entries(probs ?? {}).filter(([, p]) => typeof p === 'number').sort((a, b) => b[1] - a[1]).slice(0, 2);
// -> the stored mechanism (a family id) when its probability is above the floor, else null.
export const nearestStored = probs => { const best = topTwo(Object.fromEntries(Object.entries(probs ?? {}).filter(([id]) => id !== 'none')))[0]; return best && best[1] > FLOOR ? best[0] : null; };

// rows -> { total, groups: [{ mechanism, count, items: [{ prompt, depth, top, via }] }] }. classify(prompt) -> a mechanism id or null (the seven-way question); absent = offline.
export async function groupGaps(rows, classify = null) {
  const items = [];
  for (const row of rows.filter(isGap)) {
    const probs = probsOf(row), stored = nearestStored(probs);
    let mechanism = stored, via = stored ? 'stored' : null;
    if (!mechanism && classify && row.prompt) { const c = await classify(row.prompt); if (c) { mechanism = c; via = 'classified'; } }
    items.push({ mechanism: mechanism ?? 'unclassified', prompt: row.prompt ?? '', depth: row.depth ?? null, top: topTwo(probs), via: via ?? 'none', reason: row.pickConfidence == null && !probs ? 'no probabilities (a timeout or no key)' : undefined });
  }
  const by = new Map();
  for (const it of items) { if (!by.has(it.mechanism)) by.set(it.mechanism, []); by.get(it.mechanism).push(it); }
  const groups = [...by.entries()].map(([mechanism, list]) => ({ mechanism, count: list.length, items: list })).sort((a, b) => b.count - a.count || a.mechanism.localeCompare(b.mechanism));
  return { total: items.length, groups };
}

export const printGroups = ({ total, groups }) => {
  const lines = [`${total} gap${total === 1 ? '' : 's'}`];
  for (const g of groups) {
    lines.push('', `## ${g.mechanism}: ${g.count}`);
    for (const it of g.items) lines.push(`- [${it.depth ?? '-'}] ${it.prompt || '(no prompt recorded)'}  | top: ${it.top.map(([id, p]) => `${id} ${p}`).join(', ') || 'none'}${it.via === 'classified' ? ' | classified' : ''}`);
  }
  return lines.join('\n');
};

function key(name) {
  const text = readFileSync('C:/Users/cyudhist/Desktop/workspace/small-deploy/.env', 'utf8');
  return (text.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

async function main() {
  const { values: a } = parseArgs({ options: { ledger: { type: 'string', default: LEDGER }, offline: { type: 'boolean', default: false }, json: { type: 'boolean', default: false } } });
  if (!existsSync(a.ledger)) throw new Error(`no ledger at ${a.ledger}`);
  const rows = readFileSync(a.ledger, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  let classify = null;
  if (!a.offline) {
    const env = { TYPESAFE_API_KEY: key('TYPESAFE_API_KEY') };
    if (!env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is not in small-deploy/.env: use --offline to group by the stored probabilities only');
    classify = async prompt => { const r = await pickFamily(env, { request: prompt, depth: 'balanced' }, { families: MECHANISMS, threshold: 0, timeoutMs: 8000 }); return r.family ?? (r.reason === 'none' ? 'none' : null); };
  }
  const out = await groupGaps(rows, classify);
  console.log(a.json ? JSON.stringify(out, null, 2) : printGroups(out));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main().catch(error => { console.error(`gaps: ${error.message}`); process.exit(1); });
