// The roadmap components rendered from the recorded fixtures (esbuild bundle + react-dom/server, as answer-suggestions.test.mjs):
// the square pill, the overlay, the invitation, the ToC plan, Retry/Replace/Omit in both places, no price anywhere; and the pure
// placement geometry.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { chatOf, failuresOf, initialState, invitationOf, pillOf, reduce, tocOf } from './roadmap-client.js';
import { anchorState, deliveredSpot, overlayPosition } from './roadmap-placement.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const at = name => reduce(initialState(), { type: 'view', view: view(name) });

const tmp = mkdtempSync(join(tmpdir(), 'roadmap-view-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: {
    contents: "export { default as RoadmapInvitation } from './RoadmapInvitation.jsx'; export { default as RoadmapPlan } from './RoadmapPlan.jsx'; export { ProposalOverlay, NextStepIndicator, StepPill } from './NextStepPill.jsx'; export { useRoadmap } from './use-roadmap.js'; export { RoadmapChat, RoadmapToc, RoadmapCanvas } from './RoadmapSurfaces.jsx'; export { default as TableOfContents } from './TableOfContents.jsx'; export { default as TocConversation } from './TocConversation.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent', loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.png': 'empty', '.svg': 'empty' },
  plugins: [{ name: 'vite-url', setup(build) { build.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'vite-url' })); build.onLoad({ filter: /.*/, namespace: 'vite-url' }, () => ({ contents: 'export default ""' })); } }],
});
const lib = createRequire(import.meta.url)(outfile);
const html = (Component, props) => lib.renderToStaticMarkup(lib.createElement(Component, props));
const noop = () => {};
const BANNED = /\$|credit|cost|price|estimate|maximum|opus|sonnet|claude|token/i;

// Owner spec 2026-11-06 (pill 28px, 4px corners) and plan section 4.2 ("Remove the saturated green/red blocks"): supersedes the earlier square green/red pill.
test('the pill reads Accept [Tab] | Cancel: 28px, 4px corners, the selection bar small actions, no saturated colour, no price', () => {
  const markup = html(lib.StepPill, { pill: pillOf(at('status-active-proposal-pending')), onAccept: noop, onCancel: noop });
  assert.match(markup, /data-roadmap-pill="true"[^>]*class="inline-flex h-7[^"]* rounded border border-line/);
  assert.match(markup, /data-roadmap-accept="true"[^>]*h-7 cursor-pointer[^>]*>Accept<kbd[^>]*>Tab<\/kbd>/);
  assert.match(markup, /data-roadmap-cancel="true"[^>]*border-l[^>]*>Cancel</);
  assert.doesNotMatch(markup, /bg-(green|red)-|text-white/);
  assert.doesNotMatch(markup.replace(/<[^>]+>/g, ' '), BANNED);
});

test('a version that is not accept-ready keeps the Accept name, disabled', () => {
  const pill = { ...pillOf(at('status-active-proposal-pending')), accept: false };
  const markup = html(lib.StepPill, { pill, onAccept: noop, onCancel: noop });
  assert.match(markup, /data-roadmap-accept="true"[^>]*disabled/);
  assert.match(markup, />Accept</);
});

test('the overlay shows title, description and source relationship, is marked as the keyboard owner, and has no price text', () => {
  const pill = pillOf(at('status-active-proposal-pending'));
  const markup = html(lib.ProposalOverlay, { pill, position: { left: 10, top: 20, width: 280 }, onAccept: noop, onCancel: noop });
  assert.match(markup, /data-roadmap-overlay/);
  assert.match(markup, /What a gradient tells you/);
  assert.match(markup, /From Gradient descent notes\.md/);
  assert.doesNotMatch(markup.replace(/<[^>]+>/g, ' '), BANNED);
});

