import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const git = promisify(execFile);
export const CORRECTED_REF = '771267ec';
export const ILLUSTRATIONS_PATH = 'docs/features/explain-on-canvas/handoff/phase02-library/illustrations';
export const DEFECTIVE_CASES = Object.freeze([
  { id: 'ml-trees-threshold-search', sha: 'c3e40994' },
  { id: 'ml-trees-regression-step-fit', sha: '5de6a499' },
  { id: 'ml-trees-majority-vote', sha: '06721c8b' },
  { id: 'ml-trees-gini-vs-entropy', sha: '06721c8b' },
  { id: 'ml-trees-forest-size-accuracy', sha: '06721c8b' },
  { id: 'ml-trees-depth-overfit', sha: 'c3e40994' },
  { id: 'ml-trees-feature-importance', sha: 'c3e40994' },
].map(Object.freeze));

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');

async function gitOutput(repoRoot, args) {
  try {
    return (await git('git', ['-C', repoRoot, ...args], { encoding: 'buffer', timeout: 60_000, maxBuffer: 32 * 1024 * 1024 })).stdout;
  } catch {
    throw new Error(`Cannot read fixture history (${args[0]}). Fetch the original fixture commits into the configured repository.`);
  }
}

async function existing(path) {
  try { return await readFile(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function previewIdentity(previewId) {
  const match = /-(brief|balanced|detailed)(?:-detail)?$/.exec(previewId);
  return { referenceId: previewId.replace(/-(?:brief|balanced|detailed)(?:-detail)?$|-detail$/, ''),
    depth: match?.[1] ?? 'balanced', detail: /-detail$/.test(previewId) };
}

async function sourcePreviews(repoRoot, ref) {
  const sha = (await gitOutput(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`])).toString('utf8').trim();
  const paths = (await gitOutput(repoRoot, ['ls-tree', '-r', '--name-only', sha, '--', ILLUSTRATIONS_PATH]))
    .toString('utf8').trim().split('\n').filter(Boolean);
  return { sha, paths: new Set(paths), previews: [...new Set(paths.filter(path => /\/(?:spec\.json|408\.svg)$/.test(path))
    .map(path => path.slice(ILLUSTRATIONS_PATH.length + 1).split('/')[0]))].sort() };
}

/** Copy git blobs verbatim. Historical renderer defects must stay visible. */
export async function extractFixtures({ repoRoot, fixtureDir, outDir, topic = 'decision-trees' } = {}) {
  if (topic !== 'decision-trees') throw new Error('The historical acceptance fixture is decision-trees only');
  if (!repoRoot || !(fixtureDir ?? outDir)) throw new Error('extractFixtures requires repoRoot and fixtureDir');
  const repository = resolve(repoRoot), destination = resolve(fixtureDir ?? outDir);
  const cache = new Map();
  const source = async ref => {
    if (!cache.has(ref)) cache.set(ref, await sourcePreviews(repository, ref));
    return cache.get(ref);
  };
  const pending = [], manifests = {};
  const addPreview = async ({ set, previewId, history, shortSha, caseId }) => {
    const identity = previewIdentity(previewId);
    const id = set === 'defective' ? `${previewId}@${shortSha}` : previewId;
    const files = {};
    for (const [key, filename] of [['spec', 'spec.json'], ['preview', '408.svg']]) {
      const sourcePath = `${ILLUSTRATIONS_PATH}/${previewId}/${filename}`;
      if (!history.paths.has(sourcePath)) throw new Error(`Missing original fixture blob: ${sourcePath}@${shortSha}`);
      const bytes = await gitOutput(repository, ['show', `${history.sha}:${sourcePath}`]);
      if (key === 'spec') {
        let spec;
        try { spec = JSON.parse(bytes.toString('utf8')); }
        catch { throw new Error(`Invalid original spec JSON: ${sourcePath}@${shortSha}`); }
        if (!spec || typeof spec !== 'object' || typeof spec.diagram?.kind !== 'string') throw new Error(`Missing diagram kind: ${sourcePath}@${shortSha}`);
      } else if (!/<svg\b/.test(bytes.toString('utf8'))) throw new Error(`Invalid original SVG: ${sourcePath}@${shortSha}`);
      const path = `references.${set}/${id}/${filename}`;
      pending.push({ path, bytes });
      files[key] = { path, sourcePath, sha256: digest(bytes) };
    }
    manifests[set].previews.push({ id, ...identity, caseId, sha: history.sha, files });
  };

  const corrected = await source(CORRECTED_REF);
  manifests.human = { version: 1, topic, sourceRef: CORRECTED_REF, sourceSha: corrected.sha, previews: [] };
  const correctedPreviews = corrected.previews.filter(id => id.startsWith('ml-trees-'));
  const correctedIds = new Set(correctedPreviews.map(id => previewIdentity(id).referenceId));
  if (correctedIds.size !== 15) throw new Error(`Expected 15 corrected Lesson 04 references at ${CORRECTED_REF}; found ${correctedIds.size}`);
  for (const previewId of correctedPreviews) {
    await addPreview({ set: 'human', previewId, history: corrected, shortSha: CORRECTED_REF,
      caseId: `${previewIdentity(previewId).referenceId}@${CORRECTED_REF}` });
  }
  manifests.defective = { version: 1, topic, cases: DEFECTIVE_CASES.map(({ id, sha }) => ({ id: `${id}@${sha}`, referenceId: id, ref: sha })), previews: [] };
  for (const item of DEFECTIVE_CASES) {
    const history = await source(item.sha);
    const previews = history.previews.filter(id => previewIdentity(id).referenceId === item.id);
    if (!previews.includes(item.id)) throw new Error(`Missing original balanced preview for ${item.id}@${item.sha}`);
    for (const previewId of previews) await addPreview({ set: 'defective', previewId, history, shortSha: item.sha, caseId: `${item.id}@${item.sha}` });
  }
  for (const [set, manifest] of Object.entries(manifests)) pending.push({ path: `references.${set}/manifest.json`, bytes: jsonBytes(manifest) });

  // Check the entire plan first. Reviewer-supplied files never get replaced,
  // including a manually supplied spec/preview that differs from git history.
  let preserved = 0;
  for (const file of pending) {
    const bytes = await existing(join(destination, file.path));
    if (bytes && !bytes.equals(file.bytes)) throw new Error(`Fixture differs from original history; preserved existing file: ${file.path}`);
    if (bytes) preserved++;
  }
  let written = 0;
  for (const file of pending) {
    const path = join(destination, file.path);
    await mkdir(dirname(path), { recursive: true });
    try { await writeFile(path, file.bytes, { flag: 'wx' }); written++; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await readFile(path)).equals(file.bytes)) throw new Error(`Fixture changed during extraction; preserved existing file: ${file.path}`);
    }
  }
  const missingReviewerInputs = [];
  for (const path of ['prompts.human.json', 'verify.human.json', 'audit.human.json', 'pack.human', 'references.defective/expected-verdicts.json']) {
    try { await stat(join(destination, path)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; missingReviewerInputs.push(path); }
  }
  return { version: 1, topic, fixtureDir: destination, correctedRef: CORRECTED_REF,
    correctedReferences: correctedIds.size, correctedPreviews: manifests.human.previews.length,
    defectiveCases: DEFECTIVE_CASES.length, defectivePreviews: manifests.defective.previews.length,
    originalBlobs: pending.length - 2, written, preserved, missingReviewerInputs,
    fixtureReady: missingReviewerInputs.length === 0, manifests };
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    config: { type: 'string' }, topic: { type: 'string' }, repo: { type: 'string' }, out: { type: 'string' },
  } });
  const topic = values.topic ?? positionals[0] ?? 'decision-trees';
  if (positionals.length > 1) throw new Error('Usage: extract-fixtures.mjs [decision-trees] --config <config.local.json> | --repo <repository> --out <fixture-directory>');
  let repoRoot = values.repo, fixtureDir = values.out;
  if (values.config) {
    const { loadConfig, getTopicPaths } = await import('../config.mjs');
    const config = await loadConfig(values.config);
    repoRoot ??= config.repo.root;
    fixtureDir ??= getTopicPaths(config, topic).fixtureDir;
  }
  const result = await extractFixtures({ topic, repoRoot, fixtureDir });
  const summary = { ...result };
  delete summary.manifests;
  delete summary.fixtureDir;
  console.log(JSON.stringify(summary, null, 2));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Fixture extraction failed. Existing files were preserved.'); process.exitCode = 1; });
}
