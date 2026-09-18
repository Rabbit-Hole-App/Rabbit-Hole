import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES, STATES, TIMING, SPACE } from './scene-vocab.js';
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

test('the scales are frozen, so nobody edits the system by accident', () => {
  for (const frozen of [ROLES, STATES, SPACE]) assert.throws(() => frozen.push('x'), TypeError);
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
