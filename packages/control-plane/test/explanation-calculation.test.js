// The server step of a card made from a declared reference (explanation-calculation.js applyCalculations): the function's results are written onto the card, placeholders are filled, and the prose and
// captions may print only numbers the picture prints. Offline: the blocks are markdown bodies with one rh-diagram fence, as the learn route hands them over.
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCalculations } from '../src/explanation-calculation.js';
import { leftoverToken } from '../src/explanation-tokens.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';

const reference = id => diagramReferences.find(ref => ref.id === id);
const topK = reference('ml-sampling-top-k'), topKStandard = reference('ml-sampling-top-k').depths.standard, softmax = reference('softmax-probabilities'), meanBaseline = reference('regression-mean-baseline');
const confusion = reference('confusion-matrix-counts'), plain = diagramReferences.find(ref => !ref.calculation && ref.spec.diagram.kind === 'flow');
const fence = spec => `\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\``;
const fences = text => [...String(text).matchAll(/```rh-diagram\n(.*)\n```/g)].map(match => JSON.parse(match[1]));

// What the author writes: the template of the reference (its text fields carry {{v:name}}), the inputs of its own and anything else changed.
const author = (ref, inputs, change = d => d) => {
  const diagram = structuredClone(ref.template.diagram);
  for (const [name, value] of Object.entries(inputs)) diagram.variables.find(variable => variable.name === name).value = value;
  return { version: 1, diagram: change(diagram) ?? diagram };
};
const topKCard = (extra = {}, change) => author(topKStandard, { weights: [30, 25, 25, 10, 10], k: 2, ...extra }, change);
const softmaxCard = (change, inputs = { weightsA: [39, 33, 28], weightsB: [10, 10, 80] }) => author(softmax, inputs, change);
const block = (body, extra = {}) => ({ title: 'A card', body, ...extra });
const apply = (body, refs, extra) => applyCalculations(block(body, extra), refs);

test('a function reference: the author\'s inputs are read, the results overwrite the drawn numbers, and the placeholders fill in the title, caption and a series label', () => {
  const result = apply(`Keeping two of five tokens leaves 55% of the probability.\n\n${fence(topKCard())}\n\nThe rest is dropped.`, [topK]);
  assert.equal(result.problem, null);
  const [spec] = fences(result.block.body);
  assert.deepEqual(spec.diagram.series[0].values, [30, 25, 25, 10, 10], '30/25/25/10/10 add to 100: those are the shares');
  assert.deepEqual(spec.diagram.series[1].values, [55, 45, 0, 0, 0], 'the kept 30 and 25: 30/55 and 25/55');
  assert.equal(spec.diagram.title, 'Full softmax and top-2 sampling');
  assert.match(spec.diagram.caption, /^The kept tokens originally hold 55% of the probability/);
  assert.equal(spec.diagram.series[1].label, 'Top-2 renormalized');
  assert.equal(spec.diagram.variables.find(variable => variable.name === 'keptShare').value, 55, 'the undrawn result is in the variables list');
  assert.equal(JSON.stringify(spec).includes('{{v:'), false);
  assert.match(result.block.body, /^Keeping two of five tokens/, 'the prose around the fence is as written');
  assert.match(result.block.body, /\n\nThe rest is dropped\.$/);
});

test('the step records what it did: reference, inputs, what the author wrote, the results and which were overwritten', () => {
  const { steps } = apply(fence(topKCard()), [topK]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].reference, 'ml-sampling-top-k');
  assert.deepEqual(steps[0].inputs, { weights: [30, 25, 25, 10, 10], k: 2 });
  assert.deepEqual(steps[0].results, { full: [30, 25, 25, 10, 10], renormalized: [55, 45, 0, 0, 0], keptShare: 55 });
  assert.deepEqual(steps[0].written.full, [42, 28, 16, 8, 6], 'what the card carried before: the template\'s worked example');
  assert.deepEqual(steps[0].overwritten, ['full', 'renormalized', 'keptShare']);
});

