import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const stageIds = { prompts: '01', author: '03', verify: '04', pack: '06', audit: '07' };
const verdicts = { '04': ['ship', 'fix'], '07': ['ship', 'regenerate', 'hold'] };
const nullableNumber = { type: ['number', 'null'], minimum: 0 };
export const fixtureScoreSchema = {
  type: 'object', additionalProperties: false,
  required: ['version', 'topic', 'stage', 'mode', 'status', 'passed', 'metrics', 'gates', 'issues', 'mismatches', 'costUsd', 'wallMs'],
  properties: {
    version: { const: 1 }, topic: { type: 'string' }, stage: { enum: ['01', '03', '04', '06', '07'] },
    mode: { enum: ['human', 'agent'] }, status: { enum: ['pass', 'fail', 'unscored'] }, passed: { type: 'boolean' },
    metrics: { type: 'object' }, issues: { type: 'array', items: { type: 'string' } },
    gates: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'actual', 'target', 'passed'],
      properties: { name: { type: 'string' }, actual: {}, target: {}, passed: { type: ['boolean', 'null'] } } } },
    mismatches: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'expected', 'actual'],
      properties: { id: { type: 'string' }, expected: { type: 'string' }, actual: { type: ['string', 'null'] } } } },
    costUsd: nullableNumber, wallMs: nullableNumber,
  },
};
export const fixtureReportSchema = {
  type: 'object', additionalProperties: false,
  required: ['version', 'topic', 'status', 'passed', 'stages', 'costUsd', 'wallMs'],
  properties: { version: { const: 1 }, topic: { type: 'string' }, status: { enum: ['pass', 'fail', 'unscored'] },
    passed: { type: 'boolean' }, stages: { type: 'array', minItems: 1, items: fixtureScoreSchema },
    costUsd: nullableNumber, wallMs: nullableNumber },
};

const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const metric = value => number(value) ? value : null;
const gate = (report, name, actual, target, passed) => report.gates.push({ name, actual: actual ?? null, target, passed });
const unscored = (report, name, detail) => { report.issues.push(detail); gate(report, name, null, 'required input', null); };
function finish(report) {
  report.status = report.gates.some(row => row.passed === null) ? 'unscored' : report.gates.some(row => !row.passed) ? 'fail' : 'pass';
  report.passed = report.status === 'pass';
  return report;
}

function rowsOf(input, key, { map = false } = {}) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return null;
  if (Array.isArray(input[key])) return input[key];
  const dictionary = input.verdicts ?? input.expectedVerdicts ?? (map ? input : null);
  if (map && dictionary && typeof dictionary === 'object' && !Array.isArray(dictionary)) {
    return Object.entries(dictionary).filter(([key]) => !['topic', 'version', 'revision', 'sha'].includes(key))
      .map(([id, value]) => typeof value === 'string' ? { id, verdict: value } : { ...value, id });
  }
  return null;
}

function identity(row, stage, defaults = {}) {
  if (!row || !['string', 'number'].includes(typeof row.id) || !String(row.id).trim()) return null;
  let id = String(row.id).replaceAll('\\', '/').replace(/\/(?:408\.svg|spec\.json)$/, '').split('/').at(-1);
  if (stage === '07') {
    const number = /^(?:card[-_]?)?0*(\d{1,2})(?=$|[-_])/.exec(id)?.[1];
    return { id: number ?? id, key: number ?? id };
  }
  const embeddedSha = /@([a-f0-9]{7,40})(?=-(?:brief|balanced|detailed)(?:-detail)?$|$)/i.exec(id);
  if (embeddedSha) id = id.replace(embeddedSha[0], '');
  const depthMatch = /-(brief|balanced|detailed)(?:-detail)?$/.exec(id);
  const depth = row.depth ?? depthMatch?.[1] ?? 'balanced';
  if (!['brief', 'balanced', 'detailed'].includes(depth)) return null;
  if (row.depth && depthMatch && row.depth !== depthMatch[1]) return null;
  const sha = embeddedSha?.[1] ?? row.sha ?? row.revision ?? row.commit ?? defaults.sha ?? defaults.revision;
  if (sha !== undefined && (typeof sha !== 'string' || !/^[a-f0-9]{7,40}$/i.test(sha))) return null;
  return { id, base: id.replace(/-(?:brief|balanced|detailed)(?:-detail)?$|-detail$/, ''), depth,
    detail: /-detail$/.test(id), sha: sha?.toLowerCase(), key: `${id}@${sha?.toLowerCase() ?? ''}:${depth}` };
}

