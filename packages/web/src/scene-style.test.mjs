import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILL, HEAT_DIVERGING, HEAT_INK_FLIP, HEAT_SCALE, HEAT_TOKENS, ROLES, ROLE_FILL, STATES, TYPE_ROLES, TIMING, SPACE } from './scene-vocab.js';
import { roleVar, tintOf, textStyle, shapeStyle, inkOn, heatStyle, heatInk, selectionRing } from './scene-style.js';

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

// Bars asked for a stronger fallback than soft (see shapeStyle's comment and
// AnimatedScene.jsx's bars) - an explicit ROLE_FILL entry must still win, and
// the invariant above must still hold for whichever band actually gets used.
test('a caller may raise the fallback tier, but an explicit ROLE_FILL entry always wins', () => {
  for (const role of ROLES) {
    const band = FILL[ROLE_FILL[role] ?? 'strong'];
    const { fill, fillBand } = shapeStyle(role, {}, 'strong');
    assert.deepEqual(fillBand, band);
    const percent = fill === roleVar(role) ? 100 : Number(fill.match(/ (\d+)%/)?.[1]);
    assert.ok(band.includes(percent), `${role} with a 'strong' fallback gave ${percent}, outside ${band.join('/')}`);
  }
  assert.deepEqual(shapeStyle('observed', {}, 'strong').fillBand, FILL.solid, 'observed is explicit in ROLE_FILL - the fallback must not override it');
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

test('every HEAT_INK_FLIP entry names a token heatStyle can actually produce, with both themes present', () => {
  assert.deepEqual(Object.keys(HEAT_INK_FLIP).sort(), [...HEAT_TOKENS].sort());
  for (const token of Object.keys(HEAT_INK_FLIP)) {
    assert.ok(HEAT_TOKENS.includes(token), `${token} names neither a diverging heat token nor the scale token`);
    for (const theme of ['light', 'dark']) {
      const flip = HEAT_INK_FLIP[token][theme];
      assert.equal(flip.length, 2, `${token}/${theme} needs exactly [mid, high]`);
      assert.ok(flip[0] < flip[1], `${token}/${theme} mid threshold must precede high`);
    }
  }
});

test('no tintOf( call remains in AnimatedScene.jsx outside comments', () => {
  const source = readFileSync(new URL('./AnimatedScene.jsx', import.meta.url), 'utf8');
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /tintOf\(/, 'the renderer must reach every fill through shapeStyle or heatStyle, never tintOf directly');
});

// --- Sign fidelity: independent of magnitude and of contrast (Task E's
// three-way split from the coordinator's review - a combined test hides
// which property actually broke). value + domain + heatMode + dark ->
// { fillToken, mixPercent, inkToken }.
test('sign fidelity: signed picks a different token either side of zero; magnitude and sequential never do', () => {
  const domain = { min: -8, max: 8 };
  for (const magnitude of [1, 4, 8]) {
    const negative = heatStyle(-magnitude, domain, 'signed', false);
    const positive = heatStyle(magnitude, domain, 'signed', false);
    assert.notEqual(negative.fillToken, positive.fillToken, `signed +-${magnitude} shared a token`);
    assert.ok(HEAT_DIVERGING.includes(negative.fillToken) && HEAT_DIVERGING.includes(positive.fillToken));

    const negMag = heatStyle(-magnitude, domain, 'magnitude', false);
    const posMag = heatStyle(magnitude, domain, 'magnitude', false);
    assert.equal(negMag.fillToken, posMag.fillToken, `magnitude +-${magnitude} disagreed on a token`);
    assert.equal(negMag.mixPercent, posMag.mixPercent, `magnitude +-${magnitude} disagreed on how hot it reads`);
    // The token this reads from must be its own quantitative name, never a
    // role and never one of the diverging (signed) tokens - a magnitude cell
    // must not be readable as "which object" or "which side of zero".
    assert.equal(negMag.fillToken, HEAT_SCALE, 'magnitude must paint with the quantitative scale token, not a role');
    assert.ok(!HEAT_DIVERGING.includes(negMag.fillToken), 'magnitude must not borrow the signed scale either');
  }
  assert.equal(heatStyle(0, domain, 'signed', false).fillToken, 'heat-midpoint', 'zero is neither sign');
});

test('sign fidelity: sequential paints with the scale token, never a role, regardless of sign', () => {
  const domain = { min: -10, max: 10 };
  for (const value of [-10, -0.5, 0, 0.5, 10]) {
    const { fillToken } = heatStyle(value, domain, 'sequential', false);
    assert.equal(fillToken, HEAT_SCALE, `sequential at ${value} used ${fillToken}, not the scale token`);
  }
});

// --- Magnitude fidelity: the ramp itself, independent of ink. Requirement 1 -
// sample at least 101 shares across the full 0..1 range and prove the ramp
// never collapses the way the shipped 28/96 cliff did (0.4 -> 24%, 0.5 -> 96%).
test('magnitude fidelity: mixPercent is monotonic and steps by at most 1 across 101 samples', () => {
  const domain = { min: 0, max: 1 };
  const samples = 101; // requirement: at least 101 values from 0 to 1
  const percents = [];
  for (let i = 0; i < samples; i += 1) percents.push(heatStyle(i / (samples - 1), domain, 'magnitude', false).mixPercent);
  for (let i = 1; i < percents.length; i += 1) {
    assert.ok(percents[i] >= percents[i - 1], `share ${((i) / (samples - 1)).toFixed(2)} (${percents[i]}%) read cooler than the previous share (${percents[i - 1]}%)`);
    // The ramp's slope is (100 - HEAT_FLOOR) per unit share; over a 1/100
    // share step that is under 1, so a rounded step can only ever be 0 or 1 -
    // never the 68-point cliff the previous pass shipped (28% -> 96%).
    assert.ok(percents[i] - percents[i - 1] <= 1, `share step produced a jump of ${percents[i] - percents[i - 1]}, expected at most 1`);
  }
  const distinct = new Set(percents).size;
  assert.ok(distinct >= 90, `only ${distinct} distinct mixPercent levels across 101 samples - magnitude must stay readable`);
});

test('magnitude fidelity: sequential preserves order by raw value; magnitude preserves order by |value|', () => {
  const domain = { min: -10, max: 10 };
  const values = [-10, -6, -2, -0.5, 0, 0.5, 2, 6, 10];
  const percents = values.map(value => heatStyle(value, domain, 'sequential', false).mixPercent);
  for (let i = 1; i < percents.length; i += 1) {
    assert.ok(percents[i] >= percents[i - 1], `${values[i]} (${percents[i]}%) read cooler than ${values[i - 1]} (${percents[i - 1]}%)`);
  }
  const byAbs = [...values].sort((a, b) => Math.abs(a) - Math.abs(b));
  for (let i = 1; i < byAbs.length; i += 1) {
    const a = heatStyle(byAbs[i - 1], domain, 'magnitude', false).mixPercent;
    const b = heatStyle(byAbs[i], domain, 'magnitude', false).mixPercent;
    assert.ok(b >= a, `magnitude did not preserve order by |value|: |${byAbs[i - 1]}| then |${byAbs[i]}|`);
  }
});

// The invariant itself, asserted directly rather than only implied by the
// tests above: contrast is solved by changing ink, never by narrowing the
// fill ramp. If a future change reintroduces a fill-side dodge to make
// contrast easier, the distinct-level count collapses and this fails, even
// though the accessibility test below would still pass.
test('invariant: contrast is solved by ink, never by distorting the fill ramp', () => {
  const domain = { min: 0, max: 1 };
  const percents = new Set();
  for (let i = 0; i <= 100; i += 1) percents.add(heatStyle(i / 100, domain, 'magnitude', false).mixPercent);
  assert.ok(percents.size >= 90, `only ${percents.size} distinct mixPercent levels - the ramp must stay continuous regardless of what the ink does`);
});

// --- Text accessibility: independent of both the tests above. This is the
// test the whole defect exists for. color-mix(in srgb, X P%, transparent)
// composites X's own channels at alpha P% over whatever is behind it, so a
// step's real on-screen colour is just an alpha blend of the fill's hex over
// --viz-surface. Every integer mixPercent from HEAT_FLOOR (6) to 100 is
// actually reachable now the ramp is continuous, so every one of them is
// checked - not a sample - for every heat token, in both themes.
test('text accessibility: every mixPercent the ramp can emit clears 4.5:1 ink contrast, for every heat token, in both themes', () => {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const lightBlock = css.slice(0, css.indexOf('.dark {'));
  const darkBlock = css.slice(css.indexOf('.dark {'), css.indexOf('}', css.indexOf('.dark {')));
  const hex = (block, name) => {
    const match = block.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `no ${name} in this theme's block`);
    return match[1];
  };
  const themes = {
    light: { block: lightBlock, dark: false, surface: hex(lightBlock, '--viz-surface'), page: hex(lightBlock, '--color-ink') },
    dark: { block: darkBlock, dark: true, surface: hex(darkBlock, '--viz-surface'), page: hex(darkBlock, '--color-ink') },
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
    if (inkToken === 'var(--color-ink)') return theme.page;
    if (inkToken === 'var(--viz-ink-mid)') return hex(theme.block, '--viz-ink-mid');
    if (inkToken === 'var(--viz-ink-high)') return hex(theme.block, '--viz-ink-high');
    assert.fail(`unrecognised inkToken shape: ${inkToken}`);
  };

  let checked = 0;
  for (const themeName of ['light', 'dark']) {
    const theme = themes[themeName];
    for (const token of HEAT_TOKENS) {
      const fillHex = hex(theme.block, `--viz-${token}`);
      for (let percent = 6; percent <= 100; percent += 1) {
        const inkToken = heatInk(token, percent, theme.dark);
        const eff = compositeOver(fillHex, percent, theme.surface);
        const ink = rgb(inkHex(theme, inkToken));
        const ratio = contrastRatio(eff, ink);
        assert.ok(ratio >= 4.5,
          `${themeName}/${token}@${percent}%: vs ${inkToken} only cleared ${ratio.toFixed(2)}:1`);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 2 * HEAT_TOKENS.length * 95, 'every theme x token x reachable percent must have been checked');
});

// A viewer reported being unable to find the selected cell unprompted - a
// 0.5px stroke difference (highlighted's step 2 vs resting's step 1) was the
// entire distinction. selectionRing must read the same weight regardless of
// how saturated the cell it sits on is, and must never perturb the value it
// sits on top of.
test('a selected cell rings equally strong at minimum and maximum heat intensity, without touching the fill', () => {
  const domain = { min: 0, max: 1 };
  const pale = heatStyle(0.001, domain, 'magnitude', false); // near HEAT_FLOOR
  const saturated = heatStyle(1, domain, 'magnitude', false); // full mix
  assert.notEqual(pale.mixPercent, saturated.mixPercent, 'the fixture must actually span low and high intensity');

  const paleRing = selectionRing('observed', pale);
  const saturatedRing = selectionRing('observed', saturated);
  assert.equal(paleRing.strokeWidth, saturatedRing.strokeWidth, 'selection must read equally strong regardless of intensity');
  // Borrowing heat's own ink means the ring is provably safe against this
  // exact fill - it is exercised at every mixPercent by the accessibility
  // test above, so a ring built from it inherits that guarantee for free.
  assert.equal(paleRing.stroke, pale.inkToken);
  assert.equal(saturatedRing.stroke, saturated.inkToken);
  assert.notEqual(paleRing.stroke, saturatedRing.stroke, 'a pale and a saturated cell need different ink, which is exactly why the ring borrows it instead of a fixed colour');

  // Selecting a cell must not move VALUE: same mixPercent/fillToken with or
  // without the ring.
  const rePale = heatStyle(0.001, domain, 'magnitude', false);
  assert.equal(rePale.mixPercent, pale.mixPercent);
  assert.equal(rePale.fillToken, pale.fillToken);
});

test('a selected non-heat cell still gets the stronger ring weight, in the role colour', () => {
  const ring = selectionRing('prediction', null);
  assert.equal(ring.stroke, roleVar('prediction'), 'no heat ink to borrow, so it keeps the role colour');
  const plain = shapeStyle('prediction', {});
  assert.ok(ring.strokeWidth > plain.strokeWidth, 'still reads stronger than resting');
});

// Requirement 5: row/column labels are axis names, not data - they must read
// as muted chrome (--color-ink-3) in every matrix, not a role or a heat
// token, and not hardcoded to one lesson's own scene.
test('grid row and column labels use the muted text token, generically', () => {
  const source = readFileSync(new URL('./AnimatedScene.jsx', import.meta.url), 'utf8');
  const rowLabelBlock = source.slice(source.indexOf('rowLabels?.map'), source.indexOf('rowLabels?.map') + 400);
  const columnLabelBlock = source.slice(source.indexOf('columnLabels?.map'), source.indexOf('columnLabels?.map') + 400);
  for (const [name, block] of [['row', rowLabelBlock], ['column', columnLabelBlock]]) {
    assert.match(block, /fill:\s*'var\(--color-ink-3\)'/, `${name} labels must use the muted text token`);
    assert.doesNotMatch(block, /roleVar|--viz-|heat/, `${name} labels must not read a role or heat colour`);
  }
});
