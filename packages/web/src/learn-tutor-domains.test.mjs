// Generic Tutor availability (Professor Next Steps Task 0, owner 2026-10-06): where the Tutor runs, and with which
// TutorDomain, comes from the declarative registry (learn-tutor-domains.js) and capability state - a live journey, a
// hole's parent journey, then a registered course by its repository, its board or a hole's root. No shared Tutor code
// asks "is this nanoGPT?". The pure resolver is driven over a matrix of canvases against the expression main had, and
// useTutor (LearnTutor.jsx) is bundled and rendered once on the server, as learn-journey-ui.test.mjs does. No network,
// no model, no Send.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { TUTOR_DOMAINS, registeredCourse, tutorContext } from './learn-tutor-domains.js';
import { NANOGPT } from './learn-tutor-claims.js';
import { TIDES } from './__fixtures__/journey-synthetic-domains.mjs';

const read = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const REPO = 'karpathy/nanoGPT', BOARD = 'nanogpt-attention-tutor';

// The canvases a Learn surface can be. courseCanvas: LearnPage's `learnPreview && !board` (the app's own canvas, no
// review board). parentJourney is only ever set from a record that carries a journey (LearnTutor.jsx diveJourney).
const J = { id: 'j1', state: 'active', registry: { concepts: {}, claims: {} }, intake: { slots: {} } };
const DIVE = { journey_id: 'j2', section_id: 's1', concept_ids: [], claim_ids: [] };
const CASES = [];
for (const courseCanvas of [true, false])
  for (const repo of [REPO, 'karpathy/minGPT', undefined])
    for (const board of ['main', BOARD, 'scratch'])
      for (const root of [undefined, { kind: 'repository', title: REPO }, { kind: 'repository', title: 'karpathy/minGPT' }, { kind: 'canvas', title: REPO }, { kind: 'canvas', board: BOARD }, { kind: 'canvas', board: 'main' }])
        for (const journey of [null, { journey: null }, { journey: J, path: null }])
          for (const hole of [{ parentJourney: null, record: null }, { parentJourney: null, record: { dive_id: 'canvas-0000hole', origin: {} } }, { parentJourney: { journey: { ...J, id: 'j2' }, path: null }, record: { dive_id: 'canvas-0000hole', journey: DIVE } }])
            CASES.push({ courseCanvas, app: { name: 'app', repo }, board, root, journey, ...hole });

// What main (f4b99a3b) decided, verbatim, as the oracle: LearnPage's `on` and LearnTutor's `active` and `domainOf`.
const mainActive = ({ courseCanvas, app, board, root, journey, parentJourney }) => {
  const on = courseCanvas && app.repo === REPO;
  return on || board === BOARD || root?.board === BOARD || (root?.kind === 'repository' && root.title === REPO) || !!journey?.journey || !!parentJourney;
};
const mainDomain = ({ journey, parentJourney, record }) => (journey?.journey ? 'journey' : parentJourney && record?.journey ? 'dive' : NANOGPT);
// useTutor's call (pinned below): the app is looked up only on its own course canvas. The Tutor these regressions compare
// is the typed one (capabilities.tutor); Ruling F4's canvas domain answers hook clicks only and is tested on its own below.
const typedTutor = context => (context?.capabilities?.tutor === true ? context : null);
const resolve = ({ courseCanvas, app, ...rest }, registry) => typedTutor(tutorContext({ ...rest, app: courseCanvas ? app : null }, registry));
const domainName = context => (context.domain.kind === 'journey' ? (context.domain.context.phase === 'dive' ? 'dive' : 'journey') : context.domain);
const kindOf = context => (typeof domainName(context) === 'string' ? domainName(context) : 'course');

test('regression 1: nanoGPT keeps the Tutor exactly where main gave it - same canvases, boards, holes and domain', () => {
  let active = 0;
  for (const c of CASES) {
    const context = resolve(c);
    assert.equal(!!context, mainActive(c), JSON.stringify(c));
    if (!context) continue;
    active++;
    assert.equal(domainName(context), mainDomain(c), JSON.stringify(c));
    assert.equal(context.capabilities.tutor, true);
  }
  assert.ok(active > 0 && active < CASES.length);
  // The four registered ways in, each alone.
  for (const where of [{ app: { repo: REPO } }, { board: BOARD }, { root: { kind: 'repository', title: REPO } }, { root: { kind: 'canvas', board: BOARD } }]) {
    const context = tutorContext(where);
    assert.equal(context.domain, NANOGPT, JSON.stringify(where));
    assert.deepEqual([context.source, context.capabilities.evidence], ['registry', 'session']);
  }
  // The supplied course content keys off the same entry (LearnPage suppliedCourse).
  assert.equal(registeredCourse({ app: { repo: REPO } })?.capabilities.suppliedCourse, true);
  assert.equal(registeredCourse({ app: { repo: 'karpathy/minGPT' } }), null);
});

