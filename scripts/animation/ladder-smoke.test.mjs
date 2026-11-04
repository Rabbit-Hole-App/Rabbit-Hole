// Tests for ladder-smoke.mjs and bundle-probe.mjs with fake runners: no test suite is really run, no network, no browser.
//   node --test scripts/animation/ladder-smoke.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLICES, itemsFor, parseArgs, runSmoke } from './ladder-smoke.mjs';
import { LADDER_FEATURES, declares, dirReader, probeBundle, scanBundle } from './bundle-probe.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '../..');
const SHA = 'a'.repeat(40);
const PASSING = '# tests 3\n# pass 3\n# fail 0\n';
const cfg = (items, extra = {}) => ({ flags: ['f1', 'f2'], golden: 'g.json', mvp3: { title: 't', items }, ...extra });
// A fake world: `files` is the set of existing paths (joined with root), `runs` records the commands, `out` is what each run prints.
function fakeIo({ files = [], dirs = {}, out = PASSING, code = 0, head = SHA, probe, scan, get = 200 } = {}) {
  const runs = [];
  return {
    runs, root: '/r', exists: p => files.includes(p.replace(/\\/g, '/')) || files.some(f => f.startsWith(`${p.replace(/\\/g, '/')}/`)),
    list: d => dirs[d.replace(/\\/g, '/')] ?? [], head: () => head, readText: () => 'session=abc',
    run: (cmd, args, o) => { runs.push({ cmd, args, o }); return { code, out }; },
    probe: probe ?? (async () => ({ chunks: 4, card: ['/static/Animation3DCard-x.js'], declaredIn: ['/static/Animation3DCard-x.js'], unreadable: [] })),
    scan: scan ?? (async () => ({ chunks: 4, card: ['c'], hits: {} })), get: async () => get,
  };
}
const run = (items, opts, io, extra) => runSmoke('mvp3', { config: cfg(items, extra), ...opts }, io);
const line = (r, id) => r.lines.find(l => l.replace(/^(PASS|FAIL|SKIP|INFO)\s+/, '').startsWith(`${id}:`) || l.replace(/^(PASS|FAIL|SKIP|INFO)\s+/, '').startsWith(`${id} `));

test('every test file passes: PASS lines, summary, exit 0', async () => {
  const io = fakeIo({ files: ['/r/p/a.test.js', '/r/p/b.test.js'] });
  const r = await run([{ id: 'u', label: 'unit', kind: 'tests', cwd: 'p', files: ['a.test.js', 'b.test.js'] }], {}, io);
  assert.equal(r.code, 0);
  assert.match(line(r, 'u'), /^PASS/);
  assert.match(r.lines.at(-1), /^SMOKE mvp3 PASS: 1 pass, 0 fail, 0 skip$/);
  assert.deepEqual(io.runs[0].args, ['--test', 'a.test.js', 'b.test.js']);
});

test('a required test file that is missing fails before anything runs; an exit-0 run of 0 tests fails; a failing run fails', async () => {
  let io = fakeIo({ files: ['/r/p/a.test.js'] });
  let r = await run([{ id: 'u', label: 'x', kind: 'tests', cwd: 'p', files: ['a.test.js', 'gone.test.js'] }], {}, io);
  assert.equal(r.code, 1); assert.match(line(r, 'u'), /FAIL.*gone\.test\.js/); assert.equal(io.runs.length, 0, 'nothing ran');
  io = fakeIo({ files: ['/r/p/a.test.js'], out: '# tests 0\n# fail 0\n' });
  r = await run([{ id: 'u', label: 'x', kind: 'tests', cwd: 'p', files: ['a.test.js'] }], {}, io);
  assert.equal(r.code, 1); assert.match(line(r, 'u'), /0 tests ran/);
  io = fakeIo({ files: ['/r/p/a.test.js'], code: 1, out: '# tests 3\n# fail 1\nnot ok 2 - boom\n' });
  r = await run([{ id: 'u', label: 'x', kind: 'tests', cwd: 'p', files: ['a.test.js'] }], {}, io);
  assert.equal(r.code, 1); assert.match(line(r, 'u'), /1 failing of 3.*not ok 2 - boom/);
});

