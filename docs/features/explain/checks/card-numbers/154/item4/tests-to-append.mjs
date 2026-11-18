
// Item 4: a bootstrap draw has exactly n members for n rows (no tolerance).
const rows = id => ({ id, label: id.toUpperCase() });
const bootstrapCard = (draws, extra = {}) => ({ kind: 'sample-set', title: 'Bootstrap sample of training rows', caption: 'Worked example. Rows A to H are drawn with replacement.',
  samples: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(rows), groups: [{ id: 'boot', label: 'Draw', replacement: true, members: draws }], ...extra });
const arithmeticOf = value => { const r = schema.safeParse(value); return r.success ? [] : r.error.issues.filter(i => i.params?.code === 'arithmetic'); };

test('bootstrap draw count: the archive card (6 draws from 8 rows) fails with the numbers, tagged arithmetic; 8 from 8 passes', () => {
  const [bad] = arithmeticOf(bootstrapCard(['a', 'b', 'b', 'd', 'f', 'f']));
  assert.equal(bad.message, 'A bootstrap sample draws n = 8 rows, with replacement; this draws 6.');
  assert.deepEqual(bad.path, ['groups', 0, 'members']);
  assert.equal(schema.safeParse(bootstrapCard(['a', 'b', 'b', 'd', 'f', 'f', 'h', 'h'])).success, true);
  assert.equal(arithmeticOf(bootstrapCard(['a', 'b', 'b', 'd', 'f', 'f', 'h', 'h', 'h'])).length, 1, 'more than n is wrong too');
});

test('bootstrap draw count: m-out-of-n and subsample cards, cards that never say bootstrap, and groups without replacement are left alone; any label can carry the word', () => {
  const short = ['a', 'b', 'b', 'd'];
  assert.deepEqual(arithmeticOf(bootstrapCard(short, { title: 'Bootstrap with m out of n draws' })), []);
  assert.deepEqual(arithmeticOf(bootstrapCard(short, { title: 'm-out-of-n bootstrap' })), []);
  assert.deepEqual(arithmeticOf(bootstrapCard(short, { caption: 'A bootstrap subsample of the rows' })), []);
  assert.deepEqual(arithmeticOf(bootstrapCard(short, { title: 'Sampling with replacement', caption: 'Rows A to H, drawn with replacement.' })), [], 'bootstrap is never said');
  const labelled = bootstrapCard(short, { title: 'Sampling with replacement', caption: undefined }); labelled.groups[0].label = 'Bootstrap draw';
  assert.equal(arithmeticOf(labelled).length, 1, 'a group label saying bootstrap counts');
  const noReplacement = bootstrapCard(['a', 'b', 'c', 'd']); noReplacement.groups[0].replacement = false;
  assert.deepEqual(arithmeticOf(noReplacement), [], 'a plain subset is not a draw with replacement');
  const oob = bootstrapCard(['a', 'b', 'b', 'd', 'f', 'f', 'h', 'h']); oob.groups.push({ id: 'oob', label: 'Out of bag', outOfBagFor: 'boot', members: ['c', 'e', 'g'] });
  assert.equal(schema.safeParse(oob).success, true, 'the out-of-bag group is not a draw');
});
