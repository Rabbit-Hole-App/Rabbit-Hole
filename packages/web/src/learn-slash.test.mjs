import test from 'node:test';
import assert from 'node:assert/strict';
import { pickerSections, parseSlash, runLearnCommand } from './learn-slash.js';

// A canvas and network stand-in that records what a command did.
const harness = reply => {
  const did = [];
  const canvas = { insertNotebook: () => did.push(['notebook']), insertBlock: block => did.push(['block', block]), insertPaper: paper => did.push(['paper', paper]) };
  const post = async (path, body) => { did.push(['post', path, body]); return reply; };
  const openSearch = seed => did.push(['search', seed]);
  return { did, run: (text, target) => runLearnCommand(text, { app: 'demo', target, canvas, post, openSearch }) };
};

test('/ opens the grouped picker: LEARN, then CREATE, in the contract order', () => {
  const sections = pickerSections('/');
  assert.deepEqual(sections.map(section => section.title), ['Learn', 'Create', 'More learning tools']);
  assert.deepEqual(sections[0].items.map(item => item.name), ['deeper', 'dive', 'simplify', 'example', 'practice', 'quiz', 'compare', 'research']);
  // /more is how to reach the rest, not a tool: it is the collapsible section, never a row.
  assert.deepEqual(sections[1].items.map(item => item.name), ['explain', 'code', 'graph', 'diagram', 'animate', 'flashcards', 'notebook']);
  assert.equal(sections[2].collapsible, true);
  assert.ok(sections[2].items.some(item => item.name === 'walkthrough'));
  assert.ok(sections.flatMap(section => section.items).every(item => item.name !== 'more'));
  assert.equal(sections[0].items[0].desc, 'Go deeper');
  assert.deepEqual(pickerSections('/gr')[0].items.map(item => item.name), ['graph']);
  assert.ok(pickerSections('/', { catalog: true })[0].items.some(item => item.name === 'walkthrough'));
  assert.equal(pickerSections('/graph sigmoid'), null);
  assert.equal(pickerSections('hello'), null);
  assert.deepEqual(parseSlash('/Graph  training loss '), { name: 'graph', args: 'training loss' });
});

test('/notebook, /whiteboard and /paper <id> insert directly, with no model call', async () => {
  const { did, run } = harness();
  await run('/notebook');
  await run('/whiteboard forces');
  await run('/paper 1706.03762');
  await run('/paper https://arxiv.org/abs/2005.14165');
  assert.deepEqual(did.map(entry => entry[0]), ['notebook', 'block', 'paper', 'paper']);
  assert.equal(did[1][1].type, 'whiteboard');
  assert.deepEqual(did[2][1], { id: '1706.03762' });
  assert.ok(!did.some(entry => entry[0] === 'post'));
});

test('/paper <topic> researches first: arXiv search opens and the learner picks', async () => {
  const { did, run } = harness();
  const out = await run('/paper attention mechanisms');
  assert.deepEqual(did, [['search', { source: 'arxiv', query: 'attention mechanisms' }]]);
  assert.match(out.notice.text, /pick the paper/);
});

test('family commands go to the artifact endpoint with the command only, never a primitive list', async () => {
  const quiz = { type: 'quiz', question: 'Q?', options: [], why: '' };
  const { did, run } = harness({ result: 'artifact', primitive: 'quiz', block: quiz });
  const out = await run('/quiz', { id: 'card-1', title: 'Softmax', text: 'Softmax turns scores into probabilities.' });
  const [, path, body] = did[0];
  assert.equal(path, '/api/learn/artifact');
  assert.deepEqual(Object.keys(body).sort(), ['app', 'args', 'command', 'context', 'selection']);
  assert.deepEqual(body.selection, { kind: 'card', id: 'card-1', title: 'Softmax' });
  assert.deepEqual(did[1], ['block', quiz]);
  assert.equal(out.notice.text, 'Added a quiz.');
});

test('a paid result waits for Generate; a question, an unsupported primitive or an error inserts nothing', async () => {
  const paid = await harness({ result: 'paid_proposal', primitive: 'video_generate', block: { type: 'video' }, message: 'This uses paid generation.' }).run('/video a prism');
  assert.equal(paid.proposal.message, 'This uses paid generation.');
  for (const [reply, tone] of [
    [{ result: 'clarification', question: 'What would you like to compare?' }, 'question'],
    [{ result: 'unsupported', message: "Code exercise generation isn't available yet." }, 'info'],
    [{ result: 'validation_error', error: 'Rejected make_video_generate' }, 'error'],
  ]) {
    const { did, run } = harness(reply);
    const out = await run('/compare these');
    assert.equal(out.notice.tone, tone);
    assert.ok(!did.some(entry => entry[0] === 'block'));
  }
});

