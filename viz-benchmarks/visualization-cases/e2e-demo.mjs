// Dev-only end-to-end demo of the /explain M3 flow on real calls:
//   prompt -> author (Lane C authorStage, claude-opus-5-5) -> trusted validate + compile (validateStage)
//   -> [repairStage while refused, shared 3-round ceiling] -> render both themes (production render entry)
//   -> independent image review (explain-review.js, separate semantic and visual verdicts)
//   -> [hint/spec repair on findings, re-render, re-review, same ceiling].
// Then, with zero model calls: every declared experiment input and step state rendered, and a save/reload round trip
// (the card block serialized, parsed and re-rendered must give the same pixels).
// Needs a tree with explain/c-t19 (author, validate, repair), explain/a-* components and explain/d-t18; build first:
//   cd packages/web && npm run build -- --outDir dist-render
//   node e2e-demo.mjs <runId> "<prompt>" --cap-usd <n> [--out C:/s/spec/explain/renders/e2e]
// Paid: plan the row in spend.md first. Every call is recorded (requested/served model, tokens, cost, latency).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { anthropicTransport, readKeys, recordingModel } from './baseline.mjs';
import { HERE } from './cases.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const cap = Number(flag('--cap-usd')), outRoot = flag('--out', 'C:/s/spec/explain/renders/e2e');
const [runId, prompt] = args;
if (!runId || !prompt || !(cap > 0)) { console.error('usage: node e2e-demo.mjs <runId> "<prompt>" --cap-usd <n>'); process.exit(1); }
const out = join(outRoot, runId);
if (existsSync(out)) throw new Error(`${out} exists`);

const cp = name => import(`../../packages/control-plane/src/${name}`);
const { authorStage, validateStage } = await cp('explain-author.js');
const { repairStage } = await cp('explain-repair.js').catch(() => ({ repairStage: null }));
const { callExplainRole, EXPLAIN_LIMITS } = await cp('explain-policy.js');
const { MODEL_PRICES } = await cp('learn-models.js');
const { reviewCaptures } = await cp('explain-review.js');
const { compiledHash } = await cp('explain-render.js');
const { captureScene } = await import('../../packages/web/e2e/viz-benchmark-capture.mjs');
const dist = join(HERE, '..', '..', 'packages', 'web', 'dist-render');

