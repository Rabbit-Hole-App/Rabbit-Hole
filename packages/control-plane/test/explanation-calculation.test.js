// The server step of a card made from a declared reference (explanation-calculation.js applyCalculations): the function's results are written onto the card, placeholders are filled, and the prose and
// captions may print only numbers the picture prints. Offline: the blocks are markdown bodies with one rh-diagram fence, as the learn route hands them over.
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCalculations } from '../src/explanation-calculation.js';
import { leftoverToken } from '../src/explanation-tokens.js';
import { diagramReferences } from '../../web/src/tutor-diagrams/reference-library.js';

const reference = id => diagramReferences.find(ref => ref.id === id);
const softmax = reference('softmax-probabilities'), meanBaseline = reference('regression-mean-baseline');
const confusion = reference('confusion-matrix-counts'), plain = diagramReferences.find(ref => !ref.calculation && ref.spec.diagram.kind === 'flow');
const fence = spec => `\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\``;
const fences = text => [...String(text).matchAll(/```rh-diagram\n(.*)\n```/g)].map(match => JSON.parse(match[1]));

// What the author writes: the template of the reference (its text fields carry {{v:name}}), the inputs of its own and anything else changed.
const author = (ref, inputs, change = d => d) => {
  const diagram = structuredClone(ref.template.diagram);
  for (const [name, value] of Object.entries(inputs)) diagram.variables.find(variable => variable.name === name).value = value;
  return { version: 1, diagram: change(diagram) ?? diagram };
};
const softmaxCard = (change, inputs = { weightsA: [39, 33, 28], weightsB: [10, 10, 80] }) => author(softmax, inputs, change);
const meanCard = (change, targets = [2, 2, 2, 8, 6]) => author(meanBaseline, {}, d => { targets.forEach((y, i) => { d.series[0].points[i].y = y; }); return change ? change(d) ?? d : d; });
const block = (body, extra = {}) => ({ title: 'A card', body, ...extra });
const apply = (body, refs, extra) => applyCalculations(block(body, extra), refs);

test('a function reference: the author\'s inputs are read, the results overwrite the drawn numbers, and the placeholders fill in the title, caption and a series label', () => {
  const card = softmaxCard(d => { d.title = 'Input A puts {{v:probabilitiesA.0}} on Cat'; d.caption = 'The first weights are {{v:weightsA.0}} and {{v:weightsB.0}}.'; d.series[1].label = 'Input B ({{v:probabilitiesB.2}} on Bird)'; return d; });
  const result = apply(`Input A puts 0.39 on Cat.\n\n${fence(card)}\n\nThe rest follows.`, [softmax]);
  assert.equal(result.problem, null);
  const [spec] = fences(result.block.body);
  assert.deepEqual(spec.diagram.series[0].values, [0.39, 0.33, 0.28], '39/33/28 add to 100: those are the shares');
  assert.deepEqual(spec.diagram.series[1].values, [0.1, 0.1, 0.8], '10/10/80 add to 100');
  assert.equal(spec.diagram.title, 'Input A puts 0.39 on Cat');
  assert.equal(spec.diagram.caption, 'The first weights are 39 and 10.');
  assert.equal(spec.diagram.series[1].label, 'Input B (0.8 on Bird)');
  assert.deepEqual(spec.diagram.variables.find(variable => variable.name === 'weightsA').value, [39, 33, 28], 'the undrawn input is in the variables list');
  assert.equal(JSON.stringify(spec).includes('{{v:'), false);
  assert.match(result.block.body, /^Input A puts 0\.39 on Cat\./, 'the prose around the fence is as written');
  assert.match(result.block.body, /\n\nThe rest follows\.$/);
});

test('the step records what it did: reference, inputs, what the author wrote, the results and which were overwritten', () => {
  const { steps } = apply(fence(softmaxCard()), [softmax]);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].reference, 'softmax-probabilities');
  assert.deepEqual(steps[0].inputs, { weightsA: [39, 33, 28], weightsB: [10, 10, 80] });
  assert.deepEqual(steps[0].results, { probabilitiesA: [0.39, 0.33, 0.28], probabilitiesB: [0.1, 0.1, 0.8] });
  assert.deepEqual(steps[0].written.probabilitiesA, [0.7, 0.2, 0.1], 'what the card carried before: the template\'s worked example');
  assert.deepEqual(steps[0].overwritten, ['probabilitiesA', 'probabilitiesB']);
});

test('a value the author wrote that is already right is not reported as overwritten', () => {
  const card = softmaxCard(d => { d.series[0].values = [0.39, 0.33, 0.28]; d.series[1].values = [0.1, 0.1, 0.8]; return d; });
  assert.deepEqual(apply(fence(card), [softmax]).steps[0].overwritten, []);
});