// A second course nobody's code knows: registered only here, in the registry data.
const TIDES_DOMAIN = Object.freeze({ kind: 'tides-course', subject: TIDES.topic, ...TIDES.diagnostic.registry, evidence: { mode: 'session' } });
const OTHER = { id: 'tides', match: { repo: 'example/tides', board: 'tides-tutor' }, domain: TIDES_DOMAIN, capabilities: { tutor: true, evidence: 'session' } };
const swap = (value, from, to) => (value === from[0] ? to[0] : value === from[1] ? to[1] : value);
const rename = (c, from, to) => ({ ...c, app: { ...c.app, repo: swap(c.app.repo, from, to) }, board: swap(c.board, from, to),
  root: c.root && { ...c.root, ...(c.root.title ? { title: swap(c.root.title, from, to) } : {}), ...(c.root.board ? { board: swap(c.root.board, from, to) } : {}) } });

test('regression 2: a second course registered only in the registry data gets identical Tutor eligibility, no source change', () => {
  for (const c of CASES) {
    const nano = resolve(c), other = resolve(rename(c, [REPO, BOARD], ['example/tides', 'tides-tutor']), [OTHER]);
    assert.equal(!!other, !!nano, JSON.stringify(c));
    if (!nano) continue;
    assert.equal(kindOf(other), kindOf(nano), JSON.stringify(c));
    if (kindOf(nano) === 'course') assert.equal(other.domain, TIDES_DOMAIN);
    // Both registered: the nanoGPT canvases resolve exactly as before.
    const both = resolve(c, [...TUTOR_DOMAINS, OTHER]);
    assert.equal(kindOf(both), kindOf(nano));
    if (kindOf(nano) === 'course') assert.equal(both.domain, NANOGPT);
  }
  assert.equal(tutorContext({ app: { repo: 'example/tides' } }, [...TUTOR_DOMAINS, OTHER]).domain, TIDES_DOMAIN);
  assert.equal(tutorContext({ root: { kind: 'repository', title: 'example/tides' } }, [...TUTOR_DOMAINS, OTHER]).domain, TIDES_DOMAIN);
  assert.equal(tutorContext({ board: 'tides-tutor' }, [...TUTOR_DOMAINS, OTHER]).domain, TIDES_DOMAIN);
  assert.equal(typedTutor(tutorContext({ app: { repo: 'example/tides' } })), null, 'unregistered, the same course has no Tutor');
});

test('regression 3: an unsupported context stays unsupported through capability state - no entry, no domain, or tutor: false', () => {
  const entry = TUTOR_DOMAINS.find(e => e.domain === NANOGPT);
  const off = [[{ ...entry, capabilities: { ...entry.capabilities, tutor: false } }], [{ ...entry, domain: null }], [{ ...entry, capabilities: undefined }], []];
  for (const registry of off) {
    for (const c of CASES) {
      const context = resolve(c, registry);
      // Only a journey or a hole's parent journey (their own capability) still brings the Tutor.
      assert.equal(!!context, !!c.journey?.journey || !!c.parentJourney, JSON.stringify(c));
      if (context) assert.notEqual(context.domain, NANOGPT);
    }
  }
  for (const where of [{ app: { repo: 'karpathy/minGPT' } }, { app: {} }, { board: 'main' }, { root: { kind: 'repository', title: 'karpathy/minGPT' } }, { root: { kind: 'canvas', title: REPO } }, {}])
    assert.equal(typedTutor(tutorContext(where)), null, JSON.stringify(where));
  // An entry with no recognition data matches nothing (no undefined === undefined match).
  assert.equal(typedTutor(tutorContext({ app: {}, root: { kind: 'repository' } }, [{ id: 'blank', match: {}, domain: TIDES_DOMAIN, capabilities: { tutor: true } }])), null);
});

