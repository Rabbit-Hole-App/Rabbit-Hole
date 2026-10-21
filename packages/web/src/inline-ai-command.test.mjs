// The Ctrl+K editor's / commands (inline-ai-command.js; Release B contract B4, owner decisions 1A, 2A, 4A).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLASH, commandsFor } from './agent/slash.js';
import { ctrlkCommands, filterCommands, pick, pickerQuery, showsPill, submission, switchMode, unsupportedText } from './inline-ai-command.js';
import { EXPLICIT_ROUTES, ROUTES, routeRequest } from './inline-ai-route.js';
import { CAPABILITIES, fixedRoute, settle } from './inline-ai-decide.js';

// Owner, 2026-10-20: /walkthrough is no longer a command (Ctrl+K still routes plain words to a walkthrough).
const CTRLK = ['cad', 'explain', 'flashcards', 'code', 'graph', 'diagram', 'animate', 'image', 'video', '3d', 'motion', 'youtube', 'arxiv', 'wikipedia'];
const entry = name => SLASH.find(command => command.name === name);

test('the picker lists the registry\'s Ctrl+K commands only (owner 1A), filtered by what this canvas can run', () => {
  assert.deepEqual(ctrlkCommands({ motionDev: true }).map(command => command.name).sort(), [...CTRLK].sort());
  assert.ok(ctrlkCommands({ motionDev: true }).every(command => commandsFor('ctrlk', { motionDev: true }).includes(command)), 'the same registry objects');
  assert.deepEqual(ctrlkCommands({ enabled: ['note', 'code'], sources: false, motionDev: true }).map(command => command.name), ['code']);
  assert.deepEqual(ctrlkCommands({ enabled: ['note'], motionDev: true }).map(command => command.name), ['youtube', 'arxiv', 'wikipedia']);
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
});

test('typed "/code foo" and picked /code + "foo" submit the same request, for every Ctrl+K generation command', () => {
  for (const name of CTRLK.filter(name => entry(name).kind === 'generate')) {
    for (const mode of ['explain', 'edit']) {
      const picked = pick({ mode, text: '' }, entry(name));
      const typed = submission({ mode, command: null, text: `/${name}  foo bar ` });
      assert.deepEqual(submission({ ...picked, text: 'foo bar' }), typed, name);
      assert.deepEqual(typed, { mode: 'explain', command: name, text: 'foo bar', prompt: `/${name} foo bar` }, name);
    }
    assert.deepEqual(submission({ mode: 'explain', command: name, text: '' }), submission({ mode: 'explain', text: `/${name}` }), `bare /${name}`);
  }
  // A typed name is case-insensitive, as the registry resolves it.
  assert.equal(submission({ mode: 'explain', text: '/CODE x' }).prompt, '/code x');
});

test('modes: a generation command selects Explain; /explain has no pill but is still sent; Edit clears generation commands', () => {
  assert.equal(pick({ mode: 'edit', text: 'kept' }, entry('code')).mode, 'explain');
  assert.equal(pick({ mode: 'edit' }, entry('youtube')).mode, 'edit', 'a source search leaves the mode');
  assert.equal(showsPill('explain'), false);
  assert.equal(showsPill('code'), true);
  assert.equal(showsPill(null), false);
  assert.equal(submission({ mode: 'explain', command: 'explain', text: 'why' }).prompt, '/explain why', 'the explicit command reaches the server');
  for (const name of ['explain', 'code', 'flashcards', 'motion']) {
    assert.deepEqual(switchMode({ command: name, text: 'my words' }, 'edit'), { mode: 'edit', command: null, text: 'my words' }, name);
    assert.deepEqual(submission({ mode: 'edit', command: switchMode({ command: name, text: 'my words' }, 'edit').command, text: 'my words' }),
      { mode: 'edit', command: null, text: 'my words', prompt: 'my words' }, `${name}: nothing of it is sent`);
  }
  assert.equal(switchMode({ command: 'arxiv', text: '' }, 'edit').command, 'arxiv');
  assert.equal(switchMode({ command: 'code', text: '' }, 'explain').command, 'code');
  // Auto: Explain with no command is the automatic routing, its words sent as typed.
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

test('a typed command Ctrl+K does not offer is said and sends nothing, never a different command', () => {
  const offered = new Set(commandsFor('ctrlk', { motionDev: true, hidden: true }).map(command => command.name));
  for (const command of commandsFor('learn', { motionDev: true, hidden: true }).filter(command => !offered.has(command.name))) {
    assert.deepEqual(submission({ mode: 'explain', text: `/${command.name} x` }), { unsupported: command.name }, command.name);
  }
  assert.deepEqual(submission({ mode: 'explain', text: '/paper 1706.03762' }), { unsupported: 'paper' }, 'typed-only /paper stays a Chat command');
  assert.deepEqual(submission({ mode: 'explain', text: '/teleport' }), { unsupported: 'teleport' });
  assert.equal(unsupportedText('quiz'), '/quiz isn\'t available in Ctrl+K.');
  // Motion off on this canvas is still sent: the request check says it is unavailable here, as before.
  assert.equal(submission({ mode: 'explain', text: '/motion x' }).command, 'motion');
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