const keys = readKeys(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID']);
const env = { SMALL_ENV: 'test' };
const { callModel, ledger } = recordingModel(anthropicTransport(keys), { capUsd: cap, prices: MODEL_PRICES });
const ctx = { env, call: (role, request) => callExplainRole(env, role, request, { callModel }) };
mkdirSync(out, { recursive: true });
const save = (name, value) => writeFileSync(join(out, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const stages = [];
const timed = async (stage, fn) => { const t = Date.now(); try { return await fn(); } finally { stages.push({ stage, ms: Date.now() - t, calls: ledger.calls.length }); } };

const job = { prompt, round: 0, findings: [], captures: [], examples: [], evidence: [] };
let result = 'unknown';
const authored = await timed('author', () => authorStage(job, ctx));
if (authored.gap) result = 'gap';
let spec = authored.spec || null;
let compiled = null, accepted = false, review = null;
while (spec && result === 'unknown') {
  save(`spec-r${job.round}.json`, spec);
  const checked = await timed(`validate-r${job.round}`, async () => validateStage({ ...job, spec }));
  if (checked.gap) { result = 'gap'; job.gap = checked.gap; break; }
  if (checked.problems) {
    job.findings.push({ problems: checked.problems });
    if (!repairStage || job.round >= EXPLAIN_LIMITS.correctionRounds) { result = 'invalid'; break; }
    const repaired = await timed(`repair-r${job.round + 1}`, () => repairStage({ ...job, spec }, ctx));
    job.round++;
    if (!repaired.progress) { result = 'repair_stopped'; job.stop = repaired; break; }
    spec = repaired.spec;
    continue;
  }
  compiled = checked.compiled;
  save(`compiled-scene-r${job.round}.json`, compiled.scene);
  const hash = await compiledHash(compiled.scene);
  const rendered = await timed(`render-r${job.round}`, () => captureScene(compiled.scene, [{ id: `light-r${job.round}`, theme: 'light' }, { id: `dark-r${job.round}`, theme: 'dark' }], { dist }));
  for (const c of rendered.captures) writeFileSync(join(out, `${c.id}.png`), c.png);
  job.captures = rendered.captures.map(c => ({ id: c.id, compiledHash: hash, theme: c.theme, time: c.time, inputs: c.inputs, png: c.png, data: Buffer.from(c.png).toString('base64'), mediaType: 'image/png' }));
  review = await timed(`review-r${job.round}`, () => reviewCaptures({ request: prompt, compiledHash: hash, captures: job.captures }, { callRole: ctx.call }).catch(error => ({ error: `${error.code || ''} ${error.message}` })));
  save(`review-r${job.round}.json`, review);
  if (review.error) { result = 'review_failed'; break; }
  if (review.accepted) { accepted = true; result = 'accepted'; break; }
  // Lane C's repair reads target.state as the capture id.
  const findings = review.captures.flatMap(c => c.findings.map(f => ({ ...f, target: { ...f.target, state: c.captureId } })));
  job.findings.push({ findings });
  if (!repairStage || job.round >= EXPLAIN_LIMITS.correctionRounds) { result = 'not_accepted'; break; }
  const repaired = await timed(`repair-r${job.round + 1}`, () => repairStage({ ...job, spec }, ctx));
  job.round++;
  if (!repaired.progress) { result = 'repair_stopped'; job.stop = repaired; break; }
  spec = repaired.spec;
}

// Zero-model-call interaction checks on the final compiled scene: each declared input value and step, and save/reload.
const local = { states: [], saveReload: null, modelCallsDuring: null };
if (compiled) {
  const before = ledger.calls.length;
  const scene = compiled.scene;
  const states = [];
  for (const input of scene.inputs || []) {
    const values = input.type === 'bool' ? [true, false] : input.type === 'index' ? [...Array((scene.exampleData?.[input.of] || []).length).keys()] : input.values || [input.min, input.max].filter(v => v !== undefined);
    for (const value of values.slice(0, 6)) states.push({ id: `input-${input.name}-${value}`, inputs: { [input.name]: value }, theme: 'light' });
  }
  for (const time of [0, scene.duration / 2]) if (scene.duration) states.push({ id: `time-${time}`, time, theme: 'light' });
  if (states.length) {
    const r = await timed('interaction-states', () => captureScene(scene, states, { dist }));
    for (const c of r.captures) { writeFileSync(join(out, `${c.id}.png`), c.png); local.states.push({ id: c.id, aliases: c.aliases, sha256: c.sha256 }); }
  }
  const block = { type: 'animation', title: scene.title, scene, inputs: states.find(s => s.inputs)?.inputs || {}, time: scene.duration };
  const reloaded = JSON.parse(JSON.stringify(block));
  const [a, b] = await Promise.all([block, reloaded].map(x => captureScene(x.scene, [{ id: 'state', inputs: x.inputs, time: x.time }], { dist })));
  local.saveReload = { sameSceneJson: JSON.stringify(block) === JSON.stringify(reloaded), samePixels: a.captures[0].sha256 === b.captures[0].sha256, sha256: a.captures[0].sha256 };
  local.modelCallsDuring = ledger.calls.length - before;
}

const record = {
  runId, prompt, result, accepted, rounds: job.round, gap: job.gap || authored.gap || null, stop: job.stop || null,
  presentation: spec?.presentation ?? null, components: spec?.components?.map(c => c.component) ?? null,
  stages, interaction: local,
  calls: ledger.calls.map(({ request, ...c }) => c), spentUsd: +ledger.spentUsd.toFixed(4), unknownCost: ledger.unknownCost,
  reviewSummary: review?.captures?.map(c => ({ capture: c.captureId, semantic: c.semantic, visual: c.visual, findings: c.findings.map(f => `${f.verdict}/${f.severity}/${f.category}: ${f.message}`) })) ?? null,
};
save('record.json', record);
console.log(JSON.stringify({ out, result, rounds: record.rounds, presentation: record.presentation, components: record.components, spentUsd: record.spentUsd, stages, interaction: local, review: record.reviewSummary }, null, 2));
