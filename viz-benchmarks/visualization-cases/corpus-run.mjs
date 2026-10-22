// EXP-T02/T22 corpus runner: run imported cases through one system, render, and record honest immutable history
// (prompt.json with every call, generated.png, comparison.png, receipt) via cases.mjs recordRun. No human verdict is
// written: verdicts stay pending until the owner records one (recordVerdict).
//   node corpus-run.mjs <runId> --system v2|baseline --cases <id,id|all> --cap-usd <n> [--input-mode prompt-only|reference-guided]
// v2 = the /explain M3 flow (explain-flow.mjs; needs a tree with explain/c-m3 + explain/d-t18).
// baseline = the frozen current artifact path (baseline.mjs; baseline.json must match the tree).
// Paid: plan the run in spend.md first. One shared cap across all cases, checked before every call.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERE, buildIndex, loadCases, recordRun } from './cases.mjs';
import { anthropicTransport, assertFrozen, generateCase, readKeys, recordingModel } from './baseline.mjs';
import { composeComparison } from './compose.mjs';

const priceTable = async () => ({ ...(await import('../../packages/control-plane/src/learn-models.js')).MODEL_PRICES, 'claude-opus-5': [5, 25, 0.5] });

// deps: { transport, capUsd, prices, render(scene) -> png bytes, flow (runFlow), callRole factory }; returns per-case rows.
export async function runCorpus({ runId, system, cases, inputMode = 'prompt-only', transport, capUsd, prices, render, runFlow, callExplainRole, compose = composeComparison, casesRoot = HERE, now }) {
  const rows = [];
  let spent = 0;
  const shared = recordingModel(transport, { capUsd, prices });
  let paused = null;
  for (const record of cases) {
    // Provider-cap resilience (r2 kickoff): after a spend-cap, usage-limit or overload refusal, no further paid case runs.
    if (paused) { rows.push({ caseId: record.id, split: record.split, outcome: 'not_run', result: 'provider_unavailable', accepted: null, costUsd: 0, error: paused }); continue; }
    const scratch = mkdtempSync(join(tmpdir(), 'vc-run-'));
    let prompt, outcome = 'failed', error = null, scene = null, spec = null, critic = null, extra = {};
    const rounds = []; // every round's spec, problems and review (explain-flow save), kept beside the final output
    const before = shared.ledger.calls.length;
    const started = Date.now();
    try {
      if (system === 'v2') {
        if (inputMode !== 'prompt-only') throw new Error('transport_unavailable: the v2 author takes no reference pixels until T15');
        const env = { SMALL_ENV: 'test' };
        const ctx = { env, call: (role, request) => callExplainRole(env, role, request, { callModel: shared.callModel }) };
        const flow = await runFlow(record.prompt, { ctx, ledger: shared.ledger, save: (name, value) => rounds.push([name, value]) });
        spec = flow.spec; scene = flow.compiled?.scene || null; critic = flow.review || null;
        // The reviewed captures (every part of a paged card), so the owner sees more than the default state in generated.png.
        for (const c of flow.captures || []) rounds.push([`capture-${c.id}.png`, Buffer.from(c.png)]);
        extra = { result: flow.result, accepted: flow.accepted, rounds: flow.rounds, stages: flow.stages, gap: flow.gap, stop: flow.stop };
        if (!scene) error = `${flow.result}${flow.gap ? `: ${JSON.stringify(flow.gap).slice(0, 300)}` : flow.stop ? `: ${flow.stop.reason || flow.stop.rejected}` : ''}`;
      } else {
        const out = await generateCase(record, inputMode, { transport, capUsd: capUsd - spent, prices, casesRoot, frozen: assertFrozen(join(casesRoot, 'baseline.json')) });
        spent += out.ledger.spentUsd;
        prompt = out.prompt; scene = out.scene; extra = { result: out.outcome, primitive: out.result?.primitive ?? null };
        if (!scene && out.result?.block) { spec = out.result.block; error = `not rendered: /explain returned the ${out.result.primitive} primitive, which is not a scene`; }
        else if (!scene) error = out.outcome;
      }
      if (scene) {
        const png = await render(scene);
        writeFileSync(join(scratch, 'generated.png'), png);
        outcome = 'ok';
      }
    } catch (problem) { error = problem.message; }
    const calls = system === 'v2' ? shared.ledger.calls.slice(before).map(({ request, ...c }) => c) : prompt?.stageCalls || [];
    if (system === 'v2') spent = shared.ledger.spentUsd;
    prompt ??= { schema: 1, caseId: record.id, family: record.family, split: record.split, system, mode: 'generate', inputMode, learnerPrompt: record.prompt,
      examples: [], stageCalls: shared.ledger.calls.slice(before), redactions: 'image bytes replaced by sha256 + byte count', elapsedMs: Date.now() - started };
    const costUsd = calls.reduce((s, c) => s + (c.costUsd || 0), 0);
    const { runDir, receipt } = recordRun(record.id, { casesRoot, runId, mode: 'generate', inputMode, prompt, outcome, error,
      generatedPng: outcome === 'ok' ? join(scratch, 'generated.png') : undefined, sceneSpec: spec || undefined, compiledScene: scene || undefined, critic: critic || undefined,
      receipt: { system, costUsd: +costUsd.toFixed(6), calls: calls.length, servedModels: [...new Set(calls.map(c => c.servedModel).filter(Boolean))], elapsedMs: Date.now() - started, humanVerdict: 'pending owner', ...extra, flowResult: extra.result ?? null }, now });
    for (const [name, value] of rounds) { mkdirSync(join(runDir, 'rounds'), { recursive: true }); writeFileSync(join(runDir, 'rounds', name), typeof value === 'string' || Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}
`); }
    if (outcome === 'ok') await compose(join(casesRoot, 'cases', record.id, record.reference.file), join(runDir, 'generated.png'), join(runDir, 'comparison.png'), { resultLabel: `${system} ${runId}` });
    const refused = calls.find(c => c.status === 429 || c.status === 529 || (c.status === 400 && /usage limit/i.test(c.error || '')));
    if (refused) paused = `provider_unavailable: HTTP ${refused.status} ${refused.error || ''}`.trim();
    rows.push({ caseId: record.id, split: record.split, outcome: receipt.outcome, result: extra.result ?? null, accepted: extra.accepted ?? null, costUsd: receipt.costUsd, error: receipt.error });
  }
  buildIndex(casesRoot);
  return { rows, spentUsd: +spent.toFixed(6), paused };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const system = flag('--system'), which = flag('--cases'), cap = Number(flag('--cap-usd')), inputMode = flag('--input-mode') || 'prompt-only';
  const [runId] = args;
  if (!runId || !['v2', 'baseline'].includes(system) || !which || !(cap > 0)) { console.error('usage: node corpus-run.mjs <runId> --system v2|baseline --cases <ids|all> --cap-usd <n> [--input-mode ...]'); process.exit(1); }
  const all = loadCases().filter(c => c.generationReady);
  const cases = which === 'all' ? all : which.split(',').map(id => all.find(c => c.id === id) || (() => { throw new Error(`unknown or unassigned case ${id}`); })());
  const { captureScene } = await import('../../packages/web/e2e/viz-benchmark-capture.mjs');
  const dist = join(HERE, '..', '..', 'packages', 'web', 'dist-render');
  const v2 = system === 'v2' ? { runFlow: (await import('./explain-flow.mjs')).runFlow, callExplainRole: (await import('../../packages/control-plane/src/explain-policy.js')).callExplainRole } : {};
  const keys = readKeys(['ANTHROPIC_API_KEY', 'ANTHROPIC_WORKSPACE_ID']);
  const out = await runCorpus({ runId, system, cases, inputMode, transport: anthropicTransport(keys), capUsd: cap, prices: await priceTable(),
    render: async scene => (await captureScene(scene, [{ id: 'light', theme: 'light' }], { dist })).captures[0].png, ...v2 });
  mkdirSync(join(HERE, 'runs'), { recursive: true });
  writeFileSync(join(HERE, 'runs', `${runId}-${system}-${inputMode}.json`), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify(out, null, 2));
}