test('Next step ready indicator renders only with an indicator', () => {
  assert.equal(html(lib.NextStepIndicator, { indicator: null, onGo: noop }), '');
  assert.match(html(lib.NextStepIndicator, { indicator: { label: 'Next step ready' }, onGo: noop }), /data-roadmap-next-ready[^>]*>Next step ready</);
});

test('the invitation offers exactly the two choices; no other control', () => {
  const state = reduce(initialState(), { type: 'invitation', invitation: JSON.parse(readFileSync(DIR + 'invitation-offered.json', 'utf8')).response.body.invitation });
  const markup = html(lib.RoadmapInvitation, { invitation: invitationOf(state), lines: [], onExplain: noop, onKeep: noop, onAnswer: noop, onOffer: noop });
  assert.equal((markup.match(/<button/g) || []).length, 2);
  assert.match(markup, />Explain on canvas</);
  assert.match(markup, />Just keep it here</);
  assert.match(markup, /You’ve added \*\*Gradient descent notes\.md\*\*\. Would you like me to explain it on the canvas\?/);
  assert.equal(html(lib.RoadmapInvitation, { invitation: null, lines: [] }), '');
});

test('a failed card adds no recovery block to Chat or the Contents (the existing error toast carries its sentence)', () => {
  const state = at('status-failed-card');
  const chat = html(lib.RoadmapInvitation, { invitation: null, lines: chatOf(state), onExplain: noop, onKeep: noop, onAnswer: noop, onOffer: noop });
  const toc = html(lib.TableOfContents, { outline: [], canvasApi: { current: null }, roadmap: { toc: tocOf(state), go: noop } });
  assert.doesNotMatch(chat + toc, /data-roadmap-recover|>(Retry|Replace|Omit)</);
  assert.equal(failuresOf(state.view).length, 1);
});

test('no learner string anywhere has an ellipsis', () => {
  for (const name of ['status-proposed-plan', 'status-failed-card', 'status-held-for-checking', 'status-limitation', 'status-questioning', 'status-cancelled-paused']) {
    const state = at(name);
    const markup = html(lib.RoadmapInvitation, { invitation: null, lines: chatOf(state), onExplain: noop, onKeep: noop, onAnswer: noop, onOffer: noop }) + html(lib.TableOfContents, { outline: [], canvasApi: { current: null }, roadmap: { toc: tocOf(state), go: noop } });
    assert.doesNotMatch(markup, /\.\.\.|…|&hellip;/, name);
  }
});

test('placement: offscreen anchor flags the indicator, no anchor never does; the overlay stays inside the surface', () => {
  const surface = { left: 0, top: 0, width: 1000, height: 700 };
  assert.deepEqual(anchorState({ left: 100, top: 100, width: 200, height: 100 }, surface), { visible: true, offscreen: false });
  assert.deepEqual(anchorState({ left: 2000, top: 100, width: 200, height: 100 }, surface), { visible: false, offscreen: true });
  assert.deepEqual(anchorState(null, surface), { visible: true, offscreen: false });
  const below = overlayPosition({ left: 100, top: 100, width: 200, height: 100 }, surface);
  assert.equal(below.top, 208);
  const above = overlayPosition({ left: 100, top: 600, width: 200, height: 90 }, surface);
  assert.ok(above.top + 150 <= 600, 'above the anchor when below does not fit');
  const edge = overlayPosition({ left: 980, top: 100, width: 200, height: 100 }, surface);
  assert.ok(edge.left + edge.width <= 992);
});

test('delivered cards are placed around the anchor in free space, never on an obstacle', () => {
  const size = { w: 300, h: 200 };
  const spot = deliveredSpot(size, { x: 500, y: 400 }, [{ x: 350, y: 300, w: 300, h: 200 }]);
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  assert.equal(hit({ ...spot, ...size }, { x: 350, y: 300, w: 300, h: 200 }), false);
  const free = deliveredSpot(size, { x: 500, y: 400 }, []);
  assert.deepEqual(free, { x: 350, y: 300 }, 'centred on the anchor when free');
});

