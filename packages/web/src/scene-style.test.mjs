import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES, STATES, TYPE_ROLES, TIMING, SPACE } from './scene-vocab.js';
import { roleVar, tintOf, textStyle, shapeStyle } from './scene-style.js';

test('a role resolves to a token reference, never to a colour', () => {
  for (const role of ROLES) {
    assert.equal(roleVar(role), `var(--viz-${role})`);
    assert.doesNotMatch(roleVar(role), /#|rgb|hsl/, `${role} leaked a literal colour`);
  }
  assert.equal(roleVar('nonsense'), 'var(--viz-neutral)', 'an unknown role falls back rather than breaking the frame');
});

test('a tint is a colour-mix of the role, so it follows the theme', () => {
  assert.equal(tintOf('input', 12), 'color-mix(in srgb, var(--viz-input) 12%, transparent)');
  assert.equal(tintOf('input', 0), 'transparent');
  assert.equal(tintOf('input', 100), 'var(--viz-input)', 'a full tint is the token itself');
});

test('state modulates weight and fill, never hue', () => {
  const plain = shapeStyle('prediction', {});
  const picked = shapeStyle('prediction', { selected: true });
  assert.equal(plain.stroke, picked.stroke, 'selection must not change the colour of the thing selected');
  assert.ok(picked.strokeWidth > plain.strokeWidth, 'selection reads as weight');
  assert.notEqual(plain.fill, picked.fill, 'and as fill strength');
});

test('every state composes with every role without throwing', () => {
  for (const role of ROLES) for (const state of STATES) {
    const style = shapeStyle(role, { [state]: true });
    assert.ok(style.fill && style.stroke, `${role} + ${state} produced nothing`);
  }
});

test('being unavailable outranks being attended to', () => {
  const blocked = shapeStyle('input', { blocked: true });
  assert.deepEqual(shapeStyle('input', { blocked: true, selected: true }), blocked,
    'a blocked thing must not read as freely selectable just because it is also selected');
  assert.deepEqual(shapeStyle('input', { disabled: true, blocked: true }), shapeStyle('input', { disabled: true }));
});

test('the scales are frozen, so nobody edits the system by accident', () => {
  for (const frozen of [ROLES, STATES, SPACE]) assert.throws(() => frozen.push('x'), TypeError);
  assert.throws(() => { textStyle('caption').fontSize = 99; }, TypeError, 'a returned text style is shared, so it must be read-only');
  assert.deepEqual(SPACE, [4, 8, 12, 16, 24, 32, 48, 64, 96]);
  assert.equal(TIMING.slow, 0.7);
});

test('typography is a role, not a size', () => {
  assert.ok(textStyle('caption').fontSize < textStyle('heading').fontSize);
  assert.match(textStyle('code').fontFamily, /mono/i);
});

// Task 3 defined the tokens by hand in two separate CSS blocks. Nothing would
// catch a role added to one and not the other, and the failure is invisible
// until a learner toggles appearance. This closes that by reading the stylesheet.
test('every role has a token in both themes', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const block = name => {
    const start = css.indexOf(name);
    assert.ok(start > -1, `no ${name} block in index.css`);
    return css.slice(start, css.indexOf('}', start));
  };
  // the light roles live in their own :root block, after the --tok-* one
  const light = css.slice(css.indexOf('--viz-neutral'));
  const dark = block('.dark {');
  for (const role of ROLES) {
    assert.match(light, new RegExp(`--viz-${role}\\s*:`), `${role} has no light token`);
    assert.match(dark, new RegExp(`--viz-${role}\\s*:`), `${role} has no dark token`);
  }
  assert.match(light, /--viz-surface\s*:/);
  assert.match(dark, /--viz-surface\s*:/);
});

// scene-style.js re-lists the state and typography names by hand in its own
// lookup tables. A name added to the vocabulary but not to a table falls
// through to the default silently - the shape still renders, just wrong.
test('every state and typography role has an entry in the style tables', () => {
  const source = readFileSync(new URL('./scene-style.js', import.meta.url), 'utf8');
  const table = name => {
    const start = source.indexOf(`const ${name} = {`);
    assert.ok(start > -1, `no ${name} table in scene-style.js`);
    return source.slice(start, source.indexOf('};', start));
  };
  const states = table('STATE_STYLE');
  for (const state of STATES) assert.match(states, new RegExp(`^\\s*${state}\\s*:`, 'm'), `${state} has no style`);
  const text = table('TEXT_STYLE');
  for (const role of TYPE_ROLES) assert.match(text, new RegExp(`^\\s*${role}\\s*:`, 'm'), `${role} has no typography`);
  for (const state of STATES) assert.ok(source.includes(`'${state}'`), `${state} is missing from STATE_PRIORITY`);
});
