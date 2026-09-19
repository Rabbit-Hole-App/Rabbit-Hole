import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILL, HEAT_DIVERGING, HEAT_INK_FLIP, HEAT_MODES, ROLES, ROLE_FILL, STATES, TYPE_ROLES, TIMING, SPACE } from './scene-vocab.js';
import { roleVar, tintOf, textStyle, shapeStyle, inkOn, heatStyle } from './scene-style.js';

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

// This is the test that should have existed and did not: the grid path never
// called shapeStyle, so the non-overlap invariant above was never actually
// exercised against what a learner sees. Blocked and highlighted are exactly
// the two states AnimatedScene.jsx's grid cells pass.
test('a grid cell (blocked or highlighted) still lands inside its role band, through the grid path', () => {
  for (const role of ROLES) {
    const band = FILL[ROLE_FILL[role] ?? 'soft'];
    for (const state of [{ blocked: true }, { highlighted: true }, { highlighted: false }]) {
      const look = shapeStyle(role, state);
      assert.deepEqual(look.fillBand, band, `${role} exposed a different band than FILL says it should have`);
      const percent = look.fill === roleVar(role) ? 100 : Number(look.fill.match(/ (\d+)%/)?.[1]);
      assert.ok(band.includes(percent), `${role} + ${JSON.stringify(state)} gave ${percent}, outside ${band.join('/')} - the grid's own cell path`);
    }
  }
});

test('every HEAT_INK_FLIP entry names a token heatStyle can actually produce', () => {
  for (const token of Object.keys(HEAT_INK_FLIP)) {
    assert.ok(HEAT_DIVERGING.includes(token) || ROLE_FILL[token] === 'solid', `${token} names neither a diverging heat token nor a solid role`);
  }
});

test('no tintOf( call remains in AnimatedScene.jsx outside comments', () => {
  const source = readFileSync(new URL('./AnimatedScene.jsx', import.meta.url), 'utf8');
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /tintOf\(/, 'the renderer must reach every fill through shapeStyle or heatStyle, never tintOf directly');
});

// value + domain + heatMode + semantic tokens -> { fillToken, mixPercent, inkToken }.
test('signed picks a different token either side of zero; magnitude does not care about sign', () => {
  const domain = { min: -8, max: 8 };
  for (const magnitude of [1, 4, 8]) {
    const negative = heatStyle(-magnitude, domain, 'signed', 'observed');
    const positive = heatStyle(magnitude, domain, 'signed', 'observed');
    assert.notEqual(negative.fillToken, positive.fillToken, `signed +-${magnitude} shared a token`);
    assert.ok(HEAT_DIVERGING.includes(negative.fillToken) && HEAT_DIVERGING.includes(positive.fillToken));

    const negMag = heatStyle(-magnitude, domain, 'magnitude', 'observed');
    const posMag = heatStyle(magnitude, domain, 'magnitude', 'observed');
    assert.equal(negMag.fillToken, posMag.fillToken, `magnitude +-${magnitude} disagreed on a token`);
    assert.equal(negMag.mixPercent, posMag.mixPercent, `magnitude +-${magnitude} disagreed on how hot it reads`);
    assert.equal(negMag.fillToken, 'observed', 'magnitude paints with the role, not a diverging scale');
  }
  assert.equal(heatStyle(0, domain, 'signed', 'observed').fillToken, 'heat-midpoint', 'zero is neither sign');
});

test('sequential preserves order: a higher value never yields a lower mixPercent', () => {
  const domain = { min: -10, max: 10 };
  const values = [-10, -6, -2, -0.5, 0, 0.5, 2, 6, 10];
  const percents = values.map(value => heatStyle(value, domain, 'sequential', 'observed').mixPercent);
  for (let i = 1; i < percents.length; i += 1) {
    assert.ok(percents[i] >= percents[i - 1], `${values[i]} (${percents[i]}%) read cooler than ${values[i - 1]} (${percents[i - 1]}%)`);
  }
  // and the same is true for magnitude, over |value|
  const magPercents = values.map(value => heatStyle(value, domain, 'magnitude', 'observed').mixPercent);
  const byAbs = [...values].sort((a, b) => Math.abs(a) - Math.abs(b));
  for (let i = 1; i < byAbs.length; i += 1) {
    const a = heatStyle(byAbs[i - 1], domain, 'magnitude', 'observed').mixPercent;
    const b = heatStyle(byAbs[i], domain, 'magnitude', 'observed').mixPercent;
    assert.ok(b >= a, `magnitude did not preserve order by |value|: |${byAbs[i - 1]}| then |${byAbs[i]}|`);
  }
});

