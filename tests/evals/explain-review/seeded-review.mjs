// EXP-T18 critic calibration run: render the seven seeded pairs through the production render entry, send each capture
// alone (neutral id, its own learner request, no partner, no label) to explain-review.js reviewCaptures on
// claude-opus-5-5, and score the verdicts against EXPECTED with denominators.
//   node seeded-review.mjs <runId> --cap-usd <n>      (paid: plan the row in spend.md first)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anthropicTransport, readKeys, recordingModel } from '../../../viz-benchmarks/visualization-cases/baseline.mjs';
import { neutralCaptures, score } from './seeded-pairs.mjs';
import { reviewCaptures } from '../../../packages/control-plane/src/explain-review.js';

export const REVIEW_MODEL = 'claude-opus-5-5';

// callRole over a raw transport, mirroring Lane C's explainRequest for the review role: one tool on auto, no thinking.
export function directCallRole(callModel, maxTokens = 3000) {
  return async (_role, { system, tool, content }) => {
    const body = { max_tokens: maxTokens, system: [{ type: 'text', text: system }], tools: [tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content }] };
    const response = await callModel({}, body, REVIEW_MODEL);
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error?.message || result?.error || `HTTP ${response.status}`);
    const calls = (result.content || []).filter(b => b.type === 'tool_use' && b.name === tool.name);
    if (calls.length !== 1) throw new Error(`expected one ${tool.name} call, got ${calls.length}`);
    return { input: calls[0].input, identity: { requested: REVIEW_MODEL, served: result.model ?? null }, usage: result.usage ?? null };
  };
}

// render(scene) -> Uint8Array PNG. Each capture is reviewed alone; results keep only the neutral id until scoring.
export async function runSeeded({ render, callRole, captures = neutralCaptures() }) {
  const results = [];
  for (const item of captures) {
    const png = await render(item.scene);
    try {
      const review = await reviewCaptures({ request: item.request, captures: [{ id: item.sid, theme: 'light', time: item.scene.duration, inputs: {}, png }] }, { callRole });
      results.push({ sid: item.sid, key: item.key, ...review.captures[0], calls: review.calls });
    } catch (error) {
      results.push({ sid: item.sid, key: item.key, error: `${error.code || ''} ${error.message}` });
    }
  }
  const scored = results.filter(r => !r.error);
  return { results, score: score(scored), errors: results.filter(r => r.error).length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [runId] = process.argv.slice(2);
  const cap = Number(process.argv[process.argv.indexOf('--cap-usd') + 1]);
  if (!runId || !(cap > 0)) { console.error('usage: node seeded-review.mjs <runId> --cap-usd <n>'); process.exit(1); }
  const HERE = fileURLToPath(new URL('.', import.meta.url));
  const outPath = join(HERE, 'runs', `${runId}.json`);
  if (existsSync(outPath)) throw new Error(`${runId} exists; calibration history is immutable`);
  const { MODEL_PRICES } = await import('../../../packages/control-plane/src/learn-models.js');
  const { captureScene } = await import('../../../packages/web/e2e/viz-benchmark-capture.mjs');
  const keys = readKeys(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID']);
  const { callModel, ledger } = recordingModel(anthropicTransport(keys), { capUsd: cap, prices: MODEL_PRICES });
  const dist = join(HERE, '..', '..', '..', 'packages', 'web', 'dist-render');
  const out = await runSeeded({ render: async scene => (await captureScene(scene, [{ id: 'c' }], { dist })).captures[0].png, callRole: directCallRole(callModel) });
  mkdirSync(join(HERE, 'runs'), { recursive: true });
  const record = { runId, model: REVIEW_MODEL, spentUsd: +ledger.spentUsd.toFixed(4), unknownCost: ledger.unknownCost,
    calls: ledger.calls.map(({ request, ...c }) => c), ...out, results: out.results.map(({ calls, ...r }) => r) };
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
  console.log(JSON.stringify({ score: out.score, errors: out.errors, spentUsd: record.spentUsd, served: [...new Set(record.calls.map(c => c.servedModel))] }, null, 2));
}
