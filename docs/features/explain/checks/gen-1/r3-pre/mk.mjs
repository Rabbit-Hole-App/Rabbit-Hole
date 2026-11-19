// R3-pre builder: cells.json (REF side, saved), plan.json (PLAN arm items), trees/plan (copy of the R1 AFTER tree with planWithReferenceKind switched off), run.mjs (R1 harness adapted). No provider call.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const R1 = 'C:/s/sprint2-evidence/gen1-r1-bench/', OUT = 'C:/s/gen1-r3pre/';
// 1. the 29 set-A cells, REF = the saved AFTER rep-1 record
const rows = fs.readFileSync(R1 + 'results.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const refs = rows.filter(r => r.setTag === 'A' && r.arm === 'after' && r.rep === 1);
if (refs.length !== 29) throw new Error('expected 29 set-A rep-1 AFTER records, got ' + refs.length);
const cells = refs.map((r, i) => ({ cell: i + 1, prompt: r.prompt, depth: r.depth, plannerKind: r.plannerKind, references: r.references, shapeId: r.shapeId, finalKinds: r.finalKinds, delivered: r.delivered, diagrams: r.diagrams ?? [], r1Idx: r.idx }));
fs.writeFileSync(OUT + 'cells.json', JSON.stringify(cells, null, 1));
fs.writeFileSync(OUT + 'plan.json', JSON.stringify({ meta: { source: 'R1 bench set A, AFTER rep 1 prompts', arm: 'plan', cells: 29 }, items: cells.map(c => ({ idx: c.cell, set: 'P', prompt: c.prompt, depth: c.depth, rep: 1, profile: 'google-low' })) }, null, 1));
// 2. the PLAN tree: a copy of the R1 AFTER tree, the two call sites of planWithReferenceKind made identity (the reference is still selected and sent as an example)
const dest = OUT + 'trees/plan';
if (!fs.existsSync(dest)) { fs.mkdirSync(dest, { recursive: true }); fs.cpSync('C:/s/gen1-r1-trees/after/packages', dest + '/packages', { recursive: true }); }
const la = dest + '/packages/control-plane/src/learn-artifact.js';
let t = fs.readFileSync(la, 'utf8');
const site = 'input = planWithReferenceKind(input);';
const n = t.split(site).length - 1;
if (n !== 2) throw new Error('expected 2 call sites, found ' + n);
t = t.split(site).join('/* R3-pre harness only: the reference override is off, the planner kind is the plan kind */');
fs.writeFileSync(la, t);
// 3. the harness
let h = fs.readFileSync(R1 + 'run.mjs', 'utf8');
const rep = (a, b) => { if (!h.includes(a)) throw new Error('missing: ' + a.slice(0, 60)); h = h.replace(a, () => b); };
rep("default: 'C:/s/sprint2-evidence/gen1-r1-bench/plan.json'", "default: 'C:/s/gen1-r3pre/plan.json'");
rep("cap: { type: 'string', default: '1.74' }", "cap: { type: 'string', default: '0.30' }");
rep("trees: { type: 'string', default: 'C:/s/gen1-r1-trees' }", "trees: { type: 'string', default: 'C:/s/gen1-r3pre/trees' }");
rep("arms: { type: 'string', default: 'before,after' }", "arms: { type: 'string', default: 'plan' }");
rep("numeric.length !== 217 || !['google-low', 'fireworks-low'].includes(plan.items[0].profile)", "numeric.length !== 29 || plan.items.some(i => i.profile !== 'google-low')");
rep('plannerKind: trace.plannerKind ?? null,', "plannerKind: trace.plannerKind ?? null, planKind: trace.plan?.kind ?? null, planKindSource: trace.plan?.kindSource ?? null, planFixed: trace.plan?.fixed ?? null, planProbabilities: trace.plan?.probabilities?.kind ?? null, planConfidence: trace.plan?.confidence?.kind ?? null, planMs: trace.plan?.ms ?? null, plannerTimedOut: !trace.plan || events.some(e => e.event === 'explanation_planner_failed'),");
const lines = h.split('\n');
const i1 = lines.findIndex(l => l.includes('stop line US$${a.cap} settled (estimate')), i2 = lines.findIndex(l => l.includes('plan ok: ${numeric.length}'));
if (i1 < 0 || i2 < 0) throw new Error('dry-run lines not found');
lines[i1] = "  console.log(`stop line US$${a.cap} settled (estimate US$${(plan.items.length * 0.0033).toFixed(2)} = ${plan.items.length} runs x US$0.0033; stop line = estimate + 20 %, here the cap given); PLAN arm only: the reference override is OFF in the tree copy (planWithReferenceKind identity at its two call sites), the reference is still sent as an example`);";
lines[i2] = "  console.log(`plan ok: ${numeric.length} cells x 1 run (arm plan, google-low) = ${numeric.length} runs; est. US$${(numeric.length * 0.0033).toFixed(3)}; NO provider call made`);";
fs.writeFileSync(OUT + 'run.mjs', lines.join('\n'));
console.log('built: cells.json, plan.json, trees/plan, run.mjs');
