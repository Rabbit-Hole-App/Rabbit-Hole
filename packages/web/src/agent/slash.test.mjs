import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandsFor, descFor, IMAGE_GENERATION, labelOf, LEARN_MENU, learnRequest, MATERIAL_TOOLS, primitive, REMOVED_COMMANDS, resolveCommand, reviewOff, SELECTIONS, SLASH, toolOf, typedOf, idOfTyped, unavailableCommand } from './slash.js';
import { isReady } from '../../../control-plane/src/learn-primitives.js';

const names = (list) => list.map((c) => c.name);

// Owner spec 2026-10-29 (slash commands cleanup): exactly 18 public commands, the same in Chat and Ctrl+K, in the shared section
// order. /dive, /whiteboard and /video are removed, /browser is added. /motion needs a Motion build and /image (id generate-image)
// the server's image offer.
const PUBLIC = ['explain', 'practice', 'quiz', 'flashcards', 'goal', 'code', 'graph', 'diagram', 'notebook', 'generate-image', 'motion', 'cad', '3d', 'browser', 'image', 'youtube', 'arxiv', 'wikipedia'];
const LEARN = PUBLIC.filter((n) => n !== 'motion' && n !== 'generate-image');

test('exactly 18 public commands in the shared sections; the removed three are gone and /browser is one entry', () => {
  assert.equal(SLASH.length, 18);
  assert.deepEqual(names(SLASH), PUBLIC);
  assert.deepEqual([...LEARN_MENU.learn, ...LEARN_MENU.create, ...LEARN_MENU.search], PUBLIC, 'every command in exactly one section, in order');
  assert.deepEqual(LEARN_MENU.learn, ['explain', 'practice', 'quiz', 'flashcards', 'goal']);
  assert.deepEqual(LEARN_MENU.create, ['code', 'graph', 'diagram', 'notebook', 'generate-image', 'motion', 'cad', '3d', 'browser']);
  assert.deepEqual(LEARN_MENU.search, ['image', 'youtube', 'arxiv', 'wikipedia']);
  for (const name of ['dive', 'whiteboard', 'video']) assert.ok(!names(SLASH).includes(name) && REMOVED_COMMANDS.includes(name), name);
  assert.deepEqual(names(commandsFor('learn', { motionDev: true, imageGeneration: true })), PUBLIC);
  assert.deepEqual([learnRequest('browser').action, learnRequest('browser').deterministic, learnRequest('browser').allowedPrimitives], ['insert_webpage', true, null]);
  // Explain Back is a Practice mode, never a command.
  assert.ok(!SLASH.some((c) => /explain.?back|challenge/.test(c.name)));
});

test('one command list: Learn keeps its commands, Home, Library and Project offer none', () => {
  assert.deepEqual(names(commandsFor('learn', { motionDev: false })), LEARN);
  for (const place of ['home', 'project']) assert.deepEqual(commandsFor(place, { motionDev: true }), [], place);
  assert.equal(new Set(names([...SLASH, ...MATERIAL_TOOLS])).size, SLASH.length + MATERIAL_TOOLS.length);
});

test('every title scans in one short line; each command says what it does and hints its composer', () => {
  for (const c of SLASH) for (const place of c.places) assert.ok(descFor(c, place).length <= 34, `${c.name} in ${place}: ${descFor(c, place)}`);
  for (const c of SLASH) assert.ok(labelOf(c).length <= 20 && !labelOf(c).startsWith('/'), `${c.name}: ${labelOf(c)}`);
  for (const c of SLASH) assert.ok(c.about?.length > 20, c.name);
  for (const c of SLASH) assert.ok(c.placeholder?.length > 10 && !/\.\.\.|…/.test(c.placeholder), `${c.name} placeholder`);
});

