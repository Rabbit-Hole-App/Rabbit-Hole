// The shared answer renderer (Md.jsx; owner brief 2026-10-13 §9): answers read like documents. Md is bundled with esbuild and
// rendered with react-dom/server, as next-steps-wiring-ui.test.mjs renders the hook card; clicks and scrolling run in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dir = mkdtempSync(join(tmpdir(), 'md-render-')), outfile = join(dir, 'md.cjs');
await esbuild.build({
  stdin: { contents: "export * from './Md.jsx'; export { ChatMessages } from './ChatMessages.jsx'; export { atEnd } from './chat-scroll.js'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });
const md = (text, props = {}) => B.renderToStaticMarkup(B.createElement(B.Md, { text, ...props }));
// What a reader sees as text: KaTeX keeps the TeX source in a MathML annotation for screen readers, never on screen.
const visible = html => html.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, '').replace(/<[^>]+>/g, '');

test('headings have a visible hierarchy: h1, h2 and h3 each a different size', () => {
  const html = md('# Title\n\n## Section\n\n### Part\n\nBody.');
  const size = tag => html.match(new RegExp(`<${tag} class="[^"]*\\b(text-(?:xl|lg|base|sm))\\b`))?.[1];
  assert.deepEqual([size('h1'), size('h2'), size('h3')], ['text-xl', 'text-lg', 'text-base']);
  assert.match(html, /<p class="my-1">Body\.<\/p>/);
});

test('a short answer stays short: one paragraph, no heading, rule or list', () => {
  assert.equal(md('Yes - 42.'), '<div class="min-w-0 text-sm leading-normal"><p class="my-1">Yes - 42.</p></div>');
});

test('ordered and nested lists: 1. is an ol (keeping its start), indented items nest inside their parent item', () => {
  assert.match(md('1. one\n2. two'), /<ol class="[^"]*list-decimal[^"]*"><li>one<\/li><li>two<\/li><\/ol>/);
  assert.match(md('3. three\n4. four'), /<ol start="3"/, 'a list split by a paragraph keeps counting');
  const nested = md('- fruit\n  - apple\n  - pear\n- veg\n  1. leek\n  2. kale');
  assert.match(nested, /<ul class="[^"]*list-disc[^"]*"><li>fruit<ul class="[^"]*"><li>apple<\/li><li>pear<\/li><\/ul><\/li><li>veg<ol class="[^"]*list-decimal[^"]*"><li>leek<\/li><li>kale<\/li><\/ol><\/li><\/ul>/);
});

test('italic with * and _ beside bold; snake_case, arithmetic and *args stay literal', () => {
  const html = md('This is *really* and _truly_ **bold _and_ more** text.');
  assert.match(html, /This is <em>really<\/em> and <em>truly<\/em> <strong>bold <em>and<\/em> more<\/strong> text\./);
  assert.equal(visible(md('call my_var_name with 2 * 3 * 4 and *args, **kwargs')), 'call my_var_name with 2 * 3 * 4 and *args, **kwargs');
  assert.doesNotMatch(md('`a_b_c` and `*x*`'), /<em>/, 'code spans stay literal');
  assert.equal(visible(md('see tests/_fixtures_/a.py and src/*.py')), 'see tests/_fixtures_/a.py and src/*.py', 'paths stay literal');
});

test('blockquotes: > lines are one quote, with inline formatting inside', () => {
  assert.match(md('> First line\n> with **bold**\n\nAfter.'), /<blockquote class="[^"]*border-l-2[^"]*"><p class="my-1">First line<\/p><p class="my-1">with <strong>bold<\/strong><\/p><\/blockquote><p class="my-1">After\.<\/p>/);
});

test('tables sit in a contained horizontal scroller', () => {
  assert.match(md('| a | b |\n|---|---|\n| 1 | 2 |'), /<div class="my-2 overflow-x-auto"><table class="min-w-full border-collapse text-xs"><thead><tr><th[^>]*>a<\/th>/);
});

test('fenced code: the language tag, highlighting, and a visible Copy; an unclosed fence is a growing code block', () => {
  const html = md('```python\nx = 1  # one\n```');
  assert.match(html, /<span data-code-lang="true"[^>]*>python<\/span>/);
  assert.match(html, /<button type="button" data-code-copy="true" aria-label="Copy code" title="Copy code"[^>]*>/);
  assert.match(html, /style="color:var\(--tok-c\)">#\s?one<\/span>/, 'colorLine highlights');
  const open = md('Here:\n\n```js\nconst a = 1;\nconst b');
  assert.match(open, /<pre[^>]*><div>const a = <span[^>]*>1<\/span>;<\/div><div>const b<\/div><\/pre>/);
  assert.doesNotMatch(open, /```/);
});

test('inline and display math in every delimiter, display $$ on its own lines over several lines; never raw LaTeX', () => {
  const html = md('Inline $x^2$ and \\(y_1\\).\n\n$$\n\\frac{a}{b}\n+ c\n$$\n\nAnd \\[\\sqrt{2}\\] too.');
  assert.equal((html.match(/data-chat-math="inline"/g) || []).length, 2);
  assert.equal((html.match(/data-chat-math="display"/g) || []).length, 2);
  assert.doesNotMatch(visible(html), /\$|\\frac|\\sqrt|\\\(|\\\[/, 'no delimiter or TeX command on screen');
  assert.match(md('It costs $5 and $10.'), /<p class="my-1">It costs \$5 and \$10\.<\/p>/, 'prices are not math');
});

test('streaming: unclosed $$ or \\[ math is plain text, never a broken equation, until it closes', () => {
  for (const text of ['Then\n\n$$\n\\frac{a}{', 'Then \\[ \\frac{a}{']) {
    const html = md(text);
    assert.doesNotMatch(html, /data-chat-math|katex-error/, text);
    assert.match(visible(html), /\\frac\{a\}\{/, text);
  }
});

test('streaming: blocks split on blank lines, never inside a fence or display math, so finished blocks are memoized', () => {
  assert.deepEqual(B.splitBlocks('# A\n\npara one\nline two\n\n```\ncode\n\nmore\n```\n\n$$\na\n\nb\n$$\n\nend'),
    ['# A', 'para one\nline two', '```\ncode\n\nmore\n```', '$$\na\n\nb\n$$', 'end']);
  assert.deepEqual(B.splitBlocks('text\n\n```py\nopen'), ['text', '```py\nopen']);
  const src = read('Md.jsx');
  assert.match(src, /const Block = memo\(/);
  assert.match(src, /blocks\.map\(\(src, i\) => <Block key=\{i\} src=\{src\}/);
});

test('clickable citations keep working: the Sources line and inline references are buttons that open the file', () => {
  const html = md('See job.py:15 here.\nSources: job.py:15-20, run r-abc123', { onFile: () => {}, onRun: () => {} });
  assert.match(html, /<button type="button" data-code-ref="job\.py:15-15" aria-label="Open job\.py line 15"/);
  assert.match(html, /<div aria-label="Answer evidence"[^>]*><button type="button" title="Open job\.py lines 15–20"/);
  assert.match(html, /aria-label="Open Run · r-abc123"/);
  assert.match(html, /<details data-cited-sources="true"/);
});

test('Copy on a code block says Copied or Copy failed at the button', () => {
  const src = read('Md.jsx');
  assert.match(src, /setCopied\('Copied'\); \} catch \{ setCopied\('Copy failed'\); \}/);
  assert.match(src, /<span role="status">\{copied \|\| 'Copy'\}<\/span>/);
});

test('Jump to latest: shown when scrolled up while a reply streams or a new message lands, never when at the bottom', () => {
  const msgs = [{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'Partial answer' }];
  const list = (follow, busy) => B.renderToStaticMarkup(B.createElement(B.ChatMessages, { msgs, busy, follow, setMsgs() {}, setFilePeek() {}, setRunPeek() {} }));
  assert.match(list({ atBottom: false, jump() {} }, true), /<button type="button" data-jump-latest="true"[^>]*>.*Jump to latest<\/button>/);
  assert.doesNotMatch(list({ atBottom: true, jump() {} }, true), /Jump to latest/);
  assert.doesNotMatch(list({ atBottom: false, jump() {} }, false), /Jump to latest/, 'scrolled up reading an old, finished chat');
  assert.equal(B.atEnd({ scrollHeight: 1000, scrollTop: 560, clientHeight: 400 }), true, 'within a few pixels is at the bottom');
  assert.equal(B.atEnd({ scrollHeight: 1000, scrollTop: 300, clientHeight: 400 }), false);
  // ask.jsx no longer always scrolls to the bottom on every message change: the hook follows only a reader at the bottom.
  const ask = read('ask.jsx');
  assert.doesNotMatch(ask, /boxRef\.current\.scrollTop = boxRef\.current\.scrollHeight/);
  assert.match(ask, /const follow = useFollowLatest\(boxRef, \[msgs\]\);/);
  assert.match(ask, /<ChatMessages [^\n]*follow=\{follow\}/);
});
