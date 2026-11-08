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
      export const useState = init => [typeof init === 'function' ? init() : init, next => { globalThis.__atBottom = next; }];
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
  globalThis.__atBottom = true;
  const listeners = {}, message = {};
  const box = { scrollHeight: 1000, scrollTop: 600, clientHeight: 400, children: [message], addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {},
    scrollTo({ top, behavior }) { box.scrollTop = top; box.behavior = behavior; } };
  const follow = useFollowLatest({ current: box }, [1]);
  globalThis.__effects.forEach(run => run());
  const [observer] = observers;
  // pill(): whether Jump to latest shows (ChatMessages.jsx JumpToLatest renders exactly while atBottom is false).
  return { box, message, observer, follow, pill: () => globalThis.__atBottom === false, scroll: () => listeners.scroll(), grow: px => { box.scrollHeight += px; observer.fn([]); } };
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

// Owner 2026-10-22: switching to another panel tab (Progress, Find, TOC) and back to Chat keeps the reader's place. A hidden box
// (display none) has no height and its offset resets to 0; neither may move the reader or turn following back on.
test('a reader who scrolled up gets their place back after the box is hidden and shown again', () => {
  const { box, scroll, observer } = mount();
  box.scrollTop = 200;
  scroll();
  Object.assign(box, { clientHeight: 0, scrollTop: 0 });
  scroll(); // a scroll event while hidden is not the reader's
  observer.fn([]);
  Object.assign(box, { clientHeight: 400 });
  observer.fn([]);
  assert.equal(box.scrollTop, 200);
});

test('a following reader is back at the bottom after the box is hidden and shown again', () => {
  const { box, observer } = mount();
  Object.assign(box, { clientHeight: 0, scrollTop: 0 });
  observer.fn([]);
  Object.assign(box, { clientHeight: 400 });
  observer.fn([]);
  assert.equal(box.scrollTop, 1000);
});

test('while shown, growth never moves a scrolled-up reader, even one the browser re-anchored before the scroll event', () => {
  const { box, scroll, grow } = mount();
  box.scrollTop = 200;
  scroll();
  box.scrollTop = 260; // scroll anchoring after content above grew; its scroll event comes later
  grow(60);
  assert.equal(box.scrollTop, 260);
});

// Owner 2026-11-08: Jump to latest shows only while the list is scrolled away from the bottom (more than about one line), goes the moment
// it is back (by scrolling or by the pill, smoothly unless motion is reduced), and never for a reader at the bottom when a message lands.
test('Jump to latest: hidden at the bottom, shown after scrolling up, hidden again at the bottom', () => {
  const { box, scroll, pill } = mount();
  scroll();
  assert.equal(pill(), false, 'at the bottom');
  box.scrollTop = 990; // a few pixels up: within one line
  scroll();
  assert.equal(pill(), false, 'within one line of the bottom');
  box.scrollTop = 500;
  scroll();
  assert.equal(pill(), true, 'scrolled up');
  box.scrollTop = 600; // back down by scrolling
  scroll();
  assert.equal(pill(), false, 'back at the bottom');
});

test('Jump to latest: a message arriving while the reader is at the bottom never shows it, even when its scroll event lands after more growth', () => {
  const { box, scroll, grow, pill } = mount();
  assert.equal(box.scrollTop, 1000, 'following: at the bottom');
  box.scrollHeight += 500; // the answer grew past the slack after the hook's own scroll to the bottom
  scroll(); // the scroll event of that scroll can read the box after the answer grew again, before the observer follows it
  assert.equal(pill(), false, 'a reader at the bottom never sees the pill');
  grow(200);
  assert.equal(box.scrollTop, 1700, 'still following');
  scroll();
  assert.equal(pill(), false);
});

test('Jump to latest: pressing it hides it at once and scrolls smoothly to the latest; reduced motion jumps', () => {
  const { box, scroll, follow, pill } = mount();
  box.scrollTop = 200;
  scroll();
  assert.equal(pill(), true);
  follow.jump();
  assert.equal(pill(), false, 'hidden as soon as it is pressed');
  assert.deepEqual([box.scrollTop, box.behavior], [1000, 'smooth']);
  box.scrollTop = 700; // a smooth scroll's events go down while it glides: following holds
  scroll();
  assert.equal(pill(), false);
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  try { box.scrollTop = 200; scroll(); follow.jump(); assert.equal(box.behavior, 'auto', 'reduced motion: no glide'); }
  finally { delete globalThis.window; }
});

// Owner 2026-11-08: a card added to the canvas (its chip and generation row land in the Chat, an accepted review card leaves it) never
// moves the Chat away from where the reader is. At the bottom it stays at the latest; scrolled up, the place is kept and only the pill shows.
test('a card added while the reader is at the bottom: the Chat stays at the latest message', () => {
  const { box, scroll, grow, pill } = mount();
  grow(-160); // the accepted review card leaves the transcript
  grow(56); // the result chip and the generation row land
  scroll();
  assert.equal(box.scrollTop, box.scrollHeight, 'still at the bottom');
  assert.equal(pill(), false);
});

test('a card added while the reader is scrolled up: the place is kept exactly and only the pill shows', () => {
  const { box, scroll, grow, pill } = mount();
  box.scrollTop = 200;
  scroll();
  grow(56); // the chip lands below the reader
  scroll();
  assert.equal(box.scrollTop, 200, 'no jump');
  assert.equal(pill(), true);
});

test('a review card removed above the viewport: the browser\'s scroll anchoring keeps the content in place and the hook never undoes it', () => {
  const { box, scroll, observer, pill } = mount();
  box.scrollTop = 500;
  scroll();
  // the card (160px) above the viewport goes: scroll anchoring moves scrollTop by the same amount, so the visible content stays put
  Object.assign(box, { scrollHeight: box.scrollHeight - 160, scrollTop: 340 });
  observer.fn([]);
  scroll();
  assert.equal(box.scrollTop, 340, 'the anchored place, not moved again');
  assert.equal(pill(), true, 'still scrolled up: the pill, not a jump');
});
