import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { callAgent } from '../agents/call.mjs';
import { BATCH_OUTPUT_CEILING, agentSettings } from '../budget.mjs';
import { createBatchedAuthor, prevalidatePayload, batchSchema, foundationSchema, paths as batchPaths, validateBatch, validateFoundation } from '../author-batch.mjs';
import { createAuthorSchema, dedupeAuthorFiles, validateAuthorFiles } from '../schemas.mjs';
import { authorInputs, authorTopic, authorWorktree, commitAuthorRound, git, isolated,
  prepareAuthorRuntime, testAuthored, writeAuthored } from '../author.mjs';
import { lintAuthoredFiles } from '../checks/reference-linter.mjs';
import { createContactSheet } from '../checks/contact-sheet.mjs';
import { createPlanner } from '../planner.mjs';
import { readJson, saveState, writeJson } from '../state.mjs';

const DIAGRAMS = 'packages/web/src/tutor-diagrams';
const hasErrors = flags => flags.some(flag => flag.severity === 'error');
const optionalJson = async file => { try { return await readJson(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

export async function run(ctx) {
  const rounds = ctx.config.limits?.authorRounds;
  const effort = agentSettings(ctx.config, 'author').effort; // recorded in the notes: attempts may override it with --author-effort
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error('limits.authorRounds must be a positive integer.');
  const prompts = await readJson(join(ctx.topicDir, 'prompts.json'));
  const coverage = await readJson(join(ctx.topicDir, 'coverage.json'));
  if (!Array.isArray(prompts.prompts) || !prompts.prompts.length || coverage.prompts?.length !== prompts.prompts.length ||
    prompts.prompts.some(row => !coverage.prompts.some(hit => hit.id === row.id && ['NEW', 'REUSE'].includes(hit.decision)))) throw new Error('Stage 03 requires matching prompts.json and coverage.json from stage 02.');
  const authorDir = join(ctx.topicDir, 'author');
  await mkdir(authorDir, { recursive: true });
  const target = await authorWorktree(ctx);
  await prepareAuthorRuntime(ctx, target);
  const basePayload = { topic: ctx.topic, artifactTopic: target.artifactTopic, fixture: Boolean(ctx.fixture && ctx.dryRun), prompts, coverage };
  const baselineFile = join(target.runtimeDir, 'baseline.json');
  let baseline = await optionalJson(baselineFile);
  if (!baseline) {
    if (await git(target.worktree, ['rev-parse', 'HEAD']) !== target.baseCommit) throw new Error('Existing author branch has no saved pristine replay baseline. Use a fresh isolated worktree.');
    baseline = await isolated(target, 'baseline', basePayload, authorDir);
    await writeJson(baselineFile, baseline);
  }
  const inputs = await authorInputs(ctx, target, prompts, coverage, baseline);
  const manifestFile = join(authorDir, 'manifest.json');
  const publishedManifest = join(ctx.topicDir, 'author.json');
  const previous = await optionalJson(manifestFile);
  const startingRound = previous?.roundsUsed ?? 0;
  const commits = previous?.commits ?? [];
  const manifest = { version: 1, topic: ctx.topic, artifactTopic: authorTopic(ctx), branch: target.branch, worktree: target.worktree,
    baseCommit: target.baseCommit, commits, references: previous?.references ?? [], previewDir: join(authorDir, 'previews'),
    roundsUsed: startingRound, status: 'running' };
  const saveManifest = async () => {
    await writeJson(manifestFile, manifest);
    await writeJson(publishedManifest, manifest);
  };
  await saveManifest();
  const accepted = new Map((previous?.files ?? []).map(file => [file.path, file]));
  const verification = await optionalJson(join(ctx.topicDir, 'verify.json'));
  let feedback = ctx.authorFeedback ?? verification ?? '';
  if (typeof feedback !== 'string') feedback = JSON.stringify(feedback, null, 2);
  const planner = ctx.planner ?? createPlanner(ctx.config, { state: ctx.state, stage: '03', onUsage: () => saveState(ctx.topicDir, ctx.state) });
  // Batched author (limits.authorBatchSize): a foundation call, then parallel batches of prompts. Not used with REUSE prompts or topic briefs; those keep the single call.
  const batchSize = ctx.config.limits?.authorBatchSize;
  let batchedRound = null, roundDirNow = authorDir;
  if (Number.isInteger(batchSize) && batchSize > 0 && !coverage.prompts.some(row => row.decision === 'REUSE') && !inputs.briefs.length) {
    const prompt = name => readFile(new URL(`../agents/prompts/${name}.md`, import.meta.url), 'utf8');
    const system = `${await prompt('author')}

${await prompt('author-batch')}`;
    // Pre-round check (reviewer 2026-11-12): a batch's specs must parse and pass the file-free linter rules before its answer counts; one re-ask, no round spent.
    const prevalidate = async (value, assigned, payload) => {
      const tag = `-${assigned[0].id}`;
      const { flags } = await isolated(target, 'prevalidate', prevalidatePayload({ artifactTopic: target.artifactTopic, diagrams: DIAGRAMS, value, dataModule: payload.dataModule, assigned,
        scratch: `scripts/.topic-pipeline-author/prevalidate${tag}` }), roundDirNow, tag);
      if (flags.length) throw new Error(JSON.stringify(flags, null, 2));
    };
    const dryRun = ctx.fixture && ctx.dryRun, p = batchPaths(target.artifactTopic, DIAGRAMS), options = { topic: ctx.topic, dryRun, repoRoot: target.worktree };
    batchedRound = createBatchedAuthor({ artifactTopic: target.artifactTopic, diagrams: DIAGRAMS, size: batchSize, rows: prompts.prompts, registry: inputs.registry.content, exemplar: inputs.exemplar,
      base: { topic: inputs.topic, artifactTopic: inputs.artifactTopic, idPrefix: inputs.idPrefix, metadata: inputs.metadata, prompts, coverage, sop: inputs.sop, kindSchema: inputs.kindSchema, rendererConstraints: inputs.rendererConstraints, toyDataTemplate: inputs.toyDataTemplate },
      call: (kind, payload, assigned, last) => kind === 'foundation' ? callAgent(ctx, 'author', payload, { system, maxOutput: BATCH_OUTPUT_CEILING, schema: foundationSchema(ctx.topic, dryRun), validate: value => validateFoundation(value, options, p) })
        : callAgent(ctx, 'author', payload, { system, maxOutput: BATCH_OUTPUT_CEILING, schema: batchSchema, validate: async value => { validateBatch(value, assigned, last); await prevalidate(value, assigned, payload); return value; } }) });
  }
  for (let round = startingRound + 1; round <= rounds; round++) {
    const roundDir = join(authorDir, `round-${round}`);
    await mkdir(roundDir, { recursive: true });
    manifest.roundsUsed = round;
    roundDirNow = roundDir;
    await saveManifest();
    const warnings = [];
    const saveWarnings = () => warnings.length ? writeFile(join(roundDir, 'warnings.txt'), `${warnings.join('\n')}\n`) : null;
    try {
      const response = batchedRound ? await batchedRound(feedback, round) : await callAgent(ctx, 'author', { ...inputs, previousFiles: [...accepted.values()], feedback: String(feedback), round }, {
        schema: createAuthorSchema(ctx.topic, { dryRun: ctx.fixture && ctx.dryRun }),
        validate: value => { for (const path of dedupeAuthorFiles(value)) { const line = `Warning: the author returned ${path} more than once; kept the last entry.`; console.error(line); warnings.push(line); } return validateAuthorFiles(value, { topic: ctx.topic, dryRun: ctx.fixture && ctx.dryRun, repoRoot: target.worktree }); } });
      await saveWarnings();
      // Validate the full author response as text before any file write/import.
      const flags = lintAuthoredFiles({ files: response.files, repoRoot: target.worktree, topic: target.artifactTopic });
      await writeJson(join(roundDir, 'static-lint.json'), flags);
      if (hasErrors(flags)) throw new Error(JSON.stringify(flags, null, 2));
      const candidate = new Map(accepted);
      for (const file of response.files) candidate.set(file.path, file);
      const files = [...candidate.values()];
      const cumulativeFlags = lintAuthoredFiles({ files, repoRoot: target.worktree, topic: target.artifactTopic });
      if (hasErrors(cumulativeFlags)) throw new Error(JSON.stringify(cumulativeFlags, null, 2));
      const briefPaths = new Set(inputs.briefs.map(brief => brief.path));
      for (const file of response.files) {
        if (file.path.includes('/figure-briefs/briefs/') && !briefPaths.has(file.path)) throw new Error(`Author may update only the exact brief sources in topic.json: ${file.path}`);
        if (file.path === `${DIAGRAMS}/svg-snapshots.json` || /\/(?:illustrations|snapshots)\//u.test(file.path)) throw new Error('Preview and SVG snapshot files are generated by the existing tooling, not authored as text.');
      }
      const required = [`${DIAGRAMS}/topic-${target.artifactTopic}-replay-cases.json`,
        `docs/features/explain-on-canvas/handoff/phase02-library/topic-walkthroughs/${target.artifactTopic}.md`, ...briefPaths];
      if (coverage.prompts.some(row => row.decision === 'NEW')) required.push(`${DIAGRAMS}/topic-${target.artifactTopic}-data.js`, `${DIAGRAMS}/topic-${target.artifactTopic}-references.js`);
      if (required.some(path => !candidate.has(path))) throw new Error(`Author output is missing required topic files: ${required.filter(path => !candidate.has(path)).join(', ')}`);
      for (const [path, file] of candidate) accepted.set(path, file);
      await writeJson(join(roundDir, 'author-files.json'), { files: response.files });
      await writeAuthored(target, response.files);
      await testAuthored(target, files, roundDir);
      const referenceModule = `${DIAGRAMS}/topic-${target.artifactTopic}-references.js`;
      const overlayModule = `${DIAGRAMS}/topic-${target.artifactTopic}-overlays.js`;
      const replayFile = `${DIAGRAMS}/topic-${target.artifactTopic}-replay-cases.json`;
      const payload = { ...basePayload, baseline, files, idPrefix: inputs.idPrefix, replayFile,
        referenceModule: files.some(file => file.path === referenceModule) ? referenceModule : null,
        overlayModule: files.some(file => file.path === overlayModule) ? overlayModule : null };
      const inspection = await isolated(target, 'inspect', payload, roundDir);
      if (hasErrors(inspection.flags)) throw new Error(JSON.stringify(inspection.flags, null, 2));
      const budgetPath = `${DIAGRAMS}/topic-${target.artifactTopic}-token-budgets.json`;
      await writeJson(join(target.worktree, budgetPath), inspection.budgets);
      const budgetFile = { path: budgetPath, content: await readFile(join(target.worktree, budgetPath), 'utf8') };
      accepted.set(budgetPath, budgetFile);
      const rendered = join(target.runtimeDir, 'previews');
      await isolated(target, 'previews', { ...payload, references: inspection.references, previewDir: rendered }, roundDir);
      await mkdir(manifest.previewDir, { recursive: true });
      const previewEntries = await readdir(rendered, { withFileTypes: true });
      for (const entry of previewEntries.filter(entry => entry.isDirectory())) {
        if (!inspection.references.some(reference => entry.name === reference.id || ['-brief', '-balanced', '-detailed', '-detail', '-brief-detail', '-detailed-detail'].some(suffix => entry.name === reference.id + suffix))) continue;
        await cp(join(rendered, entry.name), join(manifest.previewDir, entry.name), { recursive: true });
        if (!inspection.ownIds.some(id => entry.name === id || ['-brief', '-balanced', '-detailed', '-detail', '-brief-detail', '-detailed-detail'].some(suffix => entry.name === id + suffix))) continue;
        const destination = join(target.worktree, 'docs/features/explain-on-canvas/handoff/phase02-library/illustrations', entry.name);
        await mkdir(destination, { recursive: true });
        for (const name of ['408.svg', 'natural.svg', '960.svg', 'spec.json']) await cp(join(rendered, entry.name, name), join(destination, name));
      }
      await isolated(target, 'snapshots', payload, roundDir);
      const replay = await isolated(target, 'replay', { ...payload, expected: inspection.expected }, roundDir);
      // The failure names collisions and rows that missed their reference; the passing rows would only bloat the next author input past its ceiling.
      if (!replay.passed) { const { rows, ...rest } = replay; throw new Error(JSON.stringify({ ...rest, failingRows: rows.filter(row => !row.firstPick) }, null, 2)); }
      const plans = {};
      for (const row of inspection.replayCases) for (const prompt of row.paraphrases ?? []) {
        plans[prompt] ??= {};
        for (const depth of ['brief', 'balanced', 'detailed']) plans[prompt][depth] ??= await planner(prompt, depth);
      }
      const paraphrases = await isolated(target, 'paraphrases', { ...payload, replayCases: inspection.replayCases, plans }, roundDir);
      if (!paraphrases.passed) throw new Error(JSON.stringify(paraphrases, null, 2));
      const contact = await createContactSheet({ previewDir: manifest.previewDir, outDir: roundDir,
        references: inspection.references, sourceFiles: files.filter(file => /\.[cm]?js$/u.test(file.path) && !/\.test\.mjs$/u.test(file.path)).map(file => join(target.worktree, file.path)) });
      const commit = await commitAuthorRound(target, { topic: ctx.topic }, { files: [...accepted.values()], ownIds: inspection.ownIds });
      commits.push(commit);
      manifest.status = 'ok';
      manifest.files = [...accepted.values()];
      manifest.references = inspection.references.map(reference => ({ ...reference, kind: reference.spec.diagram.kind,
        promptIds: inspection.expected.filter(row => row.referenceId === reference.id).map(row => row.id),
        authored: inspection.ownIds.includes(reference.id), decision: inspection.ownIds.includes(reference.id) ? 'NEW' : 'REUSE' }));
      manifest.referenceModule = payload.referenceModule;
      manifest.overlayModule = payload.overlayModule;
      manifest.contactSheetPath = contact.contactSheetPath;
      manifest.numbersPath = contact.numbersPath;
      manifest.paraphraseFirstPickRate = paraphrases.firstPickRate;
      manifest.priorReplay = { cases: replay.priorCases, changed: 0, parity: replay.parity };
      manifest.checks = { linterPassed: !hasErrors(inspection.flags), paraphraseFirstPickRate: paraphrases.firstPickRate,
        priorPickChanges: replay.changedPriorPicks.length, replayPassed: replay.passed,
        promptDepthCases: replay.rows.length, priorDepthCases: replay.priorCases, previewCount: contact.previewCount };
      manifest.commit = commit;
      await saveManifest();
      return { status: 'ok', artefacts: [authorDir, publishedManifest], notes: `Author round ${round}/${rounds} (effort ${effort}): linter green, ${inspection.expected.length} prompt references first at all depths, ${(paraphrases.firstPickRate * 100).toFixed(1)}% paraphrase first picks, commit ${commit}.` };
    } catch (error) {
      feedback = error.message;
      await saveWarnings();
      await writeFile(join(roundDir, 'feedback.txt'), feedback + '\n');
      manifest.files = [...accepted.values()];
      manifest.lastFailure = feedback;
      await saveManifest();
      if (ctx.state.calls?.some(entry => entry.usageKnown === false)) {
        manifest.status = 'fail';
        await saveManifest();
        return { status: 'fail', artefacts: [authorDir, publishedManifest], notes: `Author round ${round}/${rounds} (effort ${effort}) stopped: provider usage is unknown. Reconcile it before rerunning; no further round was started.` };
      }
    }
  }
  manifest.status = 'fail';
  await saveManifest();
  return { status: 'fail', artefacts: [authorDir, publishedManifest], notes: `Author checks did not pass within ${rounds} configured rounds (effort ${effort}). Verbatim feedback is saved in author/round-${manifest.roundsUsed}/feedback.txt.` };
}