test('the mean baseline: a * input path, and the placeholder in a label of an annotation', () => {
  const card = author(meanBaseline, {}, d => { [2, 2, 2, 8, 6].forEach((y, i) => { d.series[0].points[i].y = y; }); return d; });
  const result = apply(`The line sits at 4.\n\n${fence(card)}`, [meanBaseline]);
  assert.equal(result.problem, null);
  const [spec] = fences(result.block.body);
  assert.equal(spec.diagram.annotations[0].value, 4);
  assert.equal(spec.diagram.annotations[0].label, 'Mean prediction of 4');
});

test('a "none" reference: the diagram is untouched and only the "?" and {{v:}} checks run', () => {
  const body = `Eighty of a hundred positives are found.\n\n${fence(confusion.spec)}\n\nThe 20 missed are the highlighted cell.`;
  const result = apply(body, [confusion]);
  assert.equal(result.problem, null);
  assert.deepEqual(result.steps, []);
  assert.equal(result.block.body, body);
});

// Owner decision (b), 2026-11-24: the prose number check runs only when a function ran on the card (steps.length > 0). A reference that declares none prints counts nobody computed, so the rate a sentence derives from them is not checked.
test('the prose number check runs only on a card a function ran on: a rate beside a confusion matrix is accepted, a number neither printed nor computed beside a softmax card is refused', () => {
  const rate = 'The model is right 0.70 of the time and finds 80% of the positives.';
  const none = apply(`${rate}\n\n${fence(confusion.spec)}`, [confusion]);
  assert.equal(none.problem, null, 'no function ran on a confusion-matrix card: the prose is not checked for numbers');
  assert.deepEqual(none.steps, []);
  assert.equal(none.block.body.includes('0.70'), true, 'the prose is as written');
  const caption = apply(fence({ ...confusion.spec, diagram: { ...confusion.spec.diagram, caption: 'Right 0.70 of the time.' } }), [confusion]);
  assert.equal(caption.problem, null, 'nor is the caption');
  const refused = apply(`Input A puts 0.70 on Cat.\n\n${fence(softmaxCard())}`, [softmax]);
  assert.equal(refused.steps.length, 1, 'a function ran on the card');
  assert.match(refused.problem, /^explanation_bad_prose_number: the text writes 0\.70, which the picture does not print/);
  const ran = apply(`Input A puts 0.39 on Cat.\n\n${fence(softmaxCard())}`, [softmax]);
  assert.equal(ran.problem, null);
  assert.equal(ran.steps.length, 1, 'a function ran on the card, and the prose it wrote is printed');
});

test('a block with no declared reference comes back untouched (the same object), with no steps and no problem', () => {
  const card = block(`Prose with 0.70 and ?, {{v:x}}.\n\n${fence(plain.spec)}`, { more: [{ title: 'More', text: 'a {{v:y}}' }] });
  for (const references of [[], [plain], undefined, null]) {
    const result = applyCalculations(card, references);
    assert.equal(result.block, card, 'the same object');
    assert.deepEqual(result.steps, []);
    assert.equal(result.problem, null);
  }
  assert.equal(applyCalculations(card, [{ ...softmax, shape: true }]).block, card, 'a shape example is not a declared reference');
  assert.equal(applyCalculations(card, [{ ...softmax, seededExample: true }]).block, card, 'a seeded example is not a declared reference');
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
  // The mean-baseline picture prints 2, 2, 2, 8, 6 (the targets) and 4 (the mean); a percent is compared with those numbers.
  const ok = text => apply(`${text}\n\n${fence(meanCard())}`, [meanBaseline]);
  assert.equal(ok('The line is at 4% of it.').problem, null);
  assert.equal(ok('The line is at 4 % of it.').problem, null);
  assert.match(ok('The line is at 70% of it.').problem, /^explanation_bad_prose_number: the text writes 70%/);
  assert.match(ok('The line is at 70 % of it.').problem, /^explanation_bad_prose_number: the text writes 70 %/);
});

test('prose number check: a caption may use the placeholders', () => {
  const placeholder = apply(fence(softmaxCard(d => { d.caption = 'Input A puts {{v:probabilitiesA.0}} on Cat.'; return d; })), [softmax]);
  assert.equal(placeholder.problem, null);
  assert.equal(fences(placeholder.block.body)[0].diagram.caption, 'Input A puts 0.39 on Cat.');
});

