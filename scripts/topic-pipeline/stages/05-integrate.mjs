import { mkdir, readdir, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readJson } from '../state.mjs';
import { toolPath } from '../tooling.mjs';
import { artefactTopic, command, configuredCommand, exists, manifest, runBench, scrub, topicSet, withStack } from './operator.mjs';

const ownReferences = (ctx, author) => (author.references ?? []).filter(r => r.authored === true || r.decision === 'NEW' || (r.authored === undefined && r.decision === undefined && r.id.startsWith(ctx.fixture && ctx.dryRun ? 'ml-dry-trees-' : `ml-${ctx.topic}-`))).map(r => r.id).filter(id => /^[a-z0-9-]+$/.test(id));

// A reference's preview folders: the base id and every depth and detail variant the preview export writes (stage 03 copies the same set).
const VARIANTS = ['', '-brief', '-balanced', '-detailed', '-detail', '-brief-detail', '-balanced-detail', '-detailed-detail'];

// A fresh integration worktree has no installed dependencies, so the suites failed on 'Cannot find package'. When config.repo.depsRoot names a tree with
// installed dependencies at the same lockfile, its node_modules folders (root and packages/*) are linked in as junctions (never copied, never written to).
export async function linkDependencies(depsRoot, worktree) {
  if (!depsRoot) return [];
  const linked = [], candidates = ['node_modules'];
  for (const entry of await readdir(join(depsRoot, 'packages'), { withFileTypes: true }).catch(() => [])) if (entry.isDirectory()) candidates.push(`packages/${entry.name}/node_modules`);
  for (const rel of candidates) {
    const from = join(depsRoot, rel), to = join(worktree, rel);
    if (!await exists(from) || await exists(to) || !await exists(dirname(to)).catch(() => false)) continue;
    await symlink(resolve(from), to, 'junction');
    linked.push(rel);
  }
  return linked;
}

export function allowed(path, ctx, author) {
  const topic = artefactTopic(ctx), stem = `topic-${topic}`;
  const refs = ownReferences(ctx, author);
  if (['packages/web/src/tutor-diagrams/reference-library.js', 'packages/web/src/tutor-diagrams/svg-snapshots.json'].includes(path)) return true;
  if (path.startsWith(`packages/web/src/tutor-diagrams/${stem}-`) && /\.(?:js|mjs|json)$/.test(path) && !path.slice('packages/web/src/tutor-diagrams/'.length).includes('/')) return true;
  if (path === `docs/features/explain-on-canvas/handoff/phase02-library/topic-walkthroughs/${topic}.md`) return true;
  const preview = 'docs/features/explain-on-canvas/handoff/phase02-library/illustrations/';
  if (refs.some(id => VARIANTS.map(suffix => `${id}${suffix}`).some(variant => path.startsWith(`${preview}${variant}/`) && /\/(?:natural|408|960)\.svg$|\/spec\.json$/.test(path)))) return true;
  // An earlier author round's references (renamed or dropped by a later round) stay inside the topic's own id prefix: its commits are integrated in order, so the final tree is the last round's.
  const prefix = ctx.fixture && ctx.dryRun ? 'ml-dry-trees-' : `ml-${ctx.topic}-`;
  if (path.startsWith(`${preview}${prefix}`) && /^[a-z0-9-]+\/(?:natural\.svg|408\.svg|960\.svg|spec\.json)$/.test(path.slice(preview.length + prefix.length))) return true;
  if (path.startsWith('packages/web/src/tutor-diagrams/__snapshots__/') && refs.some(id => VARIANTS.some(suffix => path.endsWith(`/${id}${suffix}.svg`)))) return true;
  // Brief paths are lesson metadata, supplied by the topic manifest rather than inferred from a slug.
  return (ctx.metadata?.sources ?? []).some(source => source.kind === 'brief' && source.path === path && path.startsWith('docs/features/explain-on-canvas/handoff/figure-briefs/briefs/') && path.endsWith('.md'));
}

export function propertyCountFromGateLines(text) {
  const found = [...String(text).matchAll(/GATE PASS: max (\d+) <= \d+/gu)].map(match => Number(match[1]));
  return found.length ? Math.max(...found) : undefined;
}

