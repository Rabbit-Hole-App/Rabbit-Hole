
// Item 5: a whisker beyond the (validated) fences names both numbers, tagged arithmetic, half a unit of the decimals written.
test('box plot: a whisker beyond a correct fence is an arithmetic issue naming the whiskers and the fences; whiskers on the fence or inside pass', () => {
  const card = box => fenceCard({ q1: 6, median: 9, q3: 12, fences: { lower: -3, upper: 21 }, whiskerLow: 4, whiskerHigh: 14, ...box }, { label: 'Reading', min: -5, max: 25 });
  assert.equal(schema.safeParse(card({})).success, true);
  assert.equal(schema.safeParse(card({ whiskerHigh: 21 })).success, true, 'a whisker exactly on the fence');
  assert.equal(schema.safeParse(card({ whiskerLow: -3 })).success, true);
  const high = schema.safeParse(card({ whiskerHigh: 23 })).error.issues;
  assert.equal(high.length, 1, 'the fences themselves are right, so this is the only issue');
  assert.equal(high[0].message, 'Fences must enclose both whiskers: the whiskers run from 4 to 23, outside the fences -3 and 21.');
  assert.deepEqual([high[0].path.join('.'), high[0].params], ['boxes.0.fences', { code: 'arithmetic' }]);
  assert.equal(schema.safeParse(card({ whiskerLow: -4 })).error.issues[0].params.code, 'arithmetic');
  // half a unit of the decimals written: one decimal allows 0.05 beyond, not 0.2
  const tenth = box => fenceCard({ q1: 6.5, median: 9, q3: 12.5, fences: { lower: -2.5, upper: 21.5 }, whiskerLow: 4, whiskerHigh: 14, ...box }, { label: 'Reading', min: -5, max: 25 });
  assert.equal(schema.safeParse(tenth({ whiskerHigh: 21.5 })).success, true);
  assert.equal(schema.safeParse(tenth({ whiskerHigh: 21.7 })).success, false);
});