// The description of a diagram ends with the caption line: printedNumbers leaves the title and the caption out of it (a caption cannot print its own numbers for itself).
test('prose number check: the caption of every diagram is read too: a number the picture does not print, typed in a caption, is refused', () => {
  const typed = apply(fence(softmaxCard(d => { d.caption = 'Input A puts 0.70 on Cat.'; return d; })), [softmax]);
  assert.match(typed.problem, /^explanation_bad_prose_number: the text writes 0\.70/);
  const percent = apply(fence(meanCard(d => { d.caption = 'The line is at 70% of it.'; return d; })), [meanBaseline]);
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
  const result = apply(`Input A puts {{v:probabilitiesA.0}} on Cat and {{v:probabilitiesA.2}} on Bird, from the weights {{v:weightsA.0}} and {{v:weightsA.2}}.\n\n${fence(softmaxCard())}`, [softmax]);
  assert.equal(result.problem, null);
  assert.match(result.block.body, /^Input A puts 0\.39 on Cat and 0\.28 on Bird, from the weights 39 and 28\./);
  const mean = apply(`The line sits at {{v:mean}}.\n\n${fence(meanCard())}`, [meanBaseline]);
  assert.equal(mean.problem, null, 'a number that is not a list');
  assert.match(mean.block.body, /^The line sits at 4\./);
});

test('a "?" left standing for a number in a diagram is refused', () => {
  for (const mark of ['Input ?', '?', 'hold ?%']) {
    const result = apply(fence(softmaxCard(d => { d.series[1].label = mark; })), [softmax]);
    assert.match(result.problem, /^explanation_bad_placeholder: /, mark);
  }
  assert.equal(apply(fence(softmaxCard(d => { d.title = 'What is softmax?'; })), [softmax]).problem, null, 'a question mark that ends a question is no placeholder');
  const none = apply(fence({ ...confusion.spec, diagram: { ...confusion.spec.diagram, title: 'Counts of ?' } }), [confusion]);
  assert.match(none.problem, /^explanation_bad_placeholder: /, 'a none reference is checked for a "?" too');
});

test('an unknown {{v:...}} is refused, in a diagram and in the prose', () => {
  const inDiagram = apply(fence(softmaxCard(d => { d.caption = 'Holds {{v:nothere}} of it.'; return d; })), [softmax]);
  assert.match(inDiagram.problem, /^explanation_bad_calculation: \{\{v:nothere\}\} does not name a number/);
  const inProse = apply(`It holds {{v:nothere}}.\n\n${fence(softmaxCard())}`, [softmax]);
  assert.match(inProse.problem, /^explanation_bad_calculation: \{\{v:nothere\}\}/);
  assert.match(apply(`Prose {{v:x}}\n\n${fence(confusion.spec)}`, [confusion]).problem, /^explanation_bad_calculation: /);
  assert.match(apply(fence(softmaxCard(d => { d.caption = '{{v:probabilitiesA}}'; return d; })), [softmax]).problem, /it is a list: write \{\{v:name\.0\}\}/);
});

test('a function problem carries its prefix: inputs outside the limits, a refused input, no variables list, a missing variable', () => {
  assert.match(apply(fence(softmaxCard(undefined, { weightsA: [39, 33, 2000], weightsB: [10, 10, 80] })), [softmax]).problem, /^explanation_bad_calculation: input weightsA must be from 1 to 1000 \(got 2000\)/);
  assert.match(apply(fence(softmaxCard(undefined, { weightsA: [39, 33, 28], weightsB: [10, 10] })), [softmax]).problem, /^explanation_bad_calculation: the inputs are refused: the two weight lists must have the same length/);
  assert.match(apply(fence(softmaxCard(undefined, { weightsA: [39, 0, 28], weightsB: [10, 10, 80] })), [softmax]).problem, /^explanation_bad_calculation: input weightsA must be from 1 to 1000 \(got 0\)/);
  assert.match(apply(fence(softmaxCard(d => { delete d.variables; })), [softmax]).problem, /^explanation_bad_calculation: the diagram has no variables list/);
  assert.match(apply(fence(softmaxCard(d => { d.variables = d.variables.filter(v => v.name !== 'weightsA'); })), [softmax]).problem, /^explanation_bad_calculation: variables has no input named weightsA/);
});

test('the problem hands the original block back, unchanged', () => {
  const card = block(`Text.\n\n${fence(softmaxCard(undefined, { weightsA: [39, 33, 2000], weightsB: [10, 10, 80] }))}`);
  const result = applyCalculations(card, [softmax]);
  assert.equal(result.block, card);
  assert.deepEqual(result.steps, []);
});

test('a diagram of another kind than the reference\'s, and a fence that is not JSON, are left as they are', () => {
  const other = { version: 1, diagram: { kind: 'flow', title: 'Steps', nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] } };
  const body = `Prose.\n\n${fence(other)}\n\n\`\`\`rh-diagram\nnot json\n\`\`\``;
  const result = apply(body, [softmax]);
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