test('a value the author wrote that is already right is not reported as overwritten', () => {
  const card = topKCard({}, d => { d.series[0].values = [30, 25, 25, 10, 10]; d.series[1].values = [55, 45, 0, 0, 0]; d.variables.find(v => v.name === 'keptShare').value = 55; });
  assert.deepEqual(apply(fence(card), [topK]).steps[0].overwritten, []);
});

test('the mean baseline: a * input path, and the placeholder in a label of an annotation', () => {
  const card = author(meanBaseline, {}, d => { [2, 2, 2, 8, 6].forEach((y, i) => { d.series[0].points[i].y = y; }); return d; });
  const result = apply(`The line sits at 4.\n\n${fence(card)}`, [meanBaseline]);
  assert.equal(result.problem, null);
  const [spec] = fences(result.block.body);
  assert.equal(spec.diagram.annotations[0].value, 4);
  assert.equal(spec.diagram.annotations[0].label, 'Mean prediction of 4');
});

test('a "none" reference: the diagram is untouched and only the checks run', () => {
  const body = `Eighty of a hundred positives are found.\n\n${fence(confusion.spec)}\n\nThe 20 missed are the highlighted cell.`;
  const result = apply(body, [confusion]);
  assert.equal(result.problem, null);
  assert.deepEqual(result.steps, []);
  assert.equal(result.block.body, body);
  const bad = apply(`The model is right 0.70 of the time.\n\n${fence(confusion.spec)}`, [confusion]);
  assert.match(bad.problem, /^explanation_bad_prose_number: /);
  assert.equal(bad.block.body.includes('0.70'), true, 'a problem hands the block back as it was');
});

test('a block with no declared reference comes back untouched (the same object), with no steps and no problem', () => {
  const card = block(`Prose with 0.70 and ?, {{v:x}}.\n\n${fence(plain.spec)}`, { more: [{ title: 'More', text: 'a {{v:y}}' }] });
  for (const references of [[], [plain], undefined, null]) {
    const result = applyCalculations(card, references);
    assert.equal(result.block, card, 'the same object');
    assert.deepEqual(result.steps, []);
    assert.equal(result.problem, null);
  }
  assert.equal(applyCalculations(card, [{ ...topK, shape: true }]).block, card, 'a shape example is not a declared reference');
  assert.equal(applyCalculations(card, [{ ...topK, seededExample: true }]).block, card, 'a seeded example is not a declared reference');
});

test('prose number check: a decimal the picture does not print is refused, one it prints is accepted, at its rounding too', () => {
  // The picture prints 0.39, 0.33, 0.28, 0.1, 0.1, 0.8.
  const ok = text => apply(`${text}\n\n${fence(softmaxCard())}`, [softmax]);
  assert.equal(ok('Input A puts 0.39 on Cat.').problem, null);
  assert.equal(ok('Input B puts 0.8 on Bird.').problem, null);
  assert.equal(ok('Input A puts about 0.4 on Cat.').problem, null, '0.4 is 0.39 at one decimal');
  assert.equal(ok('Input A puts 0.33 on Dog, 0.28 on Bird.').problem, null);
  const bad = ok('Input A puts 0.70 on Cat.');
  assert.match(bad.problem, /^explanation_bad_prose_number: the text writes 0\.70, which the picture does not print/);
  assert.match(ok('Input A puts 0.34 on Dog.').problem, /^explanation_bad_prose_number: .*0\.34/, 'close is not printed');
  assert.match(ok('It is 0.39 or 0.7, 0.9.').problem, /0\.7, 0\.9/, 'every number that is not printed is named');
});

test('prose number check: integers without a percent sign are ignored', () => {
  const result = apply(`There are 3 classes, 100 samples and 70 weights in 2 rows.\n\n${fence(softmaxCard())}`, [softmax]);
  assert.equal(result.problem, null);
});

