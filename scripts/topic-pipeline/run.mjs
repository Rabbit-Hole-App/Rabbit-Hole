import { parseArgs } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { loadConfig, getTopicPaths, redact } from './config.mjs';
import { loadState, saveState, archiveFrom, withTopicLock } from './state.mjs';
import { notify } from './notify.mjs';
import { estimateTopic } from './budget.mjs';

export const stageNames = ['01-prompts', '02-coverage', '03-author', '04-verify', '05-integrate', '06-pack', '07-audit', '08-ready', '09-release'];

export async function runPipeline(options) {
  const { topic, topicDir, stages, from, to = '08', go = false } = options;
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(topic)) throw new Error('Topic must be a slug');
  for (const id of [from, to].filter(Boolean)) if (!/^0[1-9]$/.test(id)) throw new Error('Stage must be 01 through 09');
  if ((from === '09' || to === '09') && !go) throw new Error('Release requires --go after STOP-4 READY');
  return withTopicLock(topicDir, async () => {
    const state = await loadState(topicDir, topic);
    if (options.preflight) state.estimateUsd = estimateTopic(options.config);
    if (go && state.stages['08']?.stop !== 'STOP-4') throw new Error('Release requires STOP-4 READY');
    if (from) await archiveFrom(topicDir, state, from);
    const ctx = { ...options, state, config: options.config ?? {} };
    const start = go ? '09' : from ?? '01';
    const end = go ? '09' : to;
    for (const id of Object.keys(stages).sort().filter(id => id >= start && id <= end)) {
      if (!from && state.stages[id]?.status === 'ok') continue;
      if (!from && state.stages[id]?.status === 'stop') return state.stages[id];
      const startedAt = new Date().toISOString();
      const attempts = (state.stages[id]?.attempts ?? 0) + 1;
      state.stages[id] = { status: 'running', attempts, startedAt, artefacts: [] };
      state.status = 'running';
      await saveState(topicDir, state);
      let result;
      try {
        result = await stages[id](ctx);
        if (!['ok', 'stop', 'fail'].includes(result?.status)) throw new Error('Stage returned an invalid result');
        if (id === '01' && options.approvePrompts && result.status === 'ok') result = { ...result, status: 'stop', stop: 'STOP-1' };
      } catch (error) {
        result = { status: 'fail', artefacts: [], notes: redact(error.message, ctx.config) };
      }
      if (result.status === 'stop') {
        const stops = { '01': 'STOP-1', '04': 'STOP-2', '06': 'STOP-3', '07': 'STOP-3', '08': 'STOP-4' };
        if (stops[id] !== result.stop) throw new Error('Stop point does not match its stage');
        const path = join(topicDir, result.stop === 'STOP-4' ? 'READY.md' : 'STOPPED.md');
        result.artefacts = [...(result.artefacts ?? []), path];
        state.stages[id] = { ...result, attempts, startedAt, finishedAt: new Date().toISOString() };
        state.status = 'stop';
        await saveState(topicDir, state);
        try { await notify(ctx, result.stop, result.notificationText ?? result.notes); }
        catch { result.notes += ' Notification failed. The stop checkpoint is saved.'; result.notificationFailed = true; }
      }
      state.stages[id] = { ...result, attempts, startedAt, finishedAt: new Date().toISOString() };
      state.status = result.status;
      await saveState(topicDir, state);
      options.onStage?.(id, result);
      if (result.status !== 'ok') return result;
    }
    return { status: 'ok', artefacts: [], notes: 'Requested stages complete' };
  });
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    config: { type: 'string', default: join(dirname(fileURLToPath(import.meta.url)), 'config.local.json') },
    from: { type: 'string' }, to: { type: 'string' },
    'approve-prompts': { type: 'boolean' }, go: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, fixture: { type: 'boolean' },
    'author-answer': { type: 'string' }, 'author-model': { type: 'string' }, 'author-effort': { type: 'string' }, 'reviewer-model': { type: 'string' }, 'reviewer-effort': { type: 'string' }, 'judge-model': { type: 'string' },
  } });
  const topic = positionals[0];
  if (positionals.length !== 1 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(topic)) throw new Error('Usage: node scripts/topic-pipeline/run.mjs <topic> [--from 01] [--to 08] [--fixture]');
  const config = await loadConfig(values.config);
  config.overrides = Object.fromEntries(Object.entries(values).filter(([key]) => /model|effort/.test(key)));
  config.run = { fixture: !!values.fixture, dryRun: !!values['dry-run'], authorAnswer: values['author-answer'] ? resolve(values['author-answer']) : undefined };
  const stages = {};
  for (const name of stageNames) {
    stages[name.slice(0, 2)] = async ctx => (await import(`./stages/${name}.mjs`)).run(ctx);
  }
  const result = await runPipeline({ topic, ...getTopicPaths(config, topic), config, stages,
    from: values.from, to: values.to ?? (values['dry-run'] ? '07' : undefined), approvePrompts: values['approve-prompts'], go: values.go,
    dryRun: values['dry-run'], fixture: values.fixture,
    preflight: !(values.from === '02' && values.to === '02' && config.planner?.fixtureFile),
    onStage: (id, output) => console.log(JSON.stringify({ stage: id, status: output.status, stop: output.stop, notes: redact(output.notes, config) })),
  });
  if (values.fixture && values['dry-run'] && (values.to ?? '07') >= '07') {
    const { fixtureReport } = await import('./checks/fixture-report.mjs');
    const report = await fixtureReport({ topic, ...getTopicPaths(config, topic), config }, { mapPrompts: result.status === 'ok' });
    console.log(JSON.stringify({ fixtureScore: report.status, passed: report.passed }));
    if (!report.passed) process.exitCode = 1;
  }
  if (result.status === 'fail') process.exitCode = 1;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Topic pipeline failed. Check config.local.json and the saved stage report.'); process.exitCode = 1; });
}
