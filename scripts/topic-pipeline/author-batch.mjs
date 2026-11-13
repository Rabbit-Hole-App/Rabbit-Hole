// Batched author (reviewer 2026-11-12): one foundation call writes the data module, then the prompts are split into batches that run
// in parallel. Each batch returns code sections that this module assembles mechanically into the topic's references, tests, replay
// cases and registry wiring. A failure is routed to the batch that owns it; only that batch is called again.
import { createAuthorSchema, dedupeAuthorFiles, validateAuthorFiles } from './schemas.mjs';

const DOCS = 'docs/features/explain-on-canvas/handoff/';

export const planBatches = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

export const paths = (artifactTopic, diagrams) => ({
  data: `${diagrams}/topic-${artifactTopic}-data.js`, dataTest: `${diagrams}/topic-${artifactTopic}-data.test.mjs`,
  references: `${diagrams}/topic-${artifactTopic}-references.js`, tests: `${diagrams}/topic-${artifactTopic}-references.test.mjs`,
  replay: `${diagrams}/topic-${artifactTopic}-replay-cases.json`, walkthrough: `${DOCS}phase02-library/topic-walkthroughs/${artifactTopic}.md`,
  registry: `${diagrams}/reference-library.js`,
});

// The definitions every batch body may use; shown to the batches verbatim so they build the same reference objects.
export const helperSource = artifactTopic => [
  `import * as data from './topic-${artifactTopic}-data.js';`,
  `import replay from './topic-${artifactTopic}-replay-cases.json' with { type: 'json' };`,
  `const metadata = data.metadata;`,
  `const spec = diagram => ({ version: 1, diagram });`,
  `const reference = ({ id, keywords, useWhen, overview, standard, deep }) => { const row = replay.prompts.find(item => item.referenceId === id); return { id, topic: metadata.topic, artifactTopic: metadata.artifactTopic, lessons: metadata.lessons, sources: metadata.sources, origin: 'lesson', lesson: metadata.lessons[0], promptOrigins: [{ id: row.id, prompt: row.prompt, origin: 'lesson', lesson: metadata.lessons[0] }], prompts: [row.prompt, ...row.paraphrases], paraphrases: row.paraphrases, keywords, shortKeywords: keywords, useWhen, ...standard, depths: { overview, standard, deep } }; };`,
];

export function assembleReferences(artifactTopic, parts) {
  const lines = [...helperSource(artifactTopic), 'export const topicMetadata = metadata;', 'const parts = ['], ranges = [];
  parts.forEach((part, index) => {
    lines.push('(() => {');
    const start = lines.length + 1;
    lines.push(...part.references.split('\n'));
    ranges.push({ index, start, end: lines.length });
    lines.push('})(),');
  });
  lines.push('];', 'export const references = Object.freeze(parts.flatMap(part => part.references));',
    'export function derived() { return Object.assign({}, data.derived(), ...parts.map(part => part.derived?.() ?? {})); }');
  return { content: lines.join('\n') + '\n', ranges };
}

export function assembleTests(artifactTopic, parts) {
  const lines = ['import test from \'node:test\';', 'import assert from \'node:assert\';', `import * as data from './topic-${artifactTopic}-data.js';`,
    `import { references, derived } from './topic-${artifactTopic}-references.js';`, `import replay from './topic-${artifactTopic}-replay-cases.json' with { type: 'json' };`], ranges = [];
  parts.forEach((part, index) => {
    lines.push('{');
    const start = lines.length + 1;
    lines.push(...part.tests.split('\n'));
    ranges.push({ index, start, end: lines.length });
    lines.push('}');
  });
  return { content: lines.join('\n') + '\n', ranges };
}

export function wireRegistry(content, artifactTopic) {
  const name = `topic${artifactTopic.replace(/(?:^|-)([a-z0-9])/gu, (_, c) => c.toUpperCase())}References`;
  if (content.includes(name)) return content;
  const importAnchor = /^(import \{ lessonDecisionTreesReferences \} from .*)$/mu, spreadAnchor = /^(\s*)(\.\.\.lessonDecisionTreesReferences,)$/mu;
  if (!importAnchor.test(content) || !spreadAnchor.test(content)) throw new Error('The registry has no lessonDecisionTreesReferences anchors to wire the topic after.');
  return content.replace(importAnchor, `$1\nimport { references as ${name} } from './topic-${artifactTopic}-references.js';`).replace(spreadAnchor, `$1$2\n$1...${name},`);
}

// The request for the pre-round check of one batch: its references, tests and replay rows written to a scratch folder next to the data module.
export function prevalidatePayload({ artifactTopic, diagrams, value, dataModule, assigned, scratch }) {
  const p = paths(artifactTopic, diagrams), name = path => path.split('/').pop();
  const replay = { prompts: value.replay.map(row => ({ ...row, id: assigned.find(item => String(item.id) === String(row.id))?.id ?? row.id })) };
  const files = [...dataModule.filter(file => file.path === p.data), { path: p.references, content: assembleReferences(artifactTopic, [value]).content },
    { path: p.tests, content: assembleTests(artifactTopic, [value]).content }, { path: p.replay, content: JSON.stringify(replay) }].map(file => ({ ...file, name: name(file.path) }));
  return { scratch, entry: name(p.references), files, rows: assigned };
}

export const batchSchema = {
  type: 'object', additionalProperties: false, required: ['references', 'tests', 'replay', 'walkthrough'], properties: {
    references: { type: 'string', maxLength: 90000 }, tests: { type: 'string', maxLength: 90000 }, walkthrough: { type: 'string', maxLength: 60000 },
    replay: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['id', 'prompt', 'referenceId', 'paraphrases'],
      properties: { id: { type: 'string' }, prompt: { type: 'string' }, referenceId: { type: 'string' }, paraphrases: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } } } } },
  },
};