test('a Learn command becomes one semantic request with the selection as context; without one it acts on the current concept', () => {
  const card = { kind: 'card', id: 'b7', title: 'Attention · Guided' };
  assert.deepEqual(learnRequest('quiz', { args: 'the softmax', selection: card }),
    { kind: 'learn', command: 'quiz', family: 'quiz', allowedPrimitives: ['quiz'], deterministic: false, paid: [], prompt: 'Ask me one short question on the selected card "Attention · Guided", then wait for my answer. Focus: the softmax.', context: card, selection: card });
  assert.deepEqual(learnRequest('notebook', { args: 'for experimenting with softmax' }),
    { kind: 'learn', command: 'notebook', family: 'notebook', allowedPrimitives: ['notebook'], deterministic: true, paid: [], action: 'insert_notebook', prompt: 'for experimenting with softmax', context: null, selection: null });
  assert.equal(learnRequest('explain').prompt, 'Explanation for the current concept.');
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
// optional override that names the primitives the tutor may return. compare, walkthrough, animate, whiteboard and video are the
// Tutor's material tools.
const FAMILIES = {
  explain: ['explanation', 'table', 'animation', 'narration'], flashcards: ['flashcards'], code: ['code_sample', 'code_exercise'],
  graph: ['interactive_graph', 'data_plot', 'knowledge_graph'], diagram: ['flow_diagram', 'mermaid_diagram'], walkthrough: ['walkthrough'],
  animate: ['reference_attention', 'maths_animation'], whiteboard: ['whiteboard'], image: ['image'], 'generate-image': ['image_generate'],
  video: ['video_generate'], '3d': ['3d_model', 'blender_scene'], notebook: ['notebook'],
  // Owner 2026-10-30: one Practice card - /practice offers explain_back (the Practice card), never the challenge primitive.
  practice: ['explain_back', 'quiz', 'code_exercise'], quiz: ['quiz'],
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
// Owner, 2026-10-26: /image generates (id generate-image), /photos searches (id image); the ids never change meaning.
test('media: /photos (id image) only searches, /image (id generate-image) only generates, /youtube only searches; the Tutor keeps video', () => {
  assert.deepEqual(learnRequest('image').paid, []);
  assert.ok(!learnRequest('image').allowedPrimitives.includes('image_generate'));
  assert.deepEqual(learnRequest('generate-image').allowedPrimitives, ['image_generate']);
  assert.deepEqual(learnRequest('video').allowedPrimitives, ['video_generate'], 'the Tutor\'s internal material tool');
  assert.deepEqual([learnRequest('youtube').action, learnRequest('youtube').allowedPrimitives], ['open_source', null]);
  assert.deepEqual(['image', 'generate-image', 'youtube', '3d', 'explain', 'browser'].map((n) => descFor(toolOf(n), 'learn')),
    ['Photo search', 'Image generation', 'YouTube search', '3D scene', 'Explanation', 'Browser']);
});

// Owner, 2026-10-26: the typed names. /image is the paid generation, /photos the photo search, /generate-image still works as
// an alias of /image, and /imagine is not a command. Typed names resolve to the stable ids; the ids resolve to themselves.
test('typed names: /image resolves to generate-image, /photos to the photo search, /generate-image still resolves, /imagine does not exist', () => {
  const on = { imageGeneration: true };
  for (const surface of ['chat', 'ctrlk']) {
    assert.equal(resolveCommand('/image a lake', surface, on).command.name, 'generate-image', surface);
    assert.equal(resolveCommand('/IMAGE a lake', surface, on).command, toolOf('generate-image'), surface);
    assert.equal(resolveCommand('/photos a lake', surface, on).command.name, 'image', surface);
    assert.equal(resolveCommand('/generate-image a lake', surface, on).command, toolOf('generate-image'), `${surface}: the alias is the same entry`);
    assert.deepEqual(resolveCommand('/imagine a lake', surface, on), { unsupported: 'imagine' }, surface);
  }
  // The photo search needs no switch; /photos works while image generation is off.
  assert.equal(resolveCommand('/photos Mount Fuji', 'learn').command, toolOf('image'));
  assert.equal(resolveCommand('/photos Mount Fuji', 'learn').arg, 'Mount Fuji');
  assert.ok(!SLASH.some((c) => c.name === 'imagine' || c.typed === 'imagine' || c.aliases?.includes('imagine')));
  // ids <-> typed names, and a name nothing types is its own.
  assert.deepEqual(['image', 'generate-image', 'explain', 'simplify'].map(typedOf), ['photos', 'image', 'explain', 'simplify']);
  assert.deepEqual(['photos', 'image', 'generate-image', 'explain', 'simplify', 'imagine'].map(idOfTyped), ['image', 'generate-image', 'generate-image', 'explain', 'simplify', 'imagine']);
  // Every typed name and alias of an entry resolves to it and to no other entry.
  for (const entry of SLASH) for (const word of [typedOf(entry.name), ...(entry.aliases || [])]) assert.equal(idOfTyped(word), entry.name, `${entry.name}: ${word}`);
  // The menu reads the titles (the pill shows the typed name, CommandPill.jsx).
  assert.equal(labelOf(toolOf('generate-image')), 'Image generation');
  assert.equal(labelOf(toolOf('image')), 'Photo search');
});

// Saved data names ids, never typed names: id `image` is still the photo search and `generate-image` still the generation.
test('saved ids keep their meaning: toolOf(image) is the photo search, toolOf(generate-image) the generation', () => {
  assert.deepEqual(toolOf('image').family, ['image']);
  assert.deepEqual(toolOf('generate-image').family, ['image_generate']);
  assert.equal(commandsFor('learn').find((c) => c.name === 'image')?.desc, 'Photo search');
});

// /image needs image generation: hidden from every list and refused when typed (as /image or its alias /generate-image) until the server offers it for this person, never turned on here.
test('/image (id generate-image) is hidden and refused until the server offers it: the web constant stays off', () => {
  // Public activation: the primitive is ready but the web constant stays off, so the server's per-caller answer lists the command (image-public-gates.test.js).
  assert.equal(isReady('image_generate'), true);
  assert.equal(IMAGE_GENERATION, false);
  for (const surface of ['chat', 'learn', 'ctrlk', 'insert']) {
    assert.ok(!names(commandsFor(surface, { motionDev: true })).includes('generate-image'), surface);
    assert.deepEqual(resolveCommand('/generate-image a watercolor mountain landscape', surface), { unsupported: 'generate-image' }, surface);
    assert.deepEqual(resolveCommand('/image a watercolor mountain landscape', surface), { unsupported: 'image' }, surface);
  }
  assert.match(unavailableCommand('generate-image'), /Image generation is not available here/);
  // An unavailable command still says why, and points at the photo search.
  assert.equal(unavailableCommand('image'), 'Image generation is not available here. /photos searches for real photos.');
  assert.equal(unavailableCommand('generate-image'), unavailableCommand('image'));
  assert.equal(unavailableCommand('photos'), null, 'the photo search is never unavailable');
  // unavailableCommand takes what was TYPED: a caller holding the id `image` (the photo search) goes through typedOf.
  assert.equal(unavailableCommand(typedOf('image')), null);
  assert.equal(unavailableCommand('image', { imageGeneration: true }), null);
  assert.ok(names(commandsFor('chat', { imageGeneration: true })).includes('generate-image'));
  assert.equal(resolveCommand('/generate-image a lake', 'ctrlk', { imageGeneration: true }).command.name, 'generate-image');
  assert.equal(resolveCommand('/image a lake', 'ctrlk', { imageGeneration: true }).command.name, 'generate-image');
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

test('notebook, browser and the Tutor\'s whiteboard are deterministic: no model', () => {
  for (const [name, action] of [['notebook', 'insert_notebook'], ['browser', 'insert_webpage'], ['whiteboard', 'insert_whiteboard']]) {
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
  assert.deepEqual(learnRequest('practice').allowedPrimitives, ['explain_back', 'quiz', 'code_exercise']); // owner 2026-10-30: one Practice card
  assert.equal(learnRequest('practice', { args: 'coding' }).family, 'practice');
});

// Owner spec 2026-10-29: Chat and Ctrl+K offer the same 18 (Ctrl+K hands each to Chat's dispatcher); Insert the three source searches.
test('surfaces: Ctrl+K offers exactly Chat\'s list; Insert offers the three source searches', () => {
  for (const options of [{ motionDev: true }, { motionDev: false }, { motionDev: true, imageGeneration: true }]) {
    assert.deepEqual(commandsFor('ctrlk', options), commandsFor('learn', options), JSON.stringify(options));
    assert.deepEqual(commandsFor('chat', options), commandsFor('learn', options));
  }
  assert.ok(!names(commandsFor('ctrlk', { motionDev: false })).includes('motion'), 'no Motion build: no /motion anywhere');
  assert.deepEqual(names(commandsFor('insert')), ['youtube', 'arxiv', 'wikipedia']);
  for (const c of SLASH) {
    assert.ok(c.places.includes('learn') && c.places.includes('ctrlk'), c.name);
    if (['youtube', 'arxiv', 'wikipedia'].includes(c.name)) assert.deepEqual(c.places, ['learn', 'ctrlk', 'insert']);
  }
});

test('every command has a kind; the source ones open the finder', () => {
  for (const c of [...SLASH, ...MATERIAL_TOOLS]) assert.ok(['generate', 'source', 'prompt', 'dialog'].includes(c.kind), c.name);
  for (const name of ['youtube', 'arxiv', 'wikipedia']) {
    const c = toolOf(name);
    assert.equal(c.kind, 'source');
    assert.equal(c.source, name);
    // No model routes or reads a source search: it runs as a deterministic action, with no primitives for the tutor.
    assert.deepEqual([learnRequest(name).action, learnRequest(name).deterministic, learnRequest(name).allowedPrimitives], ['open_source', true, null]);
  }
});

test('labels: the command\'s title, never a /name', () => {
  assert.deepEqual(['youtube', 'arxiv', 'wikipedia', 'image'].map((n) => labelOf(toolOf(n))), ['YouTube search', 'arXiv search', 'Wikipedia search', 'Photo search']);
  assert.deepEqual(['explain', '3d', 'cad', 'practice', 'quiz', 'graph', 'goal'].map((n) => labelOf(toolOf(n))), ['Explanation', '3D scene', 'CAD model', 'Practice', 'Quiz', 'Graph', 'Learning goal']);
  // A saved message's removed command still reads as words.
  assert.equal(labelOf({ name: 'simplify' }), 'Simplify');
});

// Owner, 2026-10-20: /motion is the command for the Motion explainer-video pipeline, in place of /animate.
test('/motion: its title is Animated explainer, and only a Motion build offers it', () => {
  const motion = toolOf('motion');
  assert.deepEqual([labelOf(motion), descFor(motion, 'learn'), motion.action, motion.needs], ['Animated explainer', 'Animated explainer', 'motion', 'motion_dev']);
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
      const typed = resolveCommand(`/${typedOf(picked.name)} some words`, surface, { motionDev: true });
      assert.equal(typed.command, picked, `${surface} /${typedOf(picked.name)}`);
      assert.equal(typed.arg, 'some words');
    }
  }
  assert.deepEqual(resolveCommand('  /Explain   why softmax  ', 'ctrlk'), { command: toolOf('explain'), arg: 'why softmax' });
  assert.deepEqual(resolveCommand('/youtube', 'chat'), { command: toolOf('youtube'), arg: '' });
  // Every Learn command resolves alike in Ctrl+K and Chat (one dispatcher).
  for (const name of ['quiz', 'notebook', 'practice', 'goal', 'browser']) {
    assert.equal(resolveCommand(`/${name} x`, 'ctrlk').command.name, name, name);
    assert.equal(resolveCommand(`/${name} x`, 'chat').command.name, name, name);
  }
  assert.deepEqual(resolveCommand('/motion 15s softmax', 'ctrlk', { motionDev: false }), { unsupported: 'motion' });
  assert.deepEqual(resolveCommand('/nope', 'chat'), { unsupported: 'nope' });
  for (const text of ['explain this', '', '/', 'a /graph later', null]) assert.equal(resolveCommand(text, 'chat'), null, String(text));
});

// Owner, 2026-10-20: 17 commands removed, then /animate (/motion is the animation command); owner spec 2026-10-29: /dive,
// /whiteboard and /video. None is listed or resolves for a typed line on any surface; each says it is unavailable. The Tutor's
// material tools (compare, walkthrough, animate, whiteboard, video) resolve only for its own create_material (internal).
test('the removed commands are gone from every surface list and every typed dispatch, and say they are unavailable', () => {
  assert.equal(REMOVED_COMMANDS.length, 21);
  assert.deepEqual([...REMOVED_COMMANDS].sort(), ['animate', 'ask', 'compare', 'connect', 'deeper', 'dive', 'do', 'example', 'find', 'more', 'new', 'open', 'paper', 'research', 'run', 'simplify', 'source', 'teach', 'video', 'walkthrough', 'whiteboard']);
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
  assert.deepEqual(names(MATERIAL_TOOLS), ['compare', 'walkthrough', 'animate', 'whiteboard', 'video']);
  for (const name of names(MATERIAL_TOOLS)) {
    assert.ok(names(commandsFor('learn', { internal: true })).includes(name), name);
    assert.equal(resolveCommand(`/${name} x`, 'chat', { internal: true }).command.name, name);
    assert.deepEqual(resolveCommand(`/${name} x`, 'chat'), { unsupported: name });
  }
});
