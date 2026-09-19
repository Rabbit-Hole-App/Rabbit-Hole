import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILL, ROLES, ROLE_FILL, STATES, TYPE_ROLES, TIMING, SPACE } from './scene-vocab.js';
import { roleVar, tintOf, textStyle, shapeStyle, inkOn } from './scene-style.js';

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

// Fill now carries two things at once - which role this is, and what state it
// is in. That only works while the bands stay apart: the moment a chosen soft
// role reaches a strong role's resting fill, the two readings collide and
// neither can be trusted.
test('the fill bands never overlap, so state cannot impersonate a role', () => {
  const bands = Object.entries(FILL).map(([tier, steps]) => ({ tier, low: Math.min(...steps), high: Math.max(...steps) }))
    .sort((a, b) => a.low - b.low);
  for (const [index, band] of bands.entries()) {
    if (index === 0) continue;
    assert.ok(band.low > bands[index - 1].high,
      `${band.tier} starts at ${band.low}, inside ${bands[index - 1].tier} which reaches ${bands[index - 1].high}`);
  }
  for (const steps of Object.values(FILL)) {
    assert.deepEqual([...steps].sort((a, b) => a - b), [...steps], 'a band runs muted, rest, lit, peak');
  }
});

test('a role names a tier that exists, and most roles stay quiet', () => {
  for (const [role, tier] of Object.entries(ROLE_FILL)) {
    assert.ok(ROLES.includes(role), `${role} is not a role`);
    assert.ok(FILL[tier], `${role} names tier ${tier}, which is not defined`);
  }
  assert.ok(Object.keys(ROLE_FILL).length * 2 <= ROLES.length, 'loud has to stay rare to mean anything');
});

// A solid role IS the background where its label sits, and which ink survives
// there flips with the theme - observed is near-black in light, near-white in
// dark. A fixed white would be invisible on one of them.
test('a solid role carries its own ink, and only a solid role needs one', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  for (const role of ROLES) {
    if (ROLE_FILL[role] !== 'solid') {
      assert.equal(inkOn(role), 'var(--color-ink)', `${role} is a tint over the surface, so the page ink wins`);
      continue;
    }
    assert.equal(inkOn(role), `var(--viz-on-${role})`);
    assert.equal(css.split(`--viz-on-${role}:`).length - 1, 2, `--viz-on-${role} needs a light and a dark value`);
  }
});

test('every state still lands inside its own role band', () => {
  for (const role of ROLES) {
    const band = FILL[ROLE_FILL[role] ?? 'soft'];
    for (const state of [...STATES, null]) {
      const { fill } = shapeStyle(role, state ? { [state]: true } : {});
      const percent = fill === roleVar(role) ? 100 : Number(fill.match(/ (\d+)%/)?.[1]);
      assert.ok(band.includes(percent), `${role} + ${state} gave ${percent}, outside ${band.join('/')}`);
    }
  }
});
