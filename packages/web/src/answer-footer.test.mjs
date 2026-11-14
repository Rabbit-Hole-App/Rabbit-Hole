// The answer footer (owner brief section 10; chat-workspace-CONTRACT.md B2, B5). AnswerFooter.jsx is bundled with esbuild
// and rendered with react-dom/server, as next-steps-wiring-ui.test.mjs renders its card; its pure helpers run directly.
// Clicks need a browser: the canvas insertChat wiring is pinned in source here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const dir = mkdtempSync(join(tmpdir(), 'answer-footer-')), outfile = join(dir, 'footer.cjs');
// ChatMessages reaches pdf.js through the Chat workspace (chat-context.js, context-docs.js, learn-paper-figures.js) and a Vite
// ?url import, which node has no use for: it becomes an empty string (as next-steps-wiring-ui.test.mjs does).
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as AnswerFooter, copyAnswer, nextRating, footerShown, cardIdFor } from './AnswerFooter.jsx'; export { ChatMessages } from './ChatMessages.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const answer = (over = {}) => ({ role: 'assistant', messageId: '812', status: 'done', content: '## Why\n\nBecause **yeast**.', meta: { alternatives: ['807', '812'], feedback: null, contextRefs: [] }, ...over });
const render = (message, props = {}) => B.renderToStaticMarkup(B.createElement(B.AnswerFooter, { message, onAddAsCard: () => {}, onLocateCard: () => {}, onRegenerate: () => {}, onSelectAlternative: async () => {}, ...props }));
const buttons = html => [...html.matchAll(/<button ([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, inner]) => attrs.match(/aria-label="([^"]+)"/)?.[1] || inner.replace(/<[^>]+>/g, ''));

test('only a finished answer gets the footer: not streaming, stopped, an error line or the demo', () => {
  assert.notEqual(render(answer()), '');
  for (const over of [{ status: 'streaming' }, { status: 'stopped' }, { status: 'error' }, { content: '✗ Provider down' }, { demo: true }, { content: '' }, { role: 'user' }])
    assert.equal(render(answer(over)), '', JSON.stringify(over));
});

test('the latest answer: Add as card, Copy, Regenerate answer, its 2/2 alternatives and both thumbs, all keyboard buttons', () => {
  const html = render(answer(), { latest: true });
  assert.match(html, /data-add-to-canvas[^>]*>.*Add as card<\/button>/);
  assert.match(html, /<button type="button" aria-label="Copy answer" title="Copy answer"/);
  assert.match(html, /<button type="button" aria-label="Regenerate answer" title="Regenerate answer"/);
  assert.match(html, /lucide-rotate-ccw/, 'the circular-arrows icon');
  assert.match(html, /data-alternatives[\s\S]*>2\/2<[\s\S]*aria-label="Next answer"[^>]*disabled/);
  assert.match(html, /aria-label="Good answer" title="Good answer" aria-pressed="false"/);
  assert.match(html, /aria-label="Bad answer" title="Bad answer" aria-pressed="false"/);
  assert.match(html, /focus-visible:opacity-100/, 'subdued thumbs show on keyboard focus');
  assert.doesNotMatch(html, />(Add to canvas|On the canvas|New card)</, 'one label');
  assert.doesNotMatch(html, /retrain|personali[sz]e|improve the model/i, 'no claim about training');
  assert.doesNotMatch(html, /tabindex="-1"/);
});

test('an older answer has no Regenerate; one alone in its turn shows no switcher; stored feedback shows pressed', () => {
  const older = render(answer({ meta: { alternatives: ['812'], feedback: { rating: 'down', reason: null } } }), { latest: false });
  assert.doesNotMatch(older, /Regenerate answer/);
  assert.doesNotMatch(older, /data-alternatives/);
  assert.match(older, /aria-label="Bad answer"[^>]*aria-pressed="true"/);
  assert.match(older, /aria-label="Good answer"[^>]*aria-pressed="false"/);
  assert.match(render(answer({ messageId: '807', meta: { alternatives: ['807', '812', '815'] } })), />1\/3</);
});

test('a card already on the canvas reads Added and locates it; a message without a server id still copies and adds, but has no thumbs or Regenerate', () => {
  const ids = [];
  const added = render(answer(), { cardExists: id => (ids.push(id), true) });
  assert.match(added, /data-add-to-canvas="true" data-added="true" title="Show the card on the canvas"[^>]*>.*Added<\/button>/);
  assert.deepEqual(ids, ['chat-812'], 'the card id is chat-<messageId>');
  const local = render(answer({ messageId: undefined, id: 'reply-1' }), { latest: true });
  assert.deepEqual(buttons(local), ['Add as card', 'Copy answer']);
  assert.equal(B.cardIdFor({ messageId: '812' }), 'chat-812');
  assert.doesNotMatch(render(answer(), { onAddAsCard: null }), /data-add-to-canvas/, 'no canvas, no Add as card');
});

test('copy writes markdown as text/plain and the rendered answer as text/html, or text alone without ClipboardItem', async () => {
  const writes = [];
  class Item { constructor(parts) { this.parts = parts; } }
  const clipboard = { write: async items => writes.push(['write', Object.keys(items[0].parts)]), writeText: async text => writes.push(['text', text]) };
  await B.copyAnswer({ text: '**hi**', html: '<p><strong>hi</strong></p>' }, clipboard, Item);
  await B.copyAnswer({ text: '**hi**', html: '<p>hi</p>' }, clipboard, undefined);
  await B.copyAnswer({ text: '**hi**', html: null }, clipboard, Item);
  assert.deepEqual(writes, [['write', ['text/plain', 'text/html']], ['text', '**hi**'], ['text', '**hi**']]);
  await assert.rejects(B.copyAnswer({ text: 'x' }, { writeText: async () => { throw Error('denied'); } }), /denied/, 'a refused write reaches the Copy failed branch');
});

test('a thumb toggles: the active one clears, the other replaces it', () => {
  assert.equal(B.nextRating(null, 'up'), 'up');
  assert.equal(B.nextRating('up', 'up'), null);
  assert.equal(B.nextRating('up', 'down'), 'down');
  assert.equal(B.nextRating('down', 'down'), null);
});

test('the footer source: feedback state comes only from the PUT reply; copy feedback is local, never a toast', () => {
  const src = read('AnswerFooter.jsx');
  assert.match(src, /const out = await putFeedback\(id, body\);\n\s*setRating\(out\.rating \?\? null\);/);
  assert.match(src, /setCopied\('Copied'\); \} catch \{ setCopied\('Copy failed'\); \}/);
  assert.doesNotMatch(src, /toast|Sparkles|AppIcon/);
  assert.match(src, /maxLength=\{REASON_MAX\}/);
  assert.match(src, /export const REASON_MAX = 280;/);
});

