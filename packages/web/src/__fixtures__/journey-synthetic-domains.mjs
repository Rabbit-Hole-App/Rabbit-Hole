// Two synthetic learning-journey domains for the anti-hardcoding regression (docs/features/
// adaptive-learning-path-v1-anti-hardcoding-audit.md): topics no prompt example, fixture or corpus uses, ids in a
// naming style none of them uses, other counts (concepts, claims, probes, options, sections, steps), an optional first
// section and teaching steps out of the usual role order. Each is written as the planners would return it (model output
// form); the tests run it through the same validators, state machine, materializer, Tutor domain and routes as any
// journey. `reordered` gives the same data in another order (map keys, probe options, canvas blocks).
//
// Per domain: text (what the learner types), topic (journeyIntent's reading of it), intake (option per slot), walk (the
// option or free text answered per probe, in the order the walker asks them), active (the first non-optional section),
// cueMessage/cueClaim (a message the registry cues select a claim on), hole (a Rabbit Hole title that names a nanoGPT
// concept and, in this registry, the concept in holeConcept).

const claim = (concept, statement, drawn, ideas, misconceptions, prerequisites, cues) => ({ concept, statement, drawn, ideas, misconceptions, prerequisites, cues });
const mis = (id, check) => ({ id, check });
const section = (id, title, purpose, kind, target_concepts, prerequisites, expected_evidence, depth, status = 'upcoming') => ({
  id, title, purpose, kind, target_concepts, prerequisites, expected_evidence: expected_evidence.map(([c, k]) => ({ claim: c, kind: k })), depth, status, generation_state: 'not_generated',
});
const step = (step_id, role, text, claims) => ({ step_id, role, make: { text }, claims });

