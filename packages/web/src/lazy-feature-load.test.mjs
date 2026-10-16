import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { featureLoader } from './lazy-feature-load.js';

// Follow-up R3 item 1: a lazy feature's import that fails (offline, a chunk gone after a deploy) never rejects, so React.lazy
// never throws it to the root crash handler (main.jsx onUncaughtError), which would replace the page and its canvas.
const Unavailable = () => null;
const offline = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: http://127.0.0.1/static/EquationEditor-x.js'));

test('a rejected import resolves to the Unavailable stand-in, with the error, the import to retry and the props', async () => {
  const module = await featureLoader(offline, Unavailable)();
  assert.equal(typeof module.default, 'function');
  const element = module.default({ latex: 'x^2' });
  assert.equal(element.type, Unavailable);
  assert.equal(element.props.retry, offline);
  assert.deepEqual(element.props.props, { latex: 'x^2' });
  assert.match(element.props.error.message, /Failed to fetch dynamically imported module/);
});

test('an import that throws at once, or resolves without a module (vite:preloadError prevented), is unavailable too', async () => {
  for (const factory of [() => { throw new Error('sync'); }, () => Promise.resolve(undefined), () => Promise.resolve({})]) {
    const module = await featureLoader(factory, Unavailable)();
    assert.equal(module.default({}).type, Unavailable);
  }
});

test('a loaded module passes through unchanged', async () => {
  const Real = () => null, loaded = { default: Real };
  assert.equal(await featureLoader(() => Promise.resolve(loaded), Unavailable)(), loaded);
});

test('every lazy feature inside the live canvas page loads through lazyFeature, never a bare React.lazy', () => {
  for (const file of ['AdaptiveCanvas.jsx', 'ChartBlock.jsx', 'LearningBlocks.jsx', 'LearnPage.jsx', 'repository-canvas.jsx']) {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?<![\w.])lazy\(/, file);
    assert.match(source, /lazyFeature\(/, file);
  }
});
