// Avatar Teacher V1 (docs/features/rabbit-hole-avatar-teacher-v1-spec.md §3, §4.1, §27 item 15): the
// suggest_avatar_clip trigger validator and its router rows, behind TUTOR_AVATAR (off by default). No model,
// no provider: plans are written by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarMoments, validateActions } from './learn-tutor-validate.js';
import { plannerContext, route } from './learn-tutor.js';
import { deriveClaimStates } from './learn-tutor-evidence.js';
import { AVATAR_ACTION, avatarSlotId } from '../../control-plane/src/agents/learn-tutor.js';

const CLAIM = 'attention/looks-back-never-ahead';
const turn = (extra = {}) => ({
  turn_id: 't1', raw_user_message: 'Why does attention need softmax?', input_modality: 'text', slash: null, constraints: [],
  canvas: { app: 'a', board: 'b' }, target: { block_id: 'blk', card: 'depth-attention-overview', concepts: ['attention'] },
  card_state: null, evidence: [], recent_turns: [], recent_actions: [], ...extra,
});
const store = (extra = {}) => ({ socratic: {}, constraints: [], avatar_seen: [], ...extra });
// Row 'understood': the turn's one claim is understood.
const states = { ...deriveClaimStates([]), [CLAIM]: { claim: CLAIM, concept: 'attention', state: 'understood', basis: [] } };
const routeFor = (t, avatar = { ready: new Set(), on_canvas: new Set() }, s = store()) => route({ turn: t, claims: [CLAIM], states, evaluation: null, store: s, avatar });
const clip = (extra = {}) => ({ type: AVATAR_ACTION, moment: 'takeaway', concept: 'attention', visual_value: 'A presenter pausing to frame the one idea to keep.', max_duration_seconds: 9, ...extra });
const ready = (...actions) => ({ ready: new Set(actions.map(avatarSlotId)), on_canvas: new Set() });
const plan = (...actions) => ({ constraints_add: [], strategy: 'none', actions: [{ type: 'respond_text', text: 'Softmax turns scores into weights.' }, ...actions] });
const accepted = result => result.actions.filter(action => action.type === AVATAR_ACTION);

test('off (no avatar): the route and the planner context are exactly as before, and the action stays an unknown type', () => {
  const t = turn(), routed = route({ turn: t, claims: [CLAIM], states, evaluation: null, store: store() });
  assert.equal(routed.row, 'understood');
  assert.deepEqual(Object.keys(routed), ['row', 'strategy', 'allowed', 'claim']);
  assert.ok(!routed.allowed.includes(AVATAR_ACTION));
  assert.ok(!('avatar_moments' in plannerContext({ turn: t, routed, block: null, states, claims: [CLAIM] })));
  const result = validateActions(plan(clip()), routed, t);
  assert.deepEqual(result.decisions[1], { type: AVATAR_ACTION, accepted: false, stage: 'schema', reason: `unknown action type ${AVATAR_ACTION}` });
});

test('on: an allowed row adds the action and the planner sees the moments it may use', () => {
  const t = turn(), routed = routeFor(t);
  assert.ok(routed.allowed.includes(AVATAR_ACTION));
  assert.deepEqual(routed.avatar.moments, ['transition', 'takeaway', 'reflection']);
  assert.deepEqual(plannerContext({ turn: t, routed, block: null, states, claims: [CLAIM] }).avatar_moments, ['transition', 'takeaway', 'reflection']);
});

test('acceptance 1, 2, 8: Voice Mode never suppresses a suggestion - a typed and a voice turn give the same cached clip', () => {
  const text = turn(), voice = turn({ input_modality: 'voice' });
  const a = validateActions(plan(clip()), routeFor(text, ready(clip())), text);
  const b = validateActions(plan(clip()), routeFor(voice, ready(clip())), voice);
  assert.deepEqual(a.actions, b.actions);
  assert.deepEqual(accepted(b), [{ type: AVATAR_ACTION, moment: 'takeaway', concept: 'attention', max_duration_seconds: 9, offer: 'play' }]);
});

test('acceptance 3: an ordinary voice answer produces no avatar material', () => {
  const t = turn({ input_modality: 'voice' });
  const result = validateActions(plan(), routeFor(t, ready(clip())), t);
  assert.deepEqual(accepted(result), []);
});