export async function run(ctx) {
  const record = { branch: ctx.fixture && ctx.dryRun ? `release/dryrun-${ctx.topic}` : ctx.config.repo.releaseBranch,
    worktree: '', commits: [], status: 'pending', checks: [] };
  const artefacts = [];
  try {
    const commands = ctx.config.integration?.commands;
    const propertyCountCmd = ctx.config.integration?.propertyCountCmd;
    if (!Array.isArray(commands) || !commands.length || commands.some(c => typeof c !== 'string' || !c.trim()) || !propertyCountCmd?.trim()) {
      record.status = 'noop';
      artefacts.push(await manifest(ctx, 'integration.json', record));
      return { status: 'fail', artefacts, notes: 'Integration commands are empty; no commits were integrated and required checks were not run. Configure focused suites, snapshots, selector parity and propertyCountCmd.' };
    }
    const author = await readJson(join(ctx.topicDir, 'author.json'));
    ctx = { ...ctx, metadata: ctx.metadata ?? await readJson(join(ctx.topicDir, 'topic.json')) };
    if (!author.branch || !author.worktree || !author.commits?.length || !ctx.config.repo.worktreeRoot || !record.branch) throw new Error('Configure release/worktree paths and finish stage 03 before integration.');
    const verify = await readJson(join(ctx.topicDir, 'verify.json'));
    const figures = Array.isArray(verify) ? verify : verify.figures ?? verify.references ?? verify.verdicts ?? [];
    if (!figures.length || figures.some(r => r.verdict !== 'ship')) throw new Error('Every verified reference must be ship before integration.');
    for (const sha of author.commits) {
      if (!/^[a-f0-9]{7,40}$/.test(sha)) throw new Error('Author manifest has an invalid commit.');
      await command(ctx, '05', 'author-ancestry', 'git', ['merge-base', '--is-ancestor', sha, author.branch]);
      const parents = await command(ctx, '05', 'commit-parents', 'git', ['rev-list', '--parents', '-n', '1', sha]);
      if (parents.stdout.trim().split(/\s+/).length !== 2) throw new Error('Only single-parent topic data commits may be integrated.');
      const diff = await command(ctx, '05', 'scope', 'git', ['diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', sha]);
      const files = diff.stdout.trim().split('\n').filter(Boolean);
      if (!files.length || files.some(path => !allowed(path.trim(), ctx, author))) throw new Error('Topic commit touches files outside the stage 05 topic allowlist.');
      const snapshots = 'packages/web/src/tutor-diagrams/svg-snapshots.json';
      if (files.includes(snapshots)) {
        const before = JSON.parse((await command(ctx, '05', 'snapshots-before', 'git', ['show', `${sha}^:${snapshots}`])).stdout);
        const after = JSON.parse((await command(ctx, '05', 'snapshots-after', 'git', ['show', `${sha}:${snapshots}`])).stdout);
        if (before.version !== after.version || JSON.stringify(before.widths) !== JSON.stringify(after.widths)) throw new Error('Topic snapshots may not change the shared format or widths.');
        const ids = ownReferences(ctx, author);
        for (const key of new Set([...Object.keys(before.entries), ...Object.keys(after.entries)])) {
          if (JSON.stringify(before.entries[key]) === JSON.stringify(after.entries[key])) continue;
          // Own entries: the references of this author round with every depth and detail variant, and any earlier round's references under the topic's id prefix.
          const name = key.split('/')[0], prefix = ctx.fixture && ctx.dryRun ? 'ml-dry-trees-' : `ml-${ctx.topic}-`;
          if (!ids.some(id => VARIANTS.some(suffix => name === `${id}${suffix}`)) && !name.startsWith(prefix)) throw new Error('Topic snapshots changed a prior reference.');
        }
      }
    }
    record.worktree = resolve(ctx.config.repo.worktreeRoot, `integrate-${artefactTopic(ctx)}`);
    if (!await exists(record.worktree)) {
      const current = await command(ctx, '05', 'release-exists', 'git', ['show-ref', '--verify', '--quiet', `refs/heads/${record.branch}`], { allowFailure: true });
      await command(ctx, '05', 'worktree-add', 'git', current.code === 0
        ? ['worktree', 'add', record.worktree, record.branch]
        : ctx.fixture && ctx.dryRun
          ? ['worktree', 'add', '-b', record.branch, record.worktree, ctx.config.repo.releaseBranch]
          : ['worktree', 'add', record.worktree, record.branch]);
    }
    await linkDependencies(ctx.config.repo.depsRoot, record.worktree);
    const checkedOut = await command(ctx, '05', 'worktree-branch', 'git', ['branch', '--show-current'], { cwd: record.worktree });
    if (checkedOut.stdout.trim() !== record.branch) throw new Error('Integration worktree belongs to another branch.');
    const dirty = await command(ctx, '05', 'worktree-status', 'git', ['status', '--porcelain'], { cwd: record.worktree });
    if (dirty.stdout.trim()) throw new Error('Integration worktree must be clean before cherry-picking.');
    for (const sha of author.commits) {
      const included = await command(ctx, '05', 'already-integrated', 'git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { cwd: record.worktree, allowFailure: true });
      if (included.code !== 0) {
        const patches = await command(ctx, '05', 'integrated-patch', 'git', ['cherry', 'HEAD', sha, `${sha}^`], { cwd: record.worktree });
        if (patches.stdout.trim().startsWith('+')) await command(ctx, '05', 'cherry-pick', 'git', ['cherry-pick', sha], { cwd: record.worktree });
        else if (patches.stdout.trim() && !patches.stdout.trim().startsWith('-')) throw new Error('Cannot determine whether the topic patch is already integrated.');
      }
      record.commits.push(sha);
    }
    // integration.suites: false = integrate only; the suites run once, in the release gate of the candidate (reviewer 2026-11-13).
    if (ctx.config.integration?.suites === false) record.checks.push({ suites: 'skipped: run in the release gate' });
    else for (let i = 0; i < commands.length; i++) {
      const result = await configuredCommand(ctx, '05', `suite-${i + 1}`, commands[i], record.worktree);
      artefacts.push(result.log);
      record.checks.push({ command: i + 1, status: 'ok' });
    }
    const counted = await configuredCommand(ctx, '05', 'property-count', propertyCountCmd, record.worktree);
    artefacts.push(counted.log);
    let count;
    try { count = JSON.parse(counted.stdout.trim()).propertyCount; } catch { count = /^\s*\d+\s*$/.test(counted.stdout) ? Number(counted.stdout) : undefined; }
    // The gate scripts (int8-props, int8-mixed) print one `GATE PASS: max N <= 362` line each: the count is the larger N (reviewer 2026-11-13).
    if (count === undefined) count = propertyCountFromGateLines(counted.stdout);
    if (!Number.isInteger(count) || count > 362 || count < 0) throw new Error('A1 property count must be reported as propertyCount JSON or an integer, and stay at most 362.');
    record.propertyCount = count;
    // integration.smoke: false = the deterministic checks only (reviewer 2026-11-13: a topic release whose replay moves no prior pick is gated by suites, property count and replay).
    if (ctx.config.integration?.smoke === false) record.smoke = { skipped: 'integration.smoke is false: deterministic checks only' };
    else {
      const bench = await toolPath(ctx.config, 'bench');
      const smoke = await exists(join(ctx.config.repo.toolingRoot, 'scripts/explain-bench/sets/smoke.json'));
      const generated = smoke ? null : await topicSet(ctx, bench);
      if (generated) artefacts.push(generated.copy);
      record.smoke = { set: smoke ? 'smoke' : generated.set.name, note: smoke ? '' : 'smoke set missing' };
      const result = await withStack(ctx, '05', record.worktree, () => runBench(ctx, '05', 'smoke', bench, smoke ? 'smoke' : generated.set.name, record.worktree, [], false));
      artefacts.push(result.log);
      if (result.code !== 0) throw new Error('Tier-1 smoke did not pass; inspect the captured bench report.');
      record.smoke.run = result.run;
    }
    record.head = (await command(ctx, '05', 'integration-head', 'git', ['rev-parse', 'HEAD'], { cwd: record.worktree })).stdout.trim();
    record.status = 'ok';
    artefacts.push(await manifest(ctx, 'integration.json', record));
    return { status: 'ok', artefacts, notes: `Topic data integrated in a separate release worktree; configured suites passed; A1 properties ${count}/362; ${record.smoke.skipped ? 'tier-1 smoke skipped (deterministic checks only).' : 'tier-1 bench passed.'}${smoke ? '' : ' smoke set missing; used the topic demo set.'}` };
  } catch (error) {
    record.status = 'fail';
    record.error = scrub(error.message, ctx);
    artefacts.push(await manifest(ctx, 'integration.json', record));
    return { status: 'fail', artefacts, notes: record.error };
  }
}
