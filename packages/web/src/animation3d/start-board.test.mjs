// /animation's board on a canvas whose board GET has not answered yet (owner review 2026-10-31): startAnimation waits for that
// GET, then saves only through LearnPage's board push queue (pushBoard), so it never sends a second version-0 PUT beside the
// hydration's autosave (the 409 the earlier force-save made). LearnPage is too large to mount: this runs its own source -
// the hydration effect, saveBoard, refused, pushBoard and startAnimation - against a fake board server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { submitCadOnce } from '../cad-client.js';
import { boardFromText, boardText, conflictBaseKey, serial, sharingOf } from '../canvas-persist.js';

const page = readFileSync(new URL('../LearnPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const between = (from, to) => {
  const start = page.indexOf(from), end = page.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `LearnPage.jsx still has ${from.slice(0, 40)}`);
  return page.slice(start, end);
};
const SOURCE = [
  between('const startAnimation = async', '// EXP-T21'),
  `const hydrate = () => {\n${between('    let live = true;\n    boardLoaded.current = false;', '  }, [boardPath, boardLoad]);')}};`,
  between('  const pushTimer = useRef(null);', '  // Reload and keep my document'),
].join('\n');

const later = () => { let done; const promise = new Promise(resolve => { done = resolve; }); return { promise, done }; };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

// A board server: one board, a version per save, 409 on a PUT not based on its version; it records overlapping PUTs.
function server({ exists, boardId = 'board-1', fail = null }) {
  const s = { version: exists ? 3 : 0, boardId: exists ? boardId : null, puts: [], conflicts: 0, inFlight: 0, maxInFlight: 0, get: later() };
  s.api = async (path, options = {}) => {
    if (!options.method) { await s.get.promise; return exists ? { exists: true, version: s.version, board_id: s.boardId, state: { blocks: [] }, sharing: { shared: false } } : { exists: false, sharing: { shared: false } }; }
    const { version } = JSON.parse(options.body);
    s.inFlight += 1; s.maxInFlight = Math.max(s.maxInFlight, s.inFlight);
    try {
      await settle(); await settle();
      s.puts.push(version);
      if (fail) throw Object.assign(new Error(fail.message), { status: fail.status });
      if (version !== s.version) { s.conflicts += 1; throw Object.assign(new Error('changed elsewhere'), { status: 409 }); }
      s.version += 1; s.boardId ||= boardId;
      return { version: s.version, board_id: s.boardId };
    } finally { s.inFlight -= 1; }
  };
  return s;
}

function mount(s, { local = { blocks: [{ id: 'kept-card' }] } } = {}) {
  const ref = value => ({ current: value });
  const creates = [];
  const store = new Map();
  const env = {
    api: s.api, board: null, boardPath: '/api/learn/boards/canvas/main', boardStorageKey: 'ink', versionKey: 'ink:version', chatKey: 'ink:chat',
    useRef: ref, useCallback: fn => fn, useEffect: () => {}, useState: init => [typeof init === 'function' ? init() : init],
    serial, sharingOf, boardText, boardFromText, conflictBaseKey, submitCadOnce,
    boardLoaded: ref(false), boardSynced: ref(null), boardUnsynced: ref(false), boardStopped: ref(false), boardRefused: ref(null),
    boardVersion: ref(null), conflictBase: ref(null), recoveries: ref(0), boardReady: ref(null), saveError: ref(null),
    commentBoardRef: ref(null), commentBoard: null, sharingRef: ref({ shared: false }), thumbs: ref(null), canvasApi: ref({ placeAnimation: card => card.id }),
    animationRequests: ref(new Map()), exchangesRef: ref([]), chat: null,
    boardSnapshot: () => local, browserStorage: () => ({}), readBoardCopy: () => local, readBoardVersion: () => null,
    hasLocalContent: () => (local.blocks || []).length > 0, blockedStorage: [], canvas: () => null, docSaved: () => true,
    unsavedKey: () => 'ink:unsaved', localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    window: { dispatchEvent: () => {} }, syncAssets: async () => true, requestWorkspaceExports: () => {},
    setSharing: () => {}, setCommentBoard: id => { env.commentBoard = id; }, setCanvasVersion: () => {}, setBoardChars: () => {}, setSaveState: () => {},
    setRestoredBoard: () => {}, setBoardLoad: () => {}, setDocConflict: () => {}, toast: () => {}, UNKEPT: 'not kept',
    animationClient: (_api, board) => ({ create: async body => { creates.push({ board, body }); await settle(); return { job: { id: `job-${creates.length}`, cardId: body.cardId } }; } }),
    withPrompt: card => card, withJob: (card, job) => ({ ...card, animation3dJob: job }), requestRef: async () => 'ref',
    // Real timers, 100x shorter: the 1.5 s autosave and the 10 s load wait keep their order against the GET below.
    setTimeout: (fn, ms, ...args) => setTimeout(fn, (ms || 0) / 100, ...args), clearTimeout,
  };
  const scope = new Proxy(env, { has: () => true, get: (target, key) => (key in target ? target[key] : globalThis[key]) });
  // eslint-disable-next-line no-new-func
  const run = new Function('scope', `with (scope) { ${SOURCE}\nreturn { hydrate, startAnimation, pushBoard }; }`)(scope);
  return { ...run, env, creates };
}