test('prose number check: numbers inside a code fence that is not a diagram are ignored', () => {
  const body = `The code below sets a value.\n\n\`\`\`python\nx = 0.70\ny = 55.5%\n\`\`\`\n\nThen the picture.\n\n${fence(softmaxCard())}`;
  assert.equal(apply(body, [softmax]).problem, null);
  assert.match(apply(`${body}\n\nAfter the code, 0.70 again.`, [softmax]).problem, /explanation_bad_prose_number/, 'the prose after the code fence is read again');
});

test('prose number check: percents are read with and without a space', () => {
  // The top-k picture prints 30, 25, 25, 10, 10 and 55, 45 (percent).
  const ok = text => apply(`${text}\n\n${fence(topKCard())}`, [topK]);
  assert.equal(ok('The kept tokens hold 55% of it.').problem, null);
  assert.equal(ok('The kept tokens hold 55 % of it.').problem, null);
  assert.match(ok('The kept tokens hold 70% of it.').problem, /^explanation_bad_prose_number: the text writes 70%/);
  assert.match(ok('The kept tokens hold 70 % of it.').problem, /^explanation_bad_prose_number: the text writes 70 %/);
});

test('prose number check: a caption may use the placeholders', () => {
  const placeholder = apply(fence(softmaxCard(d => { d.caption = 'Input A puts {{v:probabilitiesA.0}} on Cat.'; return d; })), [softmax]);
  assert.equal(placeholder.problem, null);
  assert.equal(fences(placeholder.block.body)[0].diagram.caption, 'Input A puts 0.39 on Cat.');
});

// BUG (reported to the lead, not fixed here: explanation-calculation.js printedNumbers): the description of a diagram (describeTutorDiagram) ends with the caption line, and printedNumbers adds the whole
// description after its first line, so the caption's own numbers count as printed and a typed "0.70" in a caption passes. The comment above printedNumbers says the caption is not counted. Remove `todo` when fixed.
test('prose number check: the caption of every diagram is read too: a number the picture does not print, typed in a caption, is refused', { todo: 'bug: the caption prints its own numbers through the description line' }, () => {
  const typed = apply(fence(softmaxCard(d => { d.caption = 'Input A puts 0.70 on Cat.'; return d; })), [softmax]);
  assert.match(typed.problem, /^explanation_bad_prose_number: the text writes 0\.70/);
  const percent = apply(fence(topKCard({}, d => { d.caption = 'The kept tokens hold 70% of it.'; return d; })), [topK]);
  assert.match(percent.problem, /^explanation_bad_prose_number: the text writes 70%/);
  const prose = apply(`The line is 0.70.

${fence(softmaxCard(d => { d.caption = 'Input A puts 0.70 on Cat.'; return d; }))}`, [softmax]);
  assert.match(prose.problem, /^explanation_bad_prose_number/, 'a caption cannot vouch for a number of the prose');
});

test('prose number check: the sections of a card (more) are read as prose and filled too', () => {
  const card = block(fence(softmaxCard()), { more: [{ title: 'Detail', text: 'Cat gets {{v:probabilitiesA.0}} here.' }, { title: 'Wrong', text: 'Cat gets 0.7 here.' }] });
  const result = applyCalculations(card, [softmax]);
  assert.match(result.problem, /^explanation_bad_prose_number: the text writes 0\.7,/);
  const good = applyCalculations({ ...card, more: [card.more[0]] }, [softmax]);
  assert.equal(good.problem, null);
  assert.equal(good.block.more[0].text, 'Cat gets 0.39 here.');
});

test('{{v:name}} in the prose is filled from the calculated numbers', () => {
  const result = apply(`Keeping the top {{v:k}} tokens keeps {{v:keptShare}}% of the probability; the first is {{v:full.0}}%.\n\n${fence(topKCard())}`, [topK]);
  assert.equal(result.problem, null);
  assert.match(result.block.body, /^Keeping the top 2 tokens keeps 55% of the probability; the first is 30%\./);
});

