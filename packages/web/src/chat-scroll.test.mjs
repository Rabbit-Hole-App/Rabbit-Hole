// useFollowLatest (chat-scroll.js), called as a plain function: esbuild swaps its `react` import for a stub whose effects
// are collected and run by hand, and a fake ResizeObserver stands in for the browser's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const dir = mkdtempSync(join(tmpdir(), 'chat-scroll-'));
const outfile = join(dir, 'hook.cjs');
await esbuild.build({
  entryPoints: [fileURLToPath(new URL('./chat-scroll.js', import.meta.url))], bundle: true, outfile, format: 'cjs', platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'stub-react', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: `
      export const useState = init => [typeof init === 'function' ? init() : init, () => {}];
      export const useRef = value => ({ current: value });
      export const useEffect = run => { globalThis.__effects.push(run); };` }));
  } }],
});
const { useFollowLatest } = createRequire(import.meta.url)(outfile);
rmSync(dir, { recursive: true, force: true });

function mount() {
  const observers = [];
  globalThis.ResizeObserver = class { constructor(fn) { this.fn = fn; this.seen = new Set(); observers.push(this); } observe(el) { this.seen.add(el); } disconnect() { this.seen.clear(); } };
  globalThis.__effects = [];
  const listeners = {}, message = {};
  const box = { scrollHeight: 1000, scrollTop: 600, clientHeight: 400, children: [message], addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {} };
  useFollowLatest({ current: box }, [1]);
  globalThis.__effects.forEach(run => run());
  const [observer] = observers;
  return { box, message, observer, scroll: () => listeners.scroll(), grow: px => { box.scrollHeight += px; observer.fn([]); } };
}

test('a following reader stays at the true bottom when the last answer grows with no new message (answer_meta after done)', () => {
  const { box, message, observer, grow } = mount();
  assert.ok(observer.seen.has(box) && observer.seen.has(message), 'the box and its message blocks are observed');
  assert.equal(box.scrollTop, 1000, 'the first effect goes to the bottom');
  grow(300);
  assert.equal(box.scrollTop, 1300, 'actions and Explore next landing after done are followed');
});

test('a reader who scrolled up is never pulled down by late growth', () => {
  const { box, scroll, grow } = mount();
  box.scrollTop = 200;
  scroll();
  grow(300);
  assert.equal(box.scrollTop, 200);
});
