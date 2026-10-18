import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_LANGS, codeLang, withCodeLang, highlightCode } from './code-lang.js';

test('a Code box stays Plain text unless it holds a listed language', () => {
  assert.equal(CODE_LANGS.length, 15);
  assert.equal(codeLang({}), 'text');
  assert.equal(codeLang({ lang: 'cobol' }), 'text');
  assert.equal(codeLang({ lang: 'javascript' }), 'javascript');
});

test('the language persists on the item and the undo snapshot still holds the old one', () => {
  const before = [{ id: 'a', kind: 'text', mode: 'code', text: 'x = 1' }, { id: 'b', kind: 'text', text: 'y' }];
  const after = withCodeLang(before, 'a', 'javascript');
  assert.equal(after[0].lang, 'javascript');
  assert.equal(after[1], before[1]);
  const saved = JSON.parse(JSON.stringify(after));
  assert.equal(codeLang(saved[0]), 'javascript');
  // Undo restores the list captured before the change.
  assert.equal(codeLang(before[0]), 'text');
});

test('highlighted runs spell the text exactly and carry colors only', async () => {
  const text = 'def f(x):\n    return x + 1\n';
  const runs = await highlightCode(text, 'python');
  assert.equal(runs.map(run => run.t).join(''), text);
  assert.ok(runs.some(run => run.t === 'def' && run.color && run.dark));
  for (const run of runs) assert.deepEqual(Object.keys(run).filter(key => !['t', 'color', 'dark'].includes(key)), []);
  assert.equal(await highlightCode(text, 'text'), null);
});
