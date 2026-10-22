import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsFor, commandLine, holdsLine, materialCommands, MOTION_OFF, pickerSections, parseSlash, releaseLine, runLearnCommand, runMaterials } from './learn-slash.js';
import { generationField } from './generation-proposal-chat.js';
import { commandsFor, learnRequest } from './agent/slash.js';
import { readFileSync } from 'node:fs';
import { PRIMITIVES } from '../../control-plane/src/learn-primitives.js';
import { blockModality, modalityOf } from './learn-tutor-actions.js';
import { newNotebookBlock } from './learn-notebook.js';

// A canvas and network stand-in that records what a command did.
const harness = reply => {
  const did = [];
  const canvas = { insertNotebook: () => did.push(['notebook']), insertBlock: block => did.push(['block', block]), insertPaper: paper => did.push(['paper', paper]) };
  const post = async (path, body) => { did.push(['post', path, body]); return reply; };
  const openSearch = seed => did.push(['search', seed]);
  return { did, run: (text, target) => runLearnCommand(text, { app: 'demo', target, canvas, post, openSearch }) };
};

test('/ opens the grouped picker: LEARN, CREATE, SEARCH, then every other command under More learning tools', () => {
  const sections = pickerSections('/');
  assert.deepEqual(sections.map(section => section.title), ['Learn', 'Create', 'Search', 'More learning tools']);
  assert.deepEqual(sections[0].items.map(item => item.name), ['dive', 'practice', 'quiz']);
  assert.deepEqual(sections[1].items.map(item => item.name), ['explain', 'code', 'graph', 'diagram', 'flashcards', 'notebook']);
  // /motion takes /animate's place in a development or review build (owner, 2026-10-20), with the owner's words.
  assert.deepEqual(pickerSections('/', { motionDev: true })[1].items.slice(3, 6), [{ name: 'diagram', desc: 'Add a diagram' }, { name: 'motion', desc: 'Create an animated explainer video' }, { name: 'flashcards', desc: 'Add flashcards' }]);
  assert.deepEqual(pickerSections('/anim', { motionDev: true }), [], '/animate is not offered');
  // Owner, 2026-10-20: /image searches, so it leads the searches; /arxiv is the one paper search.
  assert.deepEqual(sections[2].items, [{ name: 'image', desc: 'Search images' }, { name: 'youtube', desc: 'Search YouTube' }, { name: 'arxiv', desc: 'Search arXiv' }, { name: 'wikipedia', desc: 'Search Wikipedia' }]);
  // With /more gone, the rest stay one list away (owner, 2026-10-20).
  assert.equal(sections[3].collapsible, true);
  assert.deepEqual(sections[3].items.map(item => item.name), ['whiteboard', 'video', 'cad', '3d']);
  for (const name of ['paper', 'more', 'walkthrough', 'compare', 'source', 'deeper', 'simplify', 'example', 'ask', 'teach', 'animate']) {
    assert.ok(sections.flatMap(section => section.items).every(item => item.name !== name), name);
  }
  assert.deepEqual(pickerSections('/pa'), []);
  assert.deepEqual(pickerSections('/wa'), []);
  assert.equal(sections[0].items[0].desc, 'Open Rabbit Hole');
  assert.equal(sections[1].items[0].desc, 'Add explanation');
  assert.deepEqual(pickerSections('/gr')[0].items.map(item => item.name), ['graph']);
  assert.equal(pickerSections('/graph sigmoid'), null);
  assert.equal(pickerSections('hello'), null);
  assert.deepEqual(parseSlash('/Graph  training loss '), { name: 'graph', args: 'training loss' });
});

test('/notebook and /whiteboard insert directly, with no model call', async () => {
  const { did, run } = harness();
  await run('/notebook');
  await run('/whiteboard forces');
  assert.deepEqual(did.map(entry => entry[0]), ['notebook', 'block']);
  assert.equal(did[1][1].type, 'whiteboard');
  assert.ok(!did.some(entry => entry[0] === 'post'));
});

