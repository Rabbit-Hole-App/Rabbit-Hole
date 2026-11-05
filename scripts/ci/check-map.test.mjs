import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { classify, parts, select } from './affected.mjs';
const map = JSON.parse(readFileSync(new URL('./check-map.json', import.meta.url), 'utf8'));
test('tool handoff component stays a manual fixture and never grants automatic runtime coverage',()=>{
 for(const file of ['packages/web/src/inline-tool-action.js','packages/web/e2e/inline-evidence-handoff-component.mjs'])assert.equal(classify(file,map),'mapped');
 assert.equal(map.checks['inline-evidence-handoff-component.mjs'].runner,'windows-only');
 assert.match(map.checks['inline-evidence-handoff-component.mjs'].why,/All retrieval intercepted/);
});
test('every tracked executable file has a class (a new file is classified in the push that adds it)', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n');
  const unclassified = files.filter(f => classify(f, map) === 'unmapped');
  assert.deepEqual(unclassified, []);
});
// Every packages/web/e2e/*-check.mjs is a key of checks (fast-e2e run 38667324551 built both bundles before run-part.sh found
// pdf-to-canvas-check.mjs missing; affected.mjs now also refuses a selected unknown check before any install).
test('every e2e check has a runner and a duration', () => {
  const checks = readdirSync(new URL('../../packages/web/e2e/', import.meta.url)).filter(f => f.endsWith('-check.mjs'));
  assert.deepEqual(checks.filter(c => !map.checks[c]), [], 'add each to scripts/ci/check-map.json checks with runner fork, harness or windows-only');
});
test('every mapped glob names checks that exist, and every windows-only check says why', () => {
  const unknown = Object.entries(map.mapped).flatMap(([g, v]) => v.filter(c => !c.includes('/') && !map.checks[c]).map(c => `${g} -> ${c}`));
  assert.deepEqual(unknown, []);
  assert.deepEqual(Object.keys(map.checks).filter(c => map.checks[c].runner === 'windows-only' && !map.checks[c].why), []);
  assert.deepEqual(Object.keys(map.checks).filter(c => !['harness', 'fork', 'windows-only'].includes(map.checks[c].runner) || !(map.checks[c].seconds > 0)), []);
});
// fast-e2e installs an engine's system libraries only for a part whose checks declare it (engine-deps.sh): a check that
// launches Firefox or WebKit without the field would be back to installing them inside its own time budget.
test('every check that launches Firefox or WebKit declares that engine, and only those two are declared', () => {
  const dir = new URL('../../packages/web/e2e/', import.meta.url);
  const launches = readdirSync(dir).filter(f => f.endsWith('-check.mjs')).flatMap(f => {
    const src = readFileSync(new URL(f, dir), 'utf8');
    return ['firefox', 'webkit'].filter(e => new RegExp(`runEmbed\\('${e}'\\)|launchEngine\\('${e}'|\\b${e}\\.launch\\(`).test(src)).map(e => `${f} ${e}`);
  }).sort();
  assert.ok(launches.includes('embed-webkit-check.mjs webkit'), 'the detector still finds the WebKit embed check');
  const declared = Object.entries(map.checks).filter(([, v]) => v.engine).map(([c, v]) => `${c} ${v.engine}`).sort();
  assert.deepEqual(declared, launches);
});
test('every none glob has a reason, and no reason is orphaned', () => {
  assert.deepEqual(map.none.filter(g => !map.noneReasons[g]).sort(), []);
  assert.deepEqual(Object.keys(map.noneReasons).filter(g => !map.none.includes(g)).sort(), []);
});

// Fix round 1 (controller review 2026-10-13).
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n');
const sel = (...paths) => select(paths.map(path => ({ status: 'M', path })), map);

