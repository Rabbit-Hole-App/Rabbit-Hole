// Explain on a highlighted passage and the shared proposal card's actions (owner 2026-11-07): the bulb opens Ctrl+K with /interactive instead of
// generating; Cancel exists only where the proposal has a canvas skeleton and removes it; Generate becomes the red Stop button while the job
// runs (and then Edit, Cancel and Go to card are not drawn); Add to chat joins Highlight and Explain on a Markdown selection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { heldPassageTarget } from './source-refs.js';
import { skeletonJobOf } from './explain-client.js';

const dir = mkdtempSync(join(tmpdir(), 'selection-explain-')), outfile = join(dir, 'card.cjs');
const viteUrl = { name: 'vite-url', setup(build) {
  build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' }));
  build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' }));
} };
await esbuild.build({
  stdin: { contents: "export { default as Card, StopConfirm } from './GenerationProposalCard.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', plugins: [viteUrl], loader: { '.png': 'empty', '.svg': 'empty', '.css': 'empty' },
});
const B = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

const explain = { proposal_id: 'gp-aaaaaaaaaaaaaaaa', version: 1, schema_version: 1, command: 'explain', title: 'Pendulum', description: 'One. Two.', prompt: 'One. Two.', settings: { presentation: 'steps' },
  input: { request: 'Explain a pendulum.', org: 'w', app: 'a', job: 'ej_1' }, original_request: 'Explain a pendulum.', references: [], assumptions: ['No friction.'], sig: `v3.${'0'.repeat(64)}` };
const html = props => B.renderToStaticMarkup(B.createElement(B.Card, { proposal: explain, onGenerate: () => {}, onSave: async () => {}, onEdit: () => {}, onCancel: () => {}, onStop: async () => {}, noun: 'explanation', ...props }));
const controls = out => [...out.matchAll(/data-proposal-(generate|stop|edit|cancel|go-to-card)=/g)].map(m => m[1]);
const running = { phase: 'running', label: 'Generating', active: true, spinner: true, detail: 'Working', canStop: true, cardId: 'c1' };

test('the proposal row: Generate, Edit, then Cancel only with a canvas skeleton; Generate is not greyed', () => {
  const withSkeleton = html({ skeleton: true });
  assert.deepEqual(controls(withSkeleton), ['generate', 'edit', 'cancel']);
  assert.doesNotMatch(withSkeleton.match(/<button[^>]*data-proposal-generate[^>]*>/)[0], /disabled=""/);
  assert.match(withSkeleton.match(/<button[^>]*data-proposal-cancel[^>]*>/)[0], /hover:bg-hover/, 'Cancel is the text control');
  assert.doesNotMatch(withSkeleton.match(/<button[^>]*data-proposal-cancel[^>]*>/)[0], /border-line-strong/);
  assert.match(withSkeleton.match(/<button[^>]*data-proposal-edit[^>]*>/)[0], /border-line-strong/, 'Edit is a real button');
  assert.deepEqual(controls(html({ skeleton: false })), ['generate', 'edit'], 'no skeleton: Generate and Edit only');
});

test('a running job: the Generate button is the red Stop button and the only control; the normal row returns when it ends', () => {
  const out = html({ skeleton: true, status: running });
  assert.deepEqual(controls(out), ['stop']);
  const stop = out.match(/<button[^>]*data-proposal-stop[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(stop, /bg-danger-fill text-white/);
  assert.doesNotMatch(stop, /bg-ink|disabled=""/);
  assert.match(stop, /aria-label="Stop explanation"/);
  assert.match(stop, /<span>Stop<\/span>/);
  // Not stoppable (no onStop): the progress label stays, disabled, and Edit / Cancel are still not drawn.
  const fixed = html({ skeleton: true, status: running, onStop: null });
  assert.deepEqual(controls(fixed), ['generate']);
  assert.match(fixed, /<span>Generating<\/span>/);
  // Ended: done offers Go to card, failed or stopped is back to Generate, Edit, Cancel.
  const done = html({ skeleton: true, onGoToCard: () => {}, status: { ...running, phase: 'done', label: 'Ready', active: false, spinner: false, canStop: false }, active: false });
  assert.deepEqual(controls(done), ['generate', 'go-to-card']);
  const failed = html({ skeleton: true, status: { ...running, phase: 'failed', label: null, active: false, spinner: false, canStop: false, cardId: null } });
  assert.deepEqual(controls(failed), ['generate', 'edit', 'cancel']);
});

test('Stop asks first: Cancel keeps the job (Escape too), only Stop calls onStop', () => {
  const calls = [];
  const tree = B.StopConfirm({ noun: 'explanation', onKeep: () => calls.push('keep'), onStop: () => calls.push('stop') });
  const out = B.renderToStaticMarkup(B.createElement(B.StopConfirm, { noun: 'explanation', onKeep() {}, onStop() {} }));
  assert.match(out, /Stop this explanation\? Credits already used won(&#x27;|&#39;|')t be refunded\./);
  assert.match(out, /data-proposal-stop-cancel[^>]*>Cancel</);
  assert.match(out, /bg-danger-fill text-white[^>]*data-proposal-stop-confirmed|data-proposal-stop-confirmed[^>]*bg-danger-fill/);
  tree.props.onKeyDown({ key: 'Escape', stopPropagation() {} });
  assert.deepEqual(calls, ['keep']);
  const buttons = [];
  (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n?.props) { if (n.props['data-proposal-stop-cancel']) buttons.push(['cancel', n.props.onClick]); if (n.props['data-proposal-stop-confirmed']) buttons.push(['stop', n.props.onClick]); walk(n.props.children); } })(tree);
  buttons.find(([name]) => name === 'cancel')[1]();
  assert.deepEqual(calls, ['keep', 'keep']);
  buttons.find(([name]) => name === 'stop')[1]();
  assert.deepEqual(calls, ['keep', 'keep', 'stop']);
});

test('the passage the bulb held rides one /explain or /interactive line, once, and only while fresh', () => {
  const held = () => ({ current: { sourceRef: 'sref_1', text: 'the quote', at: 1000 } });
  const a = held();
  assert.deepEqual(heldPassageTarget(null, '/explain the quote', a, 2000), { id: null, text: 'the quote', sourceRef: 'sref_1' });
  assert.equal(a.current, null, 'used once');
  assert.deepEqual(heldPassageTarget({ id: 'x' }, '/interactive why', held(), 2000), { id: 'x', text: 'the quote', sourceRef: 'sref_1' });
  const other = held();
  assert.equal(heldPassageTarget(null, '/motion a pendulum', other, 2000), null, 'another command leaves it alone');
  assert.ok(other.current, 'and keeps the hold');
  assert.equal(heldPassageTarget(null, '/explain late', held(), 1000 + 5 * 60_000 + 1), null, 'stale after five minutes');
  assert.equal(heldPassageTarget(null, '/explain x', { current: null }), null);
});

test('a skeleton is a card whose reviewed plan still waits for Generate', () => {
  assert.deepEqual(skeletonJobOf({ explainJob: { id: 'ej_1', stage: 'awaiting_approval' } }), { command: 'explain', id: 'ej_1' });
  assert.deepEqual(skeletonJobOf({ animation3dJob: { id: 'aj_1', stage: 'awaiting_approval' } }), { command: 'animation', id: 'aj_1' });
  assert.deepEqual(skeletonJobOf({ whiteboardJob: { id: 'wj_1', stage: 'awaiting_approval' } }), { command: 'whiteboard-video', id: 'wj_1' });
  assert.equal(skeletonJobOf({ explainJob: { id: 'ej_1', stage: 'authoring' } }), null, 'a running job is stopped, not dropped');
  assert.equal(skeletonJobOf({ type: 'note' }), null);
});

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('the bulb opens Ctrl+K with the passage as the words and NO command pill; the router picks the command; it never starts the job itself', () => {
  const page = read('./LearnPage.jsx');
  const listener = page.slice(page.indexOf('const onPassage'), page.indexOf('window.addEventListener(EXPLAIN_PASSAGE_EVENT'));
  assert.ok(listener.includes("inlineAi?.('explain', { prompt: text, rect, cardId })"), 'words only, and where they are (CK-1): no command, so no command pill');
  assert.doesNotMatch(listener, /command/);
  assert.doesNotMatch(page, /HIGHLIGHT_EXPLAIN_COMMAND/);
  assert.doesNotMatch(read('./source-refs.js'), /HIGHLIGHT_EXPLAIN_COMMAND/);
  assert.doesNotMatch(listener, /startExplain/);
  const editor = read('./InlineAiEditor.jsx');
  assert.ok(editor.includes('useState(preset?.command ?? null)'), 'a preset with no command leaves the pill off');
  assert.ok(editor.includes("useState(preset?.command ? preset?.prompt ?? '' : '')"), 'CK-2: the passage is a pill, the box starts empty');
  // The bulb's passage (a preset with no command) is handled like highlighted words: no router (CK-3 decision 2026-11-14), Enter runs /explain, and no selection target is given for it (the minted ref rides heldPassageTarget).
  assert.ok(editor.includes("const overPassage = !!(highlight || (preset && !preset.command)) && !out.handoff"), 'the bulb passage is handled like highlighted words');
  assert.doesNotMatch(editor, /transport\.route/);
});

test('a command the router picks for the bulb passage still carries the minted ref and the passage (heldPassageTarget), once', async () => {
  const { typedOf } = await import('./agent/slash.js');
  const held = () => ({ current: { sourceRef: 'sref_1', text: 'the quote', at: 1000 } });
  // InlineAiEditor builds the router's line as `/${typedOf(name)} ${asked}` and hands it over with selection null (no highlight).
  for (const name of ['explain', 'explanation']) {
    const a = held();
    assert.deepEqual(heldPassageTarget(null, `/${typedOf(name)} why is this true`, a, 2000), { id: null, text: 'the quote', sourceRef: 'sref_1' }, name);
    assert.equal(a.current, null, 'used once');
  }
  const other = held();
  assert.equal(heldPassageTarget(null, `/${typedOf('image')} the quote`, other, 2000), null, 'another routed command leaves the hold for the next explain');
  assert.ok(other.current);
});


test('a Markdown selection offers the shared four-button toolbar (Ctrl+K, Add to chat, Highlight, Create note), and Add to chat only attaches', () => {
  const source = read('./FileDocMarkdown.jsx');
  const bar = source.slice(source.indexOf('<SelectionToolbar'));
  const row = bar.slice(0, bar.indexOf('/>') + 2);
  // UX-1: the old Explain bulb is the shared toolbar's Ctrl+K button and still calls explain(bar.quote); the order is the shared component's (selection-toolbar.test.mjs)
  assert.match(row, /data-file-doc-selection-toolbar onQuickAsk=\{\(\) => explain\(bar\.quote\)\} onAddToChat=\{\(\) => addToChat\(bar\.quote\)\}/);
  assert.match(row, /onHighlight=\{\(\) => highlight\(bar\.quote\)\} onNote=\{\(\) => createNote\(bar\.quote\)\}/);
  assert.doesNotMatch(source, /Lightbulb|label="Explain"/);
  const add = source.slice(source.indexOf('const addToChat'), source.indexOf('const remove = async'));
  assert.match(add, /quote\.exact\.length > EXCERPT_LIMIT/);
  assert.match(add, /chat\.addToChat\(selectionRef\(/);
  assert.doesNotMatch(add, /putHighlight|generate|send|startExplain/);
});

// CK-1, CK-2, CK-3 (release 144): the Markdown bulb's passage is placed and framed like highlighted words; the passage is a pill and the box starts empty; Explain selection makes its card directly.
test('CK-1: the bulb passage (a preset with its rect) is placed and framed like highlighted words; only the real Range is marked', () => {
  const editor = read('./InlineAiEditor.jsx');
  assert.ok(editor.includes('const bulbWords = useMemo(() => (!highlight && preset && !preset.command && preset.rect ?'));
  assert.ok(editor.includes('const words = highlight || bulbWords;'));
  assert.ok(editor.includes('const restore = canvas.frameWords(span, { w: W, h: FRAME_ROOM, gap: 10 });'));
  assert.ok(editor.includes('if (!words || !origin) return null;') && editor.includes('if (!highlight?.live) return undefined;'), 'the placement follows `words`; the mark needs the real Range');
});

test('CK-2: the passage is a pill (title: the full text) and the box starts empty; an empty box over a passage explains the passage', () => {
  const editor = read('./InlineAiEditor.jsx');
  assert.ok(editor.includes("const passageText = highlight?.text ?? (preset && !preset.command ? preset.prompt || '' : '');"));
  assert.ok(editor.includes("useState(preset?.command ? preset?.prompt ?? '' : '')"));
  assert.ok(editor.includes('{passageText && <span data-inline-chip title={passageText}'));
  assert.ok(editor.includes("const asked = String(prompt).trim() || passageText;"));
  assert.ok(editor.includes('!(outgoing.trim() || (passageText && !command))'), 'Enter and the Send button work with an empty box over a passage');
});

test('CK-3: Explain selection over a passage makes its card through /explain (skeleton, then the card), never a preview; a note, Edit and the paid proposal keep Accept / Reject; the router is not asked', () => {
  const editor = read('./InlineAiEditor.jsx');
  assert.ok(editor.includes("if (overPassage && config.handoff) {"));
  assert.ok(editor.includes("deliver(`/${typedOf('explanation')} ${asked}`,") && editor.includes('{ selection: highlight ? highlightSelection() : null })) { handedOff.current = true; onClose(); return; }'), 'the written /explain (id explanation), not /interactive');
  assert.ok(editor.includes("const autoCard = mode === 'explain' && state.preview?.kind === 'card' && !state.preview.extraction && !state.preview.sourceReadings;"), 'the inline card fallback is accepted by itself, except a card read from an image or from PDF pages (its uncertainties and readings are reviewed, release 146)');
  assert.ok(editor.includes("!busy(status) && !autoCard && (") && editor.includes("(preview && status !== 'proposal' && !autoCard) && ("), 'no Accept or Reject, no preview text, for that card only');
  assert.ok(editor.includes("preview?.kind === 'note'") && editor.includes("status === 'proposal' && ("), 'notes and the paid proposal keep their own review');
});

// CK-5: BOTH placement points of a card made from a passage call the shared placeSourced (right or left, level with the line, no overlap, nothing moves); CK-4 centres the camera on it.
test('CK-5: placeExplain (the Ctrl+K v2 job) places through placeSourced at the passage line, writes parentCard, and centres the camera; the highlight card goes there as near.alignY', () => {
  const canvas = read('./AdaptiveCanvas.jsx').replace(/\r\n/g, '\n'), page = read('./LearnPage.jsx').replace(/\r\n/g, '\n');
  const at = canvas.indexOf('placeExplain: (card,'), body = canvas.slice(at, canvas.indexOf('reconcileCad:', at));
  assert.ok(body.includes('placeSourced({ source: box, anchorY: line, size: slot,') && !body.includes('deliveredSpot('), 'one shared helper, no private spot');
  assert.ok(body.includes('Number.isFinite(near.alignY) ? box.y + near.alignY') && body.includes('parentCard: { id: source.id, color: nextArrowColor(blocksRef.current, source.id), dy: Math.round(line - box.y) }'));
  assert.ok(body.includes("pendingAt.current.set(added.id, { x: placed.x, y: placed.y })") && body.includes('revealAfter(added.id)'), 'placed once; the camera centres on it once measured');
  assert.ok(page.includes("near = null } = {}) => {") && page.includes('near: near || (sourceRef && passageSites.current.get(sourceRef)) || null'));
  assert.ok(page.includes('near: { cardId: about.selection.id, alignY: about.selection.alignY }'), 'the highlight card and the highlighted line reach placeExplain');
  const reserve = canvas.slice(canvas.indexOf('reserve: ({ label,'), canvas.indexOf('placeRoadmapCard:'));
  assert.ok(reserve.includes('placeSourced({ source, anchorY'), 'reserve({beside}) uses it too');
});

// CK-5 (release 146): the inline fallback card made from highlighted words is placed by placeSourced at the passage line and written with parentCard; notes and diagrams keep placeNote.
test('CK-5: the fallback card goes through placeSourced at the passage line, with parentCard on accept; only a CARD from a passage', () => {
  const editor = read('./InlineAiEditor.jsx').replace(/\r\n/g, '\n');
  assert.ok(editor.includes("import { placeSourced } from './place-sourced.js';"));
  assert.ok(editor.includes('if (forCard && passage) {') && editor.includes('placeSourced({ source: targetBox, anchorY: targetBox.y + passage.dy, size, boxes: obstaclesNow(target.ids), siblings: childrenOf(passage.id), id: forCard, sourceId: passage.id, area: null })'));
  assert.ok(editor.includes('const passage = highlight && target.ids?.length === 1 && highlight.id === target.ids[0] && Number.isFinite(highlight.alignY)'));
  assert.ok(editor.includes('placeFor(size, cardId(preview.requestId))') && editor.includes('placeFor(shown.size, isCard(preview) ? cardId(preview.requestId) : null)'), 'both card placement points');
  assert.ok(editor.includes('place, parent: place && passage ? passage : null })'), 'parentCard written when the card was placed at a passage');
  assert.ok(editor.includes('const spot = placeNote(targetBox, size, obstaclesNow(target.ids), canvas.visibleWorld());'), 'notes keep placeNote');
});

// Release 146: a Ctrl+K card from words inside ANY card (an Explanation, a webpage, a note, a text card), not only a Markdown file: nothing on the path asks for the card's type.
test('a highlight in a non-Markdown card takes the same path: picked by any card, placed by placeSourced, linked by parentCard, pill and no Accept', () => {
  const picked = read('./inline-highlight.js').replace(/\r\n/g, '\n'), canvas = read('./AdaptiveCanvas.jsx').replace(/\r\n/g, '\n'), editor = read('./InlineAiEditor.jsx').replace(/\r\n/g, '\n');
  const fn = picked.slice(picked.indexOf('export function pickedHighlight'), picked.indexOf('// The whole card as one context object'));
  assert.ok(fn.includes("host?.closest?.('[data-block-id]')") && !/block\.type|\.kind ===/.test(fn), 'any card with data-block-id and text the card can read (cardText)');
  const at = canvas.indexOf('placeExplain: (card,'), body = canvas.slice(at, canvas.indexOf('reconcileCad:', at));
  assert.ok(!/source\.type|source\.kind/.test(body), 'placeExplain asks nothing of the source card but its measured box');
  assert.ok(editor.includes('passageText && <span data-inline-chip') && editor.includes('const passage = highlight && target.ids?.length === 1'), 'the pill and the fallback placement need only a highlight');
});