// Owner, 2026-10-20: 17 commands removed. Typed in Chat, each says it is unavailable and runs nothing: no post, no card, no
// search, no paper, no Rabbit Hole, no catalog, no prompt for the Tutor.
test('a removed command typed in Chat says it is unavailable and runs nothing', async () => {
  const { REMOVED_COMMANDS } = await import('./agent/slash.js');
  for (const name of REMOVED_COMMANDS) {
    const did = [];
    const canvas = { insertNotebook: () => did.push('notebook'), insertBlock: () => did.push('block'), insertPaper: () => did.push('paper'), reserve: () => did.push('reserve'), dive: () => did.push('dive'), openSources: () => did.push('sources'), startCad: () => did.push('cad') };
    const out = await runLearnCommand(`/${name} the sigmoid`, { app: 'demo', canvas, post: async () => did.push('post'), openSearch: () => did.push('search') });
    assert.deepEqual(out, { notice: { tone: 'error', text: `/${name} is no longer available. Type / to see the commands, or ask in your own words.` } }, name);
    assert.deepEqual(did, [], name);
  }
  // /generate-image while image generation is off: refused the same way, never turned into a photo search.
  const did = [];
  const out = await runLearnCommand('/generate-image a watercolor mountain landscape', { app: 'demo', canvas: { insertBlock: () => did.push('block') }, post: async () => did.push('post'), openSearch: () => did.push('search') });
  assert.match(out.notice.text, /Image generation is not available here/);
  assert.deepEqual(did, []);
});

test('family commands go to the artifact endpoint with the command only, never a primitive list', async () => {
  const quiz = { type: 'quiz', question: 'Q?', options: [], why: '' };
  const { did, run } = harness({ result: 'artifact', primitive: 'quiz', block: quiz });
  const out = await run('/quiz', { id: 'card-1', title: 'Softmax', text: 'Softmax turns scores into probabilities.' });
  const [, path, body] = did[0];
  assert.equal(path, '/api/learn/artifact');
  assert.deepEqual(Object.keys(body).sort(), ['app', 'args', 'command', 'context', 'selection']);
  assert.deepEqual(body.selection, { kind: 'card', id: 'card-1', title: 'Softmax' });
  assert.deepEqual(did[1], ['block', { ...quiz, promptUsed: '/quiz' }], 'the card keeps the typed line (card-prompt.md)');
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
    const out = await run('/diagram these');
    assert.equal(out.notice.tone, tone);
    assert.ok(!did.some(entry => entry[0] === 'block'));
  }
});

// L10 (owner, 2026-10-21): a failed interactive explanation inserts nothing and never turns into text by itself; it gives the
// line back to retry and offers a plain explanation, whose line narrows /explain to text. A made one names itself.
test('/explain: a made interactive explanation is inserted; a failed one keeps the line and offers a plain explanation', async () => {
  const made = harness({ result: 'artifact', primitive: 'animation', block: { type: 'animation', title: 'T', scene: { id: 's', duration: 1, objects: [], timeline: [] } } });
  const out = await made.run('/explain interactive binary search');
  assert.equal(out.notice.text, 'Added an interactive explanation.');
  assert.equal(made.did.find(entry => entry[0] === 'block')[1].type, 'animation');
  const failed = harness({ result: 'validation_error', primitive: 'animation', error: 'grid "g" carries values and must declare matrixKind' });
  const notice = await failed.run('/explain interactive binary search');
  assert.ok(!failed.did.some(entry => entry[0] === 'block'));
  assert.equal(notice.notice.tone, 'error');
  assert.equal(notice.keep, '/explain interactive binary search');
  assert.match(notice.notice.detail, /matrixKind/);
  // A verifier refusal shows its first finding, without the numbering.
  const checked = harness({ result: 'validation_error', primitive: 'animation', error: 'A check of the card found statements that are false: 1) "readout" says "leaving 1.248", against "[1.25]": 80 x (1/2)^6 = 1.25 exactly. 2) "other" says "x": y' });
  assert.equal((await checked.run('/explain interactive half-life')).notice.detail, '"readout" says "leaving 1.248", against "[1.25]": 80 x (1/2)^6 = 1.25 exactly.');
  assert.deepEqual(notice.notice.actions, [{ label: 'Make a plain explanation instead', line: '/explain in plain text: interactive binary search' }]);
  const plain = harness({ result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 'B', body: 'b' } });
  await plain.run(notice.notice.actions[0].line);
  assert.equal(plain.did.find(entry => entry[0] === 'post')[2].args, 'in plain text: interactive binary search');
});

test('an unknown command says so', async () => {
  const { did, run } = harness();
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
  // The Tutor's material tools still make their cards (owner, 2026-10-20).
  assert.deepEqual(cardsFor('compare').map(entry => entry.card), ['table', 'graph', 'plot', 'flow', 'mermaid']);
  assert.deepEqual(cardsFor('walkthrough').map(entry => entry.card), ['walkthrough']);
  // /video only proposes a generated clip; /image inserts a searched photo.
  assert.deepEqual(cardsFor('video').map(entry => entry.card), ['videoGenerate']);
  assert.deepEqual(cardsFor('image').map(entry => entry.card), ['image']);
});

