// Same-JSON decision (a), owner 2026-11-24: a visual tagged with a kind name ('heatmap', 'bar-chart') instead of 'diagram' that carries a spec holding a diagram object is read as the diagram
// (learn-primitives.js visualFence), its unknown keys are stripped as a 'diagram' item's are (stripUnknownKeys), and the card's trace records one entry per such visual (learn-artifact.js trace.rescuedVisual).
// The first test freezes what the three existing tags ('diagram', 'spec', 'picture') and the items that stay without a fence gave before decision (a) was coded: the strings were written by the code of the
// branch before the change and are stored below; they must not change. Offline: the model is a double.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateArtifact } from '../src/learn-artifact.js';
import { composeVisuals, rescuedVisualTag, stripUnknownKeys } from '../src/learn-primitives.js';

// [name, body, visuals, composeVisuals(body, visuals) before decision (a)]
const FROZEN = [
  ["diagram with a spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"diagram","spec":{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}}], "Intro.\n\n```rh-diagram\n{\"version\":1,\"diagram\":{\"title\":\"The Thermostat Feedback Cycle\",\"caption\":\"Measuring temperature triggers heating until the set point is reached\",\"kind\":\"cycle\",\"steps\":[\"Measure room temperature against set point\",\"Compare difference and trigger relay\",\"Deliver heat or cooling to the room\",\"Temperature shifts back to target\"]}}\n```\n\nAfter."],
  ["diagram with a bar-chart spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"diagram","spec":{"version":1,"diagram":{"kind":"bar-chart","title":"Two rows","variant":"grouped","categories":["A","B"],"series":[{"label":"One","values":[1,2]},{"label":"Two","values":[3,4]}]}}}], "Intro.\n\n```rh-diagram\n{\"version\":1,\"diagram\":{\"kind\":\"bar-chart\",\"title\":\"Two rows\",\"variant\":\"grouped\",\"categories\":[\"A\",\"B\"],\"series\":[{\"label\":\"One\",\"values\":[1,2]},{\"label\":\"Two\",\"values\":[3,4]}]}}\n```\n\nAfter."],
  ["diagram with no spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"diagram"}], "Intro.\n\n```rh-diagram\nundefined\n```\n\nAfter."],
  ["diagram with a string spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"diagram","spec":"cycle"}], "Intro.\n\n```rh-diagram\n\"cycle\"\n```\n\nAfter."],
  ["spec with a spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"spec","spec":{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}}], "Intro.\n\n```rh-diagram\n{\"version\":1,\"diagram\":{\"title\":\"The Thermostat Feedback Cycle\",\"caption\":\"Measuring temperature triggers heating until the set point is reached\",\"kind\":\"cycle\",\"steps\":[\"Measure room temperature against set point\",\"Compare difference and trigger relay\",\"Deliver heat or cooling to the room\",\"Temperature shifts back to target\"]}}\n```\n\nAfter."],
  ["spec with no spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"spec"}], "Intro.\n\nAfter."],
  ["spec with a string spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"spec","spec":"cycle"}], "Intro.\n\nAfter."],
  ["spec with an array spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"spec","spec":["cycle"]}], "Intro.\n\nAfter."],
  ["spec with an object that holds no diagram", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"spec","spec":{"version":1}}], "Intro.\n\n```rh-diagram\n{\"version\":1}\n```\n\nAfter."],
  ["picture, complete", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"picture","p":"A wall thermostat cutaway, no text, labels, titles or icons","a":"A thermostat cutaway","c":"The strip bends as the room temperature changes"}], "Intro.\n\n```rh-illustration\n{\"version\":1,\"id\":\"pic-1\",\"prompt\":\"A wall thermostat cutaway, no text, labels, titles or icons\",\"alt\":\"A thermostat cutaway\",\"caption\":\"The strip bends as the room temperature changes\"}\n```\n\nAfter."],
  ["picture, no suffix yet", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"picture","p":"A wall thermostat cutaway","a":"A thermostat","c":"The strip bends"}], "Intro.\n\n```rh-illustration\n{\"version\":1,\"id\":\"pic-1\",\"prompt\":\"A wall thermostat cutaway. no text, labels, titles or icons\",\"alt\":\"A thermostat\",\"caption\":\"The strip bends\"}\n```\n\nAfter."],
  ["picture, incomplete", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"picture","p":"only a prompt"}], "Intro.\n\n```rh-illustration\n{\"version\":1,\"id\":\"pic-1\",\"prompt\":\"only a prompt\"}\n```\n\nAfter."],
  ["picture, empty", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"picture"}], "Intro.\n\n```rh-illustration\n{\"version\":1,\"id\":\"pic-1\"}\n```\n\nAfter."],
  ["a diagram and a picture, both placed", "Intro.\n\n[[visual:1]]\n\nMiddle.\n\n[[visual:2]]\n\nAfter.", [{"k":"diagram","spec":{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}},{"k":"picture","p":"A wall thermostat cutaway, no text, labels, titles or icons","a":"A thermostat cutaway","c":"The strip bends as the room temperature changes"}], "Intro.\n\n```rh-diagram\n{\"version\":1,\"diagram\":{\"title\":\"The Thermostat Feedback Cycle\",\"caption\":\"Measuring temperature triggers heating until the set point is reached\",\"kind\":\"cycle\",\"steps\":[\"Measure room temperature against set point\",\"Compare difference and trigger relay\",\"Deliver heat or cooling to the room\",\"Temperature shifts back to target\"]}}\n```\n\nMiddle.\n\n```rh-illustration\n{\"version\":1,\"id\":\"pic-2\",\"prompt\":\"A wall thermostat cutaway, no text, labels, titles or icons\",\"alt\":\"A thermostat cutaway\",\"caption\":\"The strip bends as the room temperature changes\"}\n```\n\nAfter."],
  ["a picture and a spec, both placed", "Intro.\n\n[[visual:1]]\n\nMiddle.\n\n[[visual:2]]\n\nAfter.", [{"k":"picture","p":"A wall thermostat cutaway","a":"A thermostat","c":"The strip bends"},{"k":"spec","spec":{"version":1,"diagram":{"kind":"bar-chart","title":"Two rows","variant":"grouped","categories":["A","B"],"series":[{"label":"One","values":[1,2]},{"label":"Two","values":[3,4]}]}}}], "Intro.\n\n```rh-illustration\n{\"version\":1,\"id\":\"pic-1\",\"prompt\":\"A wall thermostat cutaway. no text, labels, titles or icons\",\"alt\":\"A thermostat\",\"caption\":\"The strip bends\"}\n```\n\nMiddle.\n\n```rh-diagram\n{\"version\":1,\"diagram\":{\"kind\":\"bar-chart\",\"title\":\"Two rows\",\"variant\":\"grouped\",\"categories\":[\"A\",\"B\"],\"series\":[{\"label\":\"One\",\"values\":[1,2]},{\"label\":\"Two\",\"values\":[3,4]}]}}\n```\n\nAfter."],
  ["two visuals, no marker (they go to the end)", "Intro only.", [{"k":"diagram","spec":{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}},{"k":"picture","p":"A wall thermostat cutaway, no text, labels, titles or icons","a":"A thermostat cutaway","c":"The strip bends as the room temperature changes"}], "Intro only.\n\n```rh-diagram\n{\"version\":1,\"diagram\":{\"title\":\"The Thermostat Feedback Cycle\",\"caption\":\"Measuring temperature triggers heating until the set point is reached\",\"kind\":\"cycle\",\"steps\":[\"Measure room temperature against set point\",\"Compare difference and trigger relay\",\"Deliver heat or cooling to the room\",\"Temperature shifts back to target\"]}}\n```\n\n```rh-illustration\n{\"version\":1,\"id\":\"pic-2\",\"prompt\":\"A wall thermostat cutaway, no text, labels, titles or icons\",\"alt\":\"A thermostat cutaway\",\"caption\":\"The strip bends as the room temperature changes\"}\n```"],
  ["a marker for a visual that does not exist", "Intro.\n\n[[visual:1]]\n\nMiddle.\n\n[[visual:2]]\n\nAfter.", [{"k":"diagram","spec":{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}}], "Intro.\n\n```rh-diagram\n{\"version\":1,\"diagram\":{\"title\":\"The Thermostat Feedback Cycle\",\"caption\":\"Measuring temperature triggers heating until the set point is reached\",\"kind\":\"cycle\",\"steps\":[\"Measure room temperature against set point\",\"Compare difference and trigger relay\",\"Deliver heat or cooling to the room\",\"Temperature shifts back to target\"]}}\n```\n\nMiddle.\n\nAfter."],
  ["the same marker twice", "A.\n\n[[visual:1]]\n\nB.\n\n[[visual:1]]\n\nC.", [{"k":"diagram","spec":{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}}], "A.\n\n```rh-diagram\n{\"version\":1,\"diagram\":{\"title\":\"The Thermostat Feedback Cycle\",\"caption\":\"Measuring temperature triggers heating until the set point is reached\",\"kind\":\"cycle\",\"steps\":[\"Measure room temperature against set point\",\"Compare difference and trigger relay\",\"Deliver heat or cooling to the room\",\"Temperature shifts back to target\"]}}\n```\n\nB.\n\nC."],
  ["other tag, no spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"heatmap"}], "Intro.\n\nAfter."],
  ["other tag, string spec", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"other","spec":"x"}], "Intro.\n\nAfter."],
  ["other tag, spec holds no diagram", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"other","spec":{"version":1}}], "Intro.\n\nAfter."],
  ["other tag, spec holds a string diagram", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"other","spec":{"version":1,"diagram":"x"}}], "Intro.\n\nAfter."],
  ["other tag, spec is an array", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":"other","spec":[{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}]}], "Intro.\n\nAfter."],
  ["no tag", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"spec":{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}}], "Intro.\n\nAfter."],
  ["a non-string tag", "Intro.\n\n[[visual:1]]\n\nAfter.", [{"k":7,"spec":{"version":1,"diagram":{"title":"The Thermostat Feedback Cycle","caption":"Measuring temperature triggers heating until the set point is reached","kind":"cycle","steps":["Measure room temperature against set point","Compare difference and trigger relay","Deliver heat or cooling to the room","Temperature shifts back to target"]}}}], "Intro.\n\nAfter."],
  ["null item", "Intro.\n\n[[visual:1]]\n\nAfter.", [null], "Intro.\n\nAfter."],
  ["string item", "Intro.\n\n[[visual:1]]\n\nAfter.", ["diagram"], "Intro.\n\nAfter."],
  ["empty item", "Intro.\n\n[[visual:1]]\n\nAfter.", [{}], "Intro.\n\nAfter."],
];