export const AQUEDUCTS = {
  text: 'I want to learn Roman aqueducts', topic: 'roman aqueducts',
  intake: [['goal', 'project'], ['familiarity', 'parts'], ['depth', 'deep']],
  diagnostic: {
    registry: {
      concepts: {
        'spring-capture': { label: 'Capturing a spring', names: ['spring capture', 'spring'], prerequisites: [] },
        'channel-fall': { label: 'Channel fall', names: ['channel fall', 'channel'], prerequisites: ['spring-capture'] },
        'inverted-siphon': { label: 'Inverted siphon', names: ['inverted siphon', 'siphon'], prerequisites: ['channel-fall'] },
        'castellum-split': { label: 'Castellum distribution', names: ['castellum', 'outlets'], prerequisites: ['channel-fall'] },
      },
      claims: {
        'spring-capture/settling-basin': claim('spring-capture', 'Spring water first passes a settling basin, so silt drops out before it enters the channel.', 'the spring at the head of the Aqua Claudia and its basin',
          ['silt settles out in a basin before the channel'], [mis('filters-by-mesh', 'says the water is cleaned by a mesh rather than by settling')], [], ['silt', 'settl', 'basin']),
        'channel-fall/steady-drop': claim('channel-fall', 'The channel falls by a small, steady amount per kilometre, so gravity alone keeps the water moving.', 'a 10 km stretch that drops 3 m',
          ['the channel drops a little over each kilometre', 'gravity alone moves the water'], [mis('pumped', 'says pumps push the water along')], ['spring-capture'], ['downhill', 'per kilometre', 'gravity']),
        'channel-fall/too-steep-scours': claim('channel-fall', 'A fall that is too steep makes the water fast enough to scour the channel lining.', 'a steep chute beside the gentle stretch',
          ['too steep a fall makes the water fast', 'fast water wears away the lining'], [mis('steeper-better', 'says a steeper channel is always better')], ['spring-capture'], ['steep', 'scour', 'too fast']),
        'inverted-siphon/pressure-pipe': claim('inverted-siphon', 'An inverted siphon carries water down across a valley and up the far side in sealed pressure pipes.', 'the lead pipes across the valley at Lyon',
          ['sealed pipes go down and back up across a valley'], [mis('climbs-higher', 'says the water comes out higher than it went in')], ['channel-fall'], ['pressure', 'valley', 'sealed']),
        'inverted-siphon/exit-lower': claim('inverted-siphon', 'The siphon exit must sit lower than its entrance, or the water stops.', 'the entry and exit tanks at Lyon',
          ['the exit sits lower than the entrance'], [mis('climbs-higher', 'says the exit can sit higher than the entrance')], ['channel-fall'], ['exit', 'entrance']),
        'castellum-split/priority-outlets': claim('castellum-split', 'A castellum divides the arriving water among outlets set at different heights.', 'the castellum at Nemausus and its ring of outlets',
          ['outlets at different heights share the water'], [mis('equal-shares', 'says every outlet always gets an equal share')], ['channel-fall'], ['divide', 'share']),
        'castellum-split/overflow-order': claim('castellum-split', 'When the supply drops, the highest outlets run dry first and the lowest flow longest.', 'the Nemausus castellum in a dry summer',
          ['the highest outlets run dry first'], [mis('equal-shares', 'says every outlet loses water equally in a drought')], ['channel-fall'], ['drought', 'run dry']),
      },
    },
    probes: [
      { id: 'q-north', kind: 'mcq', prompt: 'A spring carries fine silt. What happens to it before the channel?', options: [{ id: 'w', label: 'It settles out in a basin' }, { id: 'x', label: 'A mesh filters it' }, { id: 'y', label: 'It flows on to the city' }],
        claims: ['spring-capture/settling-basin'], purpose: 'diagnose', transfer: false, key: { correct: 'w', misconceptions: { x: 'filters-by-mesh' } } },
      { id: 'q-east', kind: 'prediction', prompt: 'A new 20 km stretch: what keeps the water moving along it?', options: [{ id: 'w', label: 'A small steady drop per kilometre' }, { id: 'x', label: 'Pumps every few kilometres' }, { id: 'y', label: 'A steep start, then flat' }, { id: 'z', label: 'The wind' }],
        claims: ['channel-fall/steady-drop'], purpose: 'predict', transfer: true, key: { correct: 'w', misconceptions: { x: 'pumped' } } },
      { id: 'q-south', kind: 'explain_back', prompt: 'Why must a siphon exit sit lower than its entrance?', claims: ['inverted-siphon/exit-lower'], purpose: 'explain_back', transfer: false },
      { id: 'q-west', kind: 'mcq', prompt: 'In a dry summer, which castellum outlets stop first?', options: [{ id: 'w', label: 'The lowest' }, { id: 'x', label: 'The highest' }, { id: 'y', label: 'All at once' }],
        claims: ['castellum-split/overflow-order'], purpose: 'transfer', transfer: true, key: { correct: 'x', misconceptions: { y: 'equal-shares' } } },
    ],
  },
  // Started in the middle (q-east): a keyed wrong option steps down to q-north, a pass steps up past the asked q-east
  // to q-south, a free-text pass there is the third asked probe, so the walker stops with q-west never asked.
  walk: [['q-east', { option_id: 'x' }, 'fail'], ['q-north', { option_id: 'w' }, 'pass'], ['q-south', { text: 'The water only flows downhill, so the exit has to be lower.' }, 'pass']],
  path: {
    path: {
      goal: 'Explain how a Roman aqueduct moves and shares water', target_topic: 'roman aqueducts', current_section_id: null,
      sections: [
        section('alpha', 'Why Rome needed aqueducts', 'The demand that made aqueducts worth building.', 'refresher', ['spring-capture'], [], [['spring-capture/settling-basin', 'explain']], 'overview', 'optional'),
        section('bravo', 'Falling a little at a time', 'How the channel fall moves water without pumps.', 'core', ['channel-fall'], ['spring-capture'], [['channel-fall/steady-drop', 'explain'], ['channel-fall/too-steep-scours', 'predict']], 'deep'),
        section('charlie', 'Crossing a valley', 'How a siphon carries water across low ground.', 'core', ['inverted-siphon'], ['channel-fall'], [['inverted-siphon/pressure-pipe', 'explain'], ['inverted-siphon/exit-lower', 'apply']], 'deep'),
        section('delta', 'Sharing water in the city', 'How a castellum splits the supply.', 'core', ['castellum-split'], ['channel-fall'], [['castellum-split/priority-outlets', 'explain']], 'deep'),
        section('echo', 'Plan an aqueduct of your own', 'Put fall, siphon and castellum together on a new site.', 'review', ['channel-fall', 'inverted-siphon', 'castellum-split'], [], [['castellum-split/overflow-order', 'transfer']], 'deep'),
      ],
      change: { reason: 'First draft from the diagnostic.', sections_changed: [] },
    },
    concepts_added: { concepts: {}, claims: {} },
  },
  active: 'bravo',
  plan: {
    learning_objective: 'Explain why an aqueduct channel falls a little at a time.', target_concepts: ['channel-fall'],
    prerequisite_evidence: [{ concept: 'spring-capture', state: 'not_yet_observed' }],
    teaching_sequence: [
      step('st-9', 'prediction', 'Predict: what happens to water in a perfectly flat channel?', ['channel-fall/steady-drop']),
      step('st-3', 'framing', 'This section is about the fall of the channel.', ['channel-fall/steady-drop']),
      step('st-7', 'worked_example', 'A 10 km stretch that drops 3 m, and a chute that drops 3 m in 100.', ['channel-fall/steady-drop', 'channel-fall/too-steep-scours']),
      step('st-1', 'transfer_check', 'A 20 km stretch on new ground: how much should it drop?', ['channel-fall/too-steep-scours']),
    ],
    checks: [{ id: 'k-1', kind: 'mcq', prompt: 'Which stretch scours its lining?', options: [{ id: 'x', label: 'The steeper one is always fine' }, { id: 'y', label: 'The steep chute' }],
      claims: ['channel-fall/too-steep-scours'], purpose: 'transfer', transfer: true, key: { correct: 'y', misconceptions: { x: 'steeper-better' } }, trigger: { after_step: 'st-7' } }],
    completion_evidence: [{ claim: 'channel-fall/steady-drop', minimum: 'attempted' }],
  },
  cueMessage: 'It has to go downhill a little the whole way.', cueClaim: 'channel-fall/steady-drop',
  hole: { title: 'Weighted average of the outlets', concept: 'castellum-split', nanogpt: 'attention-output' },
};