// Ruling F4 (Task 10): where no journey, hole journey or registered entry resolves, the canvas gets the canvas domain for hook
// clicks only - capabilities { tutor: false, hook_turns: true }, so typed text stays the Learn chat. A registered entry that
// refuses the Tutor stays off for hooks too. goal: a hole's learning_goal or title, else the canvas title; origin: the shared
// canvas a hole came from.
test('F4: a plain canvas or a plain hole gets the canvas domain for hook clicks only; a registered entry that refuses stays off', () => {
  const entry = TUTOR_DOMAINS.find(e => e.domain === NANOGPT);
  let canvas = 0, refused = 0;
  for (const registry of [TUTOR_DOMAINS, [{ ...entry, capabilities: { ...entry.capabilities, tutor: false } }], [{ ...entry, domain: null }], []]) {
    for (const c of CASES) {
      const where = { ...c, app: c.courseCanvas ? c.app : null };
      const context = tutorContext({ ...where, title: 'My canvas' }, registry), typed = resolve(c, registry);
      if (typed) { assert.deepEqual([context.source, context.capabilities, context.domain.kind], [typed.source, typed.capabilities, typed.domain.kind], JSON.stringify(c)); continue; }
      if (registeredCourse(where, registry)) { refused++; assert.equal(context, null, JSON.stringify(c)); continue; }
      canvas++;
      assert.deepEqual([context.source, context.capabilities, context.domain.kind, context.domain.contextKey], ['canvas', { tutor: false, hook_turns: true }, 'canvas', 'canvas_context'], JSON.stringify(c));
      assert.deepEqual(context.domain.context, { goal: c.record ? null : 'My canvas', origin: null }, JSON.stringify(c));
    }
  }
  assert.ok(canvas > 0 && refused > 0);
  // A hook_turns-only entry (Task 9) is still the registry's; plain canvases with no title have no goal.
  const hooksOnly = [{ ...OTHER, capabilities: { tutor: false, hook_turns: true } }];
  assert.deepEqual([tutorContext({ board: 'tides-tutor' }, hooksOnly).source, tutorContext({ board: 'main' }, hooksOnly).source], ['registry', 'canvas']);
  assert.deepEqual(tutorContext({}).domain.context, { goal: null, origin: null });
  // A hole from a shared canvas (the server names its root kind shared): its learning_goal leads and the share is its origin.
  const shared = { kind: 'shared', title: 'Bread science', app: 'share:0f0f', board: 'main' };
  const record = { dive_id: 'canvas-0000aaaa', title: 'Exploring from Bread science', learning_goal: 'Understand why rising dough traps gas', source: { title: 'Bread science' } };
  assert.deepEqual(tutorContext({ board: 'main', root: shared, record, title: 'x' }).domain.context, { goal: 'Understand why rising dough traps gas', origin: 'Bread science' });
});

test('regression 4: renamed course and domain ids change nothing - ids and kind labels are labels, never keys', () => {
  const renamed = TUTOR_DOMAINS.map(e => ({ ...e, id: 'course-7', domain: { ...e.domain, kind: 'renamed-kind', subject: 'another name' } }));
  const renamedOther = [{ ...OTHER, id: 'x', match: { repo: 'acme/other-repo', board: 'board-b' } }];
  for (const c of CASES) {
    const nano = resolve(c), again = resolve(c, renamed);
    assert.equal(!!again, !!nano, JSON.stringify(c));
    if (nano) {
      assert.deepEqual(again.capabilities, nano.capabilities);
      assert.equal(again.domain.claims, nano.domain.claims);
      assert.equal(again.source, nano.source);
    }
    // The second course's recognition ids renamed in its data and on the canvas alike: the same eligibility.
    assert.equal(!!resolve(rename(c, [REPO, BOARD], ['acme/other-repo', 'board-b']), renamedOther), !!nano, JSON.stringify(c));
  }
});

