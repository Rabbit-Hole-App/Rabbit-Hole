// The card-offer readiness check (roadmap-offer-readiness.js): pure, built-in formats only (explanation, table).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkOffer, formatLabel, offFormats, recoveryOf } from '../src/roadmap/roadmap-offer-readiness.js';

const step = (format, over = {}) => ({ id: 'st_1', format, passage_start: 0, passage_end: 100, ...over });

test('offFormats reads the runtime switch: unset is none, commas and spaces both separate', () => {
  assert.deepEqual(offFormats({}), []);
  assert.deepEqual(offFormats(undefined), []);
  assert.deepEqual(offFormats({ ROADMAP_FORMATS_OFF: 'table, explanation' }), ['table', 'explanation']);
});

test('a usable planned format is ready and carries the format, settings and source revision it was confirmed against', () => {
  const ready = checkOffer({ step: step('table'), depth: 'detailed', sourceRevision: 'rev-1' });
  assert.deepEqual(ready, { ready: true, format: 'table', settings: { depth: 'detailed' }, sourceRevision: 'rev-1' });
});

test('an unusable table step falls back to an explanation card only when the learner did not require a table', () => {
  const free = checkOffer({ step: step('table'), planStep: { formatRequired: false }, off: ['table'] });
  assert.deepEqual([free.ready, free.reason, free.alternative, free.question], [false, 'format_unavailable', { format: 'explanation', label: 'explanation card' }, undefined]);
  const required = checkOffer({ step: step('table'), planStep: { formatRequired: true }, off: ['table'] });
  assert.equal(required.ready, false);
  assert.deepEqual(required.question.options.map(o => o.id), ['alternative', 'edit'], 'a required format is never changed silently: one question with both ways forward');
  assert.equal(required.question.id, 'offer:st_1');
  assert.match(required.question.text, /A table card cannot be prepared right now, and you asked for one\. Use an explanation card instead/);
});

test('an explanation step has no alternative: a table cannot teach an explanation, so the learner gets help and a next step', () => {
  const blocked = checkOffer({ step: step('explanation'), off: ['explanation'] });
  assert.deepEqual([blocked.ready, blocked.alternative, blocked.question], [false, undefined, undefined]);
  assert.match(blocked.help, /Edit roadmap/);
  const both = checkOffer({ step: step('table'), off: ['table', 'explanation'] });
  assert.deepEqual([both.ready, both.alternative], [false, undefined], 'no qualified card is left');
});

test('a source that cannot be read and a step without a passage block before any format is considered', () => {
  const source = checkOffer({ step: step('table'), source: { ok: false, code: 'source_unavailable' } });
  assert.deepEqual([source.ready, source.reason, source.alternative], [false, 'source_unavailable', undefined]);
  const empty = checkOffer({ step: step('explanation', { passage_start: 40, passage_end: 40 }) });
  assert.deepEqual([empty.ready, empty.reason], [false, 'passage_missing']);
});

test('a format that is not a built-in one is unsupported, never offered, and the recovery fact keeps only what Chat shows', () => {
  const odd = checkOffer({ step: step('quiz') });
  assert.deepEqual([odd.ready, odd.reason], [false, 'format_unsupported']);
  const verdict = checkOffer({ step: step('table'), planStep: { formatRequired: true }, off: ['table'] });
  assert.deepEqual(Object.keys(recoveryOf(step('table'), verdict)).sort(), ['alternative', 'question', 'reason', 'stepId']);
  assert.equal(formatLabel('nothing'), 'card');
});
