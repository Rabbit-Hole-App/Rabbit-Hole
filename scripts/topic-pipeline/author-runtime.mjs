// Trusted child entry point. The orchestrator copies this and the checks into
// its worktree; no authored module is evaluated in the key-bearing parent.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { lintAuthoredFiles, lintOverlays, lintReferences, countSpecTokens } from './checks/reference-linter.mjs';
import { selectAtDepth, depths } from './coverage.mjs';
import { runParaphraseReplay } from './checks/paraphrase-replay.mjs';

const input = JSON.parse(await readFile(process.argv[3], 'utf8'));
const root = process.cwd();
const load = file => import(pathToFileURL(resolve(root, file)).href);
const library = async () => (await load('packages/web/src/tutor-diagrams/reference-library.js')).diagramReferences;
const identity = ref => ref?.sourceId ?? ref?.id ?? null;
const sameData = (left, right) => isDeepStrictEqual(JSON.parse(JSON.stringify(left ?? null)), JSON.parse(JSON.stringify(right ?? null)));
const syntheticPlan = kind => ({ planner: 'jev', kind, visuals: [{ type: 'diagram', kind }] });
const write = value => writeFile(process.argv[4], JSON.stringify(value, null, 2) + '\n');
const assertions = [];
const assert = (condition, detail) => { if (!condition) assertions.push({ id: '<author>', depth: '*', rule: 2, detail, severity: 'error' }); };
const selected = async (text, depth, plan) => selectAtDepth({ prompt: text, depth, plan,
  fixture: input.fixture, topic: input.topic });

async function baseline() {
  const references = await library(), cases = [];
  const { singleDiagramReferences } = await load('packages/web/src/tutor-diagrams/reference-single-variants.js');
  for (const reference of references) {
    if (input.fixture && reference.id.startsWith('ml-trees-')) continue;
    for (const prompt of new Set([...(reference.prompts ?? []), ...(reference.paraphrases ?? [])])) {
      for (const depth of depths) {
        const plan = syntheticPlan(reference.spec.diagram.kind);
        const selection = await selected(prompt, depth, plan);
        cases.push({ prompt, depth, plan, firstHit: identity(selection.references[0]) });
      }
    }
  }
  return { references, authorVariants: singleDiagramReferences, cases, parity: 'Offline prior-pick parity with deterministic source-kind JEV plans' };
}

