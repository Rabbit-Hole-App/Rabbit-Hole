// packages/control-plane/src/learn-next-steps-fixtures.js
// Deterministic hook-planner output for the keyless local stack and the e2e harness. The worker reaches it only through
// journeyCallModel (learn-next-steps-planner.js), which hands out fixtureModel when env.SMALL_ENV === 'test' &&
// env.JOURNEY_MODEL_STUB === 'fixtures'; tests inject it directly. No paid call either way. The output passes the
// planner's validators. (Moved out of learn-journey-fixtures.js, Tutor cleanup P4, 6.10.)
import { hookProblem, needsRepair, topicOf as topicOfHooks } from './agents/learn-next-steps.js';

// Hooks from the input alone (ruling F6): claims ranked by repair need (misconception, gap, uncertain, unseen,
// understood), never a completed-section claim unless it needs repair (the validator's rule: needsRepair, or the concept a
// prerequisite_gap claim in scope names), and the repair frame only where needsRepair holds; no eligible claim falls back to the concepts, an
// empty scope to the block titles, then the canvas's own words, then the goal or background title. Frames are generic, labels come from the input; a frame whose hook
// fails hookProblem for this input, or repeats a previous or chosen hook, is skipped, so a repeat set never comes back.
const RANK = { misconception: 0, prerequisite_gap: 1, uncertain: 2, not_yet_observed: 3, understood: 4 };
const FRAMES = [
  ['What goes wrong when %s is misread?', 'Rework the idea behind %s where the answers went wrong', 'repair'],
  ['Could %s still hold on a brand new case?', 'Apply %s to a fresh case it was not taught on', 'transfer'],
  ['What does %s make possible next?', 'Connect %s to what it enables further on', 'frontier'],
  ['Why does %s behave this way at all?', 'Trace the mechanism that makes %s work', 'mechanism'],
  ['Where would %s surprise an expert?', 'Find the edge case where %s breaks expectations', 'frontier'],
  ['What would change if %s were reversed?', 'Predict the effect of reversing %s', 'prediction'],
];
function nextStepsFor(input) {
  const concepts = input?.scope?.concepts || {}, question = input?.recent?.question || '', topic = topicOfHooks(input);
  const completed = new Set((input?.path?.completed || []).flatMap(s => s?.claim_ids || [])), current = new Set(input?.path?.current?.claim_ids || []);
  const label = text => String(text || 'this idea').split(/\s+/).slice(0, 4).join(' ');
  const missing = new Set(Object.values(input?.scope?.claims || {}).filter(c => c?.state === 'prerequisite_gap' && c.prerequisite).map(c => c.prerequisite));
  // Owner task 2: with no cards, the canvas's own words (its native objects), before the goal or the background title.
  const drawn = (input?.canvas?.objects || []).map(o => o?.text).filter(t => String(t || '').trim()).slice(0, 3);
  const claims = Object.entries(input?.scope?.claims || {}).filter(([id, c]) => needsRepair(c) || missing.has(c?.concept) || !completed.has(id) || current.has(id))
    .sort(([, a], [, b]) => (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3));
  const topics = claims.length
    ? claims.map(([id, c]) => ({ label: label(concepts[c.concept]), concept_ids: Object.hasOwn(concepts, c.concept) ? [c.concept] : [], claim_ids: [id], repair: needsRepair(c), texts: [c.statement, ...(c.ideas || []), c.drawn] }))
    : Object.keys(concepts).length ? Object.entries(concepts).map(([id, name]) => ({ label: label(name), concept_ids: [id], claim_ids: [] }))
      : (input?.canvas?.blocks?.length ? input.canvas.blocks.map(b => b?.title) : drawn.length ? drawn : input?.repository?.symbols?.length ? input.repository.symbols.slice(0, 3) : [input?.goal || input?.canvas?.title]).map(t => ({ label: label(t), concept_ids: [], claim_ids: [] }));
  const seen = new Set((input?.previous?.hooks || []).map(h => String(h).toLowerCase()));
  const options = [];
  for (let f = 0; options.length < 3 && f < FRAMES.length * 3; f++) {
    // A topic whose label fails every frame gives way to the next one after a full pass.
    const [hook, goal, kind] = FRAMES[f % FRAMES.length], t = topics[(options.length + Math.floor(f / FRAMES.length)) % topics.length];
    if (kind === 'repair' && !t.repair) continue;
    const text = hook.replace('%s', t.label), learning_goal = goal.replace('%s', t.label);
    if (seen.has(text.toLowerCase()) || hookProblem(text, { topic, texts: [...(t.texts || []), learning_goal].filter(x => typeof x === 'string'), question })) continue;
    seen.add(text.toLowerCase());
    options.push({ hook: text, learning_goal, concept_ids: t.concept_ids, claim_ids: t.claim_ids, reason_internal: `fixture ${kind}` });
  }
  // r29: with path.next given, the third hook leads into the next section (section_id), grounded in its title.
  const next = input?.path?.next;
  if (next && options.length === 3) options[2] = { hook: `What changes once you reach ${label(next.title)}?`, learning_goal: `Open the next section: ${String(next.title).slice(0, 80)}`, concept_ids: [], claim_ids: [], reason_internal: 'fixture next section', section_id: next.id };
  return { options, ambiguous: false };
}

export function fixtureFor(task, input) {
  if (task === 'suggest_next_steps') return nextStepsFor(input);
  throw new Error(`No fixture for ${task}`);
}

// A callModel(env, body, model, org): the role is the one tool's name, the input is the user message's JSON.
export async function fixtureModel(_env, body) {
  const task = body.tools[0].name, text = body.messages[0].content;
  const input = JSON.parse(text.slice(text.indexOf('input = ') + 'input = '.length));
  return Response.json({ model: 'fixture', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: task, input: fixtureFor(task, input) }] });
}
