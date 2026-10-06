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
// useTutor's call (pinned below): the app is looked up only on its own course canvas.
const resolve = ({ courseCanvas, app, ...rest }, registry) => tutorContext({ ...rest, app: courseCanvas ? app : null }, registry);
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
  assert.equal(tutorContext({ app: { repo: 'example/tides' } }), null, 'unregistered, the same course has no Tutor');
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
    assert.equal(tutorContext(where), null, JSON.stringify(where));
  // An entry with no recognition data matches nothing (no undefined === undefined match).
  assert.equal(tutorContext({ app: {}, root: { kind: 'repository' } }, [{ id: 'blank', match: {}, domain: TIDES_DOMAIN, capabilities: { tutor: true } }]), null);
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
    contents: ["export { useTutor } from './LearnTutor.jsx';", "export { TUTOR_DOMAINS } from './learn-tutor-domains.js';", "export { createElement } from 'react';", "export { renderToStaticMarkup } from 'react-dom/server';"].join('\n'),
    resolveDir: here, loader: 'jsx',
  },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
});
const bundled = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

function hook({ app, board = 'main', courseCanvas = false, root = null }) {
  let tutor = null;
  const dive = { tree: root ? { dive: { dive_id: 'canvas-0000hole', origin: {} }, path: [root, { title: 'hole' }] } : null, suggestionCard: null };
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

test('wiring: useTutor and LearnPage decide the Tutor only through the resolver; the registry holds the one nanoGPT entry', () => {
  const tutor = read('LearnTutor.jsx'), page = read('LearnPage.jsx'), registry = read('learn-tutor-domains.js');
  assert.match(tutor, /export function useTutor\(\{ app, board, access, canvasApi, canvasState, dive, courseCanvas = false, journey = null \}\)/);
  assert.match(tutor, /const where = \{ app: courseCanvas \? app : null, board, root, parentJourney, record \};/);
  assert.match(tutor, /const active = !!tutorContext\(\{ \.\.\.where, journey \}\);/);
  assert.match(tutor, /const domainOf = canvas => tutorContext\(\{ \.\.\.where, journey: journeyRef\.current, blocks: canvas\?\.blocks\?\.\(\) \|\| \[\] \}\)\?\.domain;/);
  assert.match(page, /const tutor = useTutor\(\{ app, board: boardName, access: askScope, canvasApi, canvasState, dive, courseCanvas: learnPreview && !board, journey \}\);/);
  assert.match(page, /const suppliedCourse = learnPreview && !!registeredCourse\(\{ app \}\)\?\.capabilities\?\.suppliedCourse;/);
  assert.equal(TUTOR_DOMAINS.filter(e => e.domain === NANOGPT).length, 1);
  assert.equal(registry.match(/'karpathy\/nanoGPT'/g).length, 1);
});