test('a never-saved canvas: /animation pressed twice while its GET is slow, beside the autosave, saves in turn and starts one job', async () => {
  const s = server({ exists: false });
  const page = mount(s);
  page.hydrate();
  assert.equal(page.pushBoard(), undefined, 'an autosave before the GET answers waits in this browser');
  const first = page.startAnimation('orbit of the moon'), second = page.startAnimation('orbit of the moon');
  await settle();
  assert.deepEqual(s.puts, [], 'nothing is saved before the board GET answers');
  page.pushBoard();
  s.get.done();
  const [a, b] = await Promise.all([first, second]);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(s.conflicts, 0, 'no self-inflicted 409');
  assert.equal(s.maxInFlight, 1, 'board PUTs never overlap');
  assert.deepEqual(s.puts, [0], 'one first save, at version 0; the later pushes find the server current');
  assert.equal(page.creates.length, 1, 'one job for the repeated press');
  assert.equal(page.creates[0].board, 'board-1', 'the job targets the board the save created');
  assert.equal(a.blockId, b.blockId);
  assert.equal(page.env.boardStopped.current, false);
});

test('a canvas the server already has: /animation waits for the slow GET, then starts on its board without saving', async () => {
  const s = server({ exists: true, boardId: 'board-9' });
  const page = mount(s, { local: { blocks: [] } });
  page.hydrate();
  const started = page.startAnimation('a pendulum');
  await settle();
  s.get.done();
  const result = await started;
  assert.ok(result.blockId);
  assert.deepEqual(s.puts, []);
  assert.equal(page.creates.length, 1);
  assert.equal(page.creates[0].board, 'board-9');
});

test('a save the server refuses: /animation says why, and starts nothing', async () => {
  const s = server({ exists: false, fail: { status: 413, message: 'This canvas is over the 1.9 MB limit.' } });
  const page = mount(s, { local: { blocks: [] } });
  page.hydrate();
  s.get.done();
  const result = await page.startAnimation('gears');
  assert.equal(result.failed, 'this canvas could not be saved: This canvas is over the 1.9 MB limit. (413)');
  assert.equal(page.creates.length, 0);
});

test('/animation shows the start refusal reason instead of a bare "could not be started"', () => {
  const slash = readFileSync(new URL('../learn-slash.js', import.meta.url), 'utf8');
  assert.match(slash, /The 3D animation could not be started\$\{started\?\.failed \? `: \$\{started\.failed\}` : ''\}\. Try again\./);
  assert.match(slash, /return started && !started\.failed \? \{ notice: \{ tone: 'done'/);
});