test('acceptance 9, 10: no ready clip - a canonical moment is dropped, a personalized one needs Generate; visual_value never passes on', () => {
  const t = turn({ raw_user_message: 'Can the professor show me how this works?' });
  const result = validateActions(plan(clip({ moment: 'human_explanation' })), routeFor(t), t);
  assert.deepEqual(accepted(result), [{ type: AVATAR_ACTION, moment: 'human_explanation', concept: 'attention', max_duration_seconds: 9, offer: 'generate' }]);
  assert.ok(!JSON.stringify(result).includes('presenter pausing'), 'visual_value is consumed by the validator');
  const canonical = validateActions(plan(clip()), routeFor(turn()), turn());
  assert.deepEqual(canonical.decisions.at(-1), { type: AVATAR_ACTION, accepted: false, stage: 'resource', reason: 'no ready canonical clip' });
});

test('trigger question 1: rows that need attention elsewhere never allow a moment; an explicit teacher request allows every moment', () => {
  for (const row of ['gap', 'gap_inline', 'misconception', 'misconception_explain', 'uncertain', 'uncertain_unsettled', 'slash', 'off_slice']) {
    assert.deepEqual(avatarMoments(row, turn({ raw_user_message: 'Show me the teacher' })), [], row);
  }
  assert.deepEqual(avatarMoments('not_yet_observed', turn()), ['orientation', 'human_explanation', 'demonstration']);
  assert.deepEqual(avatarMoments('returned', turn()), ['rabbit_hole_return', 'reflection']);
  assert.ok(avatarMoments('understood', turn({ opening: true })).includes('rabbit_hole_intro'));
  assert.ok(!avatarMoments('understood', turn()).includes('completion'), 'completion only on an explicit request');
  assert.ok(avatarMoments('understood', turn({ raw_user_message: 'Can the avatar wrap this up?' })).includes('completion'));
  const t = turn();
  const result = validateActions(plan(clip({ moment: 'orientation' })), routeFor(t, ready(clip({ moment: 'orientation' }))), t);
  assert.match(result.decisions.at(-1).reason, /not an approved moment/);
});

test('trigger questions 2-4 and the policy limits each drop the suggestion with one reason', () => {
  const t = turn(), r = ready(clip(), clip({ moment: 'transition', to_concept: 'causal-mask' }));
  const reason = (response, routed = routeFor(t, r), tt = t) => validateActions(response, routed, tt).decisions.find(d => d.type === AVATAR_ACTION && !d.accepted)?.reason;
  assert.equal(reason(plan(clip({ visual_value: ' ' }))), 'no stated visual value');
  const asked = turn({ raw_user_message: 'Show me the causal mask card' });
  assert.equal(reason({ explicit_request: 'Show me the causal mask card', ...plan({ type: 'show_authored_card', card: 'c11-causal-mask', mode: 'navigate' }, clip()) }, routeFor(asked, r), asked), 'the learner asked to see a card');
  assert.equal(reason(plan(clip(), clip({ moment: 'reflection' }))), `a second ${AVATAR_ACTION}`);
  assert.equal(reason(plan(clip()), routeFor(t, { ready: r.ready, on_canvas: new Set([avatarSlotId(clip())]) })), 'this clip is already on the canvas');
  assert.equal(reason(plan(clip()), routeFor(t, r, store({ avatar_seen: ['a|b||attention'] }))), 'already suggested for this concept here');
  const deep = turn({ target: { block_id: 'blk', card: 'depth-attention-deep', concepts: ['attention'] } });
  assert.equal(reason(plan(clip({ moment: 'transition', to_concept: 'causal-mask' })), routeFor(deep, r), deep), 'no next ladder card');
  assert.equal(validateActions(plan(clip({ moment: 'transition', to_concept: 'causal-mask' })), routeFor(t, r), t).actions.at(-1).offer, 'play');
  assert.match(reason(plan(clip({ max_duration_seconds: 45 }))), /3\.\.30/);
  assert.match(validateActions(plan(clip({ concept: 'made-up' })), routeFor(t, r), t).decisions.at(-1).reason, /unknown concept/);
});

test('learning_goal: kept when clean; dropped (never logged) when it repeats the learner, carries code or an identifier', () => {
  const t = turn({ raw_user_message: 'please explain why the attention weights add up to one here' });
  const r = ready(clip());
  const keep = validateActions(plan(clip({ learning_goal: 'Frame softmax as turning scores into shares.' })), routeFor(t, r), t);
  assert.equal(accepted(keep)[0].learning_goal, 'Frame softmax as turning scores into shares.');
  for (const goal of ['why the attention weights add up to one', 'Explain F.softmax(x) => weights', 'Mail ada@example.com about it', 'See https://example.com']) {
    const result = validateActions(plan(clip({ learning_goal: goal })), routeFor(t, r), t);
    assert.ok(accepted(result)[0] && !('learning_goal' in accepted(result)[0]), goal);
    assert.match(result.log.join('\n'), /learning_goal: (learner words|code|identifier)/);
    assert.ok(!result.log.join('\n').includes(goal), 'the log names the reason, never the text');
  }
});