test('the hook and the three surfaces mount with nothing to show before the server answers (no flash, no price, no error)', () => {
  const Probe = () => {
    const roadmap = lib.useRoadmap({ api: async () => ({}), boardId: 'lb_1', host: {} });
    return lib.createElement('div', null, lib.createElement(lib.RoadmapChat, { roadmap }), lib.createElement(lib.RoadmapToc, {}), lib.createElement(lib.RoadmapCanvas, { roadmap }));
  };
  assert.equal(lib.renderToStaticMarkup(lib.createElement(Probe)), '<div></div>');
});

// UI.02 (file 01): the accepted roadmap is rows of the ONE Table of contents tree inside its one scroller: before the manual headings, with
// descriptions and a status line, manual entries untouched; no parameters, stopping point, actions, composer or conversation in any state.
test('Contents is one scroll and one tree: accepted roadmap rows, then the manual headings; no Tutor panel, draft, actions or composer in any state', () => {
  const noop = () => {};
  const outline = [{ id: 'h1', level: 1, label: 'First heading', description: 'mine', done: true }];
  const draw = state => html(lib.TableOfContents, { outline, canvasApi: { current: null }, className: 'min-h-0 flex flex-col overflow-y-auto', roadmap: { toc: tocOf(state), go: noop }, top: lib.createElement(lib.RoadmapToc, {}) });
  const toc = draw(at('status-active-proposal-pending'));
  assert.match(toc, /^<div data-toc="true" class="min-h-0 flex flex-col overflow-y-auto">/, 'the page-sized [data-toc] is the one scroller');
  assert.equal((toc.match(/overflow-y-auto/g) || []).length, 1, 'no nested scroller');
  const steps = at('status-active-proposal-pending').view.steps;
  for (const step of steps) assert.ok(toc.includes(`data-roadmap-step="${step.id}"`), step.id);
  assert.ok(toc.indexOf(`data-roadmap-step="${steps[0].id}"`) < toc.indexOf('data-toc-entry="h1"'), 'roadmap rows first, in the same tree');
  assert.match(toc, /data-toc-entry="h1"[^>]*data-done="true"/, 'the manual heading keeps its own done mark');
  assert.match(toc, /data-roadmap-status[^>]*>Proposed card · Explanation</);
  assert.match(toc, new RegExp(steps[0].goal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the step description, not a repeated title');
  for (const state of [at('status-proposed-plan'), at('status-active-proposal-pending'), at('status-completed'), at('status-cancelled-paused'), initialState(), { ...initialState(), flag: 'off' }]) {
    const markup = draw(state);
    assert.doesNotMatch(markup, /data-roadmap-plan|data-roadmap-parameters|data-roadmap-accept-plan|data-roadmap-edit-plan|data-roadmap-end|data-roadmap-propose-next|Stopping point|data-toc-composer|data-toc-conversation|Accept plan|Edit plan/);
  }
  assert.doesNotMatch(draw(at('status-proposed-plan')), /data-roadmap-step=/, 'a draft never reaches the ToC');
  assert.equal(html(lib.TocConversation, {}), '', 'no ToC conversation in any state');
});

test('Fix A: the proposal button reads Accepting while in flight; the status text follows the view, with no percentage or ellipsis', () => {
  const noop = () => {};
  const state = at('status-active-proposal-pending');
  const pressed = reduce(state, { type: 'begin', gesture: pillOf(state).gesture });
  const markup = html(lib.StepPill, { pill: pillOf(pressed), onAccept: noop, onCancel: noop });
  assert.match(markup, /data-roadmap-accept="true"[^>]* disabled=""[^>]*>Accepting</);
  assert.match(markup, /aria-busy="true"/);
  assert.doesNotMatch(markup, /<kbd/);
  assert.match(html(lib.StepPill, { pill: pillOf(state), onAccept: noop, onCancel: noop }), /<kbd[^>]*>Tab<\/kbd>/);
});