export const foundationSchema = (topic, dryRun) => createAuthorSchema(topic, { dryRun });

export function validateFoundation(value, options, p) {
  dedupeAuthorFiles(value);
  validateAuthorFiles(value, options);
  const got = value.files.map(file => file.path).sort();
  if (got.join('|') !== [p.data, p.dataTest].sort().join('|')) throw new Error(`The foundation answer must contain exactly ${p.data} and ${p.dataTest}.`);
  return value;
}

export function validateBatch(value, rows, last) {
  const want = rows.map(row => String(row.id)).sort().join(',');
  if (value.replay.map(row => String(row.id)).sort().join(',') !== want) throw new Error(`Replay cases must cover exactly the assigned prompt ids: ${want}.`);
  for (const row of rows) if (value.replay.find(item => String(item.id) === String(row.id))?.prompt !== row.prompt) throw new Error(`Replay case ${row.id} must carry its assigned prompt verbatim.`);
  if (last && !value.walkthrough.trim()) throw new Error('The last batch must return the topic walkthrough.');
  return value;
}

// Which parts own a failure? Foundation, a set of batches, or (nothing recognisable) every batch.
export function routeFailure(feedback, { artifactTopic, parts, referenceRanges, testRanges }, diagrams) {
  const text = String(feedback ?? ''), p = paths(artifactTopic, diagrams), owned = new Set();
  if (text.includes(`topic-${artifactTopic}-data`)) return { foundation: true, parts: new Set(parts.keys()) };
  parts.forEach((part, index) => { if (part.output?.replay.some(row => text.includes(row.referenceId))) owned.add(index); });
  for (const [pattern, ranges] of [[new RegExp(`topic-${artifactTopic}-references\\.js:(\\d+)`, 'gu'), referenceRanges], [new RegExp(`topic-${artifactTopic}-references\\.test\\.mjs:(\\d+)`, 'gu'), testRanges]]) {
    for (const match of text.matchAll(pattern)) {
      const hit = ranges?.find(range => Number(match[1]) >= range.start && Number(match[1]) <= range.end);
      if (hit) owned.add(hit.index);
    }
  }
  if (text.includes('topic-walkthroughs/')) owned.add(parts.length - 1);
  return { foundation: false, parts: owned.size ? owned : new Set(parts.keys()) };
}

export function createBatchedAuthor({ call, base, rows, size, artifactTopic, diagrams, registry, exemplar }) {
  const p = paths(artifactTopic, diagrams);
  const state = { foundation: null, parts: planBatches(rows, size).map(group => ({ rows: group, output: null, ok: false })), referenceRanges: [], testRanges: [] };
  const exemplarData = exemplar.filter(file => /-data(?:\.test)?\.m?js$/u.test(file.path));
  const exemplarReferences = exemplar.filter(file => /-references(?:\.test)?\.m?js$/u.test(file.path)), exemplarWalkthrough = exemplar.filter(file => file.path.endsWith('.md'));
  return async function round(feedback, round) {
    let redoFoundation = !state.foundation, redo = new Set();
    if (state.foundation && state.parts.every(part => part.ok)) {
      const route = routeFailure(feedback, { artifactTopic, parts: state.parts, referenceRanges: state.referenceRanges, testRanges: state.testRanges }, diagrams);
      redoFoundation = route.foundation; redo = route.parts;
    }
    if (redoFoundation) {
      state.foundation = (await call('foundation', { ...base, part: 'foundation', exemplar: exemplarData, previous: state.foundation ?? [], feedback: String(feedback ?? ''), round })).files;
      state.parts.forEach(part => { part.ok = false; });
    }
    state.parts.forEach((part, index) => { if (!part.ok) redo.add(index); });
    const results = await Promise.allSettled([...redo].map(async index => {
      const part = state.parts[index];
      part.ok = false;
      part.output = await call('batch', { ...base, part: 'batch', batch: index + 1, of: state.parts.length, last: index === state.parts.length - 1, assigned: part.rows,
        dataModule: state.foundation, exemplar: index === state.parts.length - 1 ? [...exemplarReferences, ...exemplarWalkthrough] : exemplarReferences, helperSource: helperSource(artifactTopic).join('\n'), previous: part.output, feedback: String(feedback ?? ''), round }, part.rows, index === state.parts.length - 1);
      // The model returns ids as strings; the checks compare with the prompt's own id (a number in prompts.json).
      part.output.replay = part.output.replay.map(row => ({ ...row, id: part.rows.find(item => String(item.id) === String(row.id)).id }));
      part.ok = true;
    }));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    const ids = state.parts.flatMap(part => part.output.replay.map(row => row.referenceId));
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    if (duplicate) throw new Error(`Reference id ${duplicate} is used by more than one batch; every reference id must be unique.`);
    const refs = assembleReferences(artifactTopic, state.parts.map(part => part.output)), tests = assembleTests(artifactTopic, state.parts.map(part => part.output));
    state.referenceRanges = refs.ranges; state.testRanges = tests.ranges;
    const replay = JSON.stringify({ prompts: state.parts.flatMap(part => part.output.replay) }, null, 1) + '\n';
    return { files: [...state.foundation, { path: p.references, content: refs.content }, { path: p.tests, content: tests.content }, { path: p.replay, content: replay },
      { path: p.walkthrough, content: state.parts.at(-1).output.walkthrough }, { path: p.registry, content: wireRegistry(registry, artifactTopic) }] };
  };
}