async function inspect() {
  const flags = lintAuthoredFiles({ files: input.files, repoRoot: root, topic: input.artifactTopic });
  if (flags.some(flag => flag.severity === 'error')) return { flags };
  const module = input.referenceModule ? await load(input.referenceModule) : {};
  const own = [...new Map(Object.values(module).filter(Array.isArray).flat()
    .filter(reference => reference?.id && reference?.spec?.diagram).map(reference => [reference.id, reference])).values()];
  const overlayModule = input.overlayModule ? await load(input.overlayModule) : {};
  const overlays = overlayModule.overlays ?? overlayModule.default ?? Object.entries(overlayModule).find(([key]) => /overlays/iu.test(key))?.[1] ?? {};
  const registry = await library(), prior = new Map(input.baseline.references.map(reference => [reference.id, reference]));
  const registered = new Map(registry.map(reference => [reference.id, reference]));
  const { singleDiagramReferences } = await load('packages/web/src/tutor-diagrams/reference-single-variants.js');
  const variants = new Map(singleDiagramReferences.map(reference => [reference.id, reference]));
  assert(registered.size === registry.length, 'The registry contains duplicate reference IDs.');
  const expected = [];
  for (const row of input.prompts.prompts) {
    const coverage = input.coverage.prompts.find(item => item.id === row.id);
    const reference = coverage?.decision === 'REUSE' ? registered.get(coverage.firstHit) ?? variants.get(coverage.firstHit) : own.find(item => item.prompts?.includes(row.prompt));
    assert(Boolean(reference), `Prompt ${row.id} has no ${coverage?.decision ?? 'coverage'} reference.`);
    if (!reference) continue;
    assert(reference.spec.diagram.kind === row.kind, `Prompt ${row.id} requires ${row.kind}; ${reference.id} has ${reference.spec.diagram.kind}.`);
    assert(reference.prompts?.includes(row.prompt), `Registry reference ${reference.id} omits prompt ${row.id} verbatim.`);
    if (coverage.decision === 'REUSE') {
      assert(overlays[reference.panelReferenceId ?? reference.id]?.prompts?.includes(row.prompt), `REUSE prompt ${row.id} requires a topic-local overlay on its base registry reference.`);
    } else {
      assert(own.filter(item => item.prompts?.includes(row.prompt)).length === 1, `NEW prompt ${row.id} maps to more than one authored reference.`);
    }
    expected.push({ ...row, referenceId: reference.id, overlayReferenceId: reference.panelReferenceId ?? reference.id });
  }
  for (const reference of own) {
    assert(!prior.has(reference.id), `Authored reference ${reference.id} collides with a pre-existing ID.`);
    assert(reference.id.startsWith(input.idPrefix), `Authored ID ${reference.id} must start with ${input.idPrefix}.`);
    assert(sameData(reference, registered.get(reference.id)), `Authored reference ${reference.id} is not registered unchanged.`);
  }
  for (const [id, before] of prior) {
    const after = registered.get(id);
    if (!overlays[id]) assert(sameData(before, after), `Pre-existing reference ${id} changed or was removed.`);
    else {
      const { prompts: oldPrompts, keywords: oldKeywords, ...oldVisual } = before;
      const { prompts: newPrompts, keywords: newKeywords, ...newVisual } = after ?? {};
      assert(sameData(oldVisual, newVisual), `REUSE reference ${id} changed beyond its prompt/keyword overlay.`);
      assert(oldPrompts.every(prompt => newPrompts?.includes(prompt)) && oldKeywords.every(keyword => newKeywords?.includes(keyword)), `Overlay for ${id} removed pre-existing prompts or keywords.`);
    }
  }
  flags.push(...lintOverlays({ overlays, references: input.baseline.references,
    prompts: expected.filter(row => input.coverage.prompts.find(hit => hit.id === row.id)?.decision === 'REUSE').map(row => ({ ...row, referenceId: row.overlayReferenceId })),
    source: input.files, repoRoot: root, topic: input.artifactTopic }));
  for (const [id, overlay] of Object.entries(overlays)) {
    assert(Object.keys(overlay).every(key => ['prompts', 'keywords'].includes(key)), `Overlay ${id} may only change prompts and keywords.`);
  }
  const { parseTutorDiagram } = await load('packages/web/src/tutor-diagrams/spec.js');
  const specErrors = [];
  for (const reference of own) for (const key of ['overview', 'standard', 'deep']) {
    const value = reference.depths?.[key] ?? reference;
    assert(Boolean(reference.depths?.[key]), `${reference.id} requires an explicit ${key} depth.`);
    // Every invalid spec becomes a flag, so one round's feedback names all of them, not only the first.
    for (const [field, spec] of [['spec', value.spec], ['detailSpec', value.detailSpec]]) {
      if (field === 'detailSpec' && !spec) continue;
      try { parseTutorDiagram(spec); }
      catch (error) { specErrors.push({ id: reference.id, depth: key, rule: 'spec', severity: 'error', detail: `${field}: ${String(error.message).slice(0, 1500)}` }); }
    }
    if (value.detailSpec && countSpecTokens(value.detailSpec) > 300) assertions.push({ id: reference.id, depth: key, rule: 1, severity: 'error', detail: 'detailSpec exceeds 300 cl100k tokens.' });
  }
  if (specErrors.length) return { flags: [...flags, ...specErrors, ...assertions] }; // the linter renders specs; it runs once they all parse
  if (own.length) flags.push(...lintReferences({ references: own, prompts: expected.filter(row => own.some(ref => ref.id === row.referenceId)),
    source: input.files, derived: module.derived, authored: true }));
  flags.push(...assertions);
  const replay = JSON.parse(await readFile(resolve(root, input.replayFile), 'utf8'));
  const cases = Array.isArray(replay) ? replay : replay.prompts;
  assert(Array.isArray(cases) && cases.length === expected.length, 'Replay cases must cover every supported prompt exactly once.');
  for (const row of expected) {
    const match = cases?.filter(item => item.id === row.id) ?? [];
    assert(match.length === 1 && match[0].prompt === row.prompt && match[0].referenceId === row.referenceId, `Replay case ${row.id} does not match its verbatim prompt and expected reference.`);
  }
  // These assertions were added after the reference checks.
  flags.push(...assertions.filter(issue => !flags.includes(issue)));
  const references = [...new Map(expected.map(row => [row.referenceId, registered.get(row.referenceId) ?? variants.get(row.referenceId)])).values()];
  const budgets = { encoding: 'cl100k_base', maxSpecTokens: 300, refs: {} };
  for (const reference of own) {
    budgets.refs[reference.id] = {};
    for (const depth of ['overview', 'standard', 'deep']) {
      const value = reference.depths?.[depth] ?? reference;
      budgets.refs[reference.id][depth] = [value.spec, value.detailSpec].filter(Boolean).map(spec => ({ tokens: countSpecTokens(spec), sha256: createHash('sha256').update(JSON.stringify(spec)).digest('hex') }));
    }
  }
  return { flags, references, ownIds: own.map(reference => reference.id), expected, replayCases: cases, budgets };
}

