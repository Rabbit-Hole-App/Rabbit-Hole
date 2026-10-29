// The Ctrl+K editor's / commands (inline-ai-command.js; Release B contract B4, owner decisions 1A, 2A, 4A; owner spec 2026-10-29:
// the same 18 commands as Chat, each explicit one handed to Chat's dispatcher).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLASH, commandsFor, typedOf } from './agent/slash.js';
import { pickerSections } from './learn-slash.js';
import { ctrlkCommands, filterCommands, pick, pickerQuery, showsPill, submission, switchMode, unsupportedText } from './inline-ai-command.js';
import { EXPLICIT_ROUTES, ROUTES, routeRequest } from './inline-ai-route.js';
import { CAPABILITIES, fixedRoute, settle } from './inline-ai-decide.js';

const entry = name => SLASH.find(command => command.name === name);
const names = list => list.map(command => command.name);

test('the picker lists exactly what Chat\'s picker lists (owner spec 2026-10-29: one catalogue)', () => {
  const chat = pickerSections('/', { motionDev: true }).flatMap(section => section.items.map(item => item.name));
  assert.deepEqual(names(ctrlkCommands({ motionDev: true })).sort(), [...chat].sort());
  assert.ok(ctrlkCommands({ motionDev: true }).every(command => commandsFor('ctrlk', { motionDev: true }).includes(command)), 'the same registry objects');
  for (const name of ['practice', 'quiz', 'goal', 'notebook', 'browser', 'cad', 'explain']) assert.ok(names(ctrlkCommands({ motionDev: true })).includes(name), name);
  // Where no source finder can open, only the three source searches leave the list.
  assert.deepEqual(names(ctrlkCommands({ sources: false, motionDev: true })), names(ctrlkCommands({ motionDev: true })).filter(name => !['youtube', 'arxiv', 'wikipedia'].includes(name)));
  assert.ok(!names(ctrlkCommands({ motionDev: false })).includes('motion'));
});

test('the list opens on a leading /word and filters as it is typed; names that start with it come first', () => {
  assert.equal(pickerQuery('/'), '');
  assert.equal(pickerQuery('/Co'), 'co');
  for (const closed of ['', 'explain /code', '/code foo', ' /code']) assert.equal(pickerQuery(closed), null, closed);
  const all = ctrlkCommands({ motionDev: true });
  assert.equal(filterCommands(all, '').length, all.length);
  assert.deepEqual(filterCommands(all, 'co').map(command => command.name)[0], 'code');
  assert.deepEqual(filterCommands(all, 'gr').map(command => command.name), ['graph', 'diagram']);
  assert.deepEqual(filterCommands(all, 'zzz'), []);
  // Owner, 2026-10-26: the search follows what is typed: /ph finds the photo search (id image), never the generation.
  assert.deepEqual(filterCommands(all, 'ph').map(command => command.name)[0], 'image');
  assert.equal(typedOf('image'), 'photos');
});

// Owner, 2026-10-26: Ctrl+K takes the same typed names as the Chat. /photos is the photo search (id image); /image is the paid
// generation, unavailable while image generation is off, and says so rather than searching.
test('Ctrl+K: /photos hands Chat its line; /image and /generate-image are unavailable while generation is off', () => {
  assert.deepEqual(submission({ mode: 'explain', text: '/photos an oak tree' }), { handoff: { command: 'image', line: '/photos an oak tree' } });
  assert.deepEqual(submission({ mode: 'explain', command: 'image', text: 'an oak tree' }), submission({ mode: 'explain', text: '/photos an oak tree' }), 'picked equals typed');
  for (const line of ['/image an oak tree', '/generate-image an oak tree']) {
    const out = submission({ mode: 'explain', text: line });
    assert.equal(out.handoff, undefined, line);
    assert.equal(unsupportedText(out.unsupported), 'Image generation is not available here. /photos searches for real photos.', line);
  }
  assert.equal(submission({ mode: 'explain', text: '/imagine an oak tree' }).unsupported, 'imagine');
});

test('every explicit command, typed or picked, in either mode, is handed to Chat as one typed line; nothing is generated inline', () => {
  for (const command of commandsFor('ctrlk', { motionDev: true }).filter(command => command.kind !== 'source')) {
    const name = command.name;
    for (const mode of ['explain', 'edit']) {
      const picked = pick({ mode, text: '' }, entry(name));
      const typed = submission({ mode, command: null, text: `/${typedOf(name)}  foo bar ` });
      assert.deepEqual(submission({ ...picked, text: 'foo bar' }), typed, name);
      assert.deepEqual(typed, { handoff: { command: name, line: `/${typedOf(name)} foo bar` } }, name);
    }
    // A bare command (a picked pill with no words, or the typed name alone) is still submitted: Chat asks for the subject or acts.
    assert.deepEqual(submission({ mode: 'explain', command: name, text: '' }), { handoff: { command: name, line: `/${typedOf(name)}` } }, `bare /${typedOf(name)}`);
  }
  assert.equal(submission({ mode: 'explain', text: '/CODE x' }).handoff.line, '/code x', 'a typed name is case-insensitive, as the registry resolves it');
  assert.deepEqual(submission({ mode: 'explain', text: '/notebook' }), { handoff: { command: 'notebook', line: '/notebook' } });
  assert.deepEqual(submission({ mode: 'explain', text: '/browser https://docs.python.org/3/tutorial/' }), { handoff: { command: 'browser', line: '/browser https://docs.python.org/3/tutorial/' } });
});

