import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBlueprint } from './interact-blueprint-check.js';
import { keepIndices, turnsOf, yRangeOf } from './interact-blueprint-build.js';

// Brief 38 step 3: the checker. The two examples that use only built options pass; one broken copy for each check gives the problem that check is for; the five other examples give only "not built yet".
const examples = JSON.parse(readFileSync(new URL('../../../docs/features/interact/interactive-blueprint-examples.json', import.meta.url), 'utf8'));
const copy = name => structuredClone(examples[name]);
const codeEdit = (blueprint, from, to) => { assert.ok(blueprint.math.code.includes(from), `the function has no "${from}"`); blueprint.math.code = blueprint.math.code.replace(from, to); return blueprint; };
const problemsOf = async (blueprint, options) => { const result = await checkBlueprint(blueprint, options); return result; };

test('the pendulum and the thrown-ball examples pass every check, with the facts Build needs measured', async () => {
  for (const name of ['pendulum', 'throw']) {
    const result = await checkBlueprint(copy(name));
    assert.deepEqual([result.ok, result.failed, result.problems], [true, 0, []], name);
    assert.ok(result.measured.reach.maxX > result.measured.reach.minX && result.measured.valueTexts.length === examples[name].values.length, name);
  }
  assert.deepEqual((await checkBlueprint(copy('pendulum'))).measured.facts.turns, { angleA: 7, angleB: 11 }); // 11 at 0.5 m: exactly the limit, as the spec says
});

const BROKEN = [
  [1, 'the form: a value label of 15 characters', b => { b.values[0].label = 'a'.repeat(15); }, /`values\[0\]\.label` is 15 characters; at most 12\./],
  [2, 'names: a part names an output that is not declared', b => { b.pictures.main.parts[2].at[0] = 'bobX'; }, /`pictures\.main\.parts\[2\]\.at\[0\]` names `bobX`, which is not a declared output\./],
  [3, 'the function runs: it returns no periodB', b => codeEdit(b, 'periodA: a.period, periodB: b.period,', 'periodA: a.period,'), /`compute` returns no `periodB` at /],
  [4, 'something moves: the pendulums do not swing', b => codeEdit(b, 'Math.cos(2 * Math.PI * t / period)', '1'), /No part moves during the run/],
  [5, 'every control matters: the mass shows nowhere', b => codeEdit(b, 'sizeB: (inputs.massB - 0.5) / 2.5,', 'sizeB: 0.5,'), /`massB` changes nothing the learner can see/],
  [6, 'the parts are drawable: a far part makes the swing too small to see', b => b.pictures.main.parts.push({ type: 'line', id: 'far', from: [0, 0], to: [1000, 0] }), /The parts move \d+ px at the scale needed to show all of them/],
  [7, 'the graph is drawable: a line turns more than 11 times', b => { b.time.duration = 20; }, /`angle[AB]` turns \d+ times in 20 s at (the defaults|lengthB = 0\.5); at most 11 can be drawn\. Shorten the run\./],
  [8, 'the claims hold: the period is said not to change with the length', b => { b.claims[0] = { type: 'unchanged', value: 'periodB', when: 'lengthB' }; }, /Claim 1 fails: `periodB` is not unchanged when `lengthB` goes from 0\.5 to 2 /],
  [9, 'the layout: an explanation line wider than its room', b => { b.explanation.cases[0].text = 'W'.repeat(36); }, /The layout refuses the scene \(text_too_wide\)/],
];
for (const [number, name, edit, expected] of BROKEN) {
  test(`check ${number}, ${name}: gives the problem that check is for`, async () => {
    const blueprint = copy('pendulum'); edit(blueprint);
    const result = await problemsOf(blueprint);
    assert.equal(result.ok, false); assert.equal(result.failed, number, result.problems.map(p => p.message).join(' | '));
    assert.match(result.problems[0].message, expected);
  });
}

test('the five examples that use a named option give only "not built yet" problems', async () => {
  for (const name of ['softmax', 'attention', 'descent', 'sorting', 'tokenizer']) {
    const result = await checkBlueprint(copy(name));
    assert.equal(result.failed, 1, name); assert.ok(result.problems.length > 0 && result.problems.every(problem => problem.code === 'not_built' && /not built yet/.test(problem.message)), `${name}: ${result.problems.map(p => p.message).join(' | ')}`);
  }
});

test('ids are unique within each of four groups, and may repeat across groups (a control quantity has its control\'s id)', async () => {
  const twice = copy('pendulum'); twice.things[1].id = 'A';
  assert.match((await checkBlueprint(twice)).problems[0].message, /repeats `A`; an id is unique among the things/);
  const across = copy('pendulum'); across.things[0].id = 'periodB'; across.pictures.main.parts.forEach(part => { if (part.of === 'A') part.of = 'periodB'; }); across.pictures.panel.series.forEach(series => { if (series.of === 'A') series.of = 'periodB'; }); across.values.forEach(value => { if (value.of === 'A') value.of = 'periodB'; });
  assert.equal((await checkBlueprint(across)).ok, true); // a thing and an output may share an id
});

test('the seeded arm: a blueprint that changes the relationship or the quantities it was given is refused', async () => {
  const given = { relationship: copy('pendulum').relationship, quantities: copy('pendulum').quantities };
  assert.equal((await checkBlueprint(copy('pendulum'), { seeded: given })).ok, true);
  const changed = copy('pendulum'); changed.relationship.statement = 'Something else.';
  const result = await checkBlueprint(changed, { seeded: given }); assert.equal(result.failed, 2); assert.match(result.problems[0].message, /`relationship` is not the one you were given/);
});

test('the guest helpers: turning points are kept, no two samples share an x, at most 25 are kept, and a line that turns twelve times is counted', () => {
  const wave = Array.from({ length: 96 }, (_, k) => Math.sin(k / 96 * 4 * Math.PI));
  assert.equal(turnsOf(wave), 4); const kept = keepIndices(wave, 25);
  assert.ok(kept.length <= 25 && kept[0] === 0 && kept.at(-1) === 95 && new Set(kept).size === kept.length && kept.every((v, k) => k === 0 || v > kept[k - 1]));
  assert.equal(turnsOf(Array.from({ length: 96 }, (_, k) => Math.sin(k / 96 * 12 * Math.PI))), 12);
  const [low, high] = yRangeOf([-20, 20]); assert.ok(low < -20 && high > 20 && low >= -25 && high <= 25); // widened by a tenth, rounded outward
});