test('a "?" left standing for a number in a diagram is refused', () => {
  for (const mark of ['Top-?', '?', 'hold ?%']) {
    const result = apply(fence(topKCard({}, d => { d.series[1].label = mark; })), [topK]);
    assert.match(result.problem, /^explanation_bad_placeholder: /, mark);
  }
  assert.equal(apply(fence(topKCard({}, d => { d.title = 'What is top-k?'; })), [topK]).problem, null, 'a question mark that ends a question is no placeholder');
  const none = apply(fence({ ...confusion.spec, diagram: { ...confusion.spec.diagram, title: 'Counts of ?' } }), [confusion]);
  assert.match(none.problem, /^explanation_bad_placeholder: /, 'a none reference is checked for a "?" too');
});

test('an unknown {{v:...}} is refused, in a diagram and in the prose', () => {
  const inDiagram = apply(fence(topKCard({}, d => { d.caption = 'Holds {{v:nothere}} of it.'; })), [topK]);
  assert.match(inDiagram.problem, /^explanation_bad_calculation: \{\{v:nothere\}\} does not name a number/);
  const inProse = apply(`It holds {{v:nothere}}.\n\n${fence(topKCard())}`, [topK]);
  assert.match(inProse.problem, /^explanation_bad_calculation: \{\{v:nothere\}\}/);
  assert.match(apply(`Prose {{v:x}}\n\n${fence(confusion.spec)}`, [confusion]).problem, /^explanation_bad_calculation: /);
  assert.match(apply(fence(topKCard({}, d => { d.caption = '{{v:full}}'; })), [topK]).problem, /it is a list: write \{\{v:name\.0\}\}/);
});

test('a function problem carries its prefix: inputs outside the limits, a refused input, no variables list, a missing variable', () => {
  assert.match(apply(fence(topKCard({ k: 9 })), [topK]).problem, /^explanation_bad_calculation: input k must be from 1 to 7 \(got 9\)/);
  assert.match(apply(fence(topKCard({ k: 5 })), [topK]).problem, /^explanation_bad_calculation: the inputs are refused: k must be a whole number from 1 to 4/);
  assert.match(apply(fence(topKCard({ weights: [30, 0, 25, 10, 10] })), [topK]).problem, /^explanation_bad_calculation: input weights must be from 1 to 1000 \(got 0\)/);
  assert.match(apply(fence(topKCard({}, d => { delete d.variables; })), [topK]).problem, /^explanation_bad_calculation: the diagram has no variables list/);
  assert.match(apply(fence(topKCard({}, d => { d.variables = d.variables.filter(v => v.name !== 'k'); })), [topK]).problem, /^explanation_bad_calculation: variables has no input named k/);
});

test('the problem hands the original block back, unchanged', () => {
  const card = block(`Text.\n\n${fence(topKCard({ k: 9 }))}`);
  const result = applyCalculations(card, [topK]);
  assert.equal(result.block, card);
  assert.deepEqual(result.steps, []);
});

test('a diagram of another kind than the reference\'s, and a fence that is not JSON, are left as they are', () => {
  const other = { version: 1, diagram: { kind: 'flow', title: 'Steps', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] } };
  const body = `Prose.\n\n${fence(other)}\n\n\`\`\`rh-diagram\nnot json\n\`\`\``;
  const result = apply(body, [topK]);
  assert.equal(result.problem, null);
  assert.deepEqual(result.steps, []);
  assert.equal(result.block.body, body);
});

test('leftoverToken refuses a {{v:...}} left in the title or the card, and still names a {{d:...}} token', () => {
  assert.match(leftoverToken({ title: 'T', body: 'a {{v:x}} b' }), /^explanation_bad_token: a \{\{v:\.\.\.\}\} placeholder was left in the card/);
  assert.match(leftoverToken({ title: 'About {{v:k}}', body: 'plain' }), /^explanation_bad_token: a \{\{v:/);
  assert.match(leftoverToken({ title: 'T', body: 'a', more: [{ text: '{{v:z}}' }] }), /\{\{v:/);
  assert.match(leftoverToken({ title: 'T', body: 'a {{d:1.x}}' }), /a \{\{d:\.\.\.\}\} token was left/);
  assert.equal(leftoverToken({ title: 'T', body: 'plain', more: [{ text: 'also plain' }] }), null);
});
