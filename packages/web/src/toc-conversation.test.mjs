// The Table of contents' own conversation (owner approved 2026-11-07, superseding checklist UI.02): a collapsible window above a composer that stays fixed under the
// scrolling outline, a Clear that starts a new conversation, and Add to chat on a contents row making a pill in THIS composer, never in the right-hand Chat.
// Markup and pure functions only, no browser: AskPanel is replaced by a stub that records the props it gets.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = fileURLToPath(new URL('.', import.meta.url));
const read = name => readFileSync(join(here, name), 'utf8').replace(/\r\n/g, '\n');
const tmp = mkdtempSync(join(tmpdir(), 'toc-conversation-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { default as TocConversation } from './TocConversation.jsx'; export { default as ContextChips } from './ContextChips.jsx'; export { addRowToConversation } from './TableOfContents.jsx'; export { ChatWorkspace } from './chat-workspace.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: here, loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' }));
    // AskPanel: what the conversation hands it is what is under test.
    build.onResolve({ filter: /^\.\/ask\.jsx$/ }, () => ({ path: 'ask-stub', namespace: 'ask-stub' }));
    build.onLoad({ filter: /.*/, namespace: 'ask-stub' }, () => ({ contents: "import { createElement } from 'react'; export function AskPanel(props) { return createElement('div', { 'data-ask-stub': '', 'data-hide-conversation': String(!!props.hideConversation), 'data-autofocus': String(!!props.autoFocus) }); }", loader: 'js', resolveDir: here }));
  } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);

const selectionPill = { sourceId: 'selection:h1', kind: 'selection', name: 'Intro', version: 'v1', range: null };
const docRef = { sourceId: 'doc:ctx:0123456789ab', kind: 'doc', name: 'Notes.pdf', version: 'v1', range: null };
// The contents workspace the conversation reads: its own thread, draft and context.
const workspace = ({ messages = [], attached = [], text = '', status = 'ready', newChat = () => {} } = {}) => ({
  thread: { status, restore: { key: 'k1', messages }, newChat },
  composer: { text, command: null, focus() {} },
  context: { attached, items: attached.map(ref => ({ ref, state: 'ready', attached: true })), detach() {} },
  canvasOps: null, panels: {}, openSource() {},
});
const render = (value, props = {}) => lib.renderToStaticMarkup(lib.createElement(lib.ChatWorkspace.Provider, { value }, lib.createElement(lib.TocConversation, props)));

test('no messages: only the one compact entry, no empty window; a pill the learner added opens the composer; an auto-offered document does not', () => {
  const empty = render(workspace());
  assert.match(empty, /data-toc-start/);
  assert.doesNotMatch(empty, /data-toc-conversation|data-ask-stub/);
  const pilled = render(workspace({ attached: [selectionPill] }));
  assert.match(pilled, /data-toc-ask/, 'the composer is open for the pill');
  assert.doesNotMatch(pilled, /data-toc-start|data-toc-conversation=|data-toc-clear/, 'still no conversation window, so no Clear');
  assert.match(render(workspace({ attached: [docRef] })), /data-toc-start/, 'a canvas document never opens it');
  assert.equal(render(workspace({ status: 'loading' })), '', 'nothing while the saved thread loads');
});

