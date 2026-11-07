// After Accept roadmap (production crash, undefined.left): render the real surfaces with the real hook's return and the recorded accepted-plan
// views, markup only, no browser. useRoadmap's own return feeds RoadmapCanvas and the Table of contents, so a missing field throws here.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { pillOf, tocOf } from './roadmap-client.js';
import { entriesOf, roadmapInvitationOf } from './roadmap-transcript.js';

const DIR = fileURLToPath(new URL('../../../docs/features/explain-on-canvas/contracts/fixtures/', import.meta.url));
const view = name => JSON.parse(readFileSync(DIR + name + '.json', 'utf8')).response.body;
const tmp = mkdtempSync(join(tmpdir(), 'roadmap-flow-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { useRoadmap } from './use-roadmap.js'; export { RoadmapCanvas } from './RoadmapSurfaces.jsx'; export { default as TableOfContents } from './TableOfContents.jsx'; export { EntryView } from './RoadmapTranscript.jsx'; export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);

// The hook as the page uses it (nothing fetched during markup rendering), its return captured.
function hookReturn() {
  let out;
  const Probe = () => { out = lib.useRoadmap({ api: async () => { throw new Error('no network in markup'); }, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host: {}, enabled: true }); return null; };
  lib.renderToStaticMarkup(lib.createElement(Probe));
  return out;
}
const seeded = name => {
  const state = { view: view(name), busy: [], editing: false, flag: 'on', notice: null, invitation: null, limitation: null, draft: null };
  return { state, pill: pillOf(state), toc: tocOf(state) };
};

test('the hook returns what RoadmapCanvas and the canvas overlay read', () => {
  const r = hookReturn();
  for (const key of ['position', 'surface', 'showOverlay', 'acceptPlan', 'go', 'toc', 'pill', 'controller', 'state']) assert.ok(key in r, `${key} is returned`);
  assert.equal(typeof r.position.left, 'number');
  assert.equal(typeof r.surface.width, 'number');
});

test('Accept roadmap, first proposal pending: the canvas overlay renders from the hook position, the ToC renders the accepted rows', () => {
  const base = hookReturn(), s = seeded('status-active-proposal-pending');
  assert.ok(s.pill, 'the accepted plan has a pending first proposal');
  const roadmap = { ...base, ...s, showOverlay: true, controller: base.controller };
  const canvas = lib.renderToStaticMarkup(lib.createElement(lib.RoadmapCanvas, { roadmap, hosted: false }));
  assert.match(canvas, /data-roadmap-overlay/);
  assert.ok(canvas.includes(s.pill.title));
  const toc = lib.renderToStaticMarkup(lib.createElement(lib.TableOfContents, { roadmap, outline: [], canvasApi: { current: null } }));
  assert.match(toc, /data-roadmap-step/);
  assert.ok(toc.includes(s.toc.steps[0].title));
});

test('every recorded status view renders on the canvas and in the ToC without throwing', () => {
  const base = hookReturn();
  for (const name of ['status-active-proposal-pending', 'status-delivered-next-ready', 'status-held-for-checking', 'status-failed-card', 'status-cancelled-paused', 'status-completed', 'status-proposed-plan', 'accept-proposal-response-generating']) {
    const s = seeded(name), roadmap = { ...base, ...s, showOverlay: !!s.pill };
    lib.renderToStaticMarkup(lib.createElement(lib.RoadmapCanvas, { roadmap, hosted: false }));
    lib.renderToStaticMarkup(lib.createElement(lib.TableOfContents, { roadmap, outline: [], canvasApi: { current: null } }));
  }
});

// Other ways the page could crash (review 2026-11-07): a result with no slot, a source ref with no source, a response that is not a full view, and
// a Tutor surface that throws while drawing (contained by SurfaceBoundary instead of the page crash screen).
test('a result without a slot, a source ref without a source and a partial response do not throw', async () => {
  const { createRoadmapController } = await import('./roadmap-controller.js');
  const delivered = view('status-delivered-next-ready');
  delivered.results = delivered.results.map(r => ({ ...r, slot: null }));
  const state = { view: delivered, busy: [], editing: false, flag: 'on', notice: null, invitation: null, limitation: null, draft: null };
  assert.doesNotThrow(() => tocOf(state));
  const pending = view('status-active-proposal-pending');
  pending.steps = pending.steps.map(s => ({ ...s, sourceRef: { ...s.sourceRef, source: undefined } }));
  const base = hookReturn(), s = { state: { ...state, view: pending }, pill: pillOf({ ...state, view: pending }), toc: tocOf({ ...state, view: pending }) };
  assert.doesNotThrow(() => lib.renderToStaticMarkup(lib.createElement(lib.RoadmapCanvas, { roadmap: { ...base, ...s, showOverlay: true } })));
  // A body that is not a full view (no steps, or a roadmap that is not an object) never replaces the view.
  for (const body of [{ roadmap: { id: 'x', state: 'active' } }, { roadmap: 'x', steps: [] }, { steps: [] }]) {
    const controller = createRoadmapController({ api: async () => body, boardId: 'lb_7c1e5a90d2b84f63a1c07e92', host: { hasBlock: () => false, insertCard: () => null, persist: async () => ({ ok: true }), boardRevision: () => 1, savedHas: () => false }, schedule: () => 1, cancel() {} });
    controller.start(); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(controller.getState().view, null, JSON.stringify(Object.keys(body)));
  }
});

test('every Tutor surface is drawn inside a SurfaceBoundary, so one throwing render never reaches the page crash screen', () => {
  const read = name => readFileSync(fileURLToPath(new URL('./' + name, import.meta.url)), 'utf8');
  for (const [file, artifact] of [['LearnPage.jsx', 'roadmap_canvas'], ['ask.jsx', 'tutor_entry'], ['AdaptiveCanvas.jsx', 'slot_card'], ['AdaptiveCanvas.jsx', 'next_card_pill'], ['LearningBlocks.jsx', 'explanation_card']]) {
    assert.ok(read(file).includes('<SurfaceBoundary ') && read(file).includes('artifact="' + artifact + '"'), file + ' wraps ' + artifact);
  }
  assert.match(read('TableOfContents.jsx'), /try \{ outline = withRoadmap\(/, 'a malformed roadmap never hides the ordinary outline');
});

// Chat invitation and draft (owner 2026-11-07): the buttons give way to ONE Generating roadmap shimmer while the first draft is written, and the draft's
// actions sit 12 px (pt-3) below the preview with 8 px (gap-2) between them, whatever the draft's length.
const INVITATION = { id: 'iv_1', title: 'en.md', sourceKeys: ['k'], state: 'offered' };
const entryOf = (state, kind, options = {}) => entriesOf(state, options).find(e => e.kind === kind);
const render = (entry, props = {}) => lib.renderToStaticMarkup(lib.createElement(lib.EntryView, { entry, live: true, run() {}, ...props }));
const count = (markup, text) => markup.split(text).length - 1;

test('Explain on canvas accepted: the invitation text stays, both buttons leave the layout, one Generating roadmap shimmer takes their place', () => {
  const idle = { view: null, busy: [], editing: false, flag: 'on', notice: null, invitation: INVITATION, limitation: null, draft: null };
  const before = render(entryOf(idle, 'invitation', { invitation: INVITATION }));
  assert.equal(count(before, '<button'), 2, 'idle: Explain on canvas and Keep here');
  assert.ok(!before.includes('data-roadmap-generating'));
  // The click is accepted (the create request is in flight).
  const creating = { ...idle, busy: ['create:iv_1'] };
  const during = render(entryOf(creating, 'invitation', { invitation: INVITATION }));
  assert.equal(count(during, '<button'), 0, 'no buttons in the layout or the tab order');
  assert.equal(count(during, 'Generating roadmap'), 1, 'one shimmer');
  assert.ok(during.includes('data-roadmap-generating') && during.includes('shimmer'));
  assert.ok(during.includes('en.md') || during.includes('data-roadmap-invitation'), 'the invitation text stays');
  // The saved invitation message while the first draft is written: shimmer, no buttons, and the draft entry draws nothing of its own.
  const drafted = { ...view('create-response-draft'), roadmap: { ...view('create-response-draft').roadmap, invitationId: 'iv_1' } };
  const drafting = { ...idle, invitation: null, view: drafted };
  const invitation = roadmapInvitationOf(drafting);
  assert.deepEqual(invitation, { invitationId: 'iv_1', first: true });
  const saved = { clientId: 'iv-entry', kind: 'invitation', content: 'Explain this?', tutor: { v: 1, kind: 'invitation', seq: 1, invitationId: 'iv_1' }, actions: [] };
  const stored = render(saved, { live: false, invitation });
  assert.equal(count(stored, '<button'), 0);
  assert.equal(count(stored, 'Generating roadmap'), 1);
  const pending = entryOf(drafting, 'draft');
  assert.ok(pending?.activity, 'the draft entry is the generating one');
  assert.equal(render(pending, { invitation }), '', 'and it draws no second indicator');
  // The draft arrives: the shimmer goes and the invitation shows no buttons; a failed or stopped generation also clears it.
  const arrived = roadmapInvitationOf({ view: { ...drafted, roadmap: { ...drafted.roadmap, state: 'proposed' } } });
  assert.deepEqual(arrived, { invitationId: 'iv_1', first: false });
  const after = render(saved, { live: false, invitation: arrived });
  assert.equal(count(after, 'Generating roadmap') + count(after, '<button'), 0);
  // A different invitation is untouched, and a later revision keeps the draft entry's own indicator.
  assert.equal(count(render({ ...saved, tutor: { ...saved.tutor, invitationId: 'iv_0' } }, { live: false, invitation }), 'Generating roadmap'), 0);
  assert.equal(roadmapInvitationOf({ view: { ...drafted, planDraft: { version: 1 } } }).first, false);
});

test('the draft actions sit 12 px under the preview and 8 px apart, outside it, for a short and a long roadmap', () => {
  for (const steps of [1, 14]) {
    const base = view('status-proposed-plan');
    const draftView = { ...base, steps: Array.from({ length: steps }, (_, i) => ({ ...base.steps[i % base.steps.length], id: 'st_' + i, title: 'Step ' + i })), plan: { ...base.plan, steps: Array.from({ length: steps }, (_, i) => ({ ...base.plan.steps[i % base.plan.steps.length], title: 'Step ' + i })) } };
    const state = { view: draftView, busy: [], editing: false, flag: 'on', notice: null, invitation: null, limitation: null, draft: null };
    const entry = entryOf(state, 'draft');
    assert.ok(entry?.draft && entry.actions.length === 2, steps + ' steps: a draft with Accept roadmap and Edit roadmap');
    const markup = render(entry);
    const wrapper = markup.match(/data-roadmap-actions="[^"]*" class="([^"]*)"/);
    assert.ok(wrapper, 'the action row is its own wrapper');
    assert.match(wrapper[1], /\bpt-3\b/, '12 px from the preview border');
    assert.match(wrapper[1], /\bgap-2\b/, '8 px between the buttons');
    assert.doesNotMatch(wrapper[1], /\b(pt-1|gap-1\.5|-mt-|mt-)/);
    const plan = markup.indexOf('data-roadmap-steps'), actions = markup.indexOf('data-roadmap-actions');
    assert.ok(plan > 0 && actions > plan, 'the buttons follow the preview, outside it');
    assert.ok(markup.slice(markup.indexOf('data-roadmap-actions')).split('</div>')[0].includes('Accept roadmap'));
    assert.ok(!markup.slice(plan, actions).includes('Accept roadmap'), 'not inside the preview');
  }
});
