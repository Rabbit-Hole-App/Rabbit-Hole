import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandsFor, descFor, labelOf, LEARN_MENU, learnRequest, placeOf, primitive, resolveCommand, reviewOff, SELECTIONS, SLASH } from './slash.js';

const names = (list) => list.map((c) => c.name);
const JOB = [{ name: 's3-log', kind: 'job' }];

test('one command list: the four modes on Home and projects, /ask and /teach on canvases (never /research or /do), Home shortcuts on Home and projects, learning shortcuts only in Learn', () => {
  assert.deepEqual(names(commandsFor('home', { catalog: JOB })), ['ask', 'teach', 'research', 'do', 'find', 'open', 'new', 'connect', 'run']); // solo v1: no /share
  assert.deepEqual(names(commandsFor('project', { catalog: JOB })), ['ask', 'teach', 'research', 'do', 'find', 'open', 'connect', 'run']);
  assert.deepEqual(names(commandsFor('learn', { catalog: JOB })), ['ask', 'teach', 'deeper', 'dive', 'simplify', 'example', 'practice', 'quiz', 'compare', 'source',
    'explain', 'flashcards', 'code', 'graph', 'diagram', 'walkthrough', 'animate', 'whiteboard', 'image', 'video', 'cad', '3d', 'notebook', 'youtube', 'arxiv', 'wikipedia', 'more']);
  assert.deepEqual(names(commandsFor('home', { catalog: [] })).includes('run'), false); // /run needs a runnable job
  assert.equal(new Set(names(SLASH)).size, SLASH.length);
});

test('a mode reads differently per place; every description scans in one short line', () => {
  const ask = SLASH.find((c) => c.name === 'ask');
  assert.equal(descFor(ask, 'home'), 'Ask about this workspace');
  assert.equal(descFor(ask, 'project'), 'Ask about this project');
  assert.equal(descFor(ask, 'learn'), 'Explain what you are looking at');
  for (const c of SLASH) for (const place of c.places) assert.ok(descFor(c, place).length <= 32, `${c.name} in ${place}: ${descFor(c, place)}`);
});

test('the bar maps its scope to a place', () => {
  assert.equal(placeOf({ kind: 'workspace' }), 'home');
  assert.equal(placeOf({ kind: 'project' }), 'project');
  assert.equal(placeOf({ kind: 'canvas' }), 'learn');
});

test('a Learn shortcut becomes one semantic request with the selection as context; without one it acts on the current concept', () => {
  const free = { family: null, allowedPrimitives: null, deterministic: false, paid: [] };
  assert.deepEqual(learnRequest('simplify'), { kind: 'learn', command: 'simplify', ...free, prompt: 'Explain the current concept more simply. Keep the original.', context: null, selection: null });
  const card = { kind: 'card', id: 'b7', title: 'Attention · Guided' };
  assert.deepEqual(learnRequest('deeper', { args: 'into the math', selection: card }),
    { kind: 'learn', command: 'deeper', ...free, prompt: 'Go one level deeper on the selected card "Attention · Guided". Focus: into the math.', context: card, selection: card });
  assert.deepEqual(learnRequest('notebook', { args: 'for experimenting with softmax' }),
    { kind: 'learn', command: 'notebook', family: 'notebook', allowedPrimitives: ['notebook'], deterministic: true, paid: [], action: 'insert_notebook', prompt: 'for experimenting with softmax', context: null, selection: null });
  assert.deepEqual(learnRequest('source', { selection: { kind: 'equation', latex: 'softmax(qk^T/\\sqrt d)' } }).action, 'open_sources');
  assert.deepEqual(learnRequest('teach', { args: 'causal masking' }), { kind: 'learn', command: 'teach', ...free, mode: 'teach', prompt: 'causal masking', context: null, selection: null });
  assert.throws(() => learnRequest('find'), /not a Learn command/);
});

