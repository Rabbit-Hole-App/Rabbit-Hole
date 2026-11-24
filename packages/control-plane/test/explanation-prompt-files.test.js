// Same-JSON task 1: the explanation author's system text is one Markdown file per section (src/prompts/explanation/*.md), bundled at build into
// src/explanation-prompts.generated.js. No model call: requests are built and read, never sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { renderExplanationPrompts } from '../scripts/build-explanation-prompts.mjs';
import { EXPLANATION_PROMPT_FILES } from '../src/explanation-prompts.generated.js';
import { fillSlots, parsePromptText, promptBlock, promptHeading, promptSection } from '../src/explanation-prompt.js';
import { prepareArtifactAuthorRequest } from '../src/learn-artifact.js';
import { assembledSystem, stepRequest } from '../src/explanation-fast-chain.js';
import { planFromAnswers } from '../src/explanation-planner.js';
import { EXPLANATION_DEPTH_LINES } from '../src/chat-depth.js';

const here = path => new URL(`../src/${path}`, import.meta.url);
const FOLDER = 'prompts/explanation/';
const HEADINGS = {
  '# Card layout': 'explanation-card-layout.md', '# Numbers and maths': 'explanation-numbers-and-maths.md', '# Diagram kinds and their fields': 'explanation-diagram-kinds.md',
  '# Depth': 'explanation-depth.md', '# Visuals for this card': 'explanation-visuals.md', '# Examples': 'explanation-examples.md', '# Output format': 'explanation-output-format.md',
};

test('the bundled module is exactly what the .md files generate (run npm run prompts:build:explanation after editing a section file)', () => {
  assert.equal(readFileSync(here('explanation-prompts.generated.js'), 'utf8').replace(/\r\n/g, '\n'), renderExplanationPrompts());
});

