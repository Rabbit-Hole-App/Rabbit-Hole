const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkSchema } = require('../lib/inputs');
const { parse } = require('../lib/toml');

test('constants declared in TOML preserve scalar types', () => {
  const config = parse('[constants]\nthreshold = 0.85\nregion = "us-east-1"\nenabled = false\ncount = 0');
  checkSchema(config);
  assert.deepEqual(config.constants, { threshold: 0.85, region: 'us-east-1', enabled: false, count: 0 });
});

test('invalid or oversized constants fail before deployment', () => {
  for (const constants of [null, [], { 'bad-name': 1 }, { x: {} }, { x: [1] }, { x: null },
    { x: Infinity }, { x: NaN }, { x: 2**53 }, { x: Number.MAX_SAFE_INTEGER + 0.5 }, { x: 'a'.repeat(2100) },
    Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['v' + i, i]))]) {
    assert.throws(() => checkSchema({ constants }), /constants/);
  }
});

test('constant tooltips preserve typed values and reject malformed definitions', () => {
  const config = parse('[constants]\nthreshold = { value = 0.85, tooltip = "Minimum score accepted." }\nenabled = { value = false }');
  checkSchema(config);
  assert.deepEqual(config.constants.threshold, { value: 0.85, tooltip: 'Minimum score accepted.' });
  for (const value of [{ tooltip: 'Missing value' }, { value: [] }, { value: 1, extra: true }, { value: 1, tooltip: 42 }, { value: 1, tooltip: 'x'.repeat(2001) }]) {
    assert.throws(() => checkSchema({ constants: { threshold: value } }), /constants/);
  }
});

test('input tooltip is optional text separate from help', () => {
  const config = parse('[inputs]\nprofile = { type = "select", default = "prod", options = ["prod", "sensitive"], help = "Choose a profile.", tooltip = "Prod: 90 degrees; sensitive: 80 degrees." }');
  checkSchema(config);
  assert.equal(config.inputs.profile.tooltip, 'Prod: 90 degrees; sensitive: 80 degrees.');
  for (const tooltip of [42, {}, null, 'x'.repeat(2001)]) {
    assert.throws(() => checkSchema({ inputs: { profile: { type: 'text', tooltip } } }), /tooltip/);
  }
});
