import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_SIZE_KEY, CARD_SIZES, DEFAULT_CARD_SIZE, readCardSize, setCardSize } from './card-size.js';

const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const memory = (initial = {}) => { const m = { ...initial }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };

// Owner, 2026-10-22: a "Card size" slider beside Filters and Sort, Small to Large, remembered across Home, Library and
// Explore and after a reload; the page renders correctly with no storage.
test('the size is read from one key, falls back to Large, and never throws on blocked or bad storage', () => {
  assert.equal(CARD_SIZE_KEY, 'small.cardSize');
  assert.equal(DEFAULT_CARD_SIZE, CARD_SIZES.length - 1);
  assert.equal(CARD_SIZES[0], 'Small');
  assert.equal(CARD_SIZES[DEFAULT_CARD_SIZE], 'Large');
  assert.equal(readCardSize(memory()), DEFAULT_CARD_SIZE);
  for (let n = 0; n < CARD_SIZES.length; n++) assert.equal(readCardSize(memory({ [CARD_SIZE_KEY]: String(n) })), n);
  for (const bad of ['-1', '4', '1.5', 'x', '']) assert.equal(readCardSize(memory({ [CARD_SIZE_KEY]: bad })), DEFAULT_CARD_SIZE, bad);
  assert.equal(readCardSize(null), DEFAULT_CARD_SIZE);
  assert.equal(readCardSize({ getItem() { throw new Error('blocked'); } }), DEFAULT_CARD_SIZE);
});

test('a chosen size is stored, survives a reload (a fresh read), and a blocked store does not break choosing', () => {
  const store = memory();
  setCardSize(1, store);
  assert.equal(store.m[CARD_SIZE_KEY], '1');
  assert.equal(readCardSize(store), 1, 'the next page load reads it');
  assert.doesNotThrow(() => setCardSize(0, { setItem() { throw new Error('blocked'); } }));
  setCardSize(DEFAULT_CARD_SIZE, memory());
});

test('the slider, its placement on all three pages, and the grid rule that makes smaller cards fit more columns', () => {
  const control = read('CardSize.jsx');
  assert.match(control, /type="range"[^>]*min=\{0\} max=\{CARD_SIZES\.length - 1\} step=\{1\} value=\{size\} aria-label="Card size" aria-valuetext=\{CARD_SIZES\[size\]\}/);
  assert.match(control, />Card size</);
  assert.match(control, />Small</);
  assert.match(control, />Large</);
  assert.match(control, /max-md:w-full/, 'on a phone it takes its own row');
  assert.match(read('../App.jsx'), /<LibraryFilters type=\{type\}[^\n]*<SortMenu size="md"[^\n]*\/>\}\{!archived && type !== 'apps' && <CardSize \/>\}/, 'the Library: after Filters and Sort');
  const home = read('../Home.jsx');
  assert.equal((home.match(/<CardSize \/>/g) || []).length, 2, 'Home (beside Start a rabbit hole) and Explore (beside Filters and Sort)');
  const css = read('../index.css');
  assert.match(css, /\.card-grid \{ grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, var\(--card-min, 100%\)\), 1fr\)\); \}/);
  const widths = [0, 1, 2].map((n) => Number(css.match(new RegExp(String.raw`html\[data-card-size="${n}"\] \{ --card-min: (\d+)px; \}`))[1]));
  assert.deepEqual([...widths].sort((a, b) => a - b), widths, 'a smaller size is a narrower minimum card');
  assert.match(css, /\.card-grid > li > \[data-card-thumbnail\] \{ order: 0; width: 100%; max-width: none; height: auto; aspect-ratio: 2 \/ 1; \}/, 'the picture scales with the card');
  // It resizes the card grid only: no rule on the page, main, the sidebar or html font size.
  assert.doesNotMatch(css.match(/Card size \(owner[\s\S]*?(?=\/\* Rabbit Hole dev, below md)/)[0], /font-size|\bmain\b|data-shell-sidebar|zoom/);
});

test('Home, Library and Explore have no composer: the Agent Bar is hidden there and the card grid is the only thing that resizes', () => {
  const routes = read('../routes.js');
  assert.match(routes, /barHidden: \['learn', 'canvas', 'chat', 'run', 'home', 'library', 'explore'\]\.includes\(place\)/);
});