test('canvas insertChat takes the card id, markdown and sources, and locates an existing card instead of adding it twice', () => {
  const canvas = read('AdaptiveCanvas.jsx');
  const at = canvas.indexOf('insertChat: ({ id = crypto.randomUUID(), question, answer, sources = null }) => {');
  assert.ok(at > 0);
  const body = canvas.slice(at, canvas.indexOf('\n      },', at));
  assert.ok(body.indexOf('if (exchangesRef.current.some(exchange => exchange.id === id)) { commandsRef.current.focusObject(id); return id; }') < body.indexOf('snapshot(true);'), 'the duplicate check runs before the undo snapshot');
  assert.match(body, /onAddRef\.current\?\.\(\[\{ id, question, answer, linkFrom: null, status: 'done', dx: 0, dy: 0, \.\.\.\(sources\?\.length \? \{ sources \} : \{\}\) \}\]\);/);
  assert.match(canvas, /hasCard: id => exchangesRef\.current\.some\(exchange => exchange\.id === id\),/);
});

// The assistant answer wrapper in ChatMessages.jsx (brief section 9: no prominent colored box; section 10: the footer).
test('a Learn answer is a plain document with the footer under it: no accent box, one Copy, Add as card, Regenerate on the latest only', () => {
  const msgs = [{ role: 'user', content: 'Why?' }, answer({ messageId: '807', status: undefined, meta: { alternatives: ['807'] } }), { role: 'user', content: 'And?' }, answer({ status: 'thinking' })];
  const chat = (props = {}) => B.renderToStaticMarkup(B.createElement('div', null, B.createElement(B.ChatMessages, { msgs, learnChat: true, busy: false, onAddToCanvas: () => {}, onRegenerate: () => {}, setMsgs: () => {}, setFilePeek: () => {}, setRunPeek: () => {}, ...props })));
  const html = chat();
  assert.doesNotMatch(html, /border-accent\/30/, 'no colored box around the answer');
  assert.equal((html.match(/data-answer-footer/g) || []).length, 2);
  assert.equal((html.match(/aria-label="Copy answer"/g) || []).length, 2, 'one Copy per answer, in its footer');
  assert.equal((html.match(/>Add as card</g) || []).length, 2);
  assert.equal((html.match(/aria-label="Regenerate answer"/g) || []).length, 1, 'Regenerate only on the latest answer');
  assert.ok(html.lastIndexOf('aria-label="Regenerate answer"') > html.lastIndexOf('data-answer-body'));
  assert.match(html, /<div data-answer="true" class="group\/answer min-w-0"><div data-answer-body="true">/);
  assert.equal((chat({ busy: true }).match(/data-answer-footer/g) || []).length, 1, 'the reply still arriving has no footer');
  assert.doesNotMatch(chat({ onAddToCanvas: null }), /Add as card/);
  assert.doesNotMatch(chat({ onRegenerate: null }), /Regenerate answer/, 'Regenerate waits for the send loop to pass it');
});

// ChatMessages reads the Chat workspace (contract A6); without one (the old sheet) its words go to the composer through setInput.
test('without a Chat workspace, Explore next and actions still render under the latest answer, typing into the composer, and Regenerate stays hidden', () => {
  const meta = { alternatives: ['812'], feedback: null, contextRefs: [], actions: [{ id: 'a1', capabilityId: 'diagram', label: 'Draw the flow', sourceMessageId: '812', contextRefs: [], args: { subject: 'the flow' }, generationRequired: true, paid: false }], followUps: [{ id: 'f1', text: 'Why does it rise?', kind: 'clarify' }] };
  const html = props => B.renderToStaticMarkup(B.createElement(B.ChatMessages, { msgs: [{ role: 'user', content: 'Why?' }, answer({ meta })], learnChat: true, busy: false, setMsgs: () => {}, setFilePeek: () => {}, setRunPeek: () => {}, ...props }));
  const typed = html({ setInput: () => {}, inputRef: { current: null } });
  assert.match(typed, /Why does it rise\?/);
  assert.match(typed, /Draw the flow/);
  assert.doesNotMatch(typed, /Regenerate answer/);
  assert.doesNotMatch(html({}), /Why does it rise\?/, 'no composer at all: nothing to prepare, so no suggestions');
});