test('the existing cases are byte-identical to before: diagram, spec and picture items, and the items that make no fence', () => {
  assert.equal(FROZEN.length, 28);
  for (const [name, body, visuals, expected] of FROZEN) assert.equal(composeVisuals(body, visuals), expected, name);
});

const CYCLE = { version: 1, diagram: { title: 'The Thermostat Feedback Cycle', caption: 'Measuring temperature triggers heating until the set point is reached', kind: 'cycle', steps: ['Measure room temperature against set point', 'Compare difference and trigger relay', 'Deliver heat or cooling to the room', 'Temperature shifts back to target'] } };
const BARS = { version: 1, diagram: { kind: 'bar-chart', title: 'Two rows', variant: 'grouped', categories: ['A', 'B'], series: [{ label: 'One', values: [1, 2] }, { label: 'Two', values: [3, 4] }] } };
const BODY = 'Intro.\n\n[[visual:1]]\n\nAfter.';

test('a visual tagged with a kind name that carries a diagram spec gives an rh-diagram fence, the same as a k:diagram item', () => {
  for (const [tag, spec] of [['heatmap', CYCLE], ['bar-chart', BARS], ['heatmap', BARS]]) {
    const fence = composeVisuals(BODY, [{ k: tag, spec }]);
    assert.equal(fence, composeVisuals(BODY, [{ k: 'diagram', spec }]), tag);
    assert.equal(fence, `Intro.\n\n\`\`\`rh-diagram\n${JSON.stringify(spec)}\n\`\`\`\n\nAfter.`, tag);
  }
  assert.match(composeVisuals('Intro only.', [{ k: 'bar-chart', spec: BARS }]), /rh-diagram/, 'with no marker it goes to the end');
});

