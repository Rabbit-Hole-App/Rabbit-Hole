import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { askHistory, askPath, loadChat, saveChat, signInForAsk, takeDraft, HISTORY_TURNS } from './shared-ask.js';

// The composer on a shared canvas (docs/features/shared-canvas-ask.md).
const memory = () => { const map = new Map(); return { map, getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) }; };
const page = readFileSync(new URL('./SharedBoardPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const composer = page.slice(page.indexOf('function SharedAsk('));

test('signed out, Send keeps the draft for this link and goes through sign-in, back with ?ask=1', () => {
  const storage = memory();
  assert.equal(signInForAsk('tok_123', 'Why scale by sqrt(d)?', storage), `/login?next=${encodeURIComponent('/b/tok_123?ask=1')}`);
  assert.equal(takeDraft('other', storage), '', 'drafts are per link');
  assert.equal(takeDraft('tok_123', storage), 'Why scale by sqrt(d)?');
  assert.equal(takeDraft('tok_123', storage), '', 'restored once');
  assert.equal(askPath('a/b'), '/api/learn/boards/shared/a%2Fb/ask');
});

test('the conversation is kept per link and per viewer, and only answered pairs ride, capped', () => {
  const storage = memory();
  saveChat('tok', 'ben@test', [{ role: 'user', content: 'q' }], storage);
  assert.deepEqual(loadChat('tok', 'ben@test', storage), [{ role: 'user', content: 'q' }]);
  assert.deepEqual(loadChat('tok', 'cara@test', storage), [], 'another viewer sees nothing');
  assert.deepEqual(loadChat('other', 'ben@test', storage), []);
  const turns = [
    { role: 'user', content: 'failed' }, { role: 'assistant', content: '', error: 'boom' },
    ...Array.from({ length: 8 }, (_, i) => [{ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` }]).flat(),
    { role: 'user', content: 'in flight' }, { role: 'assistant', content: 'part', pending: true },
  ];
  const history = askHistory(turns);
  assert.equal(history.length, HISTORY_TURNS);
  assert.deepEqual(history.slice(0, 2), [{ role: 'user', content: 'q3' }, { role: 'assistant', content: 'a3' }]);
  assert.ok(!JSON.stringify(history).includes('failed') && !JSON.stringify(history).includes('in flight'));
});

test('the shared page puts Learn\'s composer shell in the canvas composer slot, with read-only context pills', () => {
  assert.match(page, /<AdaptiveCanvas [^\n]*readOnly\n\s+composer=\{<SharedAsk token=\{token\} viewer=\{shared\.viewer\} context=\{shared\.context\} draft=\{askDraft\} \/>\} \/>/);
  assert.match(page, /import ChatComposer from '\.\/ChatComposer\.jsx';/);
  assert.match(composer, /<ChatComposer dock value=\{input\} onChange=\{setInput\} onSubmit=\{send\}/);
  assert.match(composer, /data-context-pill="repository"[^\n]*\n[^\n]*\{repository\.repo\} · \{repository\.commit\.slice\(0, 7\)\}/);
  assert.match(composer, /data-context-pill=\{source\.kind\}/);
  assert.doesNotMatch(composer, /<button[^>]*aria-label="Remove/, 'the pills are read-only');
  // Answers render with Md and no onFile: no owner-only file viewer from a shared page.
  assert.match(composer, /\{\/\* ponytail: no onFile[^\n]*\*\/\}\n\s+<Md text=\{turn\.content\} \/>/);
  // The answer window is the viewer's, kept in this tab - never posted anywhere but the ask route.
  assert.match(composer, /streamAsk\(\{ path: askPath\(token\), body: \{ message, history \}/);
  assert.doesNotMatch(composer, /\/api\/learn\/ask|\/api\/ask\b|\/api\/learn\/boards\/\$\{/);
});

test('back from sign-in: the draft is restored and focused, ?ask=1 leaves the address, and nothing is sent by itself', () => {
  assert.match(page, /get\('ask'\) !== '1'\) return null;\n\s+window\.history\.replaceState\(null, '', window\.location\.pathname\);\n\s+return takeDraft\(token\);/);
  assert.match(composer, /useState\(draft \|\| ''\)/);
  assert.match(composer, /useEffect\(\(\) => \{ if \(draft !== null\) inputRef\.current\?\.focus\(\); \}, \[\]\);/);
  // send runs only from the composer's own submit: no effect, timer or restore path calls it.
  assert.doesNotMatch(composer, /\bsend\(/);
  assert.match(composer, /if \(!viewer\) return toSignIn\(raw\);/);
});
