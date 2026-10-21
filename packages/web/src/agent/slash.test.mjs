import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandsFor, descFor, IMAGE_GENERATION, labelOf, LEARN_MENU, learnRequest, MATERIAL_TOOLS, primitive, REMOVED_COMMANDS, resolveCommand, reviewOff, SELECTIONS, SLASH, toolOf, unavailableCommand } from './slash.js';
import { isReady } from '../../../control-plane/src/learn-primitives.js';

const names = (list) => list.map((c) => c.name);

// Owner, 2026-10-20: the slash-command cleanup. These are the commands a learner can still type or pick in a production
// build; a development or review build adds /motion, which replaced /animate.
const LEARN = ['dive', 'practice', 'quiz', 'explain', 'flashcards', 'code', 'graph', 'diagram', 'whiteboard', 'image', 'video', 'cad', '3d', 'notebook', 'youtube', 'arxiv', 'wikipedia'];

test('one command list: Learn keeps its commands, Home, Library and Project offer none', () => {
  assert.deepEqual(names(commandsFor('learn', { motionDev: false })), LEARN);
  for (const place of ['home', 'project']) assert.deepEqual(commandsFor(place, { motionDev: true }), [], place);
  assert.equal(new Set(names([...SLASH, ...MATERIAL_TOOLS])).size, SLASH.length + MATERIAL_TOOLS.length);
});

test('every menu label scans in one short line; the pill label is short or falls back to the menu label', () => {
  // 34: /motion's owner-worded "Create an animated explainer video" (owner, 2026-10-20), still one line in the picker.
  for (const c of SLASH) for (const place of c.places) assert.ok(descFor(c, place).length <= 34, `${c.name} in ${place}: ${descFor(c, place)}`);
  for (const c of SLASH) assert.ok(labelOf(c).length <= 20 && !labelOf(c).startsWith('/'), `${c.name}: ${labelOf(c)}`);
  // Every retained command says what it does for the Slash commands window.
  for (const c of SLASH) assert.ok(c.about?.length > 20, c.name);
});

test('a Learn command becomes one semantic request with the selection as context; without one it acts on the current concept', () => {
  const card = { kind: 'card', id: 'b7', title: 'Attention · Guided' };
  assert.deepEqual(learnRequest('quiz', { args: 'the softmax', selection: card }),
    { kind: 'learn', command: 'quiz', family: 'quiz', allowedPrimitives: ['quiz'], deterministic: false, paid: [], prompt: 'Ask me one short question on the selected card "Attention · Guided", then wait for my answer. Focus: the softmax.', context: card, selection: card });
  assert.deepEqual(learnRequest('notebook', { args: 'for experimenting with softmax' }),
    { kind: 'learn', command: 'notebook', family: 'notebook', allowedPrimitives: ['notebook'], deterministic: true, paid: [], action: 'insert_notebook', prompt: 'for experimenting with softmax', context: null, selection: null });
  assert.equal(learnRequest('explain').prompt, 'Add explanation for the current concept.');
  for (const name of ['find', 'source', 'paper', 'deeper', 'ask', 'more']) assert.throws(() => learnRequest(name), /not a Learn command/, name);
});

