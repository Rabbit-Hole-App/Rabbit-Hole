import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, cp, lstat, mkdir, readFile, realpath, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintAuthoredFiles, isAllowedAuthoredPath } from './checks/reference-linter.mjs';
import { readJson, writeJson } from './state.mjs';

const execute = promisify(execFile);
const sourceDir = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(sourceDir, '../..');
const RUNTIME = 'scripts/.topic-pipeline-author';
const DIAGRAMS = 'packages/web/src/tutor-diagrams';
const TIMEOUT = 10 * 60 * 1000;
const inside = (root, file) => file === root || file.startsWith(root + sep);
const exists = async file => { try { await access(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
export const authorTopic = ctx => ctx.fixture && ctx.dryRun && ctx.topic === 'decision-trees' ? 'decision-trees-dryrun' : ctx.topic;

export async function git(root, args) {
  const { stdout } = await execute('git', args, { cwd: root, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trimEnd();
}

export async function authorWorktree(ctx) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Stage 03 requires Node >=24 for its permission model.');
  const config = ctx.config, topic = authorTopic(ctx);
  if (!config.repo?.root || !config.repo.worktreeRoot || !config.repo.releaseBranch) throw new Error('Stage 03 requires repo.root, repo.worktreeRoot and repo.releaseBranch in config.local.json.');
  const repo = await realpath(config.repo.root), worktree = resolve(config.repo.worktreeRoot, topic);
  if (worktree === repo || inside(repo, worktree)) throw new Error('Author worktree must be separate from the operator checkout.');
  const branch = `${config.repo.topicBranchPrefix ?? 'topic/'}${topic}`;
  const baseCommit = await git(repo, ['rev-parse', '--verify', `${config.repo.releaseBranch}^{commit}`]);
  await mkdir(dirname(worktree), { recursive: true });
  if (!await exists(worktree)) {
    const branches = await git(repo, ['for-each-ref', '--format=%(refname:short)', `refs/heads/${branch}`]);
    await git(repo, ['worktree', 'add', ...(branches ? [] : ['-b', branch]), worktree, branches ? branch : baseCommit]);
  }
  if (await git(worktree, ['branch', '--show-current']) !== branch) throw new Error('The configured author worktree belongs to another branch.');
  if (await realpath(worktree) === repo) throw new Error('Author worktree resolves to the operator checkout.');
  await git(worktree, ['merge-base', '--is-ancestor', baseCommit, 'HEAD']);
  const dirty = await git(worktree, ['status', '--porcelain', '--untracked-files=all']);
  for (const row of dirty.split('\n').filter(Boolean)) {
    const file = row.slice(3).replaceAll('\\', '/');
    if (!file.startsWith(RUNTIME + '/') && file !== 'packages/web/scripts/.topic-pipeline-illustration-previews.mjs' && !isAllowedAuthoredPath(file, { topic })) {
      throw new Error(`Unrelated changes in author worktree: ${file}`);
    }
  }
  return { branch, worktree, baseCommit, artifactTopic: topic, runtimeDir: join(worktree, RUNTIME) };
}

async function packageRoot(name, searchPaths) {
  const require = createRequire(import.meta.url);
  let entry;
  try { entry = require.resolve(name, { paths: searchPaths }); }
  catch { throw new Error(`Stage 03 needs installed ${name} dependencies in the configured repository or pipeline checkout.`); }
  let directory = dirname(await realpath(entry));
  while (directory !== dirname(directory)) {
    try { if ((await readJson(join(directory, 'package.json'))).name === name) return directory; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    directory = dirname(directory);
  }
  throw new Error(`Cannot locate the installed package root for ${name}.`);
}

/** Copy only the small existing JS dependency closure. External symlinks would
 * fail Node's worktree-only fs permission, so never use node_modules junctions. */
export async function prepareAuthorRuntime(ctx, target) {
  await mkdir(target.runtimeDir, { recursive: true });
  await mkdir(join(target.runtimeDir, 'checks'), { recursive: true });
  for (const file of ['author-runtime.mjs', 'coverage.mjs']) await cp(join(sourceDir, file), join(target.runtimeDir, file));
  for (const file of ['reference-linter.mjs', 'paraphrase-replay.mjs']) await cp(join(sourceDir, 'checks', file), join(target.runtimeDir, 'checks', file));
  // Same relative imports as the shipped exporter; the only extension accepts a
  // supplied references array and preserves its default catalogue behavior.
  await cp(join(sourceRoot, 'packages/web/scripts/illustration-previews.mjs'), join(target.worktree, 'packages/web/scripts/.topic-pipeline-illustration-previews.mjs'));
  const modules = join(target.worktree, 'node_modules');
  await mkdir(modules, { recursive: true });
  if (!inside(target.worktree, await realpath(modules))) throw new Error('Author node_modules must resolve inside its isolated worktree.');
  const copied = new Set();
  async function copyPackage(name, paths) {
    if (copied.has(name)) return;
    copied.add(name);
    const from = await packageRoot(name, paths), metadata = await readJson(join(from, 'package.json'));
    const to = join(modules, name);
    if (await exists(to)) {
      if ((await lstat(to)).isSymbolicLink() || !inside(target.worktree, await realpath(to))) throw new Error(`Author dependency ${name} must not link outside its worktree.`);
      const installed = await readJson(join(to, 'package.json'));
      if (installed.version !== metadata.version) throw new Error(`Author dependency ${name} differs from the configured checkout; refresh the isolated worktree dependencies.`);
    } else {
      await mkdir(dirname(to), { recursive: true });
      await cp(from, to, { recursive: true, dereference: true });
    }
    for (const dependency of Object.keys(metadata.dependencies ?? {})) await copyPackage(dependency, [from, ...paths]);
  }
  const paths = [sourceDir, join(ctx.config.repo.root, 'packages/web'), ctx.config.repo.root];
  for (const name of ['acorn', 'js-tiktoken', 'zod', 'react', 'react-dom', 'katex']) await copyPackage(name, paths);
}

export async function isolated(target, command, payload, roundDir) {
  const input = join(target.runtimeDir, `${command}-input.json`), output = join(target.runtimeDir, `${command}-output.json`);
  await writeJson(input, payload);
  const args = ['--permission', `--allow-fs-read=${target.worktree}`, `--allow-fs-write=${target.worktree}`,
    join(target.runtimeDir, 'author-runtime.mjs'), command, input, output];
  const log = join(roundDir, `${command}.log`);
  try {
    const { stdout, stderr } = await execute(process.execPath, args, { cwd: target.worktree, env: {}, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 16 * 1024 * 1024 });
    await writeFile(log, stdout + stderr);
    const result = await readJson(output);
    await writeJson(join(roundDir, `${command}.json`), result);
    return result;
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}\n`;
    await writeFile(log, detail);
    throw new Error(detail);
  }
}

export async function testAuthored(target, files, roundDir) {
  const tests = files.map(file => file.path).filter(file => /\.(?:test|spec)\.mjs$/u.test(file) && file.startsWith(`${DIAGRAMS}/topic-${target.artifactTopic}-`));
  const newModule = files.some(file => file.path === `${DIAGRAMS}/topic-${target.artifactTopic}-references.js`);
  if (newModule && !tests.length) throw new Error('Authored references require arithmetic tests in the topic module.');
  if (!tests.length) return;
  try {
    const { stdout, stderr } = await execute(process.execPath, ['--permission', `--allow-fs-read=${target.worktree}`, `--allow-fs-write=${target.worktree}`,
      '--test-isolation=none', '--test', ...tests], { cwd: target.worktree, env: {}, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 16 * 1024 * 1024 });
    await writeFile(join(roundDir, 'tests.log'), stdout + stderr);
    if (!/\b(?:tests|pass)\s+[1-9]/u.test(stdout)) throw new Error('Authored test command executed zero tests.');
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}${error.message}\n`;
    await writeFile(join(roundDir, 'tests.log'), detail);
    throw new Error(detail);
  }
}

export async function writeAuthored(target, files) {
  const flags = lintAuthoredFiles({ files, repoRoot: target.worktree, topic: target.artifactTopic });
  if (flags.some(flag => flag.severity === 'error')) throw new Error(JSON.stringify(flags, null, 2));
  // Validate the entire response before the first write. The shared static check
  // resolves existing ancestors so authored paths cannot escape via symlinks.
  for (const file of files) {
    const path = resolve(target.worktree, file.path);
    if (!inside(target.worktree, path) || isAbsolute(relative(target.worktree, path))) throw new Error('Authored path escaped the worktree.');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
  }
}

export async function topicFiles(target) {
  const names = (await git(target.worktree, ['status', '--porcelain', '--untracked-files=all'])).split('\n').filter(Boolean).map(row => row.slice(3));
  return names.filter(name => isAllowedAuthoredPath(name, { topic: target.artifactTopic }));
}

export async function commitAuthorRound(target, topicMetadata, { files: authored, ownIds }) {
  const declared = new Set(authored.map(file => file.path));
  const files = await topicFiles(target);
  const ownPreview = file => ownIds.some(id => file.startsWith(`docs/features/explain-on-canvas/handoff/phase02-library/illustrations/${id}/`) ||
    ['-brief', '-balanced', '-detailed', '-detail', '-brief-detail', '-detailed-detail'].some(suffix => file.startsWith(`docs/features/explain-on-canvas/handoff/phase02-library/illustrations/${id}${suffix}/`)));
  if (files.some(file => !declared.has(file) && file !== `${DIAGRAMS}/svg-snapshots.json` && !ownPreview(file))) throw new Error('Author checks changed an undeclared file outside their own previews and snapshots.');
  if (!files.length) throw new Error('Author round produced no changes to commit.');
  await git(target.worktree, ['add', '--', ...files]);
  const staged = (await git(target.worktree, ['diff', '--cached', '--name-only'])).split('\n').filter(Boolean);
  if (staged.some(file => !isAllowedAuthoredPath(file, { topic: target.artifactTopic }))) throw new Error('The author commit contains a path outside the stage-05 allowlist.');
  await mkdir(join(target.runtimeDir, 'hooks'), { recursive: true });
  await git(target.worktree, ['-c', `core.hooksPath=${join(target.runtimeDir, 'hooks')}`, 'commit', '-m', `Topic ${topicMetadata.topic}: references`]);
  return git(target.worktree, ['rev-parse', 'HEAD']);
}

export async function authorInputs(ctx, target, prompts, coverage, baseline) {
  const directory = join(ctx.config.repo.root, DIAGRAMS);
  const exemplar = [];
  for (const name of (await readdir(directory)).filter(name => /^lesson-decision-trees-.*\.js$/u.test(name))) {
    exemplar.push({ path: `${DIAGRAMS}/${name}`, content: await readFile(join(directory, name), 'utf8') });
  }
  const walkthrough = 'docs/features/explain-on-canvas/handoff/phase02-library/lesson-walkthroughs/04-decision-trees.md';
  exemplar.push({ path: walkthrough, content: await readFile(join(ctx.config.repo.root, walkthrough), 'utf8') });
  const sop = await readFile(join(ctx.config.repo.root, 'docs/features/explain/topics/SOP.md'), 'utf8');
  const { tutorDiagramJsonSchema } = await import('../../packages/web/src/tutor-diagrams/spec.js');
  const kinds = new Set(prompts.prompts.map(row => row.kind));
  const branches = tutorDiagramJsonSchema.properties.diagram.anyOf ?? tutorDiagramJsonSchema.properties.diagram.oneOf;
  const schema = { ...tutorDiagramJsonSchema, properties: { ...tutorDiagramJsonSchema.properties, diagram: { anyOf: branches.filter(branch => kinds.has(branch.properties.kind.const)) } } };
  const metadata = await readJson(join(ctx.topicDir, 'topic.json'));
  const briefs = [];
  for (const source of metadata.sources ?? []) if (source.kind === 'brief') {
    if (!/^docs\/features\/explain-on-canvas\/handoff\/figure-briefs\/briefs\/[a-z0-9.-]+\.md$/u.test(source.path)) throw new Error('Topic brief source must name its exact repository brief markdown path.');
    briefs.push({ path: source.path, content: await readFile(join(ctx.config.repo.root, source.path), 'utf8') });
  }
  return { topic: ctx.topic, artifactTopic: target.artifactTopic, metadata, briefs, idPrefix: target.artifactTopic === 'decision-trees-dryrun' ? 'ml-dry-trees-' : `ml-${ctx.topic}-`,
    prompts, coverage, sop: sop.slice(sop.indexOf('## 4.'), sop.indexOf('## 5.')), exemplar, kindSchema: schema,
    toyDataTemplate: { rows: prompts.toyData.rows, features: prompts.toyData.features, label: prompts.toyData.label, usedBy: prompts.toyData.usedBy },
    reuseReferences: coverage.prompts.filter(row => row.decision === 'REUSE').map(row => {
      const variant = baseline.authorVariants?.find(reference => reference.id === row.firstHit);
      const reference = baseline.references.find(reference => reference.id === (variant?.panelReferenceId ?? row.firstHit));
      return { ...reference, selectionId: row.firstHit, overlayId: reference?.id };
    }),
    registry: { path: `${DIAGRAMS}/reference-library.js`, content: await readFile(join(target.worktree, DIAGRAMS, 'reference-library.js'), 'utf8') },
    outputContract: `Return only {files:[{path,content}]}. Use topic-${target.artifactTopic}-data.js, topic-${target.artifactTopic}-references.js exporting a references array and derived(), topic-${target.artifactTopic}-references.test.mjs, topic-${target.artifactTopic}-token-budgets.json, topic-${target.artifactTopic}-replay-cases.json with {prompts:[{id,prompt,referenceId,paraphrases:[exactly five distinct strings]}]}, optional topic-${target.artifactTopic}-overlays.js exporting overlays, registry wiring in diagramReferences, the topic walkthrough and brief link. Export explicit overview, standard and deep specs. REUSE only through overlays that append prompts and keywords while preserving original modules. All visual specs, including detailSpec, must be <=300 compact cl100k tokens. Recompute every visible number in arithmetic tests; use only node:test and node:assert builtins, and relative imports within tutor-diagrams. The orchestrator recomputes token budgets. No authored tooling, renderer, schema or selector changes.`,
  };
}
