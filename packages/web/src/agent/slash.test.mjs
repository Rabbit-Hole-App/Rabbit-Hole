import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandsFor, descFor, learnRequest, placeOf, SELECTIONS, SLASH } from './slash.js';

const names = (list) => list.map((c) => c.name);
const JOB = [{ name: 's3-log', kind: 'job' }];

test('one command list: the four modes everywhere, Home shortcuts on Home and projects, learning shortcuts only in Learn', () => {
  assert.deepEqual(names(commandsFor('home', { catalog: JOB })), ['ask', 'teach', 'research', 'do', 'find', 'open', 'new', 'connect', 'run', 'share']);
  assert.deepEqual(names(commandsFor('project', { catalog: JOB })), ['ask', 'teach', 'research', 'do', 'find', 'open', 'connect', 'run', 'share']);
  assert.deepEqual(names(commandsFor('learn', { catalog: JOB })), ['ask', 'teach', 'research', 'do', 'deeper', 'simplify', 'example', 'practice', 'quiz', 'compare', 'source', 'notebook']);
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
  assert.deepEqual(learnRequest('simplify'), { kind: 'learn', command: 'simplify', prompt: 'Explain the current concept more simply. Keep the original.', context: null });
  const card = { kind: 'card', id: 'b7', title: 'Attention · Guided' };
  assert.deepEqual(learnRequest('deeper', { args: 'into the math', selection: card }),
    { kind: 'learn', command: 'deeper', prompt: 'Go one level deeper on the selected card "Attention · Guided". Focus: into the math.', context: card });
  assert.deepEqual(learnRequest('notebook', { args: 'for experimenting with softmax' }), { kind: 'learn', command: 'notebook', action: 'insert_notebook', prompt: 'for experimenting with softmax', context: null });
  assert.deepEqual(learnRequest('source', { selection: { kind: 'equation', latex: 'softmax(qk^T/\\sqrt d)' } }).action, 'open_sources');
  assert.deepEqual(learnRequest('teach', { args: 'causal masking' }), { kind: 'learn', command: 'teach', mode: 'teach', prompt: 'causal masking', context: null });
  assert.throws(() => learnRequest('find'), /not a Learn command/);
});

test('the selection contract names what exists today and what owning branches add later', () => {
  assert.deepEqual(SELECTIONS, ['project', 'map_node', 'card', 'equation', 'notebook_cell', 'notebook_file', 'canvas_object']);
  assert.throws(() => learnRequest('quiz', { selection: { kind: 'widget' } }), /unknown selection/);
});
