import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDERER_FILES, expectedFingerprint, fingerprintPathFor, rendererHash, sceneSpecHash } from '../scripts/render-fingerprint.mjs';

// A check on scene-spec.json is not evidence about static-00.png. This is
// the gate that makes that true: every committed static render's fingerprint
// must match a hash of ITS OWN scene-spec.json and the current renderer
// source, recomputed here, every run. No filesystem mtimes - a checkout, a
// copy, CI or a restore all make timestamps lie, which is exactly how cases
// 01 and 03's PNGs went stale in commit history while every check on their
// scene-spec.json passed.
const WEB_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(WEB_ROOT));
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', '.small', '.local-benchmark-cache', 'dist', 'build']);

function findStaticRenders(dir, found) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) findStaticRenders(full, found);
    // Only "generated/latest" is a live claim of correctness. A history
    // snapshot is an immutable record of a past render and is correctly
    // "stale" against the current scene-spec forever - that is not a defect.
    else if (entry === 'static-00.png' && full.replace(/\\/g, '/').includes('/generated/latest/')) found.push(full);
  }
  return found;
}

test('every committed static render (generated/latest/static-00.png) carries a fingerprint matching its current scene-spec.json and the current renderer', () => {
  const pngs = findStaticRenders(REPO_ROOT, []);
  assert.ok(pngs.length >= 8, `expected several static renders under generated/latest, found ${pngs.length} - did the scan break?`);
  const currentRendererHash = rendererHash(WEB_ROOT);
  const failures = [];
  for (const png of pngs) {
    const dir = dirname(png);
    const sceneSpecPath = join(dir, 'scene-spec.json');
    if (!existsSync(sceneSpecPath)) { failures.push(`${dir}: static-00.png exists with no sibling scene-spec.json to verify it against`); continue; }
    const fpPath = fingerprintPathFor(png);
    if (!existsSync(fpPath)) { failures.push(`${dir}: no fingerprint - this render's provenance is unverified`); continue; }
    const stored = JSON.parse(readFileSync(fpPath, 'utf8'));
    const expected = expectedFingerprint(sceneSpecPath, WEB_ROOT);
    if (stored.sceneSpecHash !== expected.sceneSpecHash) failures.push(`${dir}: STALE - scene-spec.json has changed since this PNG was rendered`);
    else if (stored.rendererHash !== currentRendererHash) failures.push(`${dir}: STALE - the renderer has changed since this PNG was rendered`);
  }
  assert.deepEqual(failures, [], `stale or unverified static render(s):\n${failures.join('\n')}`);
});

// A fingerprint is about the pixels, not the checkout. With core.autocrlf a
// Windows worktree holds renderer files and scene-spec.json as CRLF (or a mix,
// once an editor rewrites some), a Linux checkout as LF: the same commit must
// yield the same hashes in both, or a clean checkout reports every render STALE.
test('fingerprints ignore line endings, so every checkout of one commit agrees', () => {
  const lf = mkdtempSync(join(tmpdir(), 'fp-lf-')), crlf = mkdtempSync(join(tmpdir(), 'fp-crlf-'));
  try {
    for (const f of RENDERER_FILES) {
      const text = readFileSync(join(WEB_ROOT, f), 'utf8').replace(/\r\n/g, '\n');
      for (const [root, body] of [[lf, text], [crlf, text.replace(/\n/g, '\r\n')]]) {
        mkdirSync(dirname(join(root, f)), { recursive: true });
        writeFileSync(join(root, f), body);
      }
    }
    writeFileSync(join(lf, 'scene-spec.json'), '{\n  "a": 1\n}\n');
    writeFileSync(join(crlf, 'scene-spec.json'), '{\r\n  "a": 1\r\n}\r\n');
    assert.equal(rendererHash(crlf), rendererHash(lf));
    assert.equal(sceneSpecHash(join(crlf, 'scene-spec.json')), sceneSpecHash(join(lf, 'scene-spec.json')));
  } finally {
    rmSync(lf, { recursive: true, force: true });
    rmSync(crlf, { recursive: true, force: true });
  }
});
