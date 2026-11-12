// Owner 2026-11-09 hotfix (release 117): line breaks the author double-escaped (backslash + n) become real line breaks, in the body, captions and question text, before the paragraph
// splitter; LaTeX commands that start with backslash-n survive. The fixture is a real card of the clean-up run (content/lr-schedule, run 1) whose body held the escaped sequences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { literalBreaksToNewlines, literalBreaksDeep } from '../src/literal-breaks.js';
import { settleExplanationBody } from '../src/learn-primitives.js';

const BS = String.fromCharCode(92);
const fixture = JSON.parse(readFileSync(new URL('./fixtures/explanation-literal-breaks.json', import.meta.url), 'utf8'));

test('the real card: the escaped paragraph break becomes a blank line and no backslash-n is left', () => {
  assert.ok(fixture.body.includes(BS + 'n' + BS + 'n'), 'the fixture holds the bug');
  const fixed = literalBreaksToNewlines(fixture.body);
  assert.ok(!fixed.includes(BS + 'n'), 'no escaped break left');
  assert.ok(fixed.includes('converge efficiently.\n\nWhen training'), 'a real paragraph boundary');
  const settled = settleExplanationBody(fixture.body);
  assert.ok(!settled.includes(BS + 'n') && settled.includes('\n\n'));
});

test('crlf and long runs: backslash-r-backslash-n is one break, three or more breaks collapse to a blank line, the ends are trimmed on the body', () => {
  assert.equal(literalBreaksToNewlines('a.' + BS + 'r' + BS + 'n' + 'B'), 'a.\nB');
  assert.equal(literalBreaksToNewlines('a.' + BS + 'n' + BS + 'n' + BS + 'n' + BS + 'nB'), 'a.\n\nB');
  assert.equal(literalBreaksDeep({ body: BS + 'n' + BS + 'n' + 'Text ' + BS + 'n' + BS + 'n' }).body, 'Text');
});

test('LaTeX commands that start with backslash-n are not line breaks', () => {
  const math = 'The gradient $' + BS + 'nabla L(w)$, $a ' + BS + 'neq b$ and $' + BS + 'nu$ stay as written.';
  assert.equal(literalBreaksToNewlines(math), math);
});

test('every string of the answer: body, picture caption, diagram caption and question text', () => {
  const input = { title: 'T', body: 'One.' + BS + 'n' + BS + 'nTwo.', visuals: [{ k: 'picture', c: 'Look' + BS + 'nHere', a: 'alt', p: 'draw' }, { k: 'diagram', spec: { version: 1, diagram: { caption: 'Cap' + BS + 'nDone', kind: 'flow' } } }], questions: [{ text: 'Why?' + BS + 'nReally' }] };
  const out = literalBreaksDeep(input);
  assert.equal(out.body, 'One.\n\nTwo.');
  assert.equal(out.visuals[0].c, 'Look\nHere');
  assert.equal(out.visuals[1].spec.diagram.caption, 'Cap\nDone');
  assert.equal(out.questions[0].text, 'Why?\nReally');
  assert.equal(out.visuals[1].spec.diagram.kind, 'flow');
});

test('clean text is returned as it is', () => {
  const text = 'Plain prose with $x^2$ and a path C:' + BS + BS + 'dir.';
  assert.equal(literalBreaksToNewlines(text), text);
  assert.equal(literalBreaksDeep(5), 5);
});