test('Auto commands go through the existing Learn ask as a prompt; unknown ones say so', async () => {
  const { did, run } = harness();
  assert.deepEqual(await run('/deeper'), { prompt: 'Go one level deeper on the current concept.' });
  assert.match((await run('/frobnicate')).notice.text, /not a Learn command/);
  assert.equal(did.length, 0);
});

test('View > Slash commands shows every picker command with an example', async () => {
  const { EXAMPLES, mayConfirmPaid } = await import('./learn-slash.js');
  for (const item of pickerSections('/').flatMap(section => section.items)) assert.ok(EXAMPLES[item.name]?.startsWith(`/${item.name}`), `example for /${item.name}`);
  assert.equal(mayConfirmPaid('video'), true);
  assert.equal(mayConfirmPaid('graph'), false);
});

test('the sheet previews the cards each command can make; chat commands make none', async () => {
  const { cardsFor } = await import('./learn-slash.js');
  assert.deepEqual(cardsFor('graph').map(entry => entry.card), ['graph', 'plot']);
  assert.deepEqual(cardsFor('diagram').map(entry => entry.card), ['flow', 'mermaid']);
  assert.deepEqual(cardsFor('practice').map(entry => entry.card), ['challenge', 'explainBack', 'quiz']);
  assert.deepEqual(cardsFor('notebook').map(entry => entry.card), ['notebook']);
  assert.deepEqual(cardsFor('deeper'), []);
  // /video only proposes a generated clip; /image inserts a searched photo.
  assert.deepEqual(cardsFor('video').map(entry => entry.card), ['videoGenerate']);
  assert.deepEqual(cardsFor('image').map(entry => entry.card), ['image']);
});

test('every example runs as typed: it names its own command and never hits an unavailable primitive', async () => {
  const { EXAMPLES } = await import('./learn-slash.js');
  const { artifactPlan } = await import('../../control-plane/src/learn-artifact.js');
  for (const [name, text] of Object.entries(EXAMPLES)) {
    const parsed = parseSlash(text);
    assert.equal(parsed.name, name, text);
    // /image never reaches the planner: runLearnCommand runs it as a photo search.
    if (name !== 'image') assert.notEqual(artifactPlan(name, { args: parsed.args }).result, 'unsupported', `${text} would say not available`);
  }
});

// docs/features/canvas-skeleton-cards.md: a card command holds the card's place from the send; only a card
// fills it, and every other ending gives it up.
const slotHarness = reply => {
  const did = [];
  const canvas = {
    reserve: slot => { did.push(['reserve', slot]); return 'slot:1'; },
    release: id => did.push(['release', id]),
    insertBlock: (block, options) => { did.push(['block', block.type, options]); return 'card-1'; },
  };
  const post = async (path, body, options) => { did.push(['post', options?.signal instanceof AbortSignal]); if (reply instanceof Error) throw reply; return reply; };
  return { did, run: text => runLearnCommand(text, { app: 'demo', canvas, post, openSearch: () => {} }) };
};

test('a card command reserves before the request and its card takes that slot', async () => {
  const { did, run } = slotHarness({ result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'T', body: 'B' } });
  const out = await run('/explain why a token id is only an index');
  assert.deepEqual(did, [['reserve', { label: 'Creating /explain…', card: 'explanation' }], ['post', true], ['block', 'explanation', { into: 'slot:1' }]]);
  assert.equal(out.notice.blockId, 'card-1');
  // Sized as the command's own card: /graph as a graph, /quiz as a quiz.
  const graph = slotHarness({ result: 'clarification', question: 'Which function?' });
  await graph.run('/graph');
  assert.deepEqual(graph.did[0], ['reserve', { label: 'Creating /graph…', card: 'graph' }]);
});

