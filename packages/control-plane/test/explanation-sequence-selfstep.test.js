// Owner 2026-11-09 (batch-1 review, card 01): a sequence message from an actor to itself ("Decrypt with private key") is invalid, and the server used to delete it silently
// (simplified_sequence). It is now folded into a neighbouring message label (or the caption) and every element a server step still removes has a log line.
// The fixture is card 01's own raw spec as the model wrote it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { correctDiagrams, simplifiedDiagram, dropInvalidDiagrams } from '../src/learn-primitives.js';
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/explanation-sequence-selfstep.raw.json', import.meta.url), 'utf8'));
const fence = spec => '```rh-diagram\n' + JSON.stringify(spec) + '\n```';
const logs = fn => { const log = console.log, lines = []; console.log = line => lines.push(line); try { return { value: fn(), lines }; } finally { console.log = log; } };
const dropped = lines => lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e?.event === 'explanation_diagram_dropped_element');
const bodyOf = md => JSON.parse(md.split('\n').slice(1, -1).join('\n'));

test('card 01 raw spec is invalid because of the self-step (the premise)', () => {
  assert.throws(() => parseTutorDiagram(raw), /needs an ordinary message immediately before and after/);
});

test('the pre-repair correction folds the self-step onto the previous message: no model call, nothing dropped, no log line', () => {
  const { value, lines } = logs(() => correctDiagrams(fence(raw)));
  assert.deepEqual(value.corrections, { sequence_self_step_folded: 1 });
  const spec = bodyOf(value.md), parsed = parseTutorDiagram(spec);
  assert.equal(parsed.diagram.messages.length, 2);
  assert.ok(parsed.diagram.messages.every(m => m.from !== m.to));
  assert.equal(parsed.diagram.messages[1].label, 'Encrypt with public key -> Decrypt with private key');
  assert.equal(parsed.diagram.messages[0].label, 'Share public key');
  assert.equal(dropped(lines).length, 0, 'kept, so nothing to log');
});

test('the last-resort simplification keeps the same text too (the path card 01 took): no dropped-element line', () => {
  const { value, lines } = logs(() => simplifiedDiagram([JSON.stringify(raw)], 'sequence'));
  assert.ok(value, 'a sequence is built');
  const text = JSON.stringify(value);
  assert.ok(text.includes('Decrypt with private key') && text.includes('Encrypt with public key') && text.includes('Share public key'));
  assert.ok(value.diagram.messages.every(m => m.from !== m.to));
  assert.equal(dropped(lines).length, 0);
});

test('a self-step before a message folds onto the NEXT message; a folded label over 60 characters moves to the caption instead of being cut', () => {
  const spec = { version: 1, diagram: { kind: 'sequence', title: 'T', actors: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    messages: [{ from: 'a', to: 'a', label: 'Prepare the request' }, { from: 'a', to: 'b', label: 'Send the request' }, { from: 'b', to: 'b', label: 'Validate the signature against the registry of trusted keys' }, { from: 'b', to: 'a', label: 'Reply' }] } };
  const { value } = logs(() => correctDiagrams(fence(spec)));
  const out = parseTutorDiagram(bodyOf(value.md));
  assert.equal(out.diagram.messages[0].label, 'Prepare the request -> Send the request');
  assert.equal(out.diagram.messages[1].label, 'Reply', 'the long folded label is not cut');
  assert.ok(out.diagram.caption.includes('Validate the signature against the registry of trusted keys'), 'the self-step moved to the caption');
});

test('what a simplification still has to remove is named: an unknown actor, a 5th actor, an unlabelled message, an unfittable self-step', () => {
  const messy = { version: 1, diagram: { kind: 'sequence', title: 'T', actors: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }, { id: 'e', label: 'E' }],
    messages: [{ from: 'a', to: 'b', label: 'Hello' }, { from: 'a', to: 'zzz', label: 'To nobody' }, { from: 'b', to: 'a', label: '' }, { from: 'b', to: 'a', label: 'Back' }] } };
  const sink = [], { value, lines } = logs(() => simplifiedDiagram([JSON.stringify(messy)], 'sequence', sink));
  assert.ok(value);
  const events = dropped(lines).map(e => `${e.kind}:${e.reason}`);
  assert.ok(events.includes('actor:over the 4-actor limit'));
  assert.ok(events.includes('message:names an actor that is not in the diagram'));
  assert.ok(events.includes('message:no label'));
  assert.equal(sink.length, events.length, 'the same elements are returned for the correction counter');
});