async function replay() {
  const rows = [], collisions = [];
  for (const row of input.expected) {
    const coverage = input.coverage.prompts.find(item => item.id === row.id);
    for (const depth of depths) {
      const plan = coverage?.depths.find(item => item.depth === depth)?.plan;
      if (!plan?.planner) throw new Error(`Coverage has no original planner plan for prompt ${row.id} at ${depth}. Rerun stage 02.`);
      const selection = await selected(row.prompt, depth, plan);
      const worked = selection.references.filter(reference => !/^(?:shape|general)-/u.test(reference.id));
      const collision = worked.some((reference, index) => worked.slice(index + 1).some(other => other.spec.diagram.kind === reference.spec.diagram.kind));
      const entry = { id: row.id, prompt: row.prompt, depth, firstHit: identity(selection.references[0]), referenceId: row.referenceId,
        firstPick: identity(selection.references[0]) === row.referenceId, plannedKinds: selection.plannedKinds,
        requiredKinds: selection.requiredKinds, references: selection.references, collision };
      rows.push(entry);
      if (collision) collisions.push(entry);
    }
  }
  const changedPriorPicks = [];
  for (const row of input.baseline.cases) {
    const selection = await selected(row.prompt, row.depth, row.plan);
    const firstHit = identity(selection.references[0]);
    if (firstHit !== row.firstHit) changedPriorPicks.push({ ...row, after: firstHit });
  }
  // Collisions are warnings (reviewer 2026-11-12): they are listed in the result and the stage notes but do not fail the replay.
  return { passed: rows.every(row => row.firstPick) && !changedPriorPicks.length,
    rows, collisions, changedPriorPicks, priorCases: input.baseline.cases.length, parity: input.baseline.parity };
}

async function paraphrases() {
  return runParaphraseReplay({ prompts: input.replayCases, fixture: input.fixture, topic: input.topic,
    planner: async (prompt, depth) => {
      const plan = input.plans[prompt]?.[depth];
      if (!plan?.planner) throw new Error(`Missing recorded paraphrase plan for ${JSON.stringify(prompt)} at ${depth}.`);
      return plan;
    } });
}

// Pre-round check of one author batch (no worktree files, no baseline): its references are written to a scratch folder, imported, every spec
// is parsed and the file-free linter rules run. All errors are returned together so one re-ask can repair them (reviewer 2026-11-12).
async function prevalidate() {
  const scratch = resolve(root, input.scratch);
  await mkdir(scratch, { recursive: true });
  for (const file of input.files) await writeFile(join(scratch, file.name), file.content);
  const module = await import(pathToFileURL(join(scratch, input.entry)).href);
  const { parseTutorDiagram } = await load('packages/web/src/tutor-diagrams/spec.js');
  const own = [...(module.references ?? [])], flags = [];
  for (const reference of own) for (const key of ['overview', 'standard', 'deep']) {
    const value = reference.depths?.[key];
    if (!value) { flags.push({ id: reference.id, depth: key, rule: 'spec', severity: 'error', detail: `${reference.id} requires an explicit ${key} depth.` }); continue; }
    for (const [field, spec] of [['spec', value.spec], ['detailSpec', value.detailSpec]]) {
      if (field === 'detailSpec' && !spec) continue;
      try { parseTutorDiagram(spec); }
      catch (error) { flags.push({ id: reference.id, depth: key, rule: 'spec', severity: 'error', detail: `${field}: ${String(error.message).slice(0, 1500)}` }); }
    }
  }
  const rows = [];
  for (const row of input.rows) {
    const reference = own.find(item => item.prompts?.includes(row.prompt));
    if (!reference) { flags.push({ id: '<author>', depth: '*', rule: 2, severity: 'error', detail: `Prompt ${row.id} has no reference carrying its prompt verbatim.` }); continue; }
    if (reference.spec?.diagram?.kind !== row.kind) flags.push({ id: '<author>', depth: '*', rule: 2, severity: 'error', detail: `Prompt ${row.id} requires ${row.kind}; ${reference.id} has ${reference.spec?.diagram?.kind}.` });
    rows.push({ ...row, referenceId: reference.id });
  }
  // The linter renders specs; it runs once every spec parses.
  if (!flags.length) flags.push(...lintReferences({ references: own, prompts: rows, source: input.files.map(file => ({ path: file.path, content: file.content })), derived: module.derived, authored: true }));
  return { flags: flags.filter(flag => flag.severity === 'error') };
}

async function previews() {
  const { exportIllustrationPreviews } = await load('packages/web/scripts/.topic-pipeline-illustration-previews.mjs');
  return exportIllustrationPreviews(input.previewDir, { references: input.references });
}

async function snapshots() {
  const { captureSvgSnapshots } = await load('packages/web/scripts/explanation-svg-snapshots.mjs');
  const result = captureSvgSnapshots();
  await writeFile(resolve(root, 'packages/web/src/tutor-diagrams/svg-snapshots.json'), JSON.stringify(result, null, 2) + '\n');
  return { entries: Object.keys(result.entries).length };
}

const commands = { baseline, inspect, prevalidate, replay, paraphrases, previews, snapshots };
if (!commands[process.argv[2]]) throw new Error('Unknown isolated author command.');
await write(await commands[process.argv[2]]());