function validRows(report, input, stage, label, { map = false, key = stage === '04' ? 'figures' : 'cards' } = {}) {
  const rows = rowsOf(input, key, { map });
  if (!rows?.length) { unscored(report, label, `${label} is missing or has no ${key}; no verdicts were inferred.`); return null; }
  const result = [];
  for (const row of rows) {
    const id = identity(row, stage, input);
    if (!id || !verdicts[stage].includes(row.verdict)) {
      unscored(report, label, `${label} contains a missing/invalid id, revision, depth or verdict.`);
      return null;
    }
    if (result.some(item => item.identity.key === id.key)) {
      unscored(report, label, `${label} repeats figure/card identity ${row.id}.`);
      return null;
    }
    result.push({ ...row, identity: id });
  }
  return result;
}

const sameSha = (left, right) => left && right && (left.startsWith(right) || right.startsWith(left));
function findActual(expected, actual, stage) {
  if (stage === '07') return actual.filter(row => row.identity.id === expected.identity.id);
  const target = expected.identity;
  return actual.filter(({ identity: value }) => value.base === target.base && value.depth === target.depth && value.detail === target.detail &&
    (!target.sha || sameSha(value.sha, target.sha)));
}

function agreement(report, actual, expected, name, stage) {
  let matched = 0;
  for (const row of expected) {
    const candidates = findActual(row, actual, stage);
    if (candidates.length > 1) {
      unscored(report, `${name}-identity`, `Ambiguous ${name} identity ${row.id}; supply the original revision/depth.`);
      continue;
    }
    const verdict = candidates[0]?.verdict ?? null;
    if (verdict === row.verdict) matched++;
    else report.mismatches.push({ id: String(row.id), expected: row.verdict, actual: verdict });
  }
  const value = { matched, total: expected.length, rate: matched / expected.length };
  report.metrics[name] = value;
  return value;
}

function scorePrompts(report, options) {
  const actual = rowsOf(options.actual, 'prompts'), expected = rowsOf(options.expected, 'prompts');
  if (!actual?.length) unscored(report, 'prompts', 'Generated prompts are missing.');
  if (!expected?.length) unscored(report, 'human-prompts', 'prompts.human.json is missing; teaching-point overlap is unscored.');
  const mapping = Array.isArray(options.promptMapping) ? options.promptMapping : options.promptMapping?.matches;
  if (!Array.isArray(mapping)) unscored(report, 'prompt-mapping', 'An explicit reviewer-model prompt mapping is required; overlap was not guessed.');
  if (!actual?.length || !expected?.length || !Array.isArray(mapping)) return;
  const actualById = new Map(actual.map(row => [String(row.id), row])), expectedById = new Map(expected.map(row => [String(row.id), row]));
  if (actualById.size !== actual.length || expectedById.size !== expected.length || actual.some(row => row.id === undefined) || expected.some(row => row.id === undefined)) {
    unscored(report, 'prompt-identities', 'Both prompt files require distinct explicit ids.'); return;
  }
  gate(report, 'generated-prompt-count', actual.length, 12, actual.length === 12);
  let matched = 0, kinds = 0;
  const usedActual = new Set(), usedHuman = new Set();
  for (const pair of mapping) {
    const actualId = String(pair.promptId), humanId = String(pair.humanPromptId);
    if (!actualById.has(actualId) || !expectedById.has(humanId) || typeof pair.sameTeachingPoint !== 'boolean') {
      unscored(report, 'prompt-mapping', 'Every prompt mapping needs existing promptId/humanPromptId and explicit sameTeachingPoint.'); return;
    }
    if (!pair.sameTeachingPoint) continue;
    if (usedActual.has(actualId) || usedHuman.has(humanId)) {
      unscored(report, 'prompt-mapping', 'Teaching-point matches must be one-to-one.'); return;
    }
    usedActual.add(actualId); usedHuman.add(humanId); matched++;
    const left = actualById.get(actualId), right = expectedById.get(humanId);
    if (typeof left.kind !== 'string' || typeof right.kind !== 'string') {
      unscored(report, 'kind-agreement', 'Matched prompts require explicit kinds in both prompt files.'); return;
    }
    if (left.kind === right.kind) kinds++;
  }
  report.metrics.teachingPointOverlap = { matched, total: 12, rate: matched / 12 };
  report.metrics.kindAgreement = { matched: kinds, total: matched, rate: matched ? kinds / matched : 0 };
  gate(report, 'teaching-point-overlap', matched, '>= 9/12', matched >= 9);
  gate(report, 'matched-kind-agreement', report.metrics.kindAgreement.rate, '>= 0.8', matched > 0 && kinds / matched >= 0.8);
}