test('with messages: a window with an expand / minimize header and a Clear, above the composer, capped; minimized hides the messages only', () => {
  const html = render(workspace({ messages: [{ role: 'user', content: 'hi' }] }));
  assert.match(html, /data-toc-conversation=""/);
  assert.match(html, /data-toc-conversation-toggle[^>]*aria-expanded="true"|aria-expanded="true"[^>]*data-toc-conversation-toggle/, 'the header toggles the window');
  assert.match(html, /data-toc-clear[^>]*aria-label="Clear the conversation"|aria-label="Clear the conversation"[^>]*data-toc-clear/);
  assert.match(html, /data-hide-conversation="false"/, 'messages shown while expanded');
  assert.ok(html.indexOf('data-toc-conversation-toggle') < html.indexOf('data-ask-stub'), 'the window header is above the composer');
  assert.match(html, /class="mt-auto flex max-h-\[45%\] min-h-0 shrink-0 flex-col/, 'capped, scrolls inside, pinned to the bottom of the panel');
  assert.doesNotMatch(html, /data-toc-clear-confirm/, 'the Clear popover is closed until pressed');
  const source = read('TocConversation.jsx');
  assert.match(source, /setOpen\(shown => !shown\)/, 'the header minimizes and expands');
  assert.match(source, /hideConversation=\{!open \|\| !has\}/, 'minimized: only the header and the composer');
});

test('Clear asks first, then starts a new empty conversation; Cancel, Escape and a press elsewhere keep it', () => {
  const source = read('TocConversation.jsx');
  assert.match(source, /data-toc-clear[^\n]*onClick=\{\(\) => setClearing\(shown => !shown\)\}/, 'the icon only opens the question');
  assert.match(source, /role="alertdialog" aria-label="Clear the conversation"/);
  assert.match(source, /data-toc-clear-cancel[^\n]*setClearing\(false\)/);
  assert.match(source, /event\.key === 'Escape'[^\n]*setClearing\(false\)/);
  assert.match(source, /addEventListener\('pointerdown', away, true\)/);
  assert.match(source, /data-toc-clear-run onClick=\{\(\) => \{ setClearing\(false\); setOpen\(true\); thread\.newChat\(\); \}\}/, 'Clear starts a new thread; the old one stays saved and in Chat history');
  assert.doesNotMatch(source, /thread\.(remove|delete)|removeThread/, 'nothing is deleted');
});

test('the outline scrolls above and the composer is fixed below, in the contents tab', () => {
  const page = read('LearnPage.jsx');
  const tab = page.slice(page.indexOf('<div role="tabpanel" aria-label="Table of contents"'));
  assert.match(tab.slice(0, 200), /className=\{`\$\{panelTab === 'toc' \? 'flex' : 'hidden'\} min-h-0 flex-1 flex-col`\}/, 'a column');
  assert.match(tab, /<TableOfContents [^\n]*\n\s+className=\{`mb-3 flex \$\{setupChat \? 'max-h-\[45%\] shrink-0' : 'min-h-0'\} flex-col overflow-y-auto`\} \/>/, 'the outline is the scroller');
  assert.ok(tab.indexOf('<TableOfContents') < tab.indexOf('<TocWorkspace key={app.name}><TocConversation'), 'the conversation comes after the outline');
  assert.ok(tab.indexOf('<TocWorkspace') < tab.indexOf('<ChatPane'), 'inside the contents tab, before Chat');
  assert.match(tab, /\{!setupChat && \(app\.hosting !== 'aws' \|\| app\.app_chat\) && <TocWorkspace key=\{app\.name\}>/);
  assert.match(tab, /boardContext=\{\{ \.\.\.boardContext, onOutlineProposal: canEditCanvas \?/, 'an outline change the Tutor proposes applies to the contents');
});

test('Add to chat on a contents row makes a pill in the CONTENTS composer and never touches the right-hand Chat', () => {
  const calls = [], rightChat = [];
  const canvasApi = { current: { refForSection: id => (id === 'h1' ? selectionPill : null), addToChat: ref => rightChat.push(ref) } };
  assert.equal(lib.addRowToConversation(canvasApi, 'h1', ref => calls.push(ref)), true);
  assert.deepEqual(calls, [selectionPill], 'exactly the one ref, handed to the contents composer');
  assert.deepEqual(rightChat, [], 'the right-hand Chat is untouched');
  const told = [];
  assert.equal(lib.addRowToConversation(canvasApi, 'nothing', ref => calls.push(ref), message => told.push(message)), false);
  assert.equal(calls.length, 1, 'no ref, no pill');
  assert.match(told[0], /Could not add/);
  // The page hands that ref to the contents workspace's own context, and nothing else.
  const page = read('LearnPage.jsx');
  assert.match(page, /onAddToChat=\{ref => \{ chat\.toc\.context\.attach\(ref\); chat\.toc\.composer\.focus\?\.\(\); \}\}/);
  assert.doesNotMatch(page, /onAddToChat=\{[^}]*chat\.(addToChat|context\.attach)/);
  // The canvas builds the ref; it selects, sends and adds nothing.
  const canvas = read('AdaptiveCanvas.jsx');
  assert.match(canvas, /refForSection: id => \{[\s\S]*?selectionRef\(\{ ids: \[object\.id\]/);
  assert.doesNotMatch(canvas, /addSectionToChat/);
});

test('the contents composer shows the pill the learner added and never the canvas documents', () => {
  const value = workspace({ attached: [docRef, selectionPill] });
  const shown = lib.renderToStaticMarkup(lib.createElement(lib.ChatWorkspace.Provider, { value }, lib.createElement(lib.ContextChips, { hideDocs: true })));
  assert.match(shown, /Intro/);
  assert.doesNotMatch(shown, /Notes\.pdf/);
  const chat = lib.renderToStaticMarkup(lib.createElement(lib.ChatWorkspace.Provider, { value }, lib.createElement(lib.ContextChips, {})));
  assert.match(chat, /Notes\.pdf/, 'Chat still lists its documents');
  const ask = read('ask.jsx');
  assert.match(ask, /const attachedRefs = tocView \? \(chat\?\.context\.attached\.filter\(ref => ref\.kind !== 'doc'\) \|\| NO_REFS\)/, 'only the added pills ride the contents turn as context_refs');
});
