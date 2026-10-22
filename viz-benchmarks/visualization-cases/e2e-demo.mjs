// Dev-only end-to-end demo: prompt -> T17 author (Lane C explain-author.js authorExplanation, claude-opus-5-5)
// -> trusted validate + compileVisual -> production render entry (both themes) -> optional T18 image review.
// Needs a tree that contains explain/c-t17 and the render entry (explain/d-render), built with
// `cd packages/web && npm run build -- --outDir dist-render`. Paid: plan the rows in spend.md first.
//   node e2e-demo.mjs <runId> "<prompt>" --cap-usd <n> [--review] [--out C:/s/spec/explain/renders/e2e]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { anthropicTransport, readKeys, recordingModel } from './baseline.mjs';
import { HERE } from './cases.mjs';
import { directCallRole } from './seeded-review.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const review = args.includes('--review') && args.splice(args.indexOf('--review'), 1);
const cap = Number(flag('--cap-usd')), outRoot = flag('--out', 'C:/s/spec/explain/renders/e2e');
const [runId, prompt] = args;
if (!runId || !prompt || !(cap > 0)) { console.error('usage: node e2e-demo.mjs <runId> "<prompt>" --cap-usd <n> [--review]'); process.exit(1); }
const out = join(outRoot, runId);
if (existsSync(out)) throw new Error(`${out} exists`);

const { authorExplanation } = await import('../../packages/control-plane/src/explain-author.js').catch(() => { throw new Error('explain-author.js not in this tree: run from a tree with explain/c-t17'); });
const { MODEL_PRICES } = await import('../../packages/control-plane/src/learn-models.js');
const { captureScene } = await import('../../packages/web/e2e/viz-benchmark-capture.mjs');
const { reviewCaptures } = await import('../../packages/control-plane/src/explain-review.js');
const { compiledHash } = await import('../../packages/control-plane/src/explain-render.js');

const keys = readKeys(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID']);
const { callModel, ledger } = recordingModel(anthropicTransport(keys), { capUsd: cap, prices: MODEL_PRICES });
const started = Date.now();
mkdirSync(out, { recursive: true });
const authored = await authorExplanation(prompt, { env: { SMALL_ENV: 'test' }, callModel });
const record = { runId, prompt, kind: authored.kind, identity: authored.identity, timings: { authorMs: Date.now() - started } };
writeFileSync(join(out, 'author.json'), JSON.stringify({ ...authored, compiled: undefined }, null, 2));
if (authored.kind === 'spec') {
  writeFileSync(join(out, 'compiled-scene.json'), JSON.stringify(authored.compiled.scene, null, 2));
  const t = Date.now();
  const rendered = await captureScene(authored.compiled.scene, [{ id: 'light', theme: 'light' }, { id: 'dark', theme: 'dark' }], { dist: join(HERE, '..', '..', 'packages', 'web', 'dist-render') });
  record.timings.renderMs = Date.now() - t;
  for (const c of rendered.captures) writeFileSync(join(out, `${c.id}.png`), c.png);
  if (review) {
    const hash = await compiledHash(authored.compiled.scene);
    const r = Date.now();
    record.review = await reviewCaptures({ request: prompt, compiledHash: hash, captures: rendered.captures.map(c => ({ id: c.id, compiledHash: hash, theme: c.theme, time: c.time, inputs: c.inputs, png: c.png })) }, { callRole: directCallRole(callModel) }).catch(error => ({ error: `${error.code || ''} ${error.message}` }));
    record.timings.reviewMs = Date.now() - r;
  }
}
record.calls = ledger.calls.map(({ request, ...c }) => c);
record.spentUsd = +ledger.spentUsd.toFixed(4);
writeFileSync(join(out, 'record.json'), JSON.stringify(record, null, 2));
console.log(JSON.stringify({ out, kind: authored.kind, gap: authored.gap, problems: authored.problems, spentUsd: record.spentUsd, timings: record.timings, review: record.review && { accepted: record.review.accepted, verdicts: record.review.captures?.map(c => `${c.captureId}:${c.semantic}/${c.visual}`), error: record.review.error } }, null, 2));