function scoreAuthor(report, options) {
  const actual = options.actual;
  if (!actual || typeof actual !== 'object') { unscored(report, 'author-checks', 'Author check results are missing.'); return; }
  if (typeof actual.linterPassed !== 'boolean') unscored(report, 'linter', 'Author result requires explicit linterPassed.');
  else gate(report, 'linter', actual.linterPassed, true, actual.linterPassed);
  if (!number(actual.paraphraseFirstPickRate) || actual.paraphraseFirstPickRate > 1) unscored(report, 'paraphrase', 'Author result requires paraphraseFirstPickRate between 0 and 1.');
  else gate(report, 'paraphrase-first-pick', actual.paraphraseFirstPickRate, '>= 0.8', actual.paraphraseFirstPickRate >= 0.8);
  const rounds = options.roundsUsed ?? actual.roundsUsed;
  if (!Number.isInteger(rounds) || rounds < 1) unscored(report, 'author-rounds', 'Author roundsUsed is missing.');
  else gate(report, 'author-rounds', rounds, `<= ${options.authorRounds ?? 3}`, rounds <= (options.authorRounds ?? 3));
  report.metrics.roundsUsed = rounds ?? null;
}

function reasons(row) {
  return [row.reason, ...(Array.isArray(row.reasons) ? row.reasons : [])].filter(value => typeof value === 'string').join(' ');
}

function scoreVerify(report, options) {
  const actual = validRows(report, options.actual, '04', 'verifier-output');
  if (!actual) return;
  if (report.mode === 'agent') {
    const ship = actual.filter(row => row.verdict === 'ship').length;
    report.metrics.verdicts = { ship, fix: actual.length - ship, total: actual.length };
    gate(report, 'agent-figure-count', actual.length, 12, actual.length === 12);
    gate(report, 'agent-reference-ship', ship, '>= 10/12', ship >= 10);
    const rounds = options.roundsUsed ?? options.actual?.roundsUsed;
    if (!Number.isInteger(rounds) || rounds < 1) unscored(report, 'verify-rounds', 'Agent verifier roundsUsed is missing.');
    else gate(report, 'verify-rounds', rounds, `<= ${options.verifyRounds ?? 2}`, rounds <= (options.verifyRounds ?? 2));
    report.metrics.roundsUsed = rounds ?? null;
    return;
  }
  const expected = validRows(report, options.expected, '04', 'verify.human.json');
  if (expected) {
    // The missed depth-five case is an additional mandatory check, not an
    // eleventh pilot vote that changes the specified eight-of-ten threshold.
    const pilot = expected.filter(row => sameSha(row.identity.sha, 'c3e40994') || row.pilot === true);
    if (pilot.length !== 10) unscored(report, 'pilot-identities', 'verify.human.json must identify the ten c3e40994 pilot figures by revision or pilot:true; no subset was invented.');
    else {
      const result = agreement(report, actual, pilot, 'pilotAgreement', '04');
      gate(report, 'verifier-human-agreement', result.matched, '>= 8/10', result.matched >= 8);
    }
  }
  const defective = validRows(report, options.defectiveExpected, '04', 'references.defective/expected-verdicts.json', { map: true });
  if (defective) agreement(report, actual, defective, 'defectiveAgreement', '04');
  for (const item of [
    { name: '48ths-axis', base: 'ml-trees-threshold-search', sha: 'c3e40994', pattern: /48ths|forty[ -]eighths/i },
    { name: 'depth5-16-leaves', base: 'ml-trees-regression-step-fit', sha: '5de6a499', pattern: /(?=.*(?:depth|leav))(?=.*(?:\b(?:4|5|16)\b|four|five|sixteen))/i },
  ]) {
    const candidates = actual.filter(row => row.identity.base === item.base && sameSha(row.identity.sha, item.sha));
    const flagged = candidates.some(row => row.verdict === 'fix' && item.pattern.test(reasons(row)));
    gate(report, `must-flag-${item.name}`, flagged, 'fix with defect identified in reasons', flagged);
  }
}

function scorePack(report, options) {
  const actual = options.actual;
  if (!actual || typeof actual !== 'object') { unscored(report, 'pack', 'Pack summary is missing.'); return; }
  for (const [key, target, name] of [['total', 12, 'pack-card-count'], ['referenceSent', 12, 'intended-reference-sent'],
    ['kindMatches', 11, 'model-reference-kind'], ['delivered', 12, 'delivered']]) {
    const value = actual[key];
    if (!Number.isInteger(value) || value < 0 || (key !== 'total' && Number.isInteger(actual.total) && value > actual.total)) {
      unscored(report, name, `Pack summary requires an explicit valid ${key} count.`); continue;
    }
    report.metrics[key] = value;
    gate(report, name, value, key === 'kindMatches' ? '>= 11/12' : target, key === 'kindMatches' ? value >= target : value === target);
  }
}

