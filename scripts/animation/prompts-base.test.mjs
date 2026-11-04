// prompts-base.mjs on throwaway repositories with the shapes an integrator produces: the AN-20 prompt commits LINEAR on the integration base (the real
// feat/an20-gate-tree), an AN-20 branch MERGED into it, and a lane merged earlier whose own history already says AN-20 (the trap that fooled a first version).
// No network.   node --test scripts/animation/prompts-base.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PROMPT_FILES, promptsBase } from './prompts-base.mjs';

const PA = PROMPT_FILES[0], OLD = 'prompt v1: Surfaces are tube-curve wireframes on level lines and cross-sections.', NEW = 'prompt v2: a surface is a surface geometry.';
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'pbase-'));
  const g = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...a], { cwd: dir, encoding: 'utf8' }).trim();
  g('init', '-q', '-b', 'main');
  const commit = (subject, file = 'other.txt', text = subject) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); g('add', '-A'); g('commit', '-q', '-m', subject); return g('rev-parse', 'HEAD'); };
  const merge = (branch, message) => g('merge', '-q', '--no-ff', '-m', message, branch);
  return { dir, g, commit, merge, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const opts = r => ({ cwd: r.dir, main: 'main' });

test('linear AN-20 prompt commits on the integration base: both derivations give the base, the integrator\'s merge commit', t => {
  const r = repo(); t.after(r.cleanup);
  const main = r.commit('main release', PA, OLD);
  r.g('checkout', '-q', '-b', 'integ'); r.commit('lane a', 'a.txt'); r.g('checkout', '-q', 'main'); r.g('checkout', '-q', '-b', 'side'); r.commit('lane b', 'b.txt');
  r.g('checkout', '-q', 'integ'); r.merge('side', 'Merge feat/an18-contract into release/animation-ladder');
  const base = r.g('rev-parse', 'HEAD');
  const x = r.commit('feat(animation): cut the clamp sentences from the prompts (AN-20, owner decisions 11, 12, 13)', PA, NEW);
  r.commit('feat(animation): the byte rule (FX-AN-052, AN-20)', PA, `${NEW} bytes`);
  r.commit('docs(animation): fix.md entries', 'docs/fix.md');
  r.g('checkout', '-q', '-b', 'harness', base); r.commit('harness', 'scripts/h.mjs'); r.g('checkout', '-q', 'integ');
  r.merge('harness', "Merge branch 'feat/an20-c4-harness' into gate-tree");
  const out = promptsBase(r.g('rev-parse', 'HEAD'), opts(r));
  assert.equal(out.value, base); assert.equal(out.a.x, x); assert.equal(out.b.x, x); assert.equal(out.agree, true); assert.equal(out.mainBase, main);
  assert.deepEqual(out.warnings, []); assert.equal(out.evidence.length, 2);
});

test('an AN-20 branch merged into the base: the base is the merge commit\'s first parent', t => {
  const r = repo(); t.after(r.cleanup);
  r.commit('main release', PA, OLD); r.g('checkout', '-q', '-b', 'integ'); const base = r.commit('integration base', 'a.txt');
  r.g('checkout', '-q', '-b', 'an20'); r.commit('feat(animation): prompts (AN-20)', PA, NEW); r.commit('tests', 't.txt');
  r.g('checkout', '-q', 'integ'); r.merge('an20', 'Merge feat/an20-prompts');
  const c4 = r.commit('after', 'z.txt');
  const out = promptsBase(c4, opts(r));
  assert.equal(out.value, base); assert.equal(out.agree, true); assert.deepEqual(out.warnings, []);
});

test('the trap: a lane merged EARLIER already has an AN-20 commit in its own history; only the integrator\'s first-parent line counts', t => {
  const r = repo(); t.after(r.cleanup);
  r.commit('main release', PA, OLD);
  r.g('checkout', '-q', '-b', 'integ'); r.commit('integration start', 'a.txt');
  r.g('checkout', '-q', '-b', 'lane'); r.commit('feat(animation): lane prompts (AN-20)', 'lane-only.txt', 'on the lane, the integrator kept the old prompt file'); r.g('checkout', '-q', 'integ');
  r.merge('lane', 'Merge feat/an18-contract into release/animation-ladder');
  const base = r.g('rev-parse', 'HEAD');
  const x = r.commit('feat(animation): the integrated AN-20 prompt cut (AN-20)', PA, NEW);
  const out = promptsBase(r.g('rev-parse', 'HEAD'), opts(r));
  assert.equal(out.value, base, 'not the commit before the lane\'s own AN-20 commit'); assert.equal(out.a.x, x); assert.equal(out.b.x, x);
});

test('a prompt-file commit after the base that does not say AN-20 is a WARNING (restoring would undo it too)', t => {
  const r = repo(); t.after(r.cleanup);
  r.commit('main release', PA, OLD); r.g('checkout', '-q', '-b', 'integ'); const base = r.commit('integration base', 'a.txt');
  r.commit('feat(animation): prompts (AN-20)', PA, NEW);
  r.commit('fix(animation): a repair tool line nobody asked to revert', PA, `${NEW} repair line`);
  const out = promptsBase(r.g('rev-parse', 'HEAD'), opts(r));
  assert.equal(out.value, base); assert.equal(out.warnings.length, 1); assert.match(out.warnings[0], /a repair tool line/);
});

test('when the two derivations disagree, or only one works, it says so in WARNINGS', t => {
  const r = repo(); t.after(r.cleanup);
  r.commit('main release', PA, OLD); r.g('checkout', '-q', '-b', 'integ'); const base = r.commit('integration base', 'a.txt');
  r.commit('prompts reworded without the marker and without the tag', PA, NEW);
  const out = promptsBase(r.g('rev-parse', 'HEAD'), opts(r));
  assert.equal(out.value, base); assert.equal(out.b, null); assert.ok(out.warnings.some(w => /only one derivation worked \(content\)/.test(w)));
});

test('it refuses rather than guesses: a short sha, no marker removed and no AN-20 subject', t => {
  const r = repo(); t.after(r.cleanup);
  r.commit('main release', PA, OLD); r.g('checkout', '-q', '-b', 'integ');
  const c = r.commit('prompts reworded but still the old sentence', PA, `${OLD} and more`);
  assert.throws(() => promptsBase(c, opts(r)), /neither derivation works/);
  assert.throws(() => promptsBase('abc', opts(r)), /40-character/);
});
