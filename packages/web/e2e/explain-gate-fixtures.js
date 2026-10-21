// The scripted /explain answers explain-gate-check.mjs drives through the real server gate (explain-gate-stub-worker.js), each
// keyed by a marker word in the learner's line, built from the EXP-04 hand-made scenes (control-plane/test/fixtures/explain-states).
// Each returns the same faulty answer on the first call and on the one repair, so the refusal is the gate's own.
import twoToggles from '../../control-plane/test/fixtures/explain-states/two-toggles.json' with { type: 'json' };
import interiorSlider from '../../control-plane/test/fixtures/explain-states/interior-slider.json' with { type: 'json' };

const answer = (record, edit) => {
  const { title, calculation, scene } = structuredClone(record.response.block);
  edit(scene);
  return { title, calculation, scene };
};
// Wrong only with both toggles on: the gates read the written sum at that combination.
export const COMBINATION = answer(twoToggles, scene => { scene.exampleData.both = 'Heat with the lid on: 20 + 30 = 60 degrees gained.'; });
// 65 slider positions: one more setting than the gates check.
export const OVER_BOUND = answer(interiorSlider, scene => {
  for (const key of ['names', 'grams', 'lines']) scene.exampleData[key] = Array.from({ length: 65 }, (_, i) => scene.exampleData[key][i % 12]);
});
export const SCENE_STUB = { 'exp04-combination': () => COMBINATION, 'exp04-over-bound': () => OVER_BOUND };
