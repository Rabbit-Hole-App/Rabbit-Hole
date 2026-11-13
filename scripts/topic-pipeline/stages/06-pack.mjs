import { join } from 'node:path';
import { readJson } from '../state.mjs';
import { toolPath } from '../tooling.mjs';
import { artefactTopic, benchSupportsConfig, command, exists, integration, manifest, runBench, scrub, topicSet, withStack } from './operator.mjs';

function assess(rows, expected) { // expected = the set's card count (12 for a lesson's prompts, 13 for demo-lesson04)
  const delivered = rows.filter(r => r.delivered).length;
  const sent = rows.filter(r => r.referenceSent === true).length;
  const kinds = rows.filter(r => r.kindMatch === true).length;
  const missingReferences = rows.some(r => !r.referenceAvailable);
  return { expected, delivered, sent, kinds, passed: rows.length === expected && delivered === expected && sent === expected && kinds >= expected - 1 && !missingReferences };
}

async function exportPack(ctx, packPath, generated, integrated, runs, only = []) {
  const summary = join(ctx.topicDir, 'pack.rows.json');
  const args = [packPath, '--set', generated.set.name, '--topic', artefactTopic(ctx), '--set-file', generated.file,
    '--reference-prefix', ctx.fixture && ctx.dryRun ? 'ml-dry-trees-' : `ml-${ctx.topic}-`,
    '--out', join(ctx.topicDir, 'pack'), '--tree', integrated.worktree, '--refs-dir', generated.author.previewDir,
    '--refs-ref', generated.author.branch, '--refs-repo', generated.author.worktree, '--summary', summary,
    ...runs.flatMap(run => ['--run', run]), ...(only.length ? ['--only', only.join(',')] : [])];
  if (ctx.config.bench.noPng || ctx.config.bench.fixtureRuns?.length) args.push('--no-png');
  else args.push('--base', ctx.config.stack.baseUrl, '--vars', ctx.config.stack.varsFile);
  if (!generated.author.previewDir) throw new Error('Author manifest must name its reference preview directory.');
  const result = await command(ctx, '06', only.length ? 'pack-regenerate' : 'pack-export', process.execPath, args, { cwd: ctx.config.repo.toolingRoot });
  return { rows: await readJson(summary), artefacts: [summary, result.log, join(ctx.topicDir, 'pack')] };
}

export async function run(ctx) {
  const artefacts = [];
  try {
    const bench = await toolPath(ctx.config, 'bench');
    const pack = await toolPath(ctx.config, 'pack');
    const generated = await topicSet(ctx, bench);
    artefacts.push(generated.copy);
    const integrated = await integration(ctx);
    const fixtureRuns = ctx.config.bench.fixtureRuns;
    const runs = [];
    let exported;
    if (Array.isArray(fixtureRuns) && fixtureRuns.length) {
      if (!ctx.fixture) throw new Error('Saved fixture bench runs require --fixture.');
      for (const run of fixtureRuns) {
        if (!await exists(join(run, 'results.json'))) throw new Error('Configured saved fixture run is missing results.json.');
        runs.push(run);
      }
      exported = await exportPack(ctx, pack, generated, integrated, runs);
    } else {
      if (!ctx.execFile) await benchSupportsConfig(ctx, bench);
      exported = await withStack(ctx, '06', integrated.worktree, async () => {
        const result = await runBench(ctx, '06', 'bench', bench, generated.set.name, integrated.worktree);
        runs.push(result.run); artefacts.push(result.log);
        return exportPack(ctx, pack, generated, integrated, runs);
      });
    }
    artefacts.push(...exported.artefacts);
    const metrics = assess(exported.rows, generated.set.prompts?.length ?? generated.prompts.length);
    const record = { topic: ctx.topic, set: generated.set.name, setFile: generated.file, runs, rows: exported.rows, metrics,
      regenerated: false, pngSkipped: !!ctx.config.bench.noPng || !!fixtureRuns?.length };
    artefacts.push(await manifest(ctx, 'pack.json', record));
    const notes = `Pack: intended reference sent ${metrics.sent}/${metrics.expected}; model kind matches ${metrics.kinds}/${metrics.expected}; delivered ${metrics.delivered}/${metrics.expected}.${record.pngSkipped ? ' PNG capture skipped for saved/offline fixture export.' : ''}`;
    if (!metrics.passed) {
      const failing = exported.rows.filter(r => !r.delivered || r.referenceSent !== true || !r.kindMatch || !r.referenceAvailable);
      return { status: 'stop', stop: 'STOP-3', artefacts, notes: `${notes}\n\nFailing pipeline lines:\n${scrub(failing.map(r => `${r.promptId}: ${JSON.stringify(r.pipeline)}`).join('\n'), ctx)}` };
    }
    return { status: 'ok', artefacts, notes };
  } catch (error) {
    return { status: 'fail', artefacts, notes: scrub(error.message, ctx) };
  }
}

export async function regenerateCards(ctx, ids) {
  const artefacts = [];
  try {
    const saved = await readJson(join(ctx.topicDir, 'pack.json'));
    if (saved.regenerated || ctx.config.limits?.regenerateOnce === false) throw new Error('The single permitted card regeneration is unavailable or already used.');
    if (!Array.isArray(ids) || !ids.length) throw new Error('Regeneration requires specific prompt or reference ids.');
    const selected = saved.rows.filter(row => ids.some(id => String(id) === String(row.id) || String(id) === row.name || Number(id) === Number(row.promptId)));
    if (!selected.length || ids.some(id => !selected.some(row => String(id) === row.id || String(id) === row.name || Number(id) === Number(row.promptId)))) throw new Error('Regeneration contains unknown card ids.');
    if (ctx.config.bench.fixtureRuns?.length) throw new Error('Saved fixture runs cannot regenerate live cards. Supply a recorded regenerated run to replay instead.');
    const bench = await toolPath(ctx.config, 'bench'), pack = await toolPath(ctx.config, 'pack');
    const generated = await topicSet(ctx, bench), integrated = await integration(ctx);
    const only = [...new Set(selected.map(row => row.id))];
    if (!ctx.execFile) await benchSupportsConfig(ctx, bench);
    // Consume the attempt before invoking the bench, including a failed attempt. Resume cannot spend a second time.
    saved.regenerated = true; saved.regeneratedIds = only;
    artefacts.push(await manifest(ctx, 'pack.json', saved));
    const exported = await withStack(ctx, '06', integrated.worktree, async () => {
      const result = await runBench(ctx, '06', 'bench-regenerate', bench, saved.set, integrated.worktree, only);
      saved.runs.push(result.run); artefacts.push(result.log);
      return exportPack(ctx, pack, generated, integrated, saved.runs, only);
    });
    artefacts.push(...exported.artefacts);
    saved.rows = exported.rows; saved.metrics = assess(saved.rows, saved.metrics?.expected ?? 12);
    await manifest(ctx, 'pack.json', saved);
    const status = saved.metrics.passed ? 'ok' : 'stop';
    return { status, ...(status === 'stop' ? { stop: 'STOP-3' } : {}), artefacts, notes: status === 'ok' ? 'Selected cards regenerated once with bench --only and the pack re-exported.' : `Regenerated pack is below the delivery/reference/kind thresholds.\n${scrub(saved.rows.filter(r => !r.delivered || r.referenceSent !== true || !r.kindMatch).map(r => JSON.stringify(r.pipeline)).join('\n'), ctx)}` };
  } catch (error) { return { status: 'fail', artefacts, notes: scrub(error.message, ctx) }; }
}