// ---- useTutor, bundled with the registry so both share one module: rendered once on the server (effects never run). ----
const here = fileURLToPath(new URL('.', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'tutor-domains-'));
const outfile = join(dir, 'tutor.cjs');
await esbuild.build({
  stdin: {
    contents: ["export { useTutor, hookContext } from './LearnTutor.jsx';", "export { TUTOR_DOMAINS } from './learn-tutor-domains.js';", "export { createElement } from 'react';", "export { renderToStaticMarkup } from 'react-dom/server';"].join('\n'),
    resolveDir: here, loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const bundled = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

function hook({ app, board = 'main', courseCanvas = false, root = null, record = { dive_id: 'canvas-0000hole', origin: {} }, navigator = null }) {
  let tutor = null;
  const dive = { tree: root ? { dive: record, path: [root, { title: 'hole' }] } : null, suggestionCard: null, navigator };
  const Page = () => {
    tutor = bundled.useTutor({ app: { name: 'app', org: 'o', email: 'e@x.com', ...app }, board, access: { app: 'app' }, canvasApi: { current: { blocks: () => [], block: () => null } }, canvasState: { card: null }, dive, courseCanvas, journey: null });
    return null;
  };
  bundled.renderToStaticMarkup(bundled.createElement(Page));
  return tutor;
}

test('regressions 1-3 through useTutor: nanoGPT canvases and holes get the Tutor; a course added to the registry data does too; tutor:false does not', async () => {
  const nano = { repo: REPO, kind: 'repository' };
  assert.equal(hook({ app: nano, courseCanvas: true }).active, true, 'the supplied course canvas');
  assert.equal(hook({ app: nano, courseCanvas: false, board: 'scratch' }).active, false, 'a review board on the course');
  assert.equal(hook({ app: {}, board: BOARD }).active, true, 'the slice board');
  assert.equal(hook({ app: {}, root: { kind: 'repository', title: REPO } }).active, true, 'a hole under the course');
  assert.equal(hook({ app: {}, root: { kind: 'canvas', board: BOARD } }).active, true, 'a hole under the slice board');
  assert.equal(hook({ app: { repo: 'karpathy/minGPT', kind: 'repository' }, courseCanvas: true }).active, false, 'another repository');
  assert.equal(hook({ app: {}, root: { kind: 'repository', title: 'karpathy/minGPT' } }).active, false);

  // The registry data is the only change: the same hook now serves the new course, and stops when the entry goes.
  bundled.TUTOR_DOMAINS.push(OTHER, { ...OTHER, id: 'closed', match: { repo: 'example/closed' }, capabilities: { tutor: false } });
  try {
    assert.equal(hook({ app: { repo: 'example/tides', kind: 'repository' }, courseCanvas: true }).active, true);
    assert.equal(hook({ app: {}, root: { kind: 'repository', title: 'example/tides' } }).active, true);
    assert.equal(hook({ app: { repo: 'example/closed', kind: 'repository' }, courseCanvas: true }).active, false, 'registered with tutor: false');
    assert.equal(hook({ app: nano, courseCanvas: true }).active, true);
  } finally { bundled.TUTOR_DOMAINS.splice(-2); }
  assert.equal(hook({ app: { repo: 'example/tides', kind: 'repository' }, courseCanvas: true }).active, false);
});

test('regression 1 through useTutor: on the nanoGPT course the composer is the Tutor - its routes, its store key, no journey context', async () => {
  const storage = new Map(), calls = [];
  const globals = {
    window: { dispatchEvent: () => true },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    localStorage: { getItem: () => null },
    fetch: async (path, options) => {
      calls.push({ path, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(path === '/api/learn/tutor/evaluate' ? { status: 'error', evaluator: 'jev', events: [] }
        : { strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'The mask hides later positions.' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    const tutor = hook({ app: { repo: REPO, kind: 'repository' }, courseCanvas: true });
    assert.equal(await tutor.ask({ raw: 'Why is the mask applied before softmax?' }), 'The mask hides later positions.');
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
  assert.ok(calls.length > 0 && calls.every(c => c.path.startsWith('/api/learn/tutor/')), JSON.stringify(calls.map(c => c.path)));
  const plan = calls.find(c => c.path === '/api/learn/tutor/plan');
  assert.equal(plan.body.context.journey_context, undefined);
  assert.deepEqual([...storage.keys()], ['small.tutor:o:e@x.com']);
});

// Ruling F4 through useTutor (Task 10): on a plain canvas and a hole from a shared canvas the composer stays the Learn chat
// (no ask, no voiceTurn), and a hook click is a next_step Tutor turn with canvas_context, in the canvas's own store.
test('F4 through useTutor: a plain canvas and a shared-canvas hole run hook clicks only, with canvas_context and their own store', async () => {
  const STEP = { v: 1, set_id: 'ns_0d0d0d0d', suggestion_id: 'ns_0d0d0d0d.3', basis: 'b', hook: 'Why does dough rise overnight?', learning_goal: 'Explain how yeast gas lifts dough', concept_ids: [], claim_ids: [], scope: 'owned' };
  const shared = { kind: 'shared', title: 'Bread science', app: 'share:0f0f', board: 'main' };
  const cases = [
    [{ app: { name: 'canvas-0000aaaa', title: 'Sourdough notes' } }, { goal: 'Sourdough notes', origin: null }, 'small.tutor:o:e@x.com:canvas:canvas-0000aaaa|main'],
    [{ app: { name: 'canvas-0000bbbb', title: 'Exploring from Bread science' }, root: shared, record: { dive_id: 'canvas-0000bbbb', title: 'Exploring from Bread science', origin: { parent: { app: 'share:0f0f', board: 'main' } }, source: { title: 'Bread science' } } },
      { goal: 'Exploring from Bread science', origin: 'Bread science' }, 'small.tutor:o:e@x.com:canvas:canvas-0000bbbb|main'],
  ];
  for (const [where, canvasContext, key] of cases) {
    const storage = new Map(), calls = [];
    const globals = {
      window: { dispatchEvent: () => true },
      sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, value) => storage.set(k, String(value)) },
      localStorage: { getItem: () => null },
      fetch: async (path, options) => {
        calls.push({ path, body: JSON.parse(options.body) });
        return new Response(JSON.stringify({ strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Yeast makes gas.' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    };
    const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    let tutor;
    try {
      tutor = hook({ ...where, app: { ...where.app } });
      assert.deepEqual([tutor.active, tutor.ask, tutor.voiceTurn, typeof tutor.askStep, 'extras' in tutor], [false, undefined, undefined, 'function', true], 'typed text stays the Learn chat');
      assert.equal(await tutor.askStep({ selected_next_step: STEP }), 'Yeast makes gas.');
      assert.deepEqual([tutor.snapshot().context.source, tutor.snapshot().store.turns.at(-1).next_step], ['canvas', STEP.suggestion_id]);
    } finally {
      for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    }
    assert.deepEqual(calls.map(c => c.path), ['/api/learn/tutor/plan'], 'no evaluate: a click writes no evidence');
    const { context } = calls[0].body;
    assert.deepEqual([context.canvas_context, 'journey_context' in context, context.learner_intent.kind], [canvasContext, false, 'next_step']);
    assert.deepEqual([...storage.keys()], [key], 'never the tab-wide nanoGPT store');
    assert.deepEqual(JSON.parse(storage.get(key)).events, []);
  }
});

// ---- Task 10 fix round 1 ----
// Owner eleventh message 1: a hole that may inherit a parent journey has no hook context while that read is pending; once it
// settles, the dive domain (found) or the canvas domain (refused). hookContext is what snapshot() returns.
test('hookContext: pending gives null; a settled refusal gives canvas; a settled parent journey gives dive; a plain hole never waits', () => {
  const J2 = { ...J, id: 'j2' };
  const record = { dive_id: 'canvas-0000hole', title: 'Hole', journey: DIVE };
  assert.equal(bundled.hookContext({ record, parentJourney: null }, null), null, 'pending');
  assert.equal(bundled.hookContext({ record, parentJourney: null }, 'canvas-0000other'), null, 'settled for another hole is still pending here');
  assert.equal(bundled.hookContext({ record, parentJourney: null, title: 'x' }, record.dive_id).source, 'canvas', 'settled refusal');
  assert.equal(bundled.hookContext({ record, parentJourney: { journey: J2, path: null } }, record.dive_id).source, 'dive', 'settled parent journey');
  assert.equal(bundled.hookContext({ record: { dive_id: 'canvas-0000hole', origin: {} }, parentJourney: null }, null).source, 'canvas', 'a record without a journey never waits');
  // useTutor before the read lands (effects never run under renderToStaticMarkup): no hook context.
  const t = hook({ app: { name: 'canvas-0000hole' }, root: { kind: 'canvas', title: 'Parent' }, record });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'), storage = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { value: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) }, configurable: true, writable: true });
  try { assert.equal(t.snapshot().context, null); } finally { if (saved) Object.defineProperty(globalThis, 'sessionStorage', saved); else delete globalThis.sessionStorage; }
});

// Owner eleventh message 4 and review item 3: a canvas-domain hole keeps the same Back up chip as any hole (hook-only extras
// draw the chips), and pressing it climbs to the parent.
test('a canvas-domain hole: a hook turn that returns from the dive shows Back up the Rabbit Hole in extras; pressing it climbs', async () => {
  const STEP = { v: 1, set_id: 'ns_0e0e0e0e', suggestion_id: 'ns_0e0e0e0e.1', basis: 'b', hook: 'What did the parent canvas leave open?', learning_goal: 'Return to the parent topic', concept_ids: [], claim_ids: [], scope: 'owned' };
  const climbs = [], navigator = { climb: i => climbs.push(i), tree: { path: [{ title: 'Bread science' }, { title: 'hole' }] } };
  const storage = new Map();
  const globals = {
    window: { dispatchEvent: () => true },
    sessionStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, value) => storage.set(k, String(value)) },
    localStorage: { getItem: () => null },
    fetch: async () => new Response(JSON.stringify({ strategy: 'none', constraints_add: [], actions: [{ type: 'respond_text', text: 'Back to the bigger picture.' }, { type: 'return_from_dive' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  };
  const saved = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  let tutor;
  try {
    tutor = hook({ app: { name: 'canvas-0000cccc', title: 'Exploring from Bread science' }, root: { kind: 'shared', title: 'Bread science', app: 'share:0f0f', board: 'main' }, record: { dive_id: 'canvas-0000cccc', title: 'Exploring from Bread science', origin: { parent: { app: 'share:0f0f', board: 'main' } } }, navigator });
    assert.equal(tutor.active, false);
    assert.equal(await tutor.askStep({ selected_next_step: STEP }), 'Back to the bigger picture.');
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
  const nodes = node => (!node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]);
  assert.match(bundled.renderToStaticMarkup(tutor.extras), /data-tutor-chips[\s\S]*Back up the Rabbit Hole/);
  nodes(tutor.extras).find(n => n.type === 'button' && n.props.children === 'Back up the Rabbit Hole').props.onClick();
  assert.deepEqual([climbs, tutor.extras], [[0], null], 'climbed to the parent; the chip is gone');
});

test('wiring: useTutor and LearnPage decide the Tutor only through the resolver; the registry holds the one nanoGPT entry', () => {
  const tutor = read('LearnTutor.jsx'), page = read('LearnPage.jsx'), registry = read('learn-tutor-domains.js');
  assert.match(tutor, /export function useTutor\(\{ app, board, access, canvasApi, canvasState, dive, courseCanvas = false, journey = null, canvasVersion = null \}\)/);
  assert.match(tutor, /const where = \{ app: courseCanvas \? app : null, board, root, parentJourney, record, title: app\.title \?\? null \};/);
  assert.match(tutor, /const context = tutorContext\(\{ \.\.\.where, journey \}\), capabilities = context\?\.capabilities;\n  const active = capabilities\?\.tutor === true, hookTurns = active \|\| capabilities\?\.hook_turns === true;/);
  assert.match(tutor, /const domainOf = canvas => tutorContext\(\{ \.\.\.where, journey: journeyRef\.current, blocks: canvas\?\.blocks\?\.\(\) \|\| \[\] \}\)\?\.domain;/);
  // Task 10 fix round 1: the parent read records the hole it settled for, snapshot() waits on it, and a rename rebuilds turn().
  assert.match(tutor, /diveJourney\(record, path => api\(path\)\)\.then\(found => \{ if \(current\) \{ setParentJourney\(found\); setParentRead\(record\.dive_id\); \} \}\);/);
  assert.match(tutor, /snapshot: \(\) => \(\{ context: hookContext\(\{ \.\.\.where, journey: journeyRef\.current, blocks: canvasApi\.current\?\.blocks\?\.\(\) \|\| \[\] \}, parentRead\),/);
  assert.match(tutor, /\}, \[access, record, here\.app, here\.board, key, parentJourney, courseCanvas, root, canvasVersion, app\.title\]\);/);
  assert.match(page, /const tutor = useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, courseCanvas: learnPreview && !board, journey \}\);/);
  assert.match(page, /const suppliedCourse = learnPreview && !!registeredCourse\(\{ app \}\)\?\.capabilities\?\.suppliedCourse;/);
  assert.equal(TUTOR_DOMAINS.filter(e => e.domain === NANOGPT).length, 1);
  assert.equal(registry.match(/'karpathy\/nanoGPT'/g).length, 1);
});