test('a visual tagged with a kind name and no spec, or a spec that holds no diagram object, makes no fence: nothing is invented', () => {
  for (const visual of [{ k: 'heatmap' }, { k: 'heatmap', spec: 'x' }, { k: 'heatmap', spec: [BARS] }, { k: 'heatmap', spec: { version: 1 } }, { k: 'heatmap', spec: { version: 1, diagram: 'x' } }, { k: 'heatmap', spec: { version: 1, diagram: [BARS.diagram] } }, { k: 7, spec: BARS }, { spec: BARS }, { k: null, spec: BARS }]) {
    assert.equal(composeVisuals(BODY, [visual]), 'Intro.\n\nAfter.', JSON.stringify(visual));
    assert.equal(rescuedVisualTag(visual), null, JSON.stringify(visual));
  }
  assert.equal(rescuedVisualTag({ k: 'heatmap', spec: BARS }), 'heatmap');
  for (const tag of ['diagram', 'spec', 'picture']) assert.equal(rescuedVisualTag({ k: tag, spec: BARS }), null, `${tag} is not a rescued tag`);
});

test('a rescued item has its unknown keys stripped as a k:diagram item has', () => {
  const dirty = tag => ({ k: tag, note: 'x', spec: { version: 1, extra: 1, diagram: { ...BARS.diagram, extraKey: 2, series: BARS.diagram.series.map(series => ({ ...series, stray: 3 })) } } });
  const rescued = stripUnknownKeys([dirty('bar-chart')]), plain = stripUnknownKeys([dirty('diagram')]);
  assert.deepEqual(rescued.stripped.map(entry => entry.key), plain.stripped.map(entry => entry.key));
  assert.deepEqual(rescued.stripped.map(entry => entry.key).sort(), ['extra', 'extraKey', 'note', 'stray', 'stray']);
  assert.deepEqual(rescued.visuals, [{ ...plain.visuals[0], k: 'bar-chart' }], 'the same visual after stripping, apart from its tag');
  assert.deepEqual(rescued.visuals[0].spec, { version: 1, diagram: BARS.diagram });
  assert.equal(composeVisuals(BODY, rescued.visuals), composeVisuals(BODY, [{ k: 'diagram', spec: BARS }]));
});