test('a self-step with no message to attach to is the one thing removed, and it is logged', () => {
  const only = { version: 1, diagram: { kind: 'sequence', title: 'T', actors: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], messages: [{ from: 'a', to: 'a', label: 'Think' }] } };
  const { value, lines } = logs(() => simplifiedDiagram([JSON.stringify(only)], 'sequence'));
  assert.equal(value.diagram.kind, 'flow', 'no sequence can be built, so the labels go to the straight flow');
  assert.deepEqual(dropped(lines).map(e => e.reason), ['a self-step with no message to attach to']);
});

test('a diagram removed with nothing built is named by dropInvalidDiagrams, and the elements are returned for the counter', () => {
  const block = { body: 'Text.\n\n```rh-diagram\n{"version":1,"diagram":{"kind":"flow","title":"Unreadable","nodes":[]}}\n```\n\nMore.' };
  const { value, lines } = logs(() => dropInvalidDiagrams(block, { simplify: true }));
  assert.equal(value.dropped, 1);
  assert.deepEqual(value.elements.map(e => e.kind), ['diagram']);
  assert.equal(dropped(lines)[0].label, 'Unreadable');
});

test('the other corrections that cut content name it: matrix cells trimmed, a text cut to its limit, a link dropped', () => {
  const matrix = { version: 1, diagram: { kind: 'matrix', title: 'M', columns: ['A', 'B'], rows: [{ heading: 'R1', cells: ['1', '2', 'extra one'] }, { heading: 'R2', cells: ['3', '4', 'extra two'] }] } };
  const m = logs(() => correctDiagrams(fence(matrix)));
  assert.deepEqual(m.value.corrections, { matrix_cells_trimmed: 1 });
  assert.deepEqual(dropped(m.lines).map(e => e.kind), ['matrix cells', 'matrix cells']);
  assert.ok(dropped(m.lines)[0].reason.includes('extra one'));
});

test('Codex 9580d7a4: a self-step with an ordinary message before and after it is accepted by the schema, so the server leaves it as a loop and folds nothing', () => {
  const flanked = { version: 1, diagram: { ...raw.diagram, messages: [raw.diagram.messages[0], { from: 'bob', to: 'bob', label: 'Decrypt with private key' }, { from: 'bob', to: 'alice', label: 'Send the reply' }] } };
  assert.ok(parseTutorDiagram(flanked), 'the schema accepts it');
  const { value, lines } = logs(() => correctDiagrams(fence(flanked)));
  assert.deepEqual(value.corrections ?? {}, {}, 'no fold counted');
  assert.deepEqual(bodyOf(value.md).diagram.messages.map(m => m.label), ['Share public key', 'Decrypt with private key', 'Send the reply']);
  assert.ok(bodyOf(value.md).diagram.messages.some(m => m.from === m.to), 'the self-message stays a message from bob to bob');
  assert.equal(dropped(lines).length, 0);
});

test('the last-resort simplification keeps an accepted self-step as a loop, and still folds the one the schema refuses (card 01 ends with it)', () => {
  const withBlank = { version: 1, diagram: { ...raw.diagram, messages: [raw.diagram.messages[0], { from: 'bob', to: 'bob', label: 'Decrypt with private key' }, { from: 'bob', to: 'alice', label: 'Send the reply' }, { from: 'alice', to: 'bob', label: '' }] } };
  const kept = logs(() => simplifiedDiagram([JSON.stringify(withBlank)], 'sequence'));
  assert.ok(kept.value.diagram.messages.some(m => m.from === m.to && m.label === 'Decrypt with private key'));
  assert.deepEqual(dropped(kept.lines).map(e => e.reason), ['no label'], 'only the blank message is dropped, and it is logged');
  const trailing = logs(() => simplifiedDiagram([JSON.stringify(raw)], 'sequence'));
  assert.ok(trailing.value.diagram.messages.every(m => m.from !== m.to), 'card 01: the trailing self-step is refused by the schema, so it is folded');
});