test('an optional test that is not in the candidate is a loud SKIP, never a PASS; --strict makes it a FAIL', async () => {
  const items = [{ id: 'o', label: 'optional', kind: 'tests', cwd: 'p', optional: true, files: ['test/animation-*stream*.test.js'] }];
  const io = fakeIo({ dirs: { '/r/p/test': ['animation-job.test.js'] } });
  let r = await run(items, {}, io);
  assert.equal(r.code, 0); assert.match(line(r, 'o[missing]'), /not in this candidate/); assert.ok(r.lines.some(l => /^SKIP\s+o\[missing\]/.test(l))); assert.match(r.lines.at(-1), /PASS WITH SKIPS: 0 pass, 0 fail, 1 skip/); assert.ok(r.lines.some(l => /NOT PASSES/.test(l)));
  r = await run(items, { strict: true }, io);
  assert.equal(r.code, 1); assert.match(r.lines.at(-1), /SMOKE mvp3 FAIL/);
  // a glob that matches is run
  const io2 = fakeIo({ dirs: { '/r/p/test': ['animation-x-stream-y.test.js', 'other.test.js'] }, files: ['/r/p/test/animation-x-stream-y.test.js'] });
  r = await run(items, {}, io2);
  assert.equal(r.code, 0); assert.deepEqual(io2.runs[0].args, ['--test', 'test/animation-x-stream-y.test.js']);
});

test('script items: pass, fail, optional script missing is a SKIP, ${sha} fills from the command line', async () => {
  const items = [{ id: 'sc', label: 'x', kind: 'script', cmd: 'node', args: ['s.mjs', '${sha}'], file: 's.mjs' }];
  let r = await run(items, { sha: SHA }, fakeIo({ files: ['/r/s.mjs'] }));
  assert.equal(r.code, 0); assert.match(line(r, 'sc'), /exit 0/);
  r = await run(items, { sha: SHA }, fakeIo({ files: ['/r/s.mjs'], code: 3, out: 'bad\n' }));
  assert.equal(r.code, 1); assert.match(line(r, 'sc'), /exit 3: bad/);
  r = await run(items, { sha: SHA }, fakeIo({ files: [] }));
  assert.equal(r.code, 0); assert.match(line(r, 'sc[missing]'), /not in this candidate/);
  r = await run(items, {}, fakeIo({ files: ['/r/s.mjs'] }));
  assert.match(line(r, 'sc[live]'), /needs \$\{sha\}/);
});

test('bundle items: local declared passes, not declared fails, the live item needs --origin (--require-live fails without)', async () => {
  const items = [{ id: 'b', label: 'x', kind: 'bundle', dir: 'dist', features: '${flags}' }, { id: 'l', label: 'x', kind: 'bundle', origin: true, features: '${flags}' }];
  let io = fakeIo({ files: ['/r/dist'] });
  let r = await run(items, {}, io);
  assert.match(line(r, 'b'), /^PASS.*f1,f2 declared in/); assert.match(line(r, 'l[live]'), /^SKIP/); assert.equal(r.code, 0);
  r = await run(items, { requireLive: true }, io);
  assert.equal(r.code, 1);
  io = fakeIo({ files: ['/r/dist'], probe: async () => ({ chunks: 4, card: ['c'], declaredIn: [], unreadable: [] }) });
  r = await run(items.slice(0, 1), {}, io);
  assert.equal(r.code, 1); assert.match(line(r, 'b'), /FAIL.*declared nowhere/);
  io = fakeIo({ files: ['/r/dist'], probe: async () => ({ chunks: 4, card: [], declaredIn: ['x'], unreadable: [] }) });
  r = await run(items.slice(0, 1), {}, io);
  assert.match(line(r, 'b'), /FAIL.*NOT reached/, 'a walk that never reached the Animation card is blind and fails');
});