test('every example runs as typed: it names its own command and never hits an unavailable primitive', async () => {
  const { EXAMPLES } = await import('./learn-slash.js');
  const { artifactPlan } = await import('../../control-plane/src/learn-artifact.js');
  const { IMAGE_GENERATION } = await import('./agent/slash.js');
  for (const [name, text] of Object.entries(EXAMPLES)) {
    const parsed = parseSlash(text);
    assert.equal(parsed.name, name, text);
    // /generate-image is advertised only while image generation is on (it is off: agent/slash.js IMAGE_GENERATION).
    if (name === 'generate-image' && !IMAGE_GENERATION) continue;
    // /image never reaches the planner: runLearnCommand runs it as a photo search.
    if (name === 'cad') {
      let request;
      const result=await runLearnCommand(text,{ app:'canvas-test',canvas:{startCad: async prompt => {request=prompt;}},post:()=>{throw Error('CAD must use its durable job flow');} });
      assert.equal(request,undefined);
      await result.proposal.generate();
      assert.equal(request,parsed.args);
    } else if (name !== 'image') assert.notEqual(artifactPlan(name, { args: parsed.args }).result, 'unsupported', `${text} would say not available`);
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
  assert.deepEqual(did, [['reserve', { label: 'Creating /explain…', card: 'explanation', prompt: true }], ['post', true], ['block', 'explanation', { into: 'slot:1' }]], 'the card keeps its typed line, so the slot holds its Prompt row');
  assert.equal(out.notice.blockId, 'card-1');
  // Sized as the command's own card: /graph as a graph, /quiz as a quiz.
  const graph = slotHarness({ result: 'clarification', question: 'Which function?' });
  await graph.run('/graph');
  assert.deepEqual(graph.did[0], ['reserve', { label: 'Creating /graph…', card: 'graph', prompt: true }]);
});

test('a question, a proposal, an unsupported or invalid result, a failure or a timeout gives the slot up', async () => {
  for (const reply of [
    { result: 'clarification', question: 'Compare what?' },
    { result: 'paid_proposal', primitive: 'maths_animation', block: { type: 'video' }, message: 'This uses paid generation.' },
    { result: 'unsupported', message: 'Not yet.' },
    { result: 'validation_error', error: 'Rejected' },
  ]) {
    const { did, run } = slotHarness(reply);
    await run('/diagram these');
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
  for (const text of ['/notebook', '/whiteboard', '/image a prism', '/dive', '/deeper', '/source', '/paper 1706.03762', '/ask what is wte?']) {
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
  for (const command of ['/video light through a prism', '/3d a camera frustum']) {
    const { did, run } = slotHarness(proposal);
    const out = await run(command);
    assert.deepEqual(did.map(entry => entry[0]), ['post'], `${command}: the proposal only, no skeleton`);
    assert.equal(out.proposal.message, 'This uses paid generation.');
  }
  const { did, run } = slotHarness(proposal);
  const out = await run('/video light through a prism');
  // Cancel: the composer drops the proposal and nothing reaches the canvas.
  assert.ok(!did.some(entry => entry[0] === 'reserve' || entry[0] === 'block'));
  out.proposal.generate();
  assert.deepEqual(did.slice(1), [['reserve', { label: 'Creating /video…', card: 'videoGenerate', prompt: true }], ['block', 'video', { into: 'slot:1' }]]);
});

// Duplicate card on reuse (owner priority 2, 2026-10-21): the server keys a paid video or scene job by its operation
// (learn-video.js, learn-scene.js), so a Generate whose job a card here already shows would get that card's job back. That card
// is revealed and no second card is inserted, also after a reload (the board's saved cards); a second press starts nothing more.
test('a paid Generate reuses the card that already shows its job; repeated presses insert one card', async () => {
  const operation = { op: 'generate_math_animation', id: 'sigmoid', concept: 'Sigmoid', scene: { title: 'Slope', steps: [] } };
  const proposal = { result: 'paid_proposal', primitive: 'maths_animation', block: { type: 'video', mode: 'generate', status: 'idle', operation }, message: 'paid' };
  const run = async blocks => {
    const did = [];
    const canvas = { blocks: () => blocks, focusBlock: id => did.push(['focus', id]), reserve: () => { did.push(['reserve']); return 'slot:1'; }, release: () => {},
      insertBlock: block => { did.push(['block', block.operation]); return 'card-new'; } };
    const out = await runLearnCommand('/video the sigmoid slope', { app: 'demo', canvas, post: async () => proposal, openSearch: () => {} });
    return { did, generate: out.proposal.generate };
  };
  // The finished card from an earlier Generate (as the saved board restores it): revealed, nothing inserted, on every press.
  const shown = { id: 'card-old', type: 'video', mode: 'generate', status: 'ready', src: '/v.mp4', placementId: 'p1', operation: structuredClone(operation) };
  const reused = await run([shown]);
  assert.deepEqual(reused.generate(), { reused: 'card-old' });
  reused.generate();
  assert.deepEqual(reused.did, [['focus', 'card-old']], 'revealed once, no skeleton, no card');
  // No such card: one card however often Generate is pressed.
  const fresh = await run([]);
  fresh.generate(); fresh.generate();
  assert.deepEqual(fresh.did.map(entry => entry[0]), ['reserve', 'block']);
  // An unstarted card with the same operation (a + palette sample) is not that job; another operation is another job.
  const sample = await run([{ ...shown, status: 'idle', src: '', placementId: undefined }, { ...shown, id: 'other', operation: { ...operation, id: 'tanh' } }]);
  sample.generate();
  assert.deepEqual(sample.did.map(entry => entry[0]), ['reserve', 'block']);
});

// /motion exists only in a development or review build (agent/slash.js MOTION_DEV). MOT-20 (owner message 39): it is a chat turn,
// whose proposal card is the chat's (generation-proposal-chat.js); the command itself makes no request, card or confirmation.
test('/motion: development and review builds only; the line becomes a chat turn, with no request, card or confirmation here', async () => {
  const off = harness({});
  // A build without Motion (production) says so and runs nothing.
  assert.deepEqual((await off.run('/motion 15s explain me softmax func')).notice, { tone: 'error', text: MOTION_OFF });
  assert.ok(!(pickerSections('/mo') || []).flatMap(section => section.items).some(item => item.name === 'motion'), 'no /motion in the picker of a normal build');
  const did = [];
  const canvas = { insertBlock: block => { did.push(block); return 'block-1'; }, dive: () => did.push('dive'), reserve: () => did.push('reserve') };
  const post = async () => { did.push('POST'); return {}; };
  const run = text => runLearnCommand(text, { app: 'demo', canvas, post, openSearch: () => {}, motionDev: true });
  const out = await run('/motion 15s explain me softmax func');
  assert.deepEqual(out, { prompt: '15s explain me softmax func' }, 'the chat asks; the proposal comes back as its card');
  assert.deepEqual(did, [], 'no request, no card, no held place and no Rabbit Hole');
  assert.equal((await run('/motion')).notice.text, 'Add what you want after /motion.');
});

// ---------- Professor Next Steps (contract §2.5): the commands a hook turn may run, and running them ----------

test('materialCommands: the Learn commands that can make a card now, from the registry, never search or navigation', () => {
  const list = materialCommands();
  assert.ok(list.length > 0);
  for (const m of list) { assert.deepEqual(m.cards, cardsFor(m.command).map(c => c.card)); assert.equal(typeof m.paid, 'boolean'); }
  for (const name of ['paper', 'dive', 'source', 'more']) assert.equal(list.some(m => m.command === name), false, name);
  // Owner, 2026-10-20: separate the user's commands from the Tutor's material tools. The Tutor still offers comparison tables,
  // challenges, explain-back activities and walkthroughs, though /compare and /walkthrough are no longer typed commands.
  const tool = name => list.find(m => m.command === name);
  assert.deepEqual(tool('compare')?.cards, ['table', 'graph', 'plot', 'flow', 'mermaid']);
  assert.deepEqual(tool('walkthrough')?.cards, ['walkthrough']);
  assert.ok(['challenge', 'explainBack'].every(card => tool('practice')?.cards.includes(card)));
});

// The Tutor's own create_material runs its material tools through the internal path, with a stubbed model, and makes the
// comparison table, challenge, explain-back and walkthrough cards; the same lines typed by a learner are refused.
test('runMaterials makes comparison tables, challenges, explain-backs and walkthroughs; typed, /compare and /walkthrough run nothing', async () => {
  const blocks = { compare: PRIMITIVES.table.block(ANY), practice: PRIMITIVES.challenge.block(ANY), quiz: PRIMITIVES.explain_back.block(ANY), walkthrough: PRIMITIVES.walkthrough.block(ANY) };
  const primitives = { compare: 'table', practice: 'challenge', quiz: 'explain_back', walkthrough: 'walkthrough' };
  const inserted = [], posts = [];
  const canvas = { insertBlock: block => { inserted.push(block); return `b${inserted.length}`; }, reserve: () => 'slot', release: () => {} };
  const post = async (path, body) => { posts.push(body.command); return { result: 'artifact', primitive: primitives[body.command], block: blocks[body.command] }; };
  const actions = ['compare', 'practice', 'quiz', 'walkthrough'].map(command => ({ type: 'create_material', command, request: 'sigmoid against tanh' }));
  const results = await runMaterials(actions, { app: 'demo', canvas, post, openSearch: () => {}, offer: async () => {} });
  assert.deepEqual(posts, ['compare', 'practice', 'quiz', 'walkthrough']);
  // A walkthrough card is the walkthrough_v1 interactive scene (learn-primitives.js).
  assert.deepEqual(inserted.map(blockModality), ['table', 'challenge', 'explain_back', 'scene']);
  assert.equal(inserted[3].spec.behaviorId, 'walkthrough_v1');
  assert.ok(results.every(result => result.notice?.tone === 'done'), JSON.stringify(results));
  for (const name of ['compare', 'walkthrough']) {
    const typed = await runLearnCommand(`/${name} sigmoid against tanh`, { app: 'demo', canvas, post, openSearch: () => {} });
    assert.match(typed.notice.text, new RegExp(`^/${name} is no longer available`));
  }
  assert.equal(posts.length, 4, 'a typed /compare or /walkthrough posts nothing');
});

// Any spec: every field reads as an empty value, so a primitive's own builder returns its block without a model.
const ANY = new Proxy(() => ANY, { get: (_, key) => (key === Symbol.toPrimitive ? () => '' : key === 'length' ? 0 : ANY) });
test('every card a material command can make: its modality is the block type runLearnCommand really inserts', async () => {
  for (const m of materialCommands()) for (const { primitive, card } of cardsFor(m.command)) {
    const inserted = [];
    const canvas = { insertNotebook: () => inserted.push(newNotebookBlock()), insertBlock: block => { inserted.push(block); return 'id'; }, reserve: () => 'slot', release: () => {} };
    const post = async () => ({ result: m.paid ? 'paid_proposal' : 'artifact', primitive, message: 'Uses paid generation.', block: PRIMITIVES[primitive].block(ANY) });
    (await runLearnCommand(`/${m.command} the topic`, { app: 'demo', canvas, post, openSearch: () => {}, internal: true })).proposal?.generate();
    assert.equal(inserted.length, 1, `${m.command} ${card}`);
    assert.equal(modalityOf({ type: 'create_material', command: m.command }, { materials: [{ ...m, cards: [card] }] }), blockModality(inserted[0]), `${m.command} ${card}`);
  }
});

// L10 + owner 2026-10-21 (message 19): interactive explanations survive through BOTH /explain and the Tutor's
// create_material(command: explain). Only the internal animate/compare tools lost the animation primitive. This fails if explain
// via create_material loses the interactive scene path.
test('create_material(command: explain) still makes the interactive scene: the Tutor route keeps the animation primitive', async () => {
  assert.ok(commandsFor('learn', { internal: true }).some(command => command.name === 'explain'), 'explain stays an internal material command');
  assert.deepEqual(learnRequest('explain', { args: 'an interactive look at how binary search narrows the range' }).allowedPrimitives, ['animation']);
  const inserted = [], posts = [];
  const canvas = { insertBlock: block => { inserted.push(block); return 'b1'; }, reserve: () => 'slot', release: () => {} };
  const post = async (path, body) => { posts.push([path, body.command]); return { result: 'artifact', primitive: 'animation', block: { type: 'animation', title: 'T', scene: { id: 's', duration: 1, objects: [], timeline: [] } } }; };
  const [result] = await runMaterials([{ type: 'create_material', command: 'explain', request: 'an interactive look at how binary search narrows the range' }], { app: 'demo', canvas, post, openSearch: () => {}, offer: async () => {} });
  assert.deepEqual(posts, [['/api/learn/artifact', 'explain']]);
  assert.equal(inserted[0].type, 'animation');
  assert.equal(result.notice.text, 'Added an interactive explanation.');
});

const ticks = async (done, n = 50) => { for (let i = 0; i < n && !done(); i++) await new Promise(resolve => setImmediate(resolve)); };
test('runMaterials: several create_material actions run in order through runLearnCommand; paid proposals are offered one at a time', async () => {
  const posts = [], inserted = [], offered = [];
  const replies = {
    animate: { result: 'paid_proposal', primitive: 'maths_animation', message: 'first', block: { type: 'video', mode: 'generate', title: 'a' } },
    flashcards: { result: 'artifact', primitive: 'flashcards', block: { type: 'flashcards', cards: [] } },
    video: { result: 'paid_proposal', primitive: 'video_generate', message: 'second', block: { type: 'video', mode: 'generate', title: 'v' } },
  };
  const canvas = { insertBlock: block => { inserted.push(block.title ?? block.type); return 'id'; }, reserve: () => 'slot', release: () => {} };
  const post = async (path, body) => { posts.push([path, body.command, body.args]); return replies[body.command]; };
  const answers = [];
  const offer = proposal => new Promise(resolve => { offered.push(proposal.message); answers.push(() => { proposal.generate(); resolve(); }); });
  const actions = [{ type: 'respond_text', text: 'Three things.' }, ...['animate', 'flashcards', 'video'].map(command => ({ type: 'create_material', command, request: `about ${command}` }))];
  const done = runMaterials(actions, { app: 'demo', canvas, post, openSearch: () => {}, offer });
  await ticks(() => posts.length === 3 && inserted.length === 1);
  assert.deepEqual(posts, ['animate', 'flashcards', 'video'].map(command => ['/api/learn/artifact', command, `about ${command}`]), 'the plan order, the existing artifact route');
  assert.deepEqual([inserted, offered], [['flashcards'], ['first']], 'a free card never waits for a paid answer; one proposal at a time');
  answers[0]();
  await ticks(() => offered.length === 2);
  assert.deepEqual([inserted, offered], [['flashcards', 'a'], ['first', 'second']]);
  answers[1]();
  const results = await done;
  assert.deepEqual(inserted, ['flashcards', 'a', 'v']);
  assert.equal(results.length, 3);
});

test('runMaterials: a failed command is reported and the next one still runs; no material, nothing runs', async () => {
  const posts = [];
  const post = async (path, body) => { posts.push(body.command); if (body.command === 'quiz') throw new Error('offline'); return { result: 'artifact', primitive: 'flashcards', block: { type: 'flashcards', cards: [] } }; };
  const canvas = { insertBlock: () => 'id', reserve: () => 'slot', release: () => {} };
  const results = await runMaterials([{ type: 'create_material', command: 'quiz', request: 'q' }, { type: 'create_material', command: 'flashcards', request: 'f' }], { app: 'demo', canvas, post, openSearch: () => {}, offer: async () => {} });
  assert.deepEqual(posts, ['quiz', 'flashcards']);
  assert.deepEqual(results.map(r => r.notice?.tone), ['error', 'done']);
  assert.deepEqual(await runMaterials([{ type: 'respond_text', text: 'x' }], { app: 'demo', canvas, post, openSearch: () => {}, offer: async () => {} }), []);
  assert.equal(posts.length, 2);
});

// docs/features/card-prompt.md: a card keeps the words typed to make it. A Tutor turn's cards keep the learner's words, never
// the model-written command line; a hook click typed none, so its cards carry no prompt. /cad hands the typed line to startCad.
test('card prompt: typed line on a command card, learner words on Tutor cards, none on a hook click, the line to /cad', async () => {
  const inserted = [];
  const canvas = { insertBlock: block => { inserted.push(block); return 'id'; }, reserve: () => 'slot', release: () => {}, startCad: (args, options) => inserted.push({ cad: args, ...options }) };
  const post = async () => ({ result: 'artifact', primitive: 'quiz', block: { type: 'quiz', question: 'Q?', options: [] } });
  await runLearnCommand('/quiz  softmax basics ', { app: 'demo', canvas, post, openSearch: () => {} });
  const actions = [{ type: 'create_material', command: 'quiz', request: 'model words about softmax' }];
  await runMaterials(actions, { app: 'demo', canvas, post, openSearch: () => {}, offer: async () => {}, promptUsed: 'help me get softmax' });
  await runMaterials(actions, { app: 'demo', canvas, post, openSearch: () => {}, offer: async () => {}, promptUsed: null });
  (await runLearnCommand('/cad a 40 mm bracket', { app: 'demo', canvas, post, openSearch: () => {} })).proposal.generate();
  await ticks(() => inserted.length === 4);
  assert.deepEqual(inserted.map(block => block.promptUsed), ['/quiz  softmax basics', 'help me get softmax', undefined, '/cad a 40 mm bracket']);
  assert.equal(inserted[3].cad, 'a 40 mm bracket', 'the CAD job still gets the words after the command');
  assert.equal(inserted[0].question, 'Q?', 'the quiz question is untouched');
});

// Task 9 review fix 4: a notice is handed over as soon as its command answers, never held behind a paid proposal.
test('runMaterials: each notice reaches onNotice as its command answers, before an unanswered proposal ahead of it is decided', async () => {
  const notices = [];
  const replies = { animate: { result: 'paid_proposal', primitive: 'maths_animation', message: 'paid', block: { type: 'video', mode: 'generate', title: 'a' } }, quiz: { result: 'unsupported', message: 'Not here yet.' } };
  const canvas = { insertBlock: () => 'id', reserve: () => 'slot', release: () => {} };
  const post = async (path, body) => replies[body.command];
  const actions = ['animate', 'quiz'].map(command => ({ type: 'create_material', command, request: 'r' }));
  runMaterials(actions, { app: 'demo', canvas, post, openSearch: () => {}, offer: () => new Promise(() => {}), onNotice: notice => notices.push(notice) });
  await ticks(() => notices.length === 1);
  assert.deepEqual(notices, [{ tone: 'info', text: 'Not here yet.' }], 'the unsupported notice, while the paid proposal still waits');
});

// #46 review finding (card-context-menu): a /command sent while the dock is busy (a Tutor turn, a hole's opening turn) or
// while another command still runs was dropped. It is held and runs once that ends, if the composer still shows it.
test('held commands: only a /command line is held; it is released only while the composer still shows that line', () => {
  assert.deepEqual(['/whiteboard Bulge sketch', '/teach tides', '  /dive ', 'what is a tide?', '', 'see /whiteboard'].map(holdsLine), [true, true, true, false, false, false]);
  assert.equal(releaseLine('/whiteboard Bulge sketch', '/whiteboard Bulge sketch'), '/whiteboard Bulge sketch');
  assert.equal(releaseLine('/whiteboard Bulge sketch', '/whiteboard Bulge sketch '), '/whiteboard Bulge sketch', 'a trailing space is the same line');
  assert.equal(releaseLine('/whiteboard Bulge sketch', ''), null, 'a cleared composer is a change of mind');
  assert.equal(releaseLine('/whiteboard Bulge sketch', '/whiteboard Tides'), null, 'an edited line waits for its own Enter');
  assert.equal(releaseLine(null, '/whiteboard Bulge sketch'), null);
});

// Effects never run here, so the wiring is pinned in source; the browser run is e2e/card-context-menu-check.mjs check 5.
test('held commands: the dock holds a /command Enter while busy and sends it when busy clears; LearnSlash holds one sent while a command runs', () => {
  const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const ask = read('ask.jsx'), picker = read('LearnSlash.jsx');
  const release = run => new RegExp(String.raw`useEffect\(\(\) => \{\n\s+if \(busy \|\| held\.current == null\) return;\n\s+const line = releaseLine\(held\.current, input\);\n\s+held\.current = null;\n\s+if \(line\) ${run}\(line\);\n\s+\}, \[busy\]\);`);
  assert.match(ask, /if \(busy && !event\.defaultPrevented && composerKey\(event\.nativeEvent, chatSendKey\(\)\) === 'send' && holdsLine\(input\)\) \{ event\.preventDefault\(\); held\.current = input; \}/);
  assert.match(ask, release('send'));
  assert.match(picker, /intercept: raw => \{ if \(busy\) \{ held\.current = raw; return true; \} exec\(raw\); return true; \}/);
  assert.match(picker, release('exec'));
});

// L5 (2026-10-20): a pill's prompt came back to Send with the pill still set, was wrapped as "/simplify <prompt>" again, held
// behind the still-busy picker and dropped once the composer no longer showed it: no message and no request.
test('commandLine: a pill line runs once; every command prompt that comes back is the chat turn, never a line again', async () => {
  assert.equal(commandLine('why softmax', { command: 'simplify' }), '/simplify why softmax');
  assert.equal(commandLine('  ', { command: 'dive' }), '/dive', 'a bare pill');
  assert.equal(commandLine(' /example tanh ', { command: 'simplify' }), '/example tanh', 'a typed line replaces the pill');
  assert.equal(commandLine('why softmax'), null, 'plain words are a chat turn');
  const canvas = { startCad: async () => ({}), insertNotebook: () => 'n', insertBlock: () => 'b', insertPaper: () => 'p', reserve: () => 'slot:1', release: () => {}, dive: () => ({ notice: null }), openSources: () => ({}) };
  const post = async () => ({ result: 'artifact', primitive: 'explanation', block: { type: 'explanation', title: 't', body: 'b' } });
  const prompted = [];
  for (const { name } of commandsFor('learn', { hidden: true })) {
    const out = await runLearnCommand(commandLine('why softmax', { command: name }), { app: 'demo', canvas, post, openSearch: () => ({ added: false }) }).catch(() => ({}));
    if (!out.prompt) continue;
    prompted.push(name);
    assert.equal(commandLine(out.prompt, { command: name, prompted: true }), null, `/${name}: its prompt is the chat turn`);
  }
  // Owner, 2026-10-20 (L7): /ask, /deeper, /example, /simplify and /teach were the commands that answered with a prompt; all
  // five are removed, so none does now. The prompted guard stays for any command that answers with one again.
  assert.deepEqual(prompted.sort(), []);
  assert.equal(commandLine('/whiteboard tides', { command: 'ask', prompted: true }), null, '"/ask /whiteboard tides": a prompt starting with / is not run');
  // Effects never run here, so the wiring is pinned in source; the browser run is e2e/chat-outputs-check.mjs steps 13 and 14.
  const ask = readFileSync(new URL('./ask.jsx', import.meta.url), 'utf8');
  assert.match(ask, /const line = !regenerate && slash \? commandLine\(raw, \{ command, prompted \}\) : null;/);
  assert.match(ask, /onPrompt=\{prompt => send\(prompt, undefined, \{ skipJourney: true, command: promptCommand\.current, prompted: true \}\)\}/);
});

// Release B (owner 4A and A4, 2026-10-16): the source searches open the shared finder with the query and run no model;
// /arxiv previews an ID or link there too, while a typed /paper keeps opening one directly.
test('/youtube, /arxiv and /wikipedia open the source finder with the query; nothing is posted or inserted', async () => {
  const { did, run } = harness();
  const outs = [await run('/youtube how transformers pay attention'), await run('/arxiv 1706.03762'), await run('/wikipedia'), await run('/arxiv https://arxiv.org/abs/2005.14165')];
  assert.deepEqual(did, [
    ['search', { source: 'youtube', query: 'how transformers pay attention' }], ['search', { source: 'arxiv', query: '1706.03762' }],
    ['search', { source: 'wikipedia', query: '' }], ['search', { source: 'arxiv', query: 'https://arxiv.org/abs/2005.14165' }],
  ]);
  assert.ok(outs.every(out => out.notice === null && !out.prompt), 'the finder says the rest; never sent to the Tutor');
  // The composer keeps its draft until the finder closes: finder settles { added } from the opener's answer.
  assert.deepEqual(await Promise.all(outs.map(out => out.finder)), [{ added: false }, { added: false }, { added: false }, { added: false }]);
  const added = await runLearnCommand('/arxiv attention', { app: 'demo', canvas: {}, post: null, openSearch: async () => ({ added: true }) });
  assert.deepEqual(await added.finder, { added: true });
});

// CAD dispatch owns no model call; the backend records a durable job on explicit submit.
test('CAD command selection is inert; empty submit clarifies and a detailed submit enters the durable path once', async()=>{
 let starts=0;
 const options={app:'canvas-test',canvas:{startCad:async()=>{starts++;}},post:()=>{throw Error('generic artifact route must not receive CAD');}};
 assert.ok(pickerSections('/cad')[0].items.some(item=>item.name==='cad'));
 assert.equal(starts,0);
 assert.equal((await runLearnCommand('/cad',options)).notice.tone,'question');assert.equal(starts,0);
 const result=await runLearnCommand('/cad a 40 mm plate',options);assert.equal(starts,0);
 await Promise.all([result.proposal.generate(),result.proposal.generate()]);assert.equal(starts,1);
});


// Owner brief 2026-10-21 message 7 item 4: the selected card reaches Motion's resolver as motion_request context.selection
// (control-plane motion-context.js), bounded to 4000 characters; with none, only the words go. MOT-20: it rides the chat turn's
// generation field, so the proposal (and the video it approves) is about that card.
test('/motion with a selected card: the chat turn sends it as context.selection, bounded; with none, only the concept', () => {
  const target = { id: 'b-photo', kind: 'Explanation', title: 'Photosynthesis', card: true, text: `Explanation: Photosynthesis\n${'Plants make glucose. '.repeat(400)}` };
  const { motion } = generationField({ offered: true, concept: 'Biology', target });
  assert.deepEqual(Object.keys(motion.context.selection), ['cardId', 'kind', 'title', 'text']);
  assert.deepEqual([motion.concept, motion.context.selection.cardId, motion.context.selection.kind, motion.context.selection.title], ['Biology', 'b-photo', 'Explanation', 'Photosynthesis']);
  assert.equal(motion.context.selection.text.length, 4000);
  assert.ok(motion.context.selection.text.startsWith('Explanation: Photosynthesis\nPlants make glucose.'));
  assert.equal(generationField({ offered: true, concept: 'Biology' }).motion.context, undefined, 'no selection, no context');
  assert.equal(generationField({ offered: true, target: { id: 'b-empty', kind: 'Whiteboard', text: '  ' } }).motion.context, undefined, 'a card with no text has nothing to ground on');
});