// The test the whole defect exists for. color-mix(in srgb, X P%, transparent)
// composites X's own channels at alpha P% over whatever is behind it, so a
// step's real on-screen colour is just an alpha blend of the fill's hex over
// --viz-surface - see scene-style.js's heatStyle comment for why the ramp
// jumps at 28/96 rather than running smoothly between them.
test('every heat step clears 4.5:1 ink contrast, in both themes', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const lightBlock = css.slice(0, css.indexOf('.dark {'));
  const darkBlock = css.slice(css.indexOf('.dark {'), css.indexOf('}', css.indexOf('.dark {')));
  const hex = (block, name) => {
    const match = block.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `no ${name} in this theme's block`);
    return match[1];
  };
  const themes = {
    light: { block: lightBlock, surface: hex(lightBlock, '--viz-surface'), ink: hex(lightBlock, '--color-ink') },
    dark: { block: darkBlock, surface: hex(darkBlock, '--viz-surface'), ink: hex(darkBlock, '--color-ink') },
  };
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const relLum = ([r, g, b]) => {
    const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const [rl, gl, bl] = [r, g, b].map(lin);
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  };
  const contrastRatio = (a, b) => {
    const [l1, l2] = [relLum(a), relLum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const compositeOver = (fillHex, percent, surfaceHex) => {
    const f = rgb(fillHex), s = rgb(surfaceHex);
    const a = percent / 100;
    return f.map((channel, index) => channel * a + s[index] * (1 - a));
  };
  const inkHex = (theme, inkToken) => {
    if (inkToken === 'var(--color-ink)') return theme.ink;
    const name = inkToken.match(/--viz-on-([\w-]+)/)?.[1];
    assert.ok(name, `unrecognised inkToken shape: ${inkToken}`);
    return hex(theme.block, `--viz-on-${name}`);
  };

  const domain = { min: -10, max: 10 };
  // Every step of the ramp: both safe bands (see HEAT_INK_FLIP's comment for
  // why nothing between them is ever produced), at both ends and near each
  // threshold, for every mode and every role/token heatStyle can resolve to.
  const shares = [0, 0.1, 0.3, 0.49, 0.5, 0.7, 0.9, 1];
  const cases = [];
  for (const share of shares) {
    cases.push({ mode: 'magnitude', role: 'observed', value: share * 10 });
    cases.push({ mode: 'magnitude', role: 'success', value: share * 10 });
    cases.push({ mode: 'sequential', role: 'observed', value: domain.min + share * (domain.max - domain.min) });
    cases.push({ mode: 'signed', role: 'observed', value: share * 10 });
    cases.push({ mode: 'signed', role: 'observed', value: -share * 10 });
  }
  assert.ok(HEAT_MODES.every(mode => cases.some(c => c.mode === mode)), 'every heat mode must be exercised');

  let checked = 0;
  for (const themeName of ['light', 'dark']) {
    const theme = themes[themeName];
    for (const { mode, role, value } of cases) {
      const { fillToken, mixPercent, inkToken } = heatStyle(value, domain, mode, role);
      const fillHex = hex(theme.block, `--viz-${fillToken}`);
      const eff = compositeOver(fillHex, mixPercent, theme.surface);
      const ink = rgb(inkHex(theme, inkToken));
      const ratio = contrastRatio(eff, ink);
      assert.ok(ratio >= 4.5,
        `${themeName}/${mode}/${role} value=${value}: fill ${fillToken}@${mixPercent}% vs ${inkToken} only cleared ${ratio.toFixed(2)}:1`);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});
