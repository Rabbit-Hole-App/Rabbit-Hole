import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { invocations, rehearse } from './rehearse.mjs';
import { FIXED } from './fixture-adapters.mjs';

const script = `E="BASE=http://x PERSIST=/g/fork/local D1_CONFIG=/a/cfg.jsonc"
run stack.sh sca seeded-check.mjs
RHL="LOCAL=1 BASE=http://x"
(cd $W/packages/web && env $RHL timeout 1500 node e2e/plain-check.mjs > $F/l.log 2>&1)
slice() { (cd $W/packages/web && TUTOR_BASE=http://x timeout 900 node e2e/inline-check.mjs) }
`;
// An app whose adapted checks already carry their FIXED markers (tutor-slice has none, so its refusal is filtered out), plus the
// checks a test names.
function app(checks) {
  const root = mkdtempSync(join(tmpdir(), 'rehearse-')), e2e = join(root, 'packages/web/e2e');
  mkdirSync(e2e, { recursive: true });
  const files = { 'shared-canvas-ask-check.mjs': FIXED.sharedCanvas, 'selected-pill-check.mjs': FIXED.selectedPill, 'repo-browser-check.mjs': FIXED.repoBrowser };
  for (const [name, text] of Object.entries({ ...files, ...checks })) writeFileSync(join(e2e, name), text);
  return root;
}

test('each invocation gets its own env: $E (plus WRANGLER_BIN from prepare), env $X, or inline prefixes', () => {
  const got = Object.fromEntries(invocations(script).map(i => [i.check, [...i.given].sort()]));
  assert.deepEqual(got['seeded-check.mjs'], ['BASE', 'D1_CONFIG', 'PERSIST', 'WRANGLER_BIN']);
  assert.deepEqual(got['plain-check.mjs'], ['BASE', 'LOCAL']);
  assert.deepEqual(got['inline-check.mjs'], ['TUTOR_BASE']);
});

test('a check reading a gate-local variable its invocation does not pass is refused (run 38792322071)', () => {
  const root = app({ 'seeded-check.mjs': 'process.env.PERSIST; process.env.WRANGLER_BIN', 'plain-check.mjs': 'process.env.PERSIST; process.env.LOCAL', 'inline-check.mjs': 'process.env.TUTOR_BASE' });
  const problems = rehearse(root, script).filter(p => !p.includes('adapter'));
  assert.deepEqual(problems, ['plain-check.mjs: reads process.env.PERSIST, which its int35.sh invocation does not pass']);
});

test('an adapter refusal is reported before dispatch (run 38790698635)', () => {
  const root = app({});
  writeFileSync(join(root, 'packages/web/e2e/repo-browser-check.mjs'), 'const lit = () => 0;');
  assert.ok(rehearse(root, script).some(p => p.startsWith('repo-browser-check.mjs: adapter refuses - repo-browser highlight checks changed')));
});