test('the eight section files exist, and a file text has LF line ends and no final newline', () => {
  assert.deepEqual(Object.keys(EXPLANATION_PROMPT_FILES), ['explanation-card-layout.md', 'explanation-depth.md', 'explanation-diagram-kinds.md', 'explanation-examples.md', 'explanation-numbers-and-maths.md', 'explanation-opening.md', 'explanation-output-format.md', 'explanation-visuals.md']);
  for (const [name, { text }] of Object.entries(EXPLANATION_PROMPT_FILES)) {
    assert.ok(!text.includes('\r') && !text.endsWith('\n') && text.length > 0, name);
    const onDisk = readFileSync(here(FOLDER + name), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(text, onDisk.replace(/\n$/, ''), `${name}: the text is the file with one final newline removed`);
  }
});

// Rule: a section heading is written in exactly one file under src. The .md file holds it; no .js file may (a string, a comment or a template). The generated module is
// not a second place: it is the build copy of the .md files and the first test proves it equal to them, so it is left out of the search and never edited.
test('every section heading is written in exactly one file under src, the one that holds that section', () => {
  const files = (dir = '') => readdirSync(here(dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(`${dir}${entry.name}/`) : [`${dir}${entry.name}`]);
  const searched = files().filter(path => /\.(js|mjs)$/.test(path) && !path.endsWith('.generated.js') || path.startsWith(FOLDER) && path.endsWith('.md'));
  assert.ok(searched.length > 100 && searched.includes(`${FOLDER}explanation-depth.md`) && searched.includes('learn-primitives.js'));
  for (const [heading, owner] of Object.entries(HEADINGS)) {
    const holders = searched.filter(path => readFileSync(here(path), 'utf8').includes(heading));
    assert.deepEqual(holders, [FOLDER + owner], heading);
  }
});

test('the loader reads blocks and slots and refuses a marker it does not know', () => {
  const parsed = parsePromptText('t.md', '# H\n{% block a %}\none {% slot x %}\n{% endblock %} and {% block b %}two{% endblock %}');
  assert.deepEqual(parsed.blocks, { a: 'one {% slot x %}', b: 'two' });
  assert.equal(parsed.section, '# H\none {% slot x %} and two');
  assert.throws(() => parsePromptText('t.md', '{% block a %}1{% endblock %}{% block a %}2{% endblock %}'), /block a is written twice/);
  assert.throws(() => parsePromptText('t.md', '{% block a %}1'), /unknown or unclosed marker/);
  assert.throws(() => parsePromptText('t.md', 'x {% slotty y %}'), /unknown or unclosed marker/);
  assert.equal(fillSlots('a {% slot x %} b {% slot x %} {% slot y %}', { x: '$&', y: '' }), 'a $& b $& ');
  assert.throws(() => fillSlots('a {% slot x %}', {}), /slot x has no value/);
  assert.throws(() => fillSlots('a', { z: 1 }), /no slot for z/);
  assert.throws(() => promptBlock('explanation-depth.md', 'nope'), /no block nope/);
  assert.throws(() => promptBlock('explanation-nope.md', 'a'), /is missing/);
  assert.throws(() => promptSection('explanation-numbers-and-maths.md'), /slot math-format has no value/); // a slot the caller forgot never reaches a request
  assert.equal(promptHeading('explanation-examples.md'), '# Examples');
  assert.equal(promptBlock('explanation-depth.md', 'lead-in'), 'Based on the rules above, this card:');
});

// The kinds of request the author gets: planned or not, every Depth, with and without a seed, the tool route and the fast chain, interactions on and off.
const answers = (kind, more = {}) => ({ visualType: { choice: 'diagram', confidence: 0.95 }, kind: { choice: kind, confidence: 0.9, probabilities: { [kind]: 0.9, flow: 0.05 } }, depthTreatment: { choice: 'mechanism' }, isPhysical: { noul: 0.05 }, ...more });
const plans = depth => ({
  none: null, bar: planFromAnswers(answers('bar-chart'), depth), picture: planFromAnswers({ ...answers('flow'), visualType: { choice: 'picture', confidence: 0.9 } }, depth),
  both: planFromAnswers(answers('flow', { isPhysical: { noul: 0.9 } }), depth), two: planFromAnswers({ ...answers('flow'), kind: { choice: 'flow', confidence: 0.4, probabilities: { flow: 0.4, tree: 0.35 } } }, depth),
  pair: planFromAnswers(answers('tree', { secondVisual: { noul: 0.9 } }), depth),
});
const ENVS = {
  fast: { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x', EXPLANATION_INTERACTIONS: 'true' },
  fastPlain: { SMALL_ENV: 'test', EXPLANATION_MODEL_PROFILE: 'google-low', GEMINI_API_KEY: 'x', FIREWORKS_API_KEY: 'x' },
  tools: { SMALL_ENV: 'test', EXPLANATION_INTERACTIONS: 'true' },
  toolsFormula: { SMALL_ENV: 'test', EXPLANATION_FORMULA_SAMPLER: 'on' },
};
const PROMPTS = ['Does top-k filtering affect the reported probability of the chosen token?', 'Why is the sky blue?'];

test('no block or slot marker reaches a request, and every section arrives', () => {
  const log = console.log; console.log = () => {};
  let count = 0;
  try {
    for (const [envName, env] of Object.entries(ENVS)) for (const depth of ['brief', 'balanced', 'detailed', undefined]) for (const [planName, plan] of Object.entries(plans(depth))) for (const requestSeed of [undefined, 'seed-1']) for (const args of PROMPTS) {
      const { body } = prepareArtifactAuthorRequest(env, { command: 'explanation', args, selection: null, context: null, depth, ...(requestSeed ? { requestSeed } : {}), ...(plan ? { plan, planned: true } : {}) });
      const texts = [JSON.stringify(body), body.tools[0].description];
      if (envName.startsWith('fast')) texts.push(assembledSystem(body), ...['google', 'fireworks'].map(provider => stepRequest({ provider, model: 'm' }, 'low', body).messages[0].content));
      const where = `${envName} ${depth} ${planName} ${requestSeed ?? 'no seed'} ${args.slice(0, 20)}`;
      for (const text of texts) assert.ok(!text.includes('{%') && !text.includes('%}'), `a marker reached the request: ${where}`);
      // the sections the request must hold, in the text the author reads (the tool route keeps them in the tool description, the fast chain in the system message)
      const read = envName.startsWith('fast') ? assembledSystem(body) : body.tools[0].description;
      for (const heading of ['# Card layout', '# Numbers and maths', '# Diagram kinds and their fields', '# Depth', '# Visuals for this card']) assert.ok(read.includes(`\n${heading}\n`) || read.startsWith(`${heading}\n`), `${heading} missing: ${where}`);
      assert.ok(read.includes('\nBased on the rules above, this card:\n\n# Depth\n'), where);
      // the Depth paragraph is the learner's one, never another
      const d = depth ?? 'balanced';
      for (const key of ['brief', 'balanced', 'detailed']) assert.equal(read.includes(EXPLANATION_DEPTH_LINES[key]), key === d, `${key} paragraph at ${d}: ${where}`);
      assert.ok(read.includes('Budget: at most 450 characters of prose'), where); // the budget slot is filled with the number
      assert.equal(read.includes('# Output format'), envName.startsWith('fast') || env.EXPLANATION_INTERACTIONS === 'true', where);
      assert.equal(read.includes('Choose visuals in this order.'), !plan, `the no-plan rules block goes with no plan: ${where}`);
      assert.equal(read.includes("This card's visuals: "), !!plan, where);
      count++;
    }
  } finally { console.log = log; }
  assert.equal(count, 4 * 4 * 6 * 2 * PROMPTS.length);
});

test('the planned wording is filled from the plan: one kind, two offered kinds, a picture, a pair, no depth treatment', () => {
  const log = console.log; console.log = () => {};
  try {
    const read = plan => prepareArtifactAuthorRequest(ENVS.tools, { command: 'explanation', args: 'Compare a stack and a queue.', selection: null, context: null, depth: 'balanced', plan, planned: true }).body.tools[0].description.split('# Visuals for this card\n')[1].split('\n\n')[0];
    const p = plans('balanced');
    assert.match(read(p.bar), /^This card's visuals: 1\) a bar-chart diagram\. Depth treatment: mechanism\. The visual must contain /);
    assert.match(read(p.two), /^This card's visuals: 1\) a diagram of one of these kinds, the one that teaches the answer: flow or tree\. /);
    assert.match(read(p.picture), /^This card's visuals: 1\) a picture \(no diagram\)\. Depth treatment: mechanism\. The visual must contain .*incomplete\.$/);
    assert.match(read(p.both), /^This card's visuals: 1\) a picture; 2\) a flow diagram\. /);
    assert.match(read(p.pair), /1\) a diagram of one of these kinds.*; 2\) a diagram of one of these kinds.*\. The question names two things: draw each one on its own, one visual per thing\. Depth treatment: /);
    assert.ok(read({ ...p.bar, depthTreatment: undefined }).startsWith("This card's visuals: 1) a bar-chart diagram. The visual must contain"));
    assert.ok(read(p.bar).endsWith('{{d:1.boxes.0.fences.upper}}).'), 'a diagram card reads the token sentence');
  } finally { console.log = log; }
});