// ---- the card's trace ----
const THERMO = ['A thermostat keeps a room near a set temperature by closing a feedback loop.', 'It measures the room temperature against the set point and compares the difference.', 'When the room is cold it triggers the relay to deliver heat, and the temperature shifts back to the target.', 'The loop repeats, so the room stays near the set point.'];
const PICTURE = { k: 'picture', p: 'Technical cutaway of a wall thermostat showing a bimetallic strip and a heating switch, no text, labels, titles or icons', a: 'A thermostat cutaway', c: 'The strip bends as the room temperature changes' };
const answer = visuals => ({ title: 'How a thermostat holds a temperature', visuals, body: [THERMO[0], '[[visual:1]]', THERMO[1], THERMO[2], '[[visual:2]]', THERMO[3]].join('\n\n') });
const PLAN = { planner: 'jev', visuals: [{ type: 'picture' }, { type: 'diagram', kind: 'cycle' }], kind: 'cycle', fixed: true, depthTreatment: 'mechanism' };

async function run(t, visuals, trace) {
  const { log, warn } = console;
  console.log = () => {}; console.warn = () => {}; t.after(() => { console.log = log; console.warn = warn; });
  return generateArtifact({}, { command: 'explanation', args: 'How does a thermostat keep a room near a set temperature?', plan: PLAN }, { trace, callModel: async () => Response.json({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'c1', name: 'make_explanation', input: answer(visuals) }] }) });
}

test('the trace carries one entry per rescued visual, with its tag; a k:diagram or k:spec visual adds none', async t => {
  const rescued = {}, out = await run(t, [PICTURE, { k: 'cycle', spec: CYCLE }], rescued);
  assert.equal(out.error, undefined);
  assert.equal(out.result, 'artifact');
  assert.match(out.block.body, /"kind":"cycle"/, 'the rescued visual is the card\'s diagram');
  assert.deepEqual(rescued.rescuedVisual, [{ tag: 'cycle' }]);
  for (const k of ['diagram', 'spec']) {
    const plain = {}, card = await run(t, [PICTURE, { k, spec: CYCLE }], plain);
    assert.equal(card.result, 'artifact', k);
    assert.equal('rescuedVisual' in plain, false, k);
  }
});
