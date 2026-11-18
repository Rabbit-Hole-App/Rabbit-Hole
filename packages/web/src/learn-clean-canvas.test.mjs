// A clean canvas (owner 2026-11-17 "i need a clean canvas always"; Reviewer 19:55, section-run-fixes-spec.md section 5): Learn from it starts its goal (the goal record is kept)
// but puts no code card on the canvas and shows no practice card; every other codebase goal is unchanged.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const tmp = mkdtempSync(join(tmpdir(), 'clean-canvas-'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const outfile = join(tmp, 'bundle.cjs');
await esbuild.build({
  stdin: { contents: "export { startGoal } from './TutorCodebase.jsx'; export { shownActivity, learnPlanActive } from './TutorActivity.jsx';", resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'jsx' },
  bundle: true, outfile, format: 'cjs', platform: 'node', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'asset-url-stub', setup(build) { build.onResolve({ filter: /[?](url|raw|worker)$/ }, args => ({ path: args.path, namespace: 'asset-stub' })); build.onLoad({ filter: /.*/, namespace: 'asset-stub' }, () => ({ contents: 'export default ""', loader: 'js' })); } }],
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty', '.png': 'empty', '.wasm': 'empty', '.py': 'text', '.md': 'text', '.txt': 'text', '.html': 'text' },
});
const lib = createRequire(import.meta.url)(outfile);

// The start answer: a map with two source files, as nanoGPT's learn_concept start gives (model.py, sample.py).
const map = { repository: { repo: 'karpathy/nanoGPT' }, nodes: [{ path: 'model.py', role: 'source' }, { path: 'sample.py', role: 'source' }],
  citations: [{ path: 'model.py', text: 'a', start: 1, end: 30, commit: 'c' }, { path: 'sample.py', text: 'b', start: 1, end: 30, commit: 'c' }] };
function world() {
  const posted = [], cards = [];
  globalThis.window = { dispatchEvent: event => { if (event.type === 'small:code-card') cards.push(event.detail.path); return true; }, location: { pathname: '/' }, localStorage: { getItem: () => null } };
  globalThis.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  globalThis.fetch = async (path, init) => { posted.push(JSON.parse(init.body)); return new Response(JSON.stringify({ map }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const chat = { canvas: 'canvas-1', coaching: { state: { revision: 3 }, reload: async () => {} } };
  return { posted, cards, chat };
}
const repository = { repo: 'karpathy/nanoGPT', commit: '3adf61e' };

test('Learn from it (learn set): start is posted with the learn option, and no code card is placed', async () => {
  const { posted, cards, chat } = world();
  const out = await lib.startGoal({ chat, board: 'main', repository, goalId: 'learn_concept', text: '', learn: { id: 'o1', label: 'GPT transformer architecture and attention', depth: 'balanced' } });
  assert.deepEqual(out, { ok: true });
  assert.equal(posted.length, 1);
  assert.equal(posted[0].action, 'start');
  assert.equal(posted[0].learn.id, 'o1', 'the goal record carries the learn option');
  assert.deepEqual(cards, [], 'zero blocks added');
});

test('another codebase goal (no learn) still places its two source files as code cards', async () => {
  const { cards, chat } = world();
  await lib.startGoal({ chat, board: 'main', repository, goalId: 'learn_concept', text: 'attention' });
  assert.deepEqual(cards, ['model.py', 'sample.py']);
});

test('the practice card: hidden for a Learn-plan goal (checkpoint.learn), shown for any other active activity', () => {
  const state = learn => ({ activeGoalId: 'g', activeActivityId: 'a', activities: [{ goalId: 'g', activityId: 'a', status: 'in_progress', checkpoint: learn ? { learn: { id: 'o1' } } : { codebase: {} } }] });
  assert.equal(lib.shownActivity(state(true)), null);
  assert.equal(lib.learnPlanActive(state(true)), true);
  assert.equal(lib.shownActivity(state(false))?.activityId, 'a');
  assert.equal(lib.learnPlanActive(state(false)), false);
});