test('file conversion mappings report guarded manual coverage without starting its service or demos', () => {
  for (const path of ['packages/file-convert/server.mjs', 'packages/control-plane/file-jobs-dev-demo.mjs', 'packages/web/src/file-jobs-client.js']) {
    const selected = sel(path);
    assert.equal(classify(path, map), 'mapped');
    assert.deepEqual(selected.checks, [], 'no automatic converter, restart or paid execution');
    assert.ok(selected.notCovered.includes('file-converter-ui-check.mjs'));
    assert.ok(selected.notCovered.includes('file-step-retry-check.mjs'));
  }
});

test('import and model paths select their real checks while pointer diagnostics retain both consumers', () => {
  assert.ok(sel('packages/web/src/FileDocCard.jsx').notCovered.includes('file-doc-cards-check.mjs'));
  assert.ok(sel('packages/web/src/ModelCard.jsx').notCovered.includes('model-viewer-check.mjs'));
  assert.ok(sel('packages/web/src/file-source-client.js').notCovered.includes('file-sources-check.mjs'));
  assert.ok(sel('packages/web/src/TocConversation.jsx').notCovered.includes('toc-tutor-check.mjs'));
  assert.deepEqual(sel('packages/web/e2e/pointer-diagnostics.mjs').checks, ['project-menu-check.mjs', 'workspace-check.mjs']);
});
test('markdown that the bundles import at run time is broad, not docs', () => {
  for (const p of ['docs/courses/nanogpt/lesson-01-plan.md', 'docs/courses/nanogpt/lesson-02-plan.md', 'docs/courses/nanogpt/quickstart-curriculum.md']) assert.equal(classify(p, map), 'broad', p);
  assert.equal(classify('docs/features/coaching.md', map), 'docs');
});
// ci-speed item 2: no longer broad (not on the owner's list), but never none: each has a mapped row.
test('files outside web and control-plane that the bundles import are mapped, not none', () => {
  for (const p of ['packages/cli/lib/byoc-client.mjs', 'packages/cli/lib/byoc-uploads.mjs', 'packages/cli/lib/byoc-s3.js', 'packages/byoc/template.mjs', 'packages/byoc/python-source.mjs',
    'packages/byoc/api.py', 'packages/byoc/signer.py', 'packages/byoc/permissions.py', 'packages/byoc/grants.py']) assert.equal(classify(p, map), 'mapped', p);
  assert.equal(classify('packages/cli/lib/deploy.mjs', map), 'none');
});
// Everything the Vite bundles and the two workers pull in must be a class that runs checks. The crawl follows relative imports,
// new URL(..., import.meta.url), CSS @import/url() and HTML src/href.
test('nothing reachable from the bundle and worker entries is classed none or docs', () => {
  const set = new Set(tracked);
  const find = (from, spec) => {
    spec = spec.split(/[?#]/)[0];
    const b = spec.startsWith('/') ? 'packages/web/public' + spec : posix.normalize(posix.join(posix.dirname(from), spec));
    return [b, b + '.js', b + '.jsx', b + '.mjs', b + '/index.js', b + '/index.jsx'].find(c => set.has(c));
  };
  const refs = (f, t) => {
    const rel = s => /^[./]/.test(s) && !/^\/\//.test(s);
    const out = [];
    if (/\.(m?jsx?|cjs)$/.test(f)) for (const re of [/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g, /new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g]) for (const m of t.matchAll(re)) out.push(m[1]);
    if (f.endsWith('.css')) for (const re of [/@import\s+(?:url\()?['"]?([^'")\s;]+)/g, /url\(\s*['"]?([^'")\s]+)/g]) for (const m of t.matchAll(re)) out.push(m[1]);
    if (f.endsWith('.html')) for (const m of t.matchAll(/(?:src|href)=["']([^"']+)["']/g)) out.push(m[1]);
    return out.filter(rel);
  };
  const entries = ['packages/web/src/main.jsx', 'packages/web/dev-worker.js', 'packages/web/app-worker.js', 'packages/control-plane/src/index.js', 'packages/web/index.html',
    ...tracked.filter(f => /^packages\/web\/design\/rabbit-hole-[a-z-]+\.html$/.test(f))];
  const seen = new Map(), queue = entries.map(e => [e, 'entry']);
  while (queue.length) {
    const [f, via] = queue.pop();
    if (seen.has(f)) continue;
    seen.set(f, via);
    if (/\.(m?jsx?|cjs|css|html)$/.test(f)) for (const r of refs(f, readFileSync(f, 'utf8'))) { const x = find(f, r); if (x) queue.push([x, f]); }
  }
  assert.ok(seen.size > 400, `the crawl found only ${seen.size} files`);
  assert.deepEqual([...seen].filter(([f]) => ['none', 'docs'].includes(classify(f, map))).map(([f, via]) => `${f} <- ${via}`), []);
});
test('the pinned nanoGPT fixture selects the checks that read it', () => {
  const p = 'packages/learn-render/motion/fixtures/sources/nanogpt-3adf61e/MANIFEST.json';
  assert.equal(classify(p, map), 'mapped');
  const s = sel(p);
  assert.deepEqual(s.checks, ['workspace-check.mjs']);
  assert.deepEqual(s.notCovered.sort(), ['rabbit-hole-check.mjs', 'repo-browser-check.mjs']);
  const other = tracked.find(f => f.startsWith('packages/learn-render/motion/') && !f.includes('/nanogpt-3adf61e/') && /\.m?js$/.test(f) && !f.endsWith('.test.mjs'));
  assert.equal(classify(other, map), 'none', other);
});
test('Dive, PanelHeader and FileImportDialog select every check that drives them', () => {
  // Selected: run here, or listed as not covered when windows-only (Task B4 parked repo-browser, next-steps-wiring and voice).
  const all = p => { const s = sel(p); return [...s.checks, ...s.notCovered]; };
  const dive = all('packages/web/src/Dive.jsx');
  for (const c of ['dive-check.mjs', 'next-steps-wiring-check.mjs', 'voice-check.mjs', 'cross-device-check.mjs']) assert.ok(dive.includes(c), `Dive.jsx -> ${c}`);
  assert.ok(all('packages/web/src/PanelHeader.jsx').includes('repo-browser-check.mjs'));
  assert.ok(all('packages/web/src/FileImportDialog.jsx').includes('repo-browser-check.mjs'));
});

// ci-speed item 2 (owner brief v2 item 2; rulings B, 2026-11-05). The owner's broad list, verbatim. Every other broad line is a
// reviewed keep-line (P0-REPORT mismatch 9: lockfile, tripwire, fonts, html, bundled docs) whose reason is in broadReasons.
const OWNER_BROAD = ['packages/control-plane/src/index.js', 'packages/control-plane/src/auth*.js', 'packages/control-plane/src/dev-access*.js',
  'packages/control-plane/src/dev-forwarding.js', 'packages/control-plane/src/learn-spend*.js', 'packages/control-plane/src/learn-paid*.js',
  'packages/control-plane/src/learn-usage*.js', 'packages/control-plane/src/learn-board*.js', 'packages/control-plane/src/learn-boards.js',
  'packages/control-plane/src/shared-privacy.js', 'packages/control-plane/migrations/**', 'packages/control-plane/learn-migrations/**', '**/*.sql',
  '**/wrangler*.jsonc', '**/package.json', '**/package-lock.json', 'uv.lock', '.github/**', 'scripts/ci/**',
  'packages/web/app-worker.js', 'packages/web/dev-worker.js', 'packages/web/vite.config.js', 'scripts/ensure-natives.mjs', 'scripts/lock-natives.mjs'];
test('broad is exactly the owner list plus the reviewed keep-lines, each with its reason', () => {
  const keep = Object.keys(map.broadReasons ?? {});
  assert.deepEqual(keep.filter(g => OWNER_BROAD.includes(g)), [], 'a keep-line repeats an owner line');
  assert.deepEqual([...map.broad].sort(), [...OWNER_BROAD, ...keep].sort());
  assert.deepEqual(keep.filter(g => !(map.broadReasons[g].length > 20)), [], 'every keep-line says why');
});
// The unit-test files `run.sh test:unit` runs (run.sh:119-136; packages/control-plane `npm test` is node --test's default patterns).
// A mapped row may name one of these as its own check (an entry with a slash); verify runs it, fast-e2e never does.
const CI_UNIT = [/^packages\/web\/src\/.+\.test\.mjs$/, /^packages\/control-plane\/(?:test\/.+\.[cm]?js|.+\.test\.[cm]?js)$/, /^scripts\/[^/]+\.test\.mjs$/,
  /^tests\/unit_tests\/.+\/test_[^/]+\.py$/, /^tests\/evals\/(?:learn-grade|explain-review|explain-back|tutor-session)\/[^/]+\.test\.mjs$/,
  /^packages\/learn-render\/motion\/(?:service\/)?[^/]+\.test\.mjs$/, /^packages\/file-convert\/(?:activation\/)?[^/]+\.test\.mjs$/];
const isUnit = e => e.includes('/');
const linux = c => !isUnit(c) && map.checks[c] && map.checks[c].runner !== 'windows-only';
test('every mapped row names a Linux check or a CI-run unit test, or is a recorded Preview/Full-tier row', () => {
  const set = new Set(tracked);
  assert.deepEqual([...new Set(Object.values(map.mapped).flat().filter(isUnit))].filter(u => !set.has(u) || !CI_UNIT.some(r => r.test(u))), [], 'a unit-test entry that run.sh test:unit does not run');
  const tier = map.previewTier ?? {};
  assert.deepEqual(Object.entries(tier).filter(([g, t]) => !map.mapped[g] || !['preview', 'full'].includes(t.tier) || !(t.why?.length > 20)).map(([g]) => g), [], 'a tier row without a mapped row, a tier or a reason');
  assert.deepEqual(Object.entries(map.mapped).filter(([g, v]) => !v.some(c => linux(c) || isUnit(c)) && !tier[g]).map(([g]) => g), []);
  assert.deepEqual(Object.entries(map.mapped).filter(([g, v]) => tier[g] && v.some(c => linux(c) || isUnit(c))).map(([g]) => g), [], 'a tier row that has automatic coverage');
});
// One file per area (brief item 2): it is mapped, selects its own checks and far fewer than the broad set.
const AREAS = {
  whiteboard: [['packages/control-plane/src/whiteboard-job.js', 'whiteboard-mvp-check.mjs'], ['packages/web/src/WhiteboardVideoCard.jsx', 'whiteboard-mvp-check.mjs']],
  animation: [['packages/control-plane/src/animation-job.js', 'animation-mvp-check.mjs'], ['packages/web/src/Animation3DCard.jsx', 'animation-mvp-check.mjs']],
  cad: [['packages/control-plane/src/cad-jobs.js', 'focus-cad-check.mjs'], ['packages/web/src/CadCard.jsx', 'focus-cad-check.mjs']],
  motion: [['packages/control-plane/src/motion-provider.js', 'motion-command-check.mjs'], ['packages/control-plane/src/learn-video.js', 'motion-command-check.mjs']],
  explain: [['packages/control-plane/src/explain-job.js', 'explain-program-check.mjs'], ['packages/web/src/ExplainBackPanel.jsx', 'explain-back-layout-check.mjs']],
  'chat and proposals': [['packages/control-plane/src/chat-proposal-route.js', 'explain-proposal-card-check.mjs'], ['packages/web/src/ChatPane.jsx', 'chat-generation-check.mjs']],
  'files and sources': [['packages/control-plane/src/file-jobs.js', 'pdf-status-check.mjs'], ['packages/control-plane/src/learn-files.js', 'start-sources-check.mjs'], ['packages/web/src/SourcesPane.jsx', 'start-sources-check.mjs']],
  'markdown cards': [['packages/web/src/Md.jsx', 'markdown-fences-check.mjs'], ['packages/web/src/learn-rich-text.js', 'canvas-editing-check.mjs']],
  'share and fork': [['packages/control-plane/src/learn-shared-ask.js', 'shared-header-check.mjs'], ['packages/web/src/SharePanel.jsx', 'share-dialog-check.mjs'], ['packages/web/src/canvas-fork.js', 'canvas-forking-check.mjs']],
};
test('a one-file change in each area is mapped, selects that area\'s own check and far fewer than the broad set', () => {
  const all = select([], map, true).checks.length;
  for (const [area, rows] of Object.entries(AREAS)) for (const [p, own] of rows) {
    assert.equal(classify(p, map), 'mapped', `${area}: ${p}`);
    const s = sel(p);
    assert.ok(s.checks.includes(own), `${area}: ${p} selects ${own} (got ${s.checks.join(', ')})`);
    assert.ok(s.checks.length <= all / 2, `${area}: ${p} selects ${s.checks.length} of ${all}`);
  }
});
test('WhiteboardVideoCard.jsx is no longer shadowed by a broad glob: its row runs', () => {
  assert.ok(map.mapped['packages/web/src/WhiteboardVideoCard.jsx'].includes('whiteboard-mvp-check.mjs'));
  assert.equal(classify('packages/web/src/WhiteboardVideoCard.jsx', map), 'mapped');
});

const own = v => v.filter(c => !c.includes('/')); // a row's browser checks (unit-test files have a slash)
test('bounded compute check remains manual fixture coverage for both source helpers',()=>{
 for(const path of ['packages/web/src/inline-compute.js','packages/web/src/inline-compute-result.js','packages/web/e2e/ctrlk-compute-check.mjs']){
  assert.deepEqual(own(map.mapped[path]),['ctrlk-compute-check.mjs']);
 }
 assert.equal(map.checks['ctrlk-compute-check.mjs'].runner,'windows-only');
 assert.match(map.checks['ctrlk-compute-check.mjs'].why,/intercepted/);
});

test('source page and derivative browser check remains explicit manual fixture coverage',()=>{
 for(const path of ['packages/web/src/inline-source-readings.js','packages/web/src/inline-polynomial-derivative.js','packages/web/src/inline-source-compute.js','packages/web/src/inline-source-compute-result.js','packages/web/e2e/ctrlk-source-derivative-check.mjs']) assert.deepEqual(own(map.mapped[path]),['ctrlk-source-derivative-check.mjs']);
 assert.equal(map.checks['ctrlk-source-derivative-check.mjs'].runner,'windows-only');
 assert.match(map.checks['ctrlk-source-derivative-check.mjs'].why,/intercepted generation/);
});

test('native image replacement remains manual intercepted extraction coverage',()=>{assert.deepEqual(own(map.mapped['packages/web/src/inline-image-replacement.js']),['ctrlk-image-replacement-check.mjs']);assert.equal(map.checks['ctrlk-image-replacement-check.mjs'].runner,'windows-only');});

// The planner balances the six fast-e2e parts on these seconds, and a part's job stops at 20 minutes (fast-e2e.yml timeout-minutes),
// install and build included. Run 40969234666 hit that limit twice: three checks recorded far under their real times landed on one
// part beside others recorded far over theirs. So on a broad selection no part's estimate may pass 15 minutes, which leaves room for
// the job's own setup; a new or slower check that would break this needs its seconds measured and recorded.
test('a broad selection splits into six parts whose estimated check time each stays under 15 minutes', () => {
  const totals = parts(select([], map, true).checks, map, 6).map(part => part.reduce((sum, check) => sum + map.checks[check].seconds, 0));
  assert.ok(Math.max(...totals) <= 15 * 60, `per part seconds: ${totals.join(', ')}`);
});

test('clipboard fork and trash persistence remains manual browser coverage',()=>{assert.ok(map.mapped['packages/web/src/CodeBoxEditor.jsx'].includes('code-box-persistence-check.mjs'));assert.equal(map.checks['code-box-persistence-check.mjs'].runner,'windows-only');assert.deepEqual(map.mapped['packages/web/e2e/code-box-persistence-check.mjs'],['code-box-persistence-check.mjs']);});