test('copy items: a stale phrase still in a chunk fails, a missing claim fails, clean passes', async () => {
  const items = [{ id: 'c', label: 'x', kind: 'copy', dir: 'dist', absent: ['stale'], present: ['claim'] }];
  const files = ['/r/dist'];
  let r = await run(items, {}, fakeIo({ files, scan: async () => ({ chunks: 3, card: ['c'], hits: { stale: ['/static/a.js'], claim: ['/static/a.js'] } }) }));
  assert.equal(r.code, 1); assert.match(line(r, 'c'), /still present: \/stale\/ in \/static\/a\.js/);
  r = await run(items, {}, fakeIo({ files, scan: async () => ({ chunks: 3, card: ['c'], hits: { stale: [], claim: [] } }) }));
  assert.match(line(r, 'c'), /absent: \/claim\//);
  r = await run(items, {}, fakeIo({ files, scan: async () => ({ chunks: 3, card: ['c'], hits: { stale: [], claim: ['/static/a.js'] } }) }));
  assert.equal(r.code, 0); assert.match(line(r, 'c'), /^PASS/);
});

test('the browser check is printed and SKIPPED, never a PASS, unless --browser with a stack that answers; --require-browser fails the skip', async () => {
  const items = [{ id: 'br', label: 'browser', kind: 'browser', file: 'e2e/x.mjs', cmd: 'BASE=x node e2e/x.mjs ${stack}/shots' }];
  const files = ['/r/e2e/x.mjs'];
  let r = await run(items, {}, fakeIo({ files }));
  assert.match(line(r, 'br[browser]'), /^SKIP.*NOT RUN, NOT A PASS.*node e2e\/x\.mjs <stack persist dir>\/shots/); assert.equal(r.code, 0);
  r = await run(items, { requireBrowser: true }, fakeIo({ files }));
  assert.equal(r.code, 1);
  r = await run(items, { browser: true, stack: '/s' }, fakeIo({ files, get: 'error' }));
  assert.match(line(r, 'br[browser]'), /no local stack answers/);
  const io = fakeIo({ files });
  r = await run(items, { browser: true, stack: '/s' }, io);
  assert.equal(r.code, 0); assert.match(line(r, 'br'), /^PASS/); assert.equal(io.runs[0].cmd, 'bash'); assert.match(io.runs[0].args[1], /node e2e\/x\.mjs \/s\/shots/);
  r = await run(items, {}, fakeIo({ files: [] }));
  assert.match(line(r, 'br[missing]'), /not in this candidate/);
});

test('route items: the status must be in the expected set; the cookie is read but never printed', async () => {
  const items = [{ id: 'ro', label: 'route', kind: 'route', path: '/api/x', expect: [401] }, { id: 'rc', label: 'signed in', kind: 'route', cookie: true, path: '/api/y', expect: [200, 404] }];
  let r = await run(items, { origin: 'https://rabbit-hole-web-dev-x.tryrabbithole.workers.dev', cookieFile: '/c' }, fakeIo({ get: 401 }));
  assert.match(line(r, 'ro'), /^PASS/); assert.match(line(r, 'rc'), /FAIL.*401.*cookie was not accepted/);
  r = await run(items, { origin: 'https://rabbit-hole-web-dev-x.tryrabbithole.workers.dev', cookieFile: '/c' }, fakeIo({ get: 502 }));
  assert.equal(r.code, 1);
  assert.ok(!r.lines.join('\n').includes('session=abc'), 'the cookie never appears in the output');
  r = await run(items, {}, fakeIo());
  assert.match(line(r, 'ro[live]'), /^SKIP/);
});

test('the pinned --sha must be the checkout head; --live-only keeps only the items that read the served clone', async () => {
  let r = await run([], { sha: 'b'.repeat(40) }, fakeIo());
  assert.equal(r.code, 1); assert.match(line(r, 'identity'), /FAIL.*not the pinned/);
  r = await run([], { sha: SHA }, fakeIo());
  assert.match(line(r, 'identity'), /PASS/);
  const items = [{ id: 'u', label: 'x', kind: 'note', text: 't' }, { id: 'l', label: 'x', kind: 'bundle', origin: true, features: ['f1'] }, { id: 'r', label: 'x', kind: 'route', path: '/p', expect: [200] }];
  r = await run(items, { liveOnly: true, origin: 'https://rabbit-hole-web-dev-x.tryrabbithole.workers.dev' }, fakeIo());
  assert.deepEqual(r.lines.filter(l => /^(PASS|FAIL|SKIP|INFO)/.test(l)).map(l => l.split(':')[0].split(/\s+/)[1]), ['l', 'r']);
});

test('arguments: production, the shared worker and a bad sha are refused; a clone origin is accepted', () => {
  assert.throws(() => parseArgs(['mvp3', '--origin', 'https://digrabbithole.com']), /isolated/);
  assert.throws(() => parseArgs(['mvp3', '--origin', 'https://small-cp-dev.zeroshothq.workers.dev']), /isolated/);
  assert.throws(() => parseArgs(['mvp3', '--sha', 'abc']), /40-character/);
  assert.throws(() => parseArgs(['mvp3', '--bogus']), /unknown argument/);
  assert.throws(() => parseArgs(['mvp3', '--origin']), /needs a value/);
  const o = parseArgs(['mvp3', '--origin', 'https://rabbit-hole-web-dev-ladder-smoke.tryrabbithole.workers.dev', '--strict', '--cookie-file', 'c.txt', '--browser']);
  assert.deepEqual([o.slice, o.strict, o.cookieFile, o.browser], ['mvp3', true, 'c.txt', true]);
});

test('the shipped ladder-smoke.json: four slices, unique ids, known kinds, and every REQUIRED test file exists in this checkout', () => {
  const config = JSON.parse(readFileSync(join(HERE, 'ladder-smoke.json'), 'utf8'));
  assert.deepEqual(config.flags, LADDER_FEATURES);
  const kinds = new Set(['note', 'exists', 'tests', 'script', 'bundle', 'copy', 'route', 'browser', 'gate2']);
  const lands = Object.values(config.landsWith).flat(); // required files that arrive with a lane that is not on main yet
  for (const p of lands) assert.equal(existsSync(join(ROOT, p)), false, `${p} is in main now: remove it from landsWith`);
  for (const slice of SLICES) {
    const ids = config[slice].items.map(i => i.id);
    assert.equal(new Set(ids).size, ids.length, `${slice}: ids unique`);
    for (const item of config[slice].items) {
      assert.ok(kinds.has(item.kind), `${slice}.${item.id}: kind ${item.kind}`);
      const required = item.kind === 'tests' && !item.optional ? item.files.filter(f => !f.includes('*')).map(f => `${item.cwd}/${f}`.replace(/^\.\//, '')) : item.kind === 'exists' ? item.paths.map(p => p.replace('${golden}', config.golden)) : [];
      for (const p of required) assert.ok(existsSync(join(ROOT, p)) || lands.includes(p), `${slice}.${item.id}: ${p} must exist (or be listed in landsWith with its lane, or mark the item optional)`);
    }
  }
  assert.ok(config.mvp3.items.some(i => i.id === 'old-client-409'), 'MVP3 always includes the old-client 409 path');
  assert.ok(config.mvp3.items.some(i => i.id === 'browser-primitives'), 'MVP3 names the golden-fixture browser check');
});

test('bundle probe: declares() needs the five quoted together near the anchor, not the word clamp elsewhere', () => {
  const declared = 'x=["curve_radius","action_motion","surface_grid","trail_points","text_readout","arrow_anchor","clamp"];y=1';
  assert.equal(declares(declared, LADDER_FEATURES), true);
  assert.equal(declares('x=["curve_radius","action_motion"];Math.clamp=1;function clamp(){}', LADDER_FEATURES), false, 'the previous release does not declare them');
  assert.equal(declares(`${'a'.repeat(3000)}"surface_grid","trail_points","text_readout","arrow_anchor","clamp"${'b'.repeat(3000)};["curve_radius"]`, LADDER_FEATURES), false, 'names far from the anchor array do not count');
});

test('bundle probe: walks a built directory, finds the card chunk and the declaring array; scanBundle reports which chunks match', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ladder-bundle-'));
  try {
    mkdirSync(join(dir, 'static'));
    writeFileSync(join(dir, 'index.html'), '<script type="module" src="/static/index-1.js"></script>');
    writeFileSync(join(dir, 'static/index-1.js'), 'import("./Animation3DCard-2.js");import("./caps-3.js");const t="works best for mechanisms";');
    writeFileSync(join(dir, 'static/Animation3DCard-2.js'), 'export default 1;const copy="loss surfaces and optimizers are not supported yet";');
    writeFileSync(join(dir, 'static/caps-3.js'), 'export const F=["curve_radius","action_motion","surface_grid","trail_points","text_readout","arrow_anchor","clamp"];');
    const read = dirReader(dir);
    const p = await probeBundle({ read, entry: 'index.html' });
    assert.deepEqual([p.chunks, p.card, p.declaredIn], [3, ['/static/Animation3DCard-2.js'], ['/static/caps-3.js']]);
    const s = await scanBundle({ read, entry: 'index.html', patterns: ['loss surfaces?[^"\'`]{0,80}not (yet )?supported', 'works best for'] });
    assert.deepEqual(s.hits['loss surfaces?[^"\'`]{0,80}not (yet )?supported'], ['/static/Animation3DCard-2.js']);
    assert.deepEqual(s.hits['works best for'], ['/static/index-1.js']);
    const none = await probeBundle({ read: dirReader(join(dir, 'missing')), entry: 'index.html' });
    assert.equal(none.noEntry, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('script items: ${gate2args} expands to separate arguments, and the item is a SKIP without --gate2-args', async () => {
  const items = [{ id: 'g', label: 'gate2 check', kind: 'script', cmd: 'node', args: ['q.mjs', '--check', '${gate2args}'], file: 'q.mjs' }];
  const io = fakeIo({ files: ['/r/q.mjs'] });
  let r = await run(items, { gate2Args: '--base https://x --cap 10' }, io);
  assert.equal(r.code, 0); assert.deepEqual(io.runs[0].args, ['q.mjs', '--check', '--base', 'https://x', '--cap', '10']);
  r = await run(items, {}, fakeIo({ files: ['/r/q.mjs'] }));
  assert.match(line(r, 'g[live]'), /^SKIP.*needs \$\{gate2args\}/);
  assert.equal(parseArgs(['mvp5', '--gate2-args', '--base x']).gate2Args, '--base x');
});

// ---- Gate 2 result as the MVP5 smoke input, and the combined slice (owner decision 23) ----
const X = 'd'.repeat(40), HEAD2 = 'e'.repeat(40);
const rowsOf = (accepted = 9, control = { outcome: 'gap', silentSgd: false }) => [...Array.from({ length: 9 }, (_, i) => ({ n: i + 1, outcome: i < accepted ? 'accepted' : 'rejected' })), { n: 10, ...control }];
const result = (over = {}) => JSON.stringify({ sha: X, version: 'v-preview', verdict: 'PASS', rows: rowsOf(), ...over });
const FROZEN = ['packages/web/src/animation3d/scene.js', 'packages/control-plane/src/agents/**'];
function gateIo({ json = result(), ancestor = true, changed = ['packages/web/src/agent/slash.js', 'docs/features/animation/fix.md'], head = HEAD2, names = ['result-ddddddd-20261103180000.json', 'result-ddddddd-20261103170000.json'] } = {}) {
  const io = fakeIo({ head });
  io.readText = p => { io.read = p; return json; };
  io.list = () => names;
  io.run = (cmd, args) => (args[0] === 'merge-base' ? { code: ancestor ? 0 : 1, out: '' } : { code: 0, out: changed.join('\n') });
  return io;
}
const gate = (opts, io) => run([{ id: 'g2', label: 'gate 2', kind: 'gate2', frozen: FROZEN }], opts, io);

test('gate2 item: a recorded PASS for an ancestor that changed nothing Gate 2 measured passes and lists what changed', async () => {
  const r = await gate({ gate2Result: '/out/result-ddddddd-1.json' }, gateIo());
  assert.equal(r.code, 0); assert.match(line(r, 'g2'), /^PASS.*Gate 2 PASS recorded for dddddddddddd.*9 of the first 9 accepted.*adds 2 file\(s\).*packages\/web\/src\/agent\/slash\.js/);
  assert.equal((await gate({ gate2Result: '/o/r.json' }, gateIo({ head: X }))).code, 0, 'the checkout is the tested candidate');
});

test('gate2 item: a frozen file changed, a failed or miscounted table, a control that became SGD, or a stranger sha all fail', async () => {
  const fails = async (io, re, label) => { const r = await gate({ gate2Result: '/o/r.json' }, io); assert.equal(r.code, 1, label); assert.match(line(r, 'g2'), re, label); };
  await fails(gateIo({ changed: ['packages/web/src/animation3d/scene.js'] }), /frozen|Gate 2 measured: packages\/web\/src\/animation3d\/scene\.js/, 'scene.js');
  await fails(gateIo({ changed: ['packages/control-plane/src/agents/animation-author.js'] }), /agents\/animation-author\.js/, 'a prompt file');
  await fails(gateIo({ json: result({ verdict: 'FAIL' }) }), /recorded verdict is FAIL/, 'verdict');
  await fails(gateIo({ json: result({ rows: rowsOf(7) }) }), /7 of the first 9 accepted/, 'a table that says PASS but recounts to 7');
  await fails(gateIo({ json: result({ rows: rowsOf(9, { outcome: 'accepted', silentSgd: true }) }) }), /silently became SGD/, 'control');
  await fails(gateIo({ json: result({ rows: rowsOf().slice(0, 9) }) }), /no result or silently/, 'no control row');
  await fails(gateIo({ ancestor: false }), /not an ancestor/, 'not an ancestor');
  await fails(gateIo({ json: result({ sha: 'abc' }) }), /no full candidate sha/, 'bad sha');
  await fails(gateIo({ json: 'not json' }), /not readable JSON/, 'unreadable');
});

test('gate2 item: a folder reads the newest result-*.json; no argument is a SKIP that --strict fails', async () => {
  const io = gateIo();
  await gate({ gate2Result: '/out' }, io);
  assert.match(io.read.split(String.fromCharCode(92)).join('/'), /\/out\/result-ddddddd-20261103180000\.json$/);
  let r = await gate({}, gateIo());
  assert.match(line(r, 'g2[missing]'), /^SKIP.*--gate2-result/); assert.equal(r.code, 0);
  r = await gate({ strict: true }, gateIo());
  assert.equal(r.code, 1);
  r = await gate({ gate2Result: '/out' }, gateIo({ names: [] }));
  assert.match(line(r, 'g2'), /no result-\*\.json/);
});

test('combined: the union of the four slices with prefixed ids, a file run once, and the old-client 409, the golden browser check and the Gate 2 result always in it', () => {
  const config = JSON.parse(readFileSync(join(HERE, 'ladder-smoke.json'), 'utf8'));
  const items = itemsFor(config, 'combined'), ids = items.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unique');
  for (const must of ['mvp3:old-client-409', 'mvp3:browser-primitives', 'mvp3:golden-present', 'mvp5:gate2-result', 'mvp2b:cp-transport', 'mvp4:harness-dry', 'mvp5:copy-local']) assert.ok(ids.includes(must), must);
  assert.equal(ids.at(-1), 'combined-shape', 'its own items come last');
  const ran = items.filter(i => i.kind === 'tests').flatMap(i => i.files.map(f => `${i.cwd}/${typeof f === 'string' ? f : f.file}`));
  assert.equal(new Set(ran).size, ran.length, 'no test file is listed twice');
  assert.ok(items.length < ['mvp2b', 'mvp3', 'mvp4', 'mvp5'].reduce((n, s) => n + config[s].items.length, 0) + 1, 'duplicates were dropped');
  const small = { a: { title: 'a', items: [{ id: 't', kind: 'tests', cwd: 'p', files: ['x.js', 'y.js'] }] }, b: { title: 'b', items: [{ id: 't', kind: 'tests', cwd: 'p', files: ['x.js'] }, { id: 'n', kind: 'note', text: 'n' }] }, c: { title: 'c', includes: ['a', 'b'], items: [{ id: 'own', kind: 'note', text: 'o' }] } };
  assert.deepEqual(itemsFor(small, 'c').map(i => `${i.id}:${i.files ?? ''}`), ['a:t:x.js,y.js', 'b:n:', 'own:']);
});
