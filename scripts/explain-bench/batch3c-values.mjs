// Batch 3C stated-values check (owner 2026-11-08): recompute every number the five ML-system-design references state, from the numbers they give, and compare with the
// stated results. A mismatch is a reference defect for the tracker (Codex's text is never edited here). No model call.
// Usage: node scripts/explain-bench/batch3c-values.mjs [--tree <repo root>]   exit 1 on any mismatch
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const tree = resolve(process.argv.includes('--tree') ? process.argv[process.argv.indexOf('--tree') + 1] : '.');
const { diagramReferences } = await import(pathToFileURL(resolve(tree, 'packages/web/src/tutor-diagrams/reference-library.js')).href);
const spec = id => diagramReferences.find(ref => ref.id === id)?.spec.diagram ?? (() => { throw new Error(`reference ${id} is not registered`); })();
const num = (text, re, what) => { const m = String(text).match(re); if (!m) throw new Error(`cannot read ${what} in: ${text}`); return Number(m[1].replace(/,/g, '')); };
const rows = [];
const check = (what, stated, computed, note = '') => rows.push({ what, stated, computed, ok: Math.abs(stated - computed) < 1e-9, note });

// churn goal -> prediction -> decision: top 5% of 1,000 eligible users = 50 offers
const churn = spec('ml-churn-goal-prediction-decision');
check('offers: 5% of 1,000 eligible users', num(churn.caption, /allows (\d+) offers/, 'the stated offers'), 1000 * num(churn.nodes.at(-1).label, /(\d+)%/, 'the offer share') / 100);

// serving latency and cost: 1M entities, 2M requests/day, 500 peak QPS
const serving = spec('ml-serving-latency-cost'), cell = (id, col) => serving.rows.find(r => r.id === id).cells[col];
const load = serving.caption, entities = num(load, /([\d.,]+)M entities/, 'entities') * 1e6, requests = num(load, /([\d.,]+)M requests\/day/, 'requests per day') * 1e6, peak = num(load, /(\d+) peak QPS/, 'peak QPS');
const scoreCost = num(cell('prices', 0), /([\d.]+) USD\/M scores/, 'score price') * entities / 1e6, readCost = num(cell('prices', 0), /([\d.]+) USD\/M reads/, 'read price') * requests / 1e6;
check('batch scoring cost, USD/day', num(cell('daily-cost', 0), /\(([\d.]+) scoring/, 'stated scoring cost'), scoreCost);
check('batch lookup cost, USD/day', num(cell('daily-cost', 0), /, ([\d.]+) lookup/, 'stated lookup cost'), readCost);
check('batch cost, USD/day', num(cell('daily-cost', 0), /^([\d.]+) USD/, 'stated batch daily cost'), scoreCost + readCost);
const perReplica = num(cell('capacity', 1), /at (\d+) QPS/, 'replica QPS'), replicas = Math.ceil(peak / perReplica);
check('online replicas for the peak, rounded up', num(cell('capacity', 1), /^(\d+) replicas/, 'stated replicas'), replicas, `${peak} / ${perReplica} = ${peak / perReplica}`);
check('online cost, USD/day', num(cell('daily-cost', 1), /^([\d.]+) USD/, 'stated online daily cost'), replicas * num(cell('prices', 1), /([\d.]+) USD\/hour/, 'hourly price') * 24);
// score age: a 24 h cycle plus a 1 h job; both routes meet the 25 h staleness limit and the 40 ms latency limit
const age = num(cell('freshness', 0), /(\d+) h/, 'stated score age'), job = num(cell('capacity', 0), /^(\d+) h job/, 'job hours'), cycle = num(cell('capacity', 0), /every (\d+) h/, 'cycle hours');
check('batch max score age, h (cycle + job)', age, cycle + job);
check('the stated staleness limit equals the batch age, h', num(serving.caption, /(\d+) h staleness/, 'staleness limit'), age);
const limit = num(serving.caption, /(\d+) ms latency/, 'latency limit');
rows.push({ what: 'both routes within the latency limit', stated: `${num(cell('latency', 0), /(\d+) ms/, 'batch latency')} and ${num(cell('latency', 1), /(\d+) ms/, 'online latency')} ms`, computed: `limit ${limit} ms`, ok: num(cell('latency', 0), /(\d+) ms/, '') <= limit && num(cell('latency', 1), /(\d+) ms/, '') <= limit, note: '' });
// fallback: the reuse window is the same 25 h
const fallback = spec('ml-batch-score-fallback');
check('fallback reuse window, h', num(fallback.edges.find(e => e.to === 'last-good').label, /(\d+) h/, 'reuse window'), age);

for (const r of rows) console.log(`${r.ok ? 'ok      ' : 'MISMATCH'} ${r.what}: stated ${r.stated}, computed ${r.computed}${r.note ? ` (${r.note})` : ''}`);
const bad = rows.filter(r => !r.ok);
console.log(`RESULT ${bad.length ? 'FAIL' : 'PASS'} ${rows.length - bad.length}/${rows.length} stated values recompute`);
process.exit(bad.length ? 1 : 0);
