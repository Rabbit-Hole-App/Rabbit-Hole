
// Softmax recompute for list transformations (item 3): after_i = softmax(before)_i within half a unit of the decimals the author wrote for that item; off for temperature, scaled, masked, causal, log-softmax and "T =" cards.
const softmax = (before, after, extra = {}) => ({ version: 1, diagram: { kind: 'transformation', title: 'Softmax transformation', before: { label: 'Scores', items: before }, after: { label: 'Probabilities', items: after }, operation: 'Apply softmax', ...extra } });
const softmaxIssues = value => { const r = tutorDiagramSchema.safeParse(value); return r.success ? [] : r.error.issues; };
const arithmetic = issues => issues.filter(i => i.params?.code === 'arithmetic');

test('softmax list transformation: the real failing archive cards fail with the correct values for EVERY item, tagged arithmetic', () => {
  const [wrong] = arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.70', '0.26', '0.04'])));
  assert.match(wrong.message, /softmax\(2\.0, 1\.0, 0\.1\) = 0\.66, 0\.24, 0\.10, not 0\.70, 0\.26, 0\.04\./);
  assert.deepEqual(wrong.path, ['diagram', 'after', 'items']);
  assert.match(arithmetic(softmaxIssues(softmax(['-2', '0', '3'], ['0.04', '0.11', '0.85'])))[0].message, /softmax\(-2, 0, 3\) = 0\.01, 0\.05, 0\.95, not 0\.04, 0\.11, 0\.85\./);
  assert.throws(() => parseTutorDiagram(softmax(['2.0', '1.0', '0.1'], ['0.70', '0.26', '0.04'])), /softmax of the before values/);
});

test('softmax list transformation: half a unit of the decimals the author wrote for THAT item decides', () => {
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.2', '0.1'])), [], 'one decimal: 0.7 against the true 0.659 passes');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.66', '0.24', '0.10'])), []);
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.659', '0.242', '0.099'])), []);
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.66', '0.24', '0.04']))).length, 1, 'two decimals: 0.04 against 0.099 fails');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.24', '0.099'])), [], 'each item has its own decimals');
  assert.deepEqual(softmaxIssues(softmax(['z_1 = 2.0', 'z_2 = 1.0', 'z_3 = 0.1'], ['p_1 = 0.66', 'p_2 = 0.24', 'p_3 = 0.10'])), [], 'a label before the number is read past');
  assert.deepEqual(softmaxIssues(softmax(['2', '1', '0.1'], ['66%', '24%', '10%'])), [], 'percent items');
  assert.equal(arithmetic(softmaxIssues(softmax(['2', '1', '0.1'], ['70%', '26%', '4%']))).length, 1);
});

test('softmax list transformation: only with softmax in the title or operation and plain numbers on both sides', () => {
  assert.deepEqual(softmaxIssues(softmax(['h1', 'h2', 'h3'], ['0.7', '0.26', '0.04'])), [], 'non-numeric before items skip the rule');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.26', 'about 0.04'])), [], 'a non-numeric after item skips the rule');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.26'])), [], 'different lengths skip the rule');
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.26', '0.04'], { title: 'Scores to shares', operation: 'Normalize' })), [], 'no softmax named');
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.26', '0.04'], { title: 'Scores to shares', operation: 'Apply softmax' }))).length, 1, 'softmax in the operation alone is enough');
});

test('softmax list transformation: temperature, T =, scaled, scaling, masked, causal and log-softmax turn the recompute off; a correct softmax(before / T) card passes', () => {
  const plain = ['0.70', '0.26', '0.04'];
  for (const extra of [{ title: 'Softmax with temperature' }, { caption: 'Temperature T lowers the entropy' }, { operation: 'Apply softmax with T = 0.5' }, { operation: 'Softmax, T=2' }, { title: 'Scaled softmax' },
    { title: 'Softmax after scaling' }, { title: 'Masked softmax' }, { operation: 'Causal softmax' }, { title: 'Log-softmax' }, { title: 'Log softmax' }, { before: { label: 'Scaled scores', items: ['2.0', '1.0', '0.1'] } }, { after: { label: 'Softmax at temperature 2', items: plain } }]) {
    assert.deepEqual(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], plain, extra))), [], JSON.stringify(extra));
  }
  // softmax(2.0 / 0.5, 1.0 / 0.5, 0.1 / 0.5) = softmax(4, 2, 0.2) = 0.86, 0.12, 0.02: correct for T = 0.5, wrong for a plain softmax of the before values
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.12', '0.02'], { operation: 'Softmax of scores divided by temperature T = 0.5' })), []);
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.12', '0.02']))).length, 1, 'the same numbers without the gate word are a plain softmax and are wrong');
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], plain, { title: 'Softmax result, set t = 3' }))).length, 1, 'a lowercase t is not the temperature marker');
});

test('softmax list transformation: a gated card that calls its after values probabilities must still sum to 1 within the half-units', () => {
  const gated = { title: 'Softmax with temperature', caption: 'The probabilities after scaling' };
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.12', '0.02'], gated)), []);
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.33', '0.33', '0.34'], gated)), []);
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.7', '0.2', '0.1'], gated)), []);
  const [bad] = arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.86', '0.22', '0.02'], gated)));
  assert.match(bad.message, /must sum to 1: 0\.86 \+ 0\.22 \+ 0\.02 = 1\.1\./);
  assert.equal(arithmetic(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.5', '0.2', '0.1'], { title: 'Masked softmax', caption: 'Probabilities of each token' }))).length, 1);
  assert.deepEqual(softmaxIssues(softmax(['2.0', '1.0', '0.1'], ['0.5', '0.3', '0.1'], { title: 'Masked softmax' })), [], 'not called probabilities: no sum check');
});
