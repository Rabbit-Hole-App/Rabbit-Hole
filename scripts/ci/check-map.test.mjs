import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { classify, select } from './affected.mjs';
const map = JSON.parse(readFileSync(new URL('./check-map.json', import.meta.url), 'utf8'));
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
  const unknown = Object.entries(map.mapped).flatMap(([g, v]) => v.filter(c => !map.checks[c]).map(c => `${g} -> ${c}`));
  assert.deepEqual(unknown, []);
  assert.deepEqual(Object.keys(map.checks).filter(c => map.checks[c].runner === 'windows-only' && !map.checks[c].why), []);
  assert.deepEqual(Object.keys(map.checks).filter(c => !['harness', 'fork', 'windows-only'].includes(map.checks[c].runner) || !(map.checks[c].seconds > 0)), []);
});
test('every none glob has a reason, and no reason is orphaned', () => {
  assert.deepEqual(map.none.filter(g => !map.noneReasons[g]).sort(), []);
  assert.deepEqual(Object.keys(map.noneReasons).filter(g => !map.none.includes(g)).sort(), []);
});

// Fix round 1 (controller review 2026-10-13).
const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n');
const sel = (...paths) => select(paths.map(path => ({ status: 'M', path })), map);
test('markdown that the bundles import at run time is broad, not docs', () => {
  for (const p of ['docs/courses/nanogpt/lesson-01-plan.md', 'docs/courses/nanogpt/lesson-02-plan.md', 'docs/courses/nanogpt/quickstart-curriculum.md']) assert.equal(classify(p, map), 'broad', p);
  assert.equal(classify('docs/features/coaching.md', map), 'docs');
});
test('files outside web and control-plane that the bundles import are broad, not none', () => {
  for (const p of ['packages/cli/lib/byoc-client.mjs', 'packages/cli/lib/byoc-uploads.mjs', 'packages/cli/lib/byoc-s3.js', 'packages/byoc/template.mjs', 'packages/byoc/python-source.mjs',
    'packages/byoc/api.py', 'packages/byoc/signer.py', 'packages/byoc/permissions.py', 'packages/byoc/grants.py']) assert.equal(classify(p, map), 'broad', p);
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

test('the default set for unmapped paths is a small list of existing Linux-ready checks, never the broad set', () => {
  assert.ok(Array.isArray(map.defaultChecks) && map.defaultChecks.length > 0 && map.defaultChecks.length < 12, 'a small, non-empty default set');
  for (const c of map.defaultChecks) {
    assert.ok(map.checks[c], `${c} is not a known check`);
    assert.notEqual(map.checks[c].runner, 'windows-only', `${c} does not run on Linux`);
  }
});