function scoreAudit(report, options) {
  const actual = validRows(report, options.actual, '07', 'auditor-output');
  if (!actual) return;
  if (report.mode === 'agent') {
    const counts = Object.fromEntries(verdicts['07'].map(verdict => [verdict, actual.filter(row => row.verdict === verdict).length]));
    report.metrics.verdicts = { ...counts, total: actual.length };
    gate(report, 'agent-card-count', actual.length, 12, actual.length === 12);
    gate(report, 'agent-pack-ship', counts.ship, '>= 11/12', counts.ship >= 11);
    gate(report, 'agent-pack-hold', counts.hold, 0, counts.hold === 0);
    return;
  }
  const expected = validRows(report, options.expected, '07', 'audit.human.json');
  if (expected) {
    gate(report, 'human-pack-count', expected.length, 13, expected.length === 13);
    const result = agreement(report, actual, expected, 'humanAgreement', '07');
    gate(report, 'auditor-human-agreement', result.matched, '>= 11/13', result.matched >= 11);
  }
  for (const [id, verdict] of [['8', 'hold'], ['5', 'regenerate'], ['9', 'regenerate']]) {
    const row = actual.find(row => row.identity.id === id);
    gate(report, `must-${verdict}-card-${id.padStart(2, '0')}`, row?.verdict, verdict, row?.verdict === verdict);
  }
}

/** Pure comparison only: no model calls, semantic guesses, or invented verdicts. */
export function scoreFixture(options = {}) {
  const requested = String(options.stage ?? ''), stage = stageIds[requested] ?? requested.slice(0, 2);
  if (!['01', '03', '04', '06', '07'].includes(stage)) throw new Error('Fixture stage must be 01, 03, 04, 06 or 07');
  const mode = options.mode ?? 'human';
  if (!['human', 'agent'].includes(mode)) throw new Error('Fixture mode must be human or agent');
  const report = { version: 1, topic: options.topic ?? 'decision-trees', stage, mode, status: 'unscored', passed: false,
    metrics: {}, gates: [], issues: [], mismatches: [],
    costUsd: metric(options.costUsd ?? options.actual?.costUsd), wallMs: metric(options.wallMs ?? options.actual?.wallMs) };
  ({ '01': scorePrompts, '03': scoreAuthor, '04': scoreVerify, '06': scorePack, '07': scoreAudit })[stage](report, options);
  return finish(report);
}

export function scoreFixtureReport({ topic = 'decision-trees', stages } = {}) {
  if (!Array.isArray(stages) || !stages.length) throw new Error('A fixture report requires stage inputs');
  const scored = stages.map(options => scoreFixture({ topic, ...options }));
  const status = scored.some(row => row.status === 'unscored') ? 'unscored' : scored.some(row => !row.passed) ? 'fail' : 'pass';
  const sum = key => scored.every(row => row[key] !== null) ? scored.reduce((sum, row) => sum + row[key], 0) : null;
  return { version: 1, topic, status, passed: status === 'pass', stages: scored, costUsd: sum('costUsd'), wallMs: sum('wallMs') };
}

async function optionalJson(path) {
  if (!path) return undefined;
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw new Error(`Invalid fixture JSON: ${path}`); }
}

function stageActual(stage, value) {
  if (stage === '03' && value?.checks) return { ...value.checks, roundsUsed: value.roundsUsed };
  if (stage === '06' && value?.metrics) return { total: value.rows?.length, referenceSent: value.metrics.sent,
    kindMatches: value.metrics.kinds, delivered: value.metrics.delivered };
  return value;
}

