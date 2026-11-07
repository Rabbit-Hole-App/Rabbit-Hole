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
    contents: "export { default as RoadmapInvitation } from './RoadmapInvitation.jsx'; export { default as RoadmapPlan } from './RoadmapPlan.jsx'; export { ProposalOverlay, NextStepIndicator, StepPill } from './NextStepPill.jsx'; export { useRoadmap } from './use-roadmap.js'; export { RoadmapChat, RoadmapToc, RoadmapCanvas } from './RoadmapSurfaces.jsx'; export { default as TableOfContents } from './TableOfContents.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';",
    resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
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
  assert.match(markup, /I can explain &quot;Gradient descent notes\.md&quot; on the canvas, step by step\./);
  assert.equal(html(lib.RoadmapInvitation, { invitation: null, lines: [] }), '');
});

test('the ToC plan: outcome, assumptions, steps, stopping point, Accept plan and Edit plan; no practice control', () => {
  const markup = html(lib.RoadmapPlan, { toc: tocOf(at('status-proposed-plan')), onAcceptPlan: noop, onEdit: noop, onProposeNext: noop, onEnd: noop, onGo: noop });
  for (const needle of ['data-roadmap-outcome', 'Assumptions', 'Stopping point', 'data-roadmap-accept-plan', 'data-roadmap-edit-plan', 'Explanations', 'data-roadmap-end']) assert.match(markup, new RegExp(needle));
  assert.doesNotMatch(markup, /data-roadmap-propose-next/);
  assert.doesNotMatch(markup, /practice/i);
  assert.doesNotMatch(markup.replace(/<[^>]+>/g, ' '), BANNED);
});

test('ToC steps navigate only where there is something to navigate to; paused offers Propose next step and End roadmap', () => {
  const delivered = html(lib.RoadmapPlan, { toc: tocOf(at('status-delivered-next-ready')), onAcceptPlan: noop, onEdit: noop, onProposeNext: noop, onEnd: noop, onGo: noop });
  assert.equal((delivered.match(/data-roadmap-go=/g) || []).length, 2, 'delivered card and pending proposal');
  const paused = html(lib.RoadmapPlan, { toc: tocOf(at('status-cancelled-paused')), onAcceptPlan: noop, onEdit: noop, onProposeNext: noop, onEnd: noop, onGo: noop });
  assert.match(paused, /data-roadmap-propose-next/);
  assert.match(paused, /data-roadmap-end/);
  assert.doesNotMatch(paused, /data-roadmap-accept-plan/);
});

test('a failed card adds no recovery block to Chat or the Contents (the existing error toast carries its sentence)', () => {
  const state = at('status-failed-card');
  const chat = html(lib.RoadmapInvitation, { invitation: null, lines: chatOf(state), onExplain: noop, onKeep: noop, onAnswer: noop, onOffer: noop });
  const toc = html(lib.RoadmapPlan, { toc: tocOf(state), onAcceptPlan: noop, onEdit: noop, onProposeNext: noop, onEnd: noop, onGo: noop });
  assert.doesNotMatch(chat + toc, /data-roadmap-recover/);
  assert.equal(failuresOf(state.view).length, 1);
});

test('no learner string anywhere has an ellipsis', () => {
  for (const name of ['status-proposed-plan', 'status-failed-card', 'status-held-for-checking', 'status-limitation', 'status-questioning', 'status-cancelled-paused']) {
    const state = at(name);
    const markup = html(lib.RoadmapInvitation, { invitation: null, lines: chatOf(state), onExplain: noop, onKeep: noop, onAnswer: noop, onOffer: noop }) + html(lib.RoadmapPlan, { toc: tocOf(state), onAcceptPlan: noop, onEdit: noop, onProposeNext: noop, onEnd: noop, onGo: noop });
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
    return lib.createElement('div', null, lib.createElement(lib.RoadmapChat, { roadmap }), lib.createElement(lib.RoadmapToc, { roadmap }), lib.createElement(lib.RoadmapCanvas, { roadmap }));
  };
  assert.equal(lib.renderToStaticMarkup(lib.createElement(Probe)), '<div></div>');
});

test('Contents is one scroll: the roadmap plan, its stopping point and actions sit inside the Table of contents scroller, before the headings; no second scroller', () => {
  const noop = () => {};
  const roadmap = state => ({ controller: {}, toc: tocOf(state), editPlan: noop, go: noop, acceptPlan: noop });
  const outline = [{ id: 'h1', level: 1, label: 'First heading', description: '', done: false }];
  const toc = html(lib.TableOfContents, { outline, canvasApi: { current: null }, className: 'min-h-0 flex flex-col overflow-y-auto', top: lib.createElement(lib.RoadmapToc, { roadmap: roadmap(at('status-proposed-plan')) }) });
  assert.match(toc, /^<div data-toc="true" class="min-h-0 flex flex-col overflow-y-auto">/, 'the page-sized [data-toc] is the one scroller');
  for (const needle of ['data-roadmap-plan', 'data-roadmap-outcome', 'Stopping point', 'data-roadmap-accept-plan', 'data-roadmap-edit-plan', 'data-roadmap-end']) assert.ok(toc.includes(needle), needle);
  assert.ok(toc.indexOf('data-roadmap-plan') < toc.indexOf('data-toc-entry="h1"'), 'the roadmap comes before the ordinary headings');
  assert.equal((toc.match(/overflow-y-auto/g) || []).length, 1, 'no nested scroller');
  assert.doesNotMatch(toc, /data-roadmap-scroll|max-h-\[50vh\]/);
  const markup = html(lib.RoadmapToc, { roadmap: roadmap(at('status-proposed-plan')) });
  assert.match(markup, />Accept plan</);
  assert.doesNotMatch(markup, /data-roadmap-accept-plan="true"[^>]* disabled=""/);
  const planned = at('status-proposed-plan');
  const busy = reduce(planned, { type: 'begin', gesture: `plan:${planned.view.roadmap.id}:${planned.view.plan.version}` });
  const pressed = html(lib.RoadmapToc, { roadmap: roadmap(busy) });
  assert.match(pressed, /data-roadmap-accept-plan="true"[^>]* disabled=""/);
  assert.match(pressed, />Accepting</);
  assert.equal(html(lib.RoadmapToc, { roadmap: { controller: {}, toc: null } }), '');
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