test('modes: a generation command selects Explain; /explain has no pill but is still handed over; Edit clears generation commands', () => {
  assert.equal(pick({ mode: 'edit', text: 'kept' }, entry('code')).mode, 'explain');
  assert.equal(pick({ mode: 'edit' }, entry('youtube')).mode, 'edit', 'a source search leaves the mode');
  assert.equal(showsPill('explain'), false);
  assert.equal(showsPill('code'), true);
  assert.equal(showsPill(null), false);
  assert.equal(submission({ mode: 'explain', command: 'explain', text: 'why' }).handoff.line, '/explain why');
  for (const name of ['explain', 'code', 'flashcards', 'motion']) {
    assert.deepEqual(switchMode({ command: name, text: 'my words' }, 'edit'), { mode: 'edit', command: null, text: 'my words' }, name);
    assert.deepEqual(submission({ mode: 'edit', command: switchMode({ command: name, text: 'my words' }, 'edit').command, text: 'my words' }),
      { mode: 'edit', command: null, text: 'my words', prompt: 'my words' }, `${name}: nothing of it is sent`);
  }
  assert.equal(switchMode({ command: 'arxiv', text: '' }, 'edit').command, 'arxiv');
  assert.equal(switchMode({ command: 'code', text: '' }, 'explain').command, 'code');
  // Auto: Explain with no command is the automatic routing, its words sent as typed (non-slash Ctrl+K is unchanged).
  assert.deepEqual(submission({ mode: 'explain', command: null, text: 'Explain this ' }), { mode: 'explain', command: null, text: 'Explain this ', prompt: 'Explain this ' });
});

test('removing a pill keeps the words: what is sent is then the words alone', () => {
  const removed = { mode: 'explain', command: null, text: 'the leaves' };
  assert.deepEqual(submission(removed), { mode: 'explain', command: null, text: 'the leaves', prompt: 'the leaves' });
});

test('source searches open the finder with their query and never enter the generation pipeline', () => {
  for (const name of ['youtube', 'arxiv', 'wikipedia']) {
    assert.deepEqual(submission({ mode: 'explain', text: `/${name} attention heads` }), { source: { source: name, query: 'attention heads' } });
    assert.deepEqual(submission({ mode: 'edit', command: name, text: ' attention heads ' }), { source: { source: name, query: 'attention heads' } });
    assert.deepEqual(submission({ mode: 'explain', command: name, text: '' }), { source: { source: name, query: '' } });
  }
});

test('a typed command that is not offered is said and sends nothing, never a different command', () => {
  for (const name of ['dive', 'whiteboard', 'video', 'paper', 'compare']) assert.deepEqual(submission({ mode: 'explain', text: `/${name} x` }), { unsupported: name }, name);
  assert.match(unsupportedText('video'), /^\/video is no longer available\./);
  assert.deepEqual(submission({ mode: 'explain', text: '/teleport' }), { unsupported: 'teleport' });
  assert.equal(unsupportedText('teleport'), '/teleport isn\'t available here.');
  // Motion off on this canvas is still handed over: Chat says it is unavailable here.
  assert.equal(submission({ mode: 'explain', text: '/motion x' }).handoff.command, 'motion');
});

test('/flashcards runs only by its command: automatic routing decides exactly as before (lead ruling 2026-10-16)', () => {
  // Flashcards remain explicit-only. Native equation is the separately authorized capability.
  assert.deepEqual(Object.keys(ROUTES), ['note', 'explain', 'code', 'diagram', 'graph', 'walkthrough', 'compare', 'animate', 'image', 'video', '3d', 'motion']);
  assert.deepEqual(Object.keys(CAPABILITIES), ['note', 'explain', 'code', 'graph', 'walkthrough', 'compare', 'animate', 'image', 'video', '3d', 'motion', 'equation', 'shapes']);
  assert.equal(Object.hasOwn(routeRequest({ prompt: 'make flashcards', selection: '' }, 'm').questions.route.criteria, 'flashcards'), false);
  assert.ok(EXPLICIT_ROUTES.flashcards);
  const request = { kind: 'selection', mode: 'explain', targetIds: ['a'], prompt: '/flashcards cells', context: { target: { objects: [{ id: 'a', text: 'Cell' }] } } };
  assert.deepEqual(fixedRoute(request, ['note', 'flashcards']), { capability: 'flashcards' });
  assert.equal(fixedRoute(request, ['note']).decision, 'unsupported');
  assert.equal(settle({ capability: 'flashcards' }, { decision: 'proceed' }, ['note', 'flashcards']).decision, 'proceed');
  assert.equal(settle(null, { decision: 'proceed', capability: 'flashcards' }, ['note', 'flashcards']).decision, 'unsupported', 'never a validator\'s own pick');
});