test('a question, a proposal, an unsupported or invalid result, a failure or a timeout gives the slot up', async () => {
  for (const reply of [
    { result: 'clarification', question: 'Compare what?' },
    { result: 'paid_proposal', primitive: 'maths_animation', block: { type: 'video' }, message: 'This uses paid generation.' },
    { result: 'unsupported', message: 'Not yet.' },
    { result: 'validation_error', error: 'Rejected' },
  ]) {
    const { did, run } = slotHarness(reply);
    await run('/compare these');
    assert.deepEqual(did.map(entry => entry[0]), ['reserve', 'post', 'release'], reply.result);
    assert.equal(did[2][1], 'slot:1');
  }
  const failed = slotHarness(new Error('Artifact generation unavailable (model HTTP 529). Try again.'));
  await assert.rejects(failed.run('/quiz'), /unavailable/);
  assert.deepEqual(failed.did.at(-1), ['release', 'slot:1']);
  const late = slotHarness(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
  const out = await late.run('/quiz');
  assert.deepEqual(late.did.at(-1), ['release', 'slot:1']);
  assert.equal(out.notice.text, '/quiz took too long. Try again.');
});

test('commands that make no card, or make one at once, reserve nothing', async () => {
  for (const text of ['/notebook', '/whiteboard', '/paper 1706.03762', '/image a prism', '/deeper', '/dive', '/source', '/ask what is wte?']) {
    const did = [];
    const canvas = { reserve: () => did.push('reserve'), insertNotebook: () => {}, insertBlock: () => {}, insertPaper: () => {}, dive: () => ({}) };
    await runLearnCommand(text, { app: 'demo', canvas, post: async () => ({}), openSearch: () => {} });
    assert.deepEqual(did, [], text);
  }
});

// A skeleton means a card is committed: a command that can end in a paid proposal holds no place at send, only
// once the learner confirms Generate; Cancel never shows one.
test('a paid command holds no place until Generate; Generate holds it and the confirmed card takes it', async () => {
  const proposal = { result: 'paid_proposal', primitive: 'maths_animation', block: { type: 'video', mode: 'generate' }, message: 'This uses paid generation.' };
  for (const command of ['/animate why the sigmoid saturates', '/video light through a prism', '/3d a camera frustum']) {
    const { did, run } = slotHarness(proposal);
    const out = await run(command);
    assert.deepEqual(did.map(entry => entry[0]), ['post'], `${command}: the proposal only, no skeleton`);
    assert.equal(out.proposal.message, 'This uses paid generation.');
  }
  const { did, run } = slotHarness(proposal);
  const out = await run('/animate why the sigmoid saturates');
  // Cancel: the composer drops the proposal and nothing reaches the canvas.
  assert.ok(!did.some(entry => entry[0] === 'reserve' || entry[0] === 'block'));
  out.proposal.generate();
  assert.deepEqual(did.slice(1), [['reserve', { label: 'Creating /animate…', card: 'mathAnimation' }], ['block', 'video', { into: 'slot:1' }]]);
});

// M7A: /motion exists only in a development build (VITE_MOTION_DEV) and costs nothing until Generate.
test('/motion: development builds only; the proposal makes no request, Generate inserts the existing video card already confirmed', async () => {
  const off = harness({});
  assert.match((await off.run('/motion 15s explain me softmax func')).notice.text, /not a Learn command/);
  assert.ok(!(pickerSections('/mo') || []).flatMap(section => section.items).some(item => item.name === 'motion'), 'no /motion in the picker of a normal build');
  const did = [];
  const canvas = { insertBlock: block => { did.push(block); return 'block-1'; }, dive: () => did.push('dive') };
  const post = async () => { did.push('POST'); return {}; };
  const run = text => runLearnCommand(text, { app: 'demo', canvas, post, openSearch: () => {}, location: { concept: 'Attention' }, motionDev: true });
  const out = await run('/motion 15s explain me softmax func');
  assert.equal(out.proposal.message, 'This uses paid generation.');
  assert.deepEqual(did, [], 'no request, no card and no Rabbit Hole before Generate');
  out.proposal.generate();
  assert.deepEqual(did, [{
    type: 'video', mode: 'generate', title: 'Motion: 15s explain me softmax func', src: '', caption: '', status: 'idle',
    operation: { op: 'motion_request', request: '/motion 15s explain me softmax func', location: { concept: 'Attention' } }, confirmedStart: true,
  }]);
  assert.ok(!did.includes('dive') && !did.includes('POST'), 'Generate only inserts the card: no dive, no artifact call');
  assert.match((await run('/motion')).notice.text, /Add what to explain/);
  const long = await runLearnCommand(`/motion ${'x'.repeat(600)}`, { app: 'demo', canvas, post, openSearch: () => {}, location: { concept: 'y'.repeat(300) }, motionDev: true });
  long.proposal.generate();
  assert.deepEqual([did.at(-1).operation.request.length, did.at(-1).operation.location.concept.length], [500, 100], 'bounded to what LearnVideos accepts');
});