export const TIDES = {
  text: 'Teach me tidal energy in 20 minutes', topic: 'tidal energy',
  intake: [['goal', 'exam'], ['familiarity', 'new'], ['depth', 'guided']],
  diagnostic: {
    registry: {
      concepts: {
        'tide-range': { label: 'Tidal range', names: ['tide range', 'tides'], prerequisites: [] },
        'barrage-turbine': { label: 'Barrage turbines', names: ['barrage', 'turbine'], prerequisites: ['tide-range'] },
      },
      claims: {
        'tide-range/twice-daily': claim('tide-range', 'Most coasts see two high tides and two low tides a day.', 'a tide table for one harbour',
          ['there are two high and two low tides a day'], [mis('once-a-day', 'says there is one high tide a day')], [], ['two high tides', 'twice a day']),
        'tide-range/spring-neap': claim('tide-range', 'The range is largest at spring tides, when sun and moon line up.', 'a month of tide heights',
          ['the range peaks when sun and moon line up'], [mis('seasonal', 'says spring tides happen in spring')], [], ['line up', 'full moon']),
        'barrage-turbine/head-difference': claim('barrage-turbine', 'A barrage turbine makes power from the height difference between the basin and the sea.', 'a barrage at half tide',
          ['power comes from the height difference across the barrage'], [mis('current-only', 'says only the speed of the current matters')], ['tide-range'], ['height difference', 'head']),
      },
    },
    probes: [
      { id: 'b1', kind: 'mcq', prompt: 'How many high tides does a typical coast see each day?', options: [{ id: 'm', label: 'Two' }, { id: 'n', label: 'One' }],
        claims: ['tide-range/twice-daily'], purpose: 'diagnose', transfer: false, key: { correct: 'm', misconceptions: { n: 'once-a-day' } } },
      { id: 'b2', kind: 'explain_back', prompt: 'Where does a barrage turbine get its power?', claims: ['barrage-turbine/head-difference'], purpose: 'explain_back', transfer: false },
    ],
  },
  // Started at b1 (the middle of two): a pass steps up to b2, a second pass is two results in one direction: stop.
  walk: [['b1', { option_id: 'm' }, 'pass'], ['b2', { text: 'From the height difference between the basin and the sea.' }, 'pass']],
  path: {
    path: {
      goal: 'Explain where tidal power comes from', target_topic: 'tidal energy', current_section_id: null,
      sections: [
        section('sec-x1', 'How tides rise and fall', 'The daily and monthly rhythm of the tide.', 'core', ['tide-range'], [], [['tide-range/twice-daily', 'explain'], ['tide-range/spring-neap', 'predict']], 'guided'),
        section('sec-x2', 'Turning height into power', 'How a barrage uses the tide.', 'core', ['barrage-turbine'], ['tide-range'], [['barrage-turbine/head-difference', 'explain']], 'guided'),
        section('sec-x3', 'Check it on a new estuary', 'Apply both ideas to a site you have not seen.', 'review', ['tide-range', 'barrage-turbine'], [], [['barrage-turbine/head-difference', 'transfer']], 'guided'),
      ],
      change: { reason: 'First draft.', sections_changed: [] },
    },
    concepts_added: { concepts: {}, claims: {} },
  },
  active: 'sec-x1',
  plan: {
    learning_objective: 'Explain the daily rhythm of the tide.', target_concepts: ['tide-range'], prerequisite_evidence: [],
    teaching_sequence: [
      step('one', 'explanation', 'Two high tides and two low tides a day.', ['tide-range/twice-daily']),
      step('two', 'practice', 'Read the next high tide off this table.', ['tide-range/twice-daily', 'tide-range/spring-neap']),
    ],
    checks: [], completion_evidence: [{ claim: 'tide-range/twice-daily', minimum: 'attempted' }],
  },
  cueMessage: 'there are two high tides every day', cueClaim: 'tide-range/twice-daily',
  hole: { title: 'Attention to the turbine', concept: 'barrage-turbine', nanogpt: 'attention' },
};

// The same domain in another order: concept and claim map keys reversed, every probe's options reversed. Nothing
// semantic moves (keys still name the same options, sections and steps keep their order).
const reverseKeys = o => Object.fromEntries(Object.entries(o).reverse());
export const reordered = d => ({
  ...d,
  diagnostic: {
    registry: { concepts: reverseKeys(d.diagnostic.registry.concepts), claims: reverseKeys(d.diagnostic.registry.claims) },
    probes: d.diagnostic.probes.map(p => (p.options ? { ...p, options: [...p.options].reverse() } : p)),
  },
});