export async function scoreSavedFixture({ topic = 'decision-trees', topicDir, fixtureDir, authorRounds = 3, verifyRounds = 2, stages = ['01', '03', '04', '06', '07'] } = {}) {
  if (!topicDir || !fixtureDir) throw new Error('scoreSavedFixture requires topicDir and fixtureDir');
  const definitions = [
    { stage: '01', actual: join(topicDir, 'prompts.json'), expected: join(fixtureDir, 'prompts.human.json'), promptMapping: join(topicDir, 'prompt-mapping.json') },
    { stage: '03', actual: join(topicDir, 'author.json') },
    { stage: '04', actual: join(topicDir, 'verify.human.json'), expected: join(fixtureDir, 'verify.human.json'), defectiveExpected: join(fixtureDir, 'references.defective', 'expected-verdicts.json') },
    { stage: '06', actual: join(topicDir, 'pack.json') },
    { stage: '07', actual: join(topicDir, 'audit.human.json'), expected: join(fixtureDir, 'audit.human.json') },
    { stage: '04', mode: 'agent', actual: join(topicDir, 'verify.json') },
    { stage: '07', mode: 'agent', actual: join(topicDir, 'audit.json') },
  ];
  const inputs = [];
  const state = await optionalJson(join(topicDir, 'state.json'));
  for (const definition of definitions.filter(row => stages.includes(row.stage))) {
    const input = { stage: definition.stage, mode: definition.mode ?? 'human', authorRounds, verifyRounds };
    for (const key of ['actual', 'expected', 'promptMapping', 'defectiveExpected']) input[key] = await optionalJson(definition[key]);
    input.actual = stageActual(definition.stage, input.actual);
    if (definition.mode === 'agent' && state?.stages?.[definition.stage]?.status !== 'ok') input.actual = null;
    const dualMode = ['04', '07'].includes(definition.stage);
    const stageCalls = state?.calls?.filter(call => String(call.stage).slice(0, 2) === definition.stage);
    // A shared stage total cannot establish the costs/timing of both its
    // human-input and agent-input runs. Leave those unknown without mode tags.
    const calls = dualMode ? stageCalls?.filter(call => call.mode === input.mode) : stageCalls;
    if (calls?.length && calls.every(call => number(call.usd))) input.costUsd = calls.reduce((sum, call) => sum + call.usd, 0);
    const stage = state?.stages?.[definition.stage];
    if ((!dualMode || stage?.mode === input.mode) && stage?.startedAt && stage?.finishedAt) {
      const elapsed = Date.parse(stage.finishedAt) - Date.parse(stage.startedAt);
      if (number(elapsed)) input.wallMs = elapsed;
    }
    inputs.push(input);
  }
  return scoreFixtureReport({ topic, stages: inputs });
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    config: { type: 'string' }, topic: { type: 'string' }, stage: { type: 'string', default: 'all' }, mode: { type: 'string', default: 'human' },
    actual: { type: 'string' }, expected: { type: 'string' }, mapping: { type: 'string' }, 'defective-expected': { type: 'string' },
    out: { type: 'string' }, 'rounds-used': { type: 'string' },
  } });
  const topic = values.topic ?? positionals[0] ?? 'decision-trees';
  if (positionals.length > 1) throw new Error('Usage: fixture-score.mjs [topic] --config <config.local.json> [--stage 04 --actual <verify.json> --expected <verify.human.json>]');
  let paths;
  if (values.config) {
    const { loadConfig, getTopicPaths } = await import('../config.mjs');
    const config = await loadConfig(values.config);
    paths = getTopicPaths(config, topic);
  }
  let result;
  if (values.stage === 'all') {
    if (!paths) throw new Error('All-stage scoring requires --config');
    result = await scoreSavedFixture({ topic, ...paths });
  } else {
    const stage = stageIds[values.stage] ?? values.stage.slice(0, 2);
    const names = { '01': 'prompts', '04': 'verify', '07': 'audit' };
    const name = names[stage];
    const actualPath = values.actual ?? (paths && (stage === '03' ? join(paths.topicDir, 'author.json') : stage === '06' ? join(paths.topicDir, 'pack.json') : join(paths.topicDir, `${name}${values.mode === 'human' && stage !== '01' ? '.human' : ''}.json`)));
    const expectedPath = values.expected ?? (paths && name && join(paths.fixtureDir, `${name}.human.json`));
    result = scoreFixture({ topic, stage, mode: values.mode, actual: stageActual(stage, await optionalJson(actualPath)), expected: await optionalJson(expectedPath),
      promptMapping: await optionalJson(values.mapping ?? (paths && join(paths.topicDir, 'prompt-mapping.json'))),
      defectiveExpected: await optionalJson(values['defective-expected'] ?? (paths && join(paths.fixtureDir, 'references.defective', 'expected-verdicts.json'))),
      roundsUsed: values['rounds-used'] === undefined ? undefined : Number(values['rounds-used']) });
  }
  const output = values.out ?? (paths && join(paths.topicDir, 'fixture-score.json'));
  if (output) {
    await mkdir(dirname(resolve(output)), { recursive: true });
    await writeFile(resolve(output), JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Fixture scoring failed. Check the configured inputs.'); process.exitCode = 1; });
}