test('the selection contract names what exists today and what owning branches add later', () => {
  assert.deepEqual(SELECTIONS, ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object']);
  assert.throws(() => learnRequest('quiz', { selection: { kind: 'widget' } }), /unknown selection/);
});

test('product availability is not the review copy: /ask is valid everywhere, /research on Home and projects, and only this preview turns some off', () => {
  assert.deepEqual(SLASH.find((c) => c.name === 'ask').places, ['home', 'project', 'learn']);
  // /research and /do are Home, Library and Project workflows, not Canvas commands (owner, 2026-10-06).
  for (const name of ['research', 'do']) assert.deepEqual(SLASH.find((c) => c.name === name).places, ['home', 'project']);
  assert.match(reviewOff('ask', 'app', { askLive: false }).reason, /live chat history/);
  assert.equal(reviewOff('ask', 'app', { askLive: true }), null);
  assert.equal(reviewOff('ask', 'workspace', { askLive: false }), null); // Home asks use LEARN_DB (learn-home-ask.js)
  assert.equal(reviewOff('ask', 'project', { askLive: false }), null); // project asks use LEARN_DB
  // A canvas offers no /research either (Professor Next Steps contract §1.7): no kind turns it on.
  for (const kind of ['workspace', 'project', 'app', 'canvas']) assert.deepEqual(reviewOff('research', kind), { reason: 'Research here would call the live model, so it is off on this preview.', short: 'Off on this preview' }, kind);
  assert.equal(reviewOff('find', 'workspace'), null);
});

// Learn tool families (user, 2026-09-28, via the Learn branch). Auto stays the default; a slash command is an
// optional override that names the primitives the tutor may return.
const FAMILIES = {
  explain: ['explanation', 'table', 'narration'], flashcards: ['flashcards'], code: ['code_sample', 'code_exercise'],
  graph: ['interactive_graph', 'data_plot', 'knowledge_graph'], diagram: ['flow_diagram', 'mermaid_diagram'], walkthrough: ['walkthrough'],
  animate: ['animation', 'reference_attention', 'maths_animation'], whiteboard: ['whiteboard'], paper: ['paper'], image: ['image', 'image_generate'],
  video: ['video', 'video_generate'], '3d': ['3d_model', 'blender_scene'], notebook: ['notebook'],
  practice: ['challenge', 'explain_back', 'quiz', 'code_exercise'], quiz: ['quiz'],
  compare: ['table', 'interactive_graph', 'data_plot', 'flow_diagram', 'mermaid_diagram', 'animation'],
};

test('each tool or narrowed intent names exactly its allowed primitives; open intents leave the choice to the tutor', () => {
  for (const [name, family] of Object.entries(FAMILIES)) {
    const r = learnRequest(name);
    assert.equal(r.family, name, name);
    assert.deepEqual(r.allowedPrimitives, family, name);
  }
  for (const name of ['ask', 'teach', 'deeper', 'simplify', 'example', 'source', 'more']) assert.equal(learnRequest(name).allowedPrimitives, null, name);
  for (const name of ['research', 'do']) assert.throws(() => learnRequest(name), /not a Learn command/, name);
});

test('paid primitives always confirm and carry no guessed cost', () => {
  for (const id of ['image_generate', 'video_generate', 'maths_animation', 'blender_scene', 'narration']) {
    assert.deepEqual(primitive(id), { id, paid: true, needsConfirm: true, estimatedCost: undefined });
  }
  assert.deepEqual(primitive('image'), { id: 'image', paid: false, needsConfirm: false });
  assert.deepEqual(learnRequest('image').paid, ['image_generate']);
  assert.deepEqual(learnRequest('animate').paid, ['maths_animation']);
  assert.deepEqual(learnRequest('3d', { args: 'a transformer block' }).paid, ['blender_scene']);
  assert.deepEqual(learnRequest('explain').paid, ['narration']); // fish.audio narration is paid (user, via the Learn branch)
  assert.deepEqual(learnRequest('code').paid, []);
});

test('notebook, whiteboard, paper, source and more are deterministic: no model', () => {
  for (const [name, action] of [['notebook', 'insert_notebook'], ['whiteboard', 'insert_whiteboard'], ['paper', 'insert_paper'], ['source', 'open_sources'], ['more', 'open_tool_catalog']]) {
    const r = learnRequest(name, { args: name === 'paper' ? 'attention-is-all-you-need' : '' });
    assert.equal(r.deterministic, true, name);
    assert.equal(r.action, action, name);
  }
  assert.equal(learnRequest('paper', { args: 'attention-is-all-you-need' }).prompt, 'attention-is-all-you-need');
  for (const name of ['explain', 'diagram', 'practice', 'deeper']) assert.equal(learnRequest(name).deterministic, false, name);
});

test('/practice subtype words narrow the family; plain /practice leaves the whole family to the tutor', () => {
  assert.deepEqual(learnRequest('practice', { args: 'explain it back' }).allowedPrimitives, ['explain_back']);
  assert.deepEqual(learnRequest('practice', { args: 'coding' }).allowedPrimitives, ['code_exercise']);
  assert.deepEqual(learnRequest('practice', { args: 'multiple choice on softmax' }).allowedPrimitives, ['quiz']);
  assert.deepEqual(learnRequest('practice').allowedPrimitives, ['challenge', 'explain_back', 'quiz', 'code_exercise']);
  assert.equal(learnRequest('practice', { args: 'coding' }).family, 'practice');
});

test('the Learn picker stays short: LEARN then CREATE; the rest only through /more or by name', () => {
  assert.deepEqual(LEARN_MENU.learn, ['deeper', 'dive', 'simplify', 'example', 'practice', 'quiz', 'compare']);
  assert.deepEqual(LEARN_MENU.create, ['explain', 'code', 'graph', 'diagram', 'animate', 'flashcards', 'notebook', 'more']);
  const desc = (name) => descFor(SLASH.find((c) => c.name === name), 'learn');
  assert.deepEqual(LEARN_MENU.learn.map(desc), ['Go deeper', 'Go down a Rabbit Hole', 'Explain more simply', 'Show a concrete example', 'Let me try it', 'Test me', 'Compare ideas']);
  assert.deepEqual(LEARN_MENU.create.map(desc), ['Add an explanation', 'Add code', 'Add a graph or plot', 'Add a diagram', 'Add an animation', 'Add flashcards', 'Add a notebook', 'More learning tools']);
  for (const hidden of ['walkthrough', 'whiteboard', 'paper', 'image', 'video', 'cad', '3d', 'source', 'research', 'do']) assert.ok(![...LEARN_MENU.learn, ...LEARN_MENU.create].includes(hidden), hidden);
});

test('/teach on an app is off on this preview: Learn is off for apps there (D7); projects and canvases teach', () => {
  assert.deepEqual(reviewOff('teach', 'app'), { reason: 'Learn on an app would ask through live chat history, so it is off on this preview.', short: 'Off on this preview' });
  for (const kind of ['workspace', 'project', 'canvas']) assert.equal(reviewOff('teach', kind), null, kind);
});

// Release B (owner decisions 1A, 2A, 4A and A4, 2026-10-16): one registry with surface capabilities.
const CTRLK_SET = ['explain', 'code', 'graph', 'diagram', 'walkthrough', 'animate', 'flashcards', 'image', 'video', 'cad', '3d', 'motion', 'youtube', 'arxiv', 'wikipedia'];

test('surfaces: Ctrl+K offers exactly the owner set; Chat is the Learn list; Insert offers the three source searches', () => {
  assert.deepEqual(names(commandsFor('ctrlk', { motionDev: true })).sort(), [...CTRLK_SET].sort());
  // A production build has no /motion anywhere, Ctrl+K included.
  assert.deepEqual(names(commandsFor('ctrlk', { motionDev: false })).sort(), CTRLK_SET.filter((n) => n !== 'motion').sort());
  assert.deepEqual(commandsFor('chat', { motionDev: true }), commandsFor('learn', { motionDev: true }));
  assert.deepEqual(names(commandsFor('insert')), ['youtube', 'arxiv', 'wikipedia']);
  // Everything else keeps its existing places: no Learn-only command left Chat, and none reached the bar.
  for (const c of SLASH) {
    if (c.places.includes('ctrlk')) assert.ok(CTRLK_SET.includes(c.name), c.name);
    if (['youtube', 'arxiv', 'wikipedia'].includes(c.name)) assert.deepEqual(c.places, ['learn', 'ctrlk', 'insert']);
  }
  for (const name of ['deeper', 'dive', 'simplify', 'example', 'practice', 'quiz', 'compare', 'source', 'whiteboard', 'paper', 'notebook', 'more'])
    assert.deepEqual(SLASH.find((c) => c.name === name).places, ['learn'], name);
});

test('every command has a kind; the generate ones are what Ctrl+K picks Explain for, the source ones open the finder', () => {
  for (const c of SLASH) assert.ok(['generate', 'source', 'prompt', 'dialog'].includes(c.kind), c.name);
  assert.deepEqual(names(commandsFor('ctrlk', { motionDev: true }).filter((c) => c.kind === 'generate')), ['explain', 'flashcards', 'code', 'graph', 'diagram', 'walkthrough', 'animate', 'image', 'video', 'cad', '3d', 'motion']);
  for (const name of ['youtube', 'arxiv', 'wikipedia']) {
    const c = SLASH.find((entry) => entry.name === name);
    assert.equal(c.kind, 'source');
    assert.equal(c.source, name);
    // No model routes or reads a source search: it runs as a deterministic action, with no primitives for the tutor.
    assert.deepEqual([learnRequest(name).action, learnRequest(name).deterministic, learnRequest(name).allowedPrimitives], ['open_source', true, null]);
  }
});

test('/paper is typed only: no picker lists it, typed it still resolves where it worked before; /arxiv is the listed paper search', () => {
  for (const surface of ['chat', 'learn', 'ctrlk', 'insert', 'home', 'project']) assert.ok(!names(commandsFor(surface)).includes('paper'), surface);
  assert.ok(names(commandsFor('learn', { hidden: true })).includes('paper'));
  assert.equal(resolveCommand('/paper 1706.03762', 'chat').command.name, 'paper');
  assert.deepEqual(resolveCommand('/paper 1706.03762', 'ctrlk'), { unsupported: 'paper' });
  assert.ok(names(commandsFor('chat')).includes('arxiv'));
});

test('labels: the owner wording for /video and the source searches; others read as their capitalised name', () => {
  const label = (name) => labelOf(SLASH.find((c) => c.name === name));
  assert.deepEqual(['video', 'youtube', 'arxiv', 'wikipedia'].map(label), ['Generate video', 'Search YouTube', 'Search arXiv', 'Search Wikipedia']);
  // The picker's line says the same for those four (owner A4: /video generates; /youtube finds existing videos).
  assert.deepEqual(['video', 'youtube', 'arxiv', 'wikipedia'].map((n) => descFor(SLASH.find((c) => c.name === n), 'learn')), ['Generate video', 'Search YouTube', 'Search arXiv', 'Search Wikipedia']);
  assert.deepEqual(['explain', 'dive', '3d'].map(label), ['Explain', 'Dive', '3D']);
});

test('resolveCommand: a typed command is the very entry the picker lists; an unoffered one is reported, never swapped', () => {
  for (const surface of ['chat', 'ctrlk', 'insert']) {
    for (const picked of commandsFor(surface, { motionDev: true })) {
      const typed = resolveCommand(`/${picked.name} some words`, surface, { motionDev: true });
      assert.equal(typed.command, picked, `${surface} /${picked.name}`);
      assert.equal(typed.arg, 'some words');
    }
  }
  assert.deepEqual(resolveCommand('  /Explain   why softmax  ', 'ctrlk'), { command: SLASH.find((c) => c.name === 'explain'), arg: 'why softmax' });
  assert.deepEqual(resolveCommand('/youtube', 'chat'), { command: SLASH.find((c) => c.name === 'youtube'), arg: '' });
  // Learn prompts and dialog commands are unsupported in Ctrl+K, but unchanged in Chat.
  for (const name of ['deeper', 'quiz', 'dive', 'notebook', 'whiteboard', 'source', 'more', 'ask', 'teach']) {
    assert.deepEqual(resolveCommand(`/${name} x`, 'ctrlk'), { unsupported: name }, name);
    assert.equal(resolveCommand(`/${name} x`, 'chat').command.name, name, name);
  }
  assert.deepEqual(resolveCommand('/motion 15s softmax', 'ctrlk', { motionDev: false }), { unsupported: 'motion' });
  assert.deepEqual(resolveCommand('/nope', 'chat'), { unsupported: 'nope' });
  for (const text of ['explain this', '', '/', 'a /graph later', null]) assert.equal(resolveCommand(text, 'chat'), null, String(text));
});
