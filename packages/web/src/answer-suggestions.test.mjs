// AnswerSuggestions (chat-workspace-CONTRACT.md B3, B4): bundled with esbuild and rendered with react-dom/server, as
// next-steps-wiring-ui.test.mjs renders NextStepsCard. Clicks run on the element tree: a second bundle swaps the component's
// own `react` import for a useState stub reading globalThis.__state (jsx-runtime keeps real React), so the component can be called as a function and
// its buttons' onClick handlers invoked without a DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'answer-suggestions-'));
const bundle = async (name, plugins = []) => {
  const outfile = join(dir, `${name}.cjs`);
  await esbuild.build({
    stdin: { contents: "export { default as AnswerSuggestions } from './AnswerSuggestions.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
    bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins,
  });
  return createRequire(import.meta.url)(outfile);
};
const B = await bundle('ssr');
const stubReact = { name: 'stub-react', setup(build) {
  build.onResolve({ filter: /^react$/ }, args => (args.importer.endsWith('AnswerSuggestions.jsx') ? { path: 'react', namespace: 'stub' } : undefined));
  build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useState = init => [globalThis.__state ?? init, v => { globalThis.__set = v; }];' }));
} };
const C = await bundle('call', [stubReact]);
rmSync(dir, { recursive: true, force: true });

const REFS = [{ sourceId: 'doc:7', kind: 'doc', name: 'Paper', version: 'v1', range: null }];
const META = {
  actions: [
    { id: 'a1', capabilityId: 'diagram', label: 'Draw the cache flow', sourceMessageId: '812', contextRefs: REFS, args: { subject: 'cache lookup from client to DB' }, generationRequired: true, paid: false },
    { id: 'a2', capabilityId: 'notebook', label: 'Open in Notebook', sourceMessageId: '812', contextRefs: REFS, args: { subject: 'the LRU example', code: { language: 'python', cells: ['from functools import lru_cache', 'print(1)'] } }, generationRequired: false, paid: false },
    { id: 'a3', capabilityId: 'video', label: 'Explain with a video', sourceMessageId: '812', contextRefs: REFS, args: { subject: 'cache eviction' }, generationRequired: true, paid: true },
  ],
  followUps: [{ id: 'f1', text: 'Why does a <changed> key miss?', kind: 'clarify' }, { id: 'f2', text: 'What would LFU change here?', kind: 'implication' }],
};
const msg = (over = {}) => ({ messageId: '812', role: 'assistant', status: 'done', content: 'An answer.', meta: META, ...over });
const spy = () => { const calls = []; const f = (...a) => { calls.push(a); }; f.calls = calls; return f; };
const html = (props) => B.renderToStaticMarkup(B.createElement(B.AnswerSuggestions, { message: msg(), latest: true, threadId: 'canvaschat-1', prepare: spy(), insertNotebook: spy(), ...props }));
const find = (node, pred, out = []) => {
  if (Array.isArray(node)) node.forEach(n => find(n, pred, out));
  else if (node && typeof node === 'object' && node.props) { if (pred(node.props)) out.push(node.props); find(node.props.children, pred, out); }
  return out;
};

test('latest answer: three actions with icons and labels, generation marked; Explore next apart, with its questions', () => {
  const out = html();
  assert.match(out, /^<div data-answer-suggestions="canvaschat-1:812"/);
  const acts = [...out.matchAll(/<button [^>]*data-answer-action="([a-z]+)"[^>]*title="([^"]*)"[^>]*><svg[^>]*>.*?<\/svg><span>([^<]+)<\/span>(<span[^>]*>Generates<\/span>)?<\/button>/g)].map(m => [m[1], m[2], m[3], !!m[4]]);
  assert.deepEqual(acts, [
    ['diagram', 'Generates: cache lookup from client to DB', 'Draw the cache flow', true],
    ['notebook', 'Opens the code from this answer', 'Open in Notebook', false],
    ['video', 'Generates: cache eviction', 'Explain with a video', true],
  ]);
  assert.match(out, /lucide-workflow/); assert.match(out, /lucide-notebook-pen/); assert.match(out, /lucide-video/);
  assert.doesNotMatch(out, /lucide-sparkles|AppIcon/);
  // Questions sit in their own titled section after the actions group, never mixed into it.
  assert.match(out, /<div role="group" aria-label="Suggested actions"[^>]*>(?:(?!aria-label="Explore next").)*<\/div><section aria-label="Explore next"/);
  assert.match(out, /<h3[^>]*>Explore next<\/h3>/);
  assert.deepEqual([...out.matchAll(/data-answer-followup="([a-z]+)"[^>]*>.*?<span class="min-w-0">([^<]+)<\/span>/g)].map(m => [m[1], m[2]]),
    [['clarify', 'Why does a &lt;changed&gt; key miss?'], ['implication', 'What would LFU change here?']]);
});

test('rendering calls neither prepare, insertNotebook nor fetch', () => {
  const prepare = spy(), insertNotebook = spy(), realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = () => { fetched++; return Promise.reject(Error('no fetch')); };
  try { html({ prepare, insertNotebook }); html({ prepare, insertNotebook, latest: false }); } finally { globalThis.fetch = realFetch; }
  assert.deepEqual([prepare.calls.length, insertNotebook.calls.length, fetched], [0, 0, 0]);
});

test('older answers render only a quiet collapsed Suggestions toggle; nothing for streaming, stopped, user, no meta or empty meta', () => {
  const old = html({ latest: false });
  assert.match(old, /^<button type="button" data-answer-suggestions-toggle="true" aria-expanded="false"[^>]*>Suggestions<svg/);
  assert.doesNotMatch(old, /data-answer-action|Explore next|LFU/);
  for (const message of [msg({ status: 'streaming' }), msg({ status: 'stopped' }), msg({ role: 'user' }), msg({ meta: undefined }), msg({ meta: { actions: [], followUps: [] } }), msg({ meta: { status: 'stopped' } })]) {
    assert.equal(html({ message }), '', JSON.stringify(message).slice(0, 60));
  }
  assert.doesNotMatch(html({ message: msg({ meta: { actions: [], followUps: META.followUps } }) }), /Suggested actions/, 'no empty actions row');
  // A Tutor syllabus answer with actions and no usable question: no bare Explore next heading.
  for (const followUps of [[], [{ id: 'f1', text: '  ', kind: 'next' }, { id: 'f2', kind: 'next' }, null], undefined]) {
    const out = html({ message: msg({ meta: { actions: META.actions, followUps } }) });
    assert.match(out, /Suggested actions/);
    assert.doesNotMatch(out, /Explore next/, JSON.stringify(followUps));
  }
});

test('clicks: a generation action prepares command, subject and refs only; notebook code inserts; a question prepares its text', () => {
  const prepare = spy(), insertNotebook = spy();
  const tree = C.AnswerSuggestions({ message: msg(), latest: true, threadId: 'canvaschat-1', prepare, insertNotebook });
  const click = attr => find(tree, p => p[attr] !== undefined && typeof p.onClick === 'function');
  const [diagram, notebook, video] = click('data-answer-action');
  diagram.onClick(); video.onClick();
  assert.deepEqual(prepare.calls, [[{ command: 'diagram', text: 'cache lookup from client to DB', contextRefs: REFS }], [{ command: 'video', text: 'cache eviction', contextRefs: REFS }]]);
  assert.equal(insertNotebook.calls.length, 0);
  notebook.onClick();
  assert.deepEqual(insertNotebook.calls, [[['from functools import lru_cache', 'print(1)'], 'python']]);
  assert.equal(prepare.calls.length, 2, 'the notebook action never prepares');
  click('data-answer-followup')[1].onClick();
  assert.deepEqual(prepare.calls[2], [{ text: 'What would LFU change here?' }]);
});

test('older-answer toggle state is keyed by thread and message: opening one never opens another chat or message', () => {
  const shown = (threadId, messageId = '812') => find(C.AnswerSuggestions({ message: msg({ messageId }), latest: false, threadId, prepare: spy(), insertNotebook: spy() }), p => p['data-answer-action'] !== undefined).length;
  const [toggle] = find(C.AnswerSuggestions({ message: msg(), latest: false, threadId: 'canvaschat-1', prepare: spy(), insertNotebook: spy() }), p => p['data-answer-suggestions-toggle']);
  toggle.onClick();
  assert.equal(globalThis.__set, 'canvaschat-1:812', 'the toggle opens this (thread, message) key');
  globalThis.__state = globalThis.__set;
  try {
    assert.equal(shown('canvaschat-1'), 3, 'opened here');
    assert.equal(shown('canvaschat-2'), 0, 'another chat stays collapsed');
    assert.equal(shown('canvaschat-1', '813'), 0, 'another message stays collapsed');
  } finally { delete globalThis.__state; delete globalThis.__set; }
});

test('ChatMessages mounts the suggestions under a Learn chat answer, as one standalone line under the answer footer, latest by position, once the composer API is passed', () => {
  const src = readFileSync(new URL('./ChatMessages.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /import AnswerSuggestions from '\.\/AnswerSuggestions\.jsx';/);
  // Inside the Learn answer (data-answer, B2's wrapper), as the last line under the footer.
  assert.match(src, /<div data-answer className[^\n]*\n(?: {12}[^\n]*\n)*? {12}<AnswerFooter [^\n]*\n(?: {14}[^\n]*\n)* {12}\{prepare && <AnswerSuggestions message=\{m\} latest=\{i === msgs\.length - 1\} threadId=\{threadId\} prepare=\{prepare\} insertNotebook=\{insertNotebook\} \/>\}\n {10}<\/div>\n {10}<\/AnswerBoundary>\n {8}\) : <Md /);
});