test('the selection contract names what exists today and what owning branches add later', () => {
  assert.deepEqual(SELECTIONS, ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object']);
  assert.throws(() => learnRequest('quiz', { selection: { kind: 'widget' } }), /unknown selection/);
});

test('the review copy keeps its limits on the bar\'s internal ask and teach', () => {
  assert.match(reviewOff('ask', 'app', { askLive: false }).reason, /live chat history/);
  assert.equal(reviewOff('ask', 'app', { askLive: true }), null);
  assert.equal(reviewOff('ask', 'workspace', { askLive: false }), null); // Home asks use LEARN_DB (learn-home-ask.js)
  assert.equal(reviewOff('ask', 'project', { askLive: false }), null); // project asks use LEARN_DB
  assert.deepEqual(reviewOff('teach', 'app'), { reason: 'Learn on an app would ask through live chat history, so it is off on this preview.', short: 'Off on this preview' });
  for (const kind of ['workspace', 'project', 'canvas']) assert.equal(reviewOff('teach', kind), null, kind);
});

// Learn tool families (user, 2026-09-28, via the Learn branch). Auto stays the default; a slash command is an
// optional override that names the primitives the tutor may return. compare and walkthrough are the Tutor's material tools.
const FAMILIES = {
  explain: ['explanation', 'table', 'animation', 'narration'], flashcards: ['flashcards'], code: ['code_sample', 'code_exercise'],
  graph: ['interactive_graph', 'data_plot', 'knowledge_graph'], diagram: ['flow_diagram', 'mermaid_diagram'], walkthrough: ['walkthrough'],
  animate: ['reference_attention', 'maths_animation'], whiteboard: ['whiteboard'], image: ['image'], 'generate-image': ['image_generate'],
  video: ['video_generate'], '3d': ['3d_model', 'blender_scene'], notebook: ['notebook'],
  practice: ['challenge', 'explain_back', 'quiz', 'code_exercise'], quiz: ['quiz'],
  compare: ['table', 'interactive_graph', 'data_plot', 'flow_diagram', 'mermaid_diagram'],
};

// Owner, 2026-10-21 (L10): interactive scenes are /explain's and the Tutor's explanation material only - no other command or
// material tool (compare, /animate) may make one. Words pick the form: plain text never gets a scene, an interactive request
// never gets text instead; neither is a topic rule.
test('only /explain makes an interactive scene, and the learner words can pick scene or text', () => {
  assert.deepEqual(commandsFor('learn', { internal: true }).filter((c) => c.family?.includes('animation')).map((c) => c.name), ['explain']);
  assert.deepEqual(learnRequest('explain', { args: 'an interactive look at how binary search narrows the range' }).allowedPrimitives, ['animation']);
  assert.deepEqual(learnRequest('explain', { args: 'a simulation of supply and demand' }).allowedPrimitives, ['animation']);
  assert.deepEqual(learnRequest('explain', { args: 'in plain text: an interactive projectile' }).allowedPrimitives, ['explanation']);
  assert.deepEqual(learnRequest('explain', { args: 'how compound interest grows' }).allowedPrimitives, FAMILIES.explain);
});

test('each tool or narrowed intent names exactly its allowed primitives', () => {
  for (const [name, family] of Object.entries(FAMILIES)) {
    const r = learnRequest(name);
    assert.equal(r.family, name, name);
    assert.deepEqual(r.allowedPrimitives, family, name);
  }
});

// Owner, 2026-10-20: search and generation are separate commands; neither family holds the other's primitive.
test('media: /image only searches, /generate-image and /video only generate, /youtube only searches', () => {
  assert.deepEqual(learnRequest('image').paid, []);
  assert.ok(!learnRequest('image').allowedPrimitives.includes('image_generate'));
  assert.deepEqual(learnRequest('generate-image').allowedPrimitives, ['image_generate']);
  assert.deepEqual(learnRequest('video').allowedPrimitives, ['video_generate']);
  assert.ok(!learnRequest('video').allowedPrimitives.includes('video'));
  assert.deepEqual([learnRequest('youtube').action, learnRequest('youtube').allowedPrimitives], ['open_source', null]);
  assert.deepEqual(['image', 'generate-image', 'youtube', 'video', '3d', 'explain', 'dive'].map((n) => descFor(toolOf(n), 'learn')),
    ['Search images', 'Generate image', 'Search YouTube', 'Generate video', 'Add 3D scene', 'Add explanation', 'Open Rabbit Hole']);
});

// /generate-image needs image generation, which is off: hidden from every list and refused when typed, never turned on here.
test('/generate-image is hidden and refused while image generation is off; the flag follows the primitive', () => {
  assert.equal(IMAGE_GENERATION, isReady('image_generate'));
  assert.equal(IMAGE_GENERATION, false);
  for (const surface of ['chat', 'learn', 'ctrlk', 'insert']) {
    assert.ok(!names(commandsFor(surface, { motionDev: true })).includes('generate-image'), surface);
    assert.deepEqual(resolveCommand('/generate-image a watercolor mountain landscape', surface), { unsupported: 'generate-image' }, surface);
  }
  assert.match(unavailableCommand('generate-image'), /Image generation is not available here/);
  assert.ok(names(commandsFor('chat', { imageGeneration: true })).includes('generate-image'));
  assert.equal(resolveCommand('/generate-image a lake', 'ctrlk', { imageGeneration: true }).command.name, 'generate-image');
});

test('paid primitives always confirm and carry no guessed cost', () => {
  for (const id of ['image_generate', 'video_generate', 'maths_animation', 'blender_scene', 'narration']) {
    assert.deepEqual(primitive(id), { id, paid: true, needsConfirm: true, estimatedCost: undefined });
  }
  assert.deepEqual(primitive('image'), { id: 'image', paid: false, needsConfirm: false });
  assert.deepEqual(learnRequest('generate-image').paid, ['image_generate']);
  assert.deepEqual(learnRequest('video').paid, ['video_generate']);
  assert.deepEqual(learnRequest('animate').paid, ['maths_animation']);
  assert.deepEqual(learnRequest('3d', { args: 'a transformer block' }).paid, ['blender_scene']);
  assert.deepEqual(learnRequest('explain').paid, ['narration']); // fish.audio narration is paid (user, via the Learn branch)
  assert.deepEqual(learnRequest('code').paid, []);
});

test('notebook and whiteboard are deterministic: no model', () => {
  for (const [name, action] of [['notebook', 'insert_notebook'], ['whiteboard', 'insert_whiteboard']]) {
    const r = learnRequest(name);
    assert.equal(r.deterministic, true, name);
    assert.equal(r.action, action, name);
  }
  for (const name of ['explain', 'diagram', 'practice', 'compare']) assert.equal(learnRequest(name).deterministic, false, name);
});

test('/practice subtype words narrow the family; plain /practice leaves the whole family to the tutor', () => {
  assert.deepEqual(learnRequest('practice', { args: 'explain it back' }).allowedPrimitives, ['explain_back']);
  assert.deepEqual(learnRequest('practice', { args: 'coding' }).allowedPrimitives, ['code_exercise']);
  assert.deepEqual(learnRequest('practice', { args: 'multiple choice on softmax' }).allowedPrimitives, ['quiz']);
  assert.deepEqual(learnRequest('practice').allowedPrimitives, ['challenge', 'explain_back', 'quiz', 'code_exercise']);
  assert.equal(learnRequest('practice', { args: 'coding' }).family, 'practice');
});

test('the Learn picker: LEARN, CREATE and SEARCH; every other command under More learning tools', () => {
  assert.deepEqual(LEARN_MENU.learn, ['dive', 'practice', 'quiz']);
  assert.deepEqual(LEARN_MENU.create, ['explain', 'code', 'graph', 'diagram', 'motion', 'flashcards', 'notebook']);
  assert.deepEqual(LEARN_MENU.search, ['image', 'youtube', 'arxiv', 'wikipedia']);
  for (const name of [...LEARN_MENU.learn, ...LEARN_MENU.create, ...LEARN_MENU.search]) assert.ok(names(SLASH).includes(name), name);
});

// Release B (owner decisions 1A, 2A, 4A and A4, 2026-10-16): one registry with surface capabilities.
const CTRLK_SET = ['explain', 'code', 'graph', 'diagram', 'flashcards', 'image', 'video', 'cad', '3d', 'motion', 'youtube', 'arxiv', 'wikipedia'];

test('surfaces: Ctrl+K offers exactly the owner set; Chat is the Learn list; Insert offers the three source searches', () => {
  assert.deepEqual(names(commandsFor('ctrlk', { motionDev: true })).sort(), [...CTRLK_SET].sort());
  // A production build has no /motion anywhere, Ctrl+K included.
  assert.deepEqual(names(commandsFor('ctrlk', { motionDev: false })).sort(), CTRLK_SET.filter((n) => n !== 'motion').sort());
  assert.deepEqual(commandsFor('chat', { motionDev: true }), commandsFor('learn', { motionDev: true }));
  assert.deepEqual(names(commandsFor('insert')), ['youtube', 'arxiv', 'wikipedia']);
  for (const c of SLASH) {
    if (c.places.includes('ctrlk') && c.name !== 'generate-image') assert.ok(CTRLK_SET.includes(c.name), c.name);
    if (['youtube', 'arxiv', 'wikipedia'].includes(c.name)) assert.deepEqual(c.places, ['learn', 'ctrlk', 'insert']);
  }
  for (const name of ['dive', 'practice', 'quiz', 'whiteboard', 'notebook']) assert.deepEqual(toolOf(name).places, ['learn'], name);
});

test('every command has a kind; the generate ones are what Ctrl+K picks Explain for, the source ones open the finder', () => {
  for (const c of [...SLASH, ...MATERIAL_TOOLS]) assert.ok(['generate', 'source', 'prompt', 'dialog'].includes(c.kind), c.name);
  assert.deepEqual(names(commandsFor('ctrlk', { motionDev: true }).filter((c) => c.kind === 'generate')), ['explain', 'flashcards', 'code', 'graph', 'diagram', 'image', 'video', 'cad', '3d', 'motion']);
  for (const name of ['youtube', 'arxiv', 'wikipedia']) {
    const c = toolOf(name);
    assert.equal(c.kind, 'source');
    assert.equal(c.source, name);
    // No model routes or reads a source search: it runs as a deterministic action, with no primitives for the tutor.
    assert.deepEqual([learnRequest(name).action, learnRequest(name).deterministic, learnRequest(name).allowedPrimitives], ['open_source', true, null]);
  }
});

test('labels: a short pill label where there is one, else the menu label; never a /name', () => {
  assert.deepEqual(['video', 'youtube', 'arxiv', 'wikipedia', 'image'].map((n) => labelOf(toolOf(n))), ['Generate video', 'Search YouTube', 'Search arXiv', 'Search Wikipedia', 'Search images']);
  assert.deepEqual(['explain', 'dive', '3d', 'cad', 'practice', 'quiz', 'graph'].map((n) => labelOf(toolOf(n))), ['Add explanation', 'Open Rabbit Hole', '3D', 'CAD', 'Practice', 'Quiz', 'Graph']);
  // A saved message's removed command still reads as words.
  assert.equal(labelOf({ name: 'simplify' }), 'Simplify');
});

// Owner, 2026-10-20: /motion is the command for the Motion explainer-video pipeline, in place of /animate.
test('/motion: its pill reads Motion, its menu line is the owner wording, and only a development or review build offers it', () => {
  const motion = toolOf('motion');
  assert.deepEqual([labelOf(motion), descFor(motion, 'learn'), motion.action, motion.needs], ['Motion', 'Create an animated explainer video', 'motion', 'motion_dev']);
  for (const surface of ['chat', 'ctrlk']) {
    assert.equal(resolveCommand('/motion 15s explain me softmax func', surface, { motionDev: true }).command, motion, surface);
    assert.deepEqual(resolveCommand('/motion 15s explain me softmax func', surface, { motionDev: false }), { unsupported: 'motion' }, surface);
  }
  assert.ok(!names(commandsFor('learn', { motionDev: false })).includes('motion'));
  assert.deepEqual(resolveCommand('/animate how softmax works', 'chat', { motionDev: true }), { unsupported: 'animate' });
});

test('resolveCommand: a typed command is the very entry the picker lists; an unoffered one is reported, never swapped', () => {
  for (const surface of ['chat', 'ctrlk', 'insert']) {
    for (const picked of commandsFor(surface, { motionDev: true })) {
      const typed = resolveCommand(`/${picked.name} some words`, surface, { motionDev: true });
      assert.equal(typed.command, picked, `${surface} /${picked.name}`);
      assert.equal(typed.arg, 'some words');
    }
  }
  assert.deepEqual(resolveCommand('  /Explain   why softmax  ', 'ctrlk'), { command: toolOf('explain'), arg: 'why softmax' });
  assert.deepEqual(resolveCommand('/youtube', 'chat'), { command: toolOf('youtube'), arg: '' });
  // Learn prompts and dialog commands are unsupported in Ctrl+K, but unchanged in Chat.
  for (const name of ['quiz', 'dive', 'notebook', 'whiteboard', 'practice']) {
    assert.deepEqual(resolveCommand(`/${name} x`, 'ctrlk'), { unsupported: name }, name);
    assert.equal(resolveCommand(`/${name} x`, 'chat').command.name, name, name);
  }
  assert.deepEqual(resolveCommand('/motion 15s softmax', 'ctrlk', { motionDev: false }), { unsupported: 'motion' });
  assert.deepEqual(resolveCommand('/nope', 'chat'), { unsupported: 'nope' });
  for (const text of ['explain this', '', '/', 'a /graph later', null]) assert.equal(resolveCommand(text, 'chat'), null, String(text));
});

// Owner, 2026-10-20: 17 commands removed, then /animate (/motion is the animation command). None is listed or resolves for a
// typed line on any surface; each says it is unavailable. The Tutor's material tools (compare, walkthrough, animate) resolve
// only for its own create_material (internal).
test('the removed commands are gone from every surface list and every typed dispatch, and say they are unavailable', () => {
  assert.equal(REMOVED_COMMANDS.length, 18);
  assert.deepEqual([...REMOVED_COMMANDS].sort(), ['animate', 'ask', 'compare', 'connect', 'deeper', 'do', 'example', 'find', 'more', 'new', 'open', 'paper', 'research', 'run', 'simplify', 'source', 'teach', 'walkthrough']);
  for (const name of REMOVED_COMMANDS) {
    assert.ok(!names(SLASH).includes(name), name);
    for (const surface of ['chat', 'learn', 'ctrlk', 'insert', 'home', 'project']) {
      assert.ok(!names(commandsFor(surface, { motionDev: true, imageGeneration: true })).includes(name), `${surface} lists /${name}`);
      assert.deepEqual(resolveCommand(`/${name} something`, surface, { motionDev: true }), { unsupported: name }, `${surface} /${name}`);
    }
    assert.match(unavailableCommand(name), new RegExp(`^/${name} is no longer available\\.`));
  }
  assert.equal(unavailableCommand('graph'), null);
  // The bar lists no commands, so it never says to type / (AgentBar.jsx).
  assert.equal(unavailableCommand('teach', { listed: false }), '/teach is no longer available. Ask in your own words.');
  // The Tutor's internal path, and only it, still reaches the material tools.
  assert.deepEqual(names(MATERIAL_TOOLS), ['compare', 'walkthrough', 'animate']);
  for (const name of ['compare', 'walkthrough', 'animate']) {
    assert.ok(names(commandsFor('learn', { internal: true })).includes(name), name);
    assert.equal(resolveCommand(`/${name} x`, 'chat', { internal: true }).command.name, name);
    assert.deepEqual(resolveCommand(`/${name} x`, 'chat'), { unsupported: name });
  }
});
