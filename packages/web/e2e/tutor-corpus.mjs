// Tutor architecture v2 benchmark corpus (docs/features/tutor-architecture-v2.md "Corpus"). One entry
// is a trace: a start (card, part, selected object, practice attempts) and 1+ learner turns. Every
// turn carries
//   stub:   what the free runner (tutor-corpus-run.mjs) answers in place of the paid models -
//           jev { claimId: { ideas: [p], mis: { id: p }, transfer: p }, gaps: { concept: p },
//                 attempt, non_attempt, error }  (missing checks: a confident "no", attempt "yes")
//           larger (same shape; p -> yes/no/unclear) and plan (a scripted TutorResponse)
//   expect: the TARGET architecture's behaviour (stage F), so every stage is scored against it:
//           selected_includes / selected_excludes (claims sent to JEV), jev / larger (called?),
//           events ('claim:result', '?' suffix = unsettled; the turn's new events, any order),
//           states { claim: state }, row, actions (types after validation, any order: the planner now writes respond_text first),
//           modes { type: mode }, card / part (the authored card an action shows).
// Turn ops: practice [answers] (new card attempts before the turn), slash, opening, keep (the
// learner pressed "Keep it on this canvas"), enter_hole (the next turns run in a softmax hole
// under the start card), climb (back on the parent).
// GT-* traces mirror the 11 golden traces in src/learn-tutor.test.mjs (which stay the unit gate).

const say = text => ({ type: 'respond_text', text });
const ask = (text, claim, purpose = 'diagnose') => ({ type: 'ask_question', text, claim, purpose });
const plan = (strategy, move, actions, extra = {}) => ({ strategy, move, reason: '', actions, ...extra });

export const CORPUS = [
  // ---------- the 11 golden traces ----------
  { id: 'GT-01', category: 'correct_explanation', golden: true, start: { card: 'depth-attention-overview' }, turns: [{
    raw: 'When it reads a character it looks back at earlier ones, mostly at one place, and never ahead.',
    stub: { jev: { 'attention/looks-back-never-ahead': { ideas: [1, 1], transfer: 0 } },
      plan: plan('feynman', 'suggest_next_rung', [say('Yes - it looks back, never ahead.'), { type: 'suggest_depth', card: 'depth-attention-overview', direction: 'deeper' }, { type: 'show_authored_card', card: 'depth-attention-guided', mode: 'navigate' }]) },
    expect: { selected_includes: ['attention/looks-back-never-ahead'], jev: true, larger: false, events: ['attention/looks-back-never-ahead:pass', 'attention/looks-back-never-ahead:pass'],
      states: { 'attention/looks-back-never-ahead': 'uncertain' }, row: 'uncertain', actions: ['respond_text', 'suggest_depth', 'show_authored_card'], modes: { show_authored_card: 'suggest' } },
  }] },
  { id: 'GT-02', category: 'practice_evidence', golden: true, start: { card: 'c11-causal-mask', practice: ['target'] }, turns: [{
    raw: 'I picked 0 to 100.',
    stub: { jev: { attempt: 0 }, plan: plan('feynman', 'hint', [say('Look at row 5 of the table.')]) },
    expect: { jev: true, larger: false, events: ['causal-mask/reads-self-and-earlier:fail'], states: { 'causal-mask/reads-self-and-earlier': 'uncertain' }, row: 'uncertain', actions: ['respond_text'] },
  }] },
  { id: 'GT-03', category: 'repeated_misconception', golden: true, start: { card: 'c11-causal-mask', practice: ['target', 'target'] }, turns: [
    { raw: 'Position 99 has to see character 100, otherwise how can it predict it?',
      stub: { jev: { 'causal-mask/reads-self-and-earlier': { ideas: [0, 0], mis: { 'reads-next-target': 1 } } },
        plan: plan('socrates', 'counterexample', [ask('If row 3 could read its highlighted cell, what would it learn to predict?', 'causal-mask/reads-self-and-earlier'), say('A long explanation again.')]) },
      expect: { selected_includes: ['causal-mask/reads-self-and-earlier'], jev: true, larger: false, states: { 'causal-mask/reads-self-and-earlier': 'misconception' }, row: 'misconception', actions: ['ask_question'] } },
    { raw: 'Hmm, still 100.',
      stub: { jev: { 'causal-mask/reads-self-and-earlier': { ideas: [0, 0], mis: { 'reads-next-target': 1 } } }, plan: plan('socrates', 'ask', [ask('Which character is row 3 trained to predict?', 'causal-mask/reads-self-and-earlier')]) },
      expect: { jev: true, larger: false, row: 'misconception', actions: ['ask_question'] } },
    { raw: 'Still 100.',
      stub: { jev: { 'causal-mask/reads-self-and-earlier': { ideas: [0, 0], mis: { 'reads-next-target': 1 } } }, plan: plan('feynman', 'explain', [say('Row i keeps columns 0 to i ...')]) },
      expect: { jev: true, larger: false, row: 'misconception_explain', actions: ['respond_text'] } },
  ] },
  { id: 'GT-04', category: 'explicit_implementation', golden: true, start: { card: 'depth-attention-overview' }, turns: [{
    raw: "Don't simplify this. Show me the implementation.",
    stub: { jev: { attempt: 0 }, plan: plan('none', 'go_deeper', [{ type: 'show_authored_card', card: 'depth-attention-deep', part_id: 'shapes', mode: 'navigate' }, { type: 'respond_text', text: 'Here is CausalSelfAttention.forward, step by step.', cites: [{ card: 'depth-attention-deep', source_index: 0 }] }],
      { explicit_request: 'Show me the implementation', constraints_add: ['no_simplify', 'implementation'] }) },
    expect: { events: [], actions: ['show_authored_card', 'respond_text'], modes: { show_authored_card: 'navigate' }, card: 'depth-attention-deep', part: 'shapes' },
  }] },
  { id: 'GT-06', category: 'prerequisite_gap', golden: true, start: { card: 'depth-attention-guided' }, turns: [{
    raw: "I get that q·k gives a score, but why do the weights add up to one? Why isn't the score just the weight?",
    stub: { jev: { attempt: 0, gaps: { softmax: 1 } }, plan: plan('none', 'prerequisite', [say('The weights come from softmax.'), { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }, { type: 'open_dive', concept: 'softmax', title: 'Softmax' }]) },
    expect: { selected_includes: ['attention/weights-from-scores'], jev: true, larger: false, events: ['attention/weights-from-scores:gap'], states: { 'attention/weights-from-scores': 'prerequisite_gap' }, row: 'gap', actions: ['respond_text', 'suggest_dive'] },
  }] },
  { id: 'GT-07', category: 'correct_explanation', golden: true, start: { card: 'c11-causal-mask', practice: ['target', 'target'] }, turns: [
    { raw: 'Position 99 has to see character 100, otherwise how can it predict it?',
      stub: { jev: { 'causal-mask/reads-self-and-earlier': { ideas: [0, 0], mis: { 'reads-next-target': 1 } } }, plan: plan('socrates', 'ask', [ask('Which character is row 3 trained to predict?', 'causal-mask/reads-self-and-earlier')]) },
      expect: { row: 'misconception', actions: ['ask_question'] } },
    { raw: "If block_size were 8, row 3 keeps columns 0 to 3, four of the eight. Column 4 is its own next character, so it's blocked with everything after it.", practice: ['self'],
      stub: { jev: { 'causal-mask/reads-self-and-earlier': { ideas: [1, 1], transfer: 1 } }, plan: plan('none', 'acknowledge', [say('Exactly.'), { type: 'suggest_practice', card: 'c11-causal-mask' }, { type: 'suggest_depth', card: 'c11-causal-mask', direction: 'deeper' }]) },
      expect: { selected_includes: ['causal-mask/reads-self-and-earlier'], states: { 'causal-mask/reads-self-and-earlier': 'understood' }, row: 'understood', actions: ['respond_text', 'suggest_depth'] } },
  ] },
  { id: 'GT-11', category: 'evaluator_disagreement', golden: true, start: { card: 'c11-causal-mask', practice: ['self'] }, turns: [{
    raw: "The mask hides the future so it can't cheat. It's applied after softmax to zero those weights.",
    stub: { jev: { 'causal-mask/applied-before-softmax': { ideas: [0, 1], mis: { 'mask-after-softmax': 1 } } },
      plan: plan('feynman', 'hint', [{ type: 'focus_part', card: 'c11-causal-mask', part_id: 'x', mode: 'suggest' }, say('What happens to a −∞ score before softmax?')]) },
    expect: { selected_includes: ['causal-mask/applied-before-softmax'], jev: true, larger: false,
      states: { 'causal-mask/reads-self-and-earlier': 'understood', 'causal-mask/applied-before-softmax': 'uncertain' }, row: 'uncertain', actions: ['respond_text'] },
  }] },
  { id: 'GT-12', category: 'evaluator_disagreement', golden: true, start: { card: 'c11-causal-mask', practice: ['before'] }, turns: [{
    raw: 'Each position reads itself and all earlier positions, never its next character.',
    stub: { jev: { 'causal-mask/reads-self-and-earlier': { ideas: [1, 1], transfer: 0 } }, plan: plan('feynman', 'clarify', [ask('Does position 99 read itself?', 'causal-mask/reads-self-and-earlier')]) },
    expect: { selected_includes: ['causal-mask/reads-self-and-earlier'], selected_excludes: ['causal-mask/applied-before-softmax'], jev: true, larger: false,
      states: { 'causal-mask/reads-self-and-earlier': 'uncertain', 'causal-mask/applied-before-softmax': 'not_yet_observed' }, row: 'uncertain', actions: ['ask_question'] },
  }] },
  { id: 'GT-D', category: 'rabbit_hole', golden: true, start: { card: 'depth-attention-guided' }, turns: [
    { raw: "I get that q·k gives a score, but why do the weights add up to one? Why isn't the score just the weight?",
      stub: { jev: { attempt: 0, gaps: { softmax: 1 } }, plan: plan('none', 'prerequisite', [say('The weights come from softmax.'), { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }]) },
      expect: { row: 'gap', actions: ['respond_text', 'suggest_dive'] } },
    { raw: 'Just explain it here.', keep: true, category: 'rabbit_hole_keep',
      stub: { jev: { attempt: 0 }, plan: plan('feynman', 'reuse', [{ type: 'show_authored_card', card: 'c21-temperature', mode: 'navigate' }, say('c21 shows softmax with a divisor.')]) },
      expect: { row: 'gap_inline', actions: ['show_authored_card', 'respond_text'], modes: { show_authored_card: 'navigate' }, card: 'c21-temperature' } },
    { opening: true, enter_hole: true, category: 'child_turn',
      stub: { plan: plan('feynman', 'explain', [say('Softmax exponentiates, then divides by the sum.'), { type: 'show_authored_card', card: 'c21-temperature', mode: 'suggest' }]) },
      expect: { jev: false, events: [], actions: ['respond_text', 'show_authored_card'], modes: { show_authored_card: 'suggest' } } },
    { raw: 'With scores 2, 1, 0: e² ≈ 7.4, e ≈ 2.7, 1; divide each by their sum 11.1 and you get 0.67, 0.24, 0.09, which add up to one.', category: 'child_turn',
      stub: { jev: { 'softmax/normalizes-to-one': { ideas: [1, 1], transfer: 1 } }, plan: plan('none', 'ack', [say('Right.'), { type: 'return_from_dive' }]) },
      expect: { selected_includes: ['softmax/normalizes-to-one'], selected_excludes: ['softmax/gaps-set-sharpness'], jev: true, larger: false, states: { 'softmax/normalizes-to-one': 'understood' }, row: 'understood', actions: ['respond_text', 'return_from_dive'] } },
    { raw: 'OK, I am back.', climb: true, category: 'return_to_parent',
      stub: { jev: { attempt: 0 }, plan: plan('socrates', 're-check', [ask('So why do the attention weights add up to one?', 'attention/weights-from-scores', 'transfer'), say('Great, you understand attention now.')]) },
      expect: { row: 'returned', actions: ['ask_question'], states: { 'attention/weights-from-scores': 'prerequisite_gap' } } },
  ] },

  // ---------- the categories the golden traces do not cover ----------
  { id: 'B-correct-transfer', category: 'correct_explanation', start: { card: 'c10-weighted-values' }, turns: [{
    raw: 'With weights 0.5, 0.3 and 0.2 over values 10, 20 and 30, the output is 5 + 6 + 6 = 17: each value times its weight, summed, so it lands between 10 and 30.',
    stub: { jev: { 'attention-output/weighted-average': { ideas: [1, 1], transfer: 1 } }, plan: plan('none', 'move_on', [say('Exactly - a weighted average.'), ask('What if every weight were 0.25?', 'attention-output/weighted-average', 'transfer')]) },
    expect: { selected_includes: ['attention-output/weighted-average'], jev: true, larger: false, states: { 'attention-output/weighted-average': 'understood' }, row: 'understood', actions: ['respond_text', 'ask_question'] },
  }] },
  { id: 'B-partial', category: 'partial_explanation', start: { card: 'depth-attention-guided' }, turns: [{
    raw: 'The weights come from putting the scores through softmax.',
    stub: { jev: { 'attention/weights-from-scores': { ideas: [1, 0] } }, plan: plan('feynman', 'explain', [say('Right, softmax. And what do the weights in a row add up to?')]) },
    expect: { selected_includes: ['attention/weights-from-scores'], selected_excludes: ['attention/scores-from-dot-products'], jev: true, larger: false,
      states: { 'attention/weights-from-scores': 'uncertain' }, row: 'uncertain', actions: ['respond_text'] },
  }] },
  { id: 'B-ambiguous', category: 'ambiguous_explanation', start: { card: 'c10-weighted-values' }, turns: [{
    raw: 'The output is kind of in the middle of the values it can see.',
    stub: { jev: { 'attention-output/weighted-average': { ideas: [0.55, 0.6] } }, larger: { 'attention-output/weighted-average': { ideas: [0.5, 1] } },
      plan: plan('feynman', 'clarify', [ask('In the middle by what rule?', 'attention-output/weighted-average')]) },
    expect: { selected_includes: ['attention-output/weighted-average'], jev: true, larger: false, row: 'uncertain_unsettled', actions: ['ask_question'] },
  }] },
  { id: 'B-misconception-once', category: 'misconception', start: { card: 'c10-weighted-values' }, turns: [{
    raw: 'The output is just the value with the biggest weight.',
    stub: { jev: { 'attention-output/weighted-average': { mis: { 'picks-top-value': 1 } } }, plan: plan('feynman', 'hint', [say('Look at the weight row: every visible value gets some weight.')]) },
    expect: { selected_includes: ['attention-output/weighted-average'], jev: true, larger: false, states: { 'attention-output/weighted-average': 'uncertain' }, row: 'uncertain', actions: ['respond_text'] },
  }] },
  { id: 'B-misconception-repeated', category: 'repeated_misconception', start: { card: 'c10-weighted-values' }, turns: [
    { raw: 'The output is just the value with the biggest weight.',
      stub: { jev: { 'attention-output/weighted-average': { mis: { 'picks-top-value': 1 } } }, plan: plan('feynman', 'hint', [say('Look at the weight row.')]) },
      expect: { row: 'uncertain' } },
    { raw: 'I still think it picks the top value, the one with the highest weight.',
      stub: { jev: { 'attention-output/weighted-average': { mis: { 'picks-top-value': 1 } } }, plan: plan('socrates', 'counterexample', [ask('If two weights were both 0.5, which value would it pick?', 'attention-output/weighted-average')]) },
      expect: { jev: true, larger: false, states: { 'attention-output/weighted-average': 'misconception' }, row: 'misconception', actions: ['ask_question'] } },
  ] },
  { id: 'B-misconception-unsure-second', category: 'evaluator_disagreement', start: { card: 'c10-weighted-values' }, turns: [
    { raw: 'The output is just the value with the biggest weight.',
      stub: { jev: { 'attention-output/weighted-average': { mis: { 'picks-top-value': 1 } } }, plan: plan('feynman', 'hint', [say('Look at the weight row.')]) },
      expect: { row: 'uncertain' } },
    { raw: 'Mostly it is the top value, I guess, maybe with a bit of the others.',
      stub: { jev: { 'attention-output/weighted-average': { mis: { 'picks-top-value': 0.5 } } }, larger: { 'attention-output/weighted-average': { mis: { 'picks-top-value': 1 } } },
        plan: plan('socrates', 'counterexample', [ask('If two weights were both 0.5, which value would it pick?', 'attention-output/weighted-average')]) },
      expect: { jev: true, larger: true, states: { 'attention-output/weighted-average': 'misconception' }, row: 'misconception', actions: ['ask_question'] } },
  ] },
  { id: 'B-question', category: 'question_request', start: { card: 'c11-causal-mask' }, turns: [{
    raw: 'Is it the same mask in every layer?',
    stub: { jev: { attempt: 0 }, plan: plan('none', 'answer', [say('Yes - every Block applies the same lower-triangular mask.', )]) },
    expect: { jev: true, larger: false, events: [], states: { 'causal-mask/reads-self-and-earlier': 'not_yet_observed' }, actions: ['respond_text'] },
  }] },
  { id: 'B-question-softmax', category: 'question_request', start: { card: 'depth-attention-guided' }, turns: [{
    raw: 'Why does softmax make these weights sum to one?',
    stub: { jev: { attempt: 0 }, plan: plan('none', 'answer', [say('It divides each exponentiated score by the sum of them all.')]) },
    expect: { selected_includes: ['softmax/normalizes-to-one'], selected_excludes: ['attention/scores-from-dot-products', 'softmax/gaps-set-sharpness'], jev: true, larger: false, events: [], actions: ['respond_text'] },
  }] },
  { id: 'B-another-way', category: 'question_request', start: { card: 'depth-attention-guided' }, turns: [{
    raw: 'Explain attention another way.',
    stub: { jev: { attempt: 0 }, plan: plan('feynman', 'reuse', [say('The Overview card shows the same idea as bars.'), { type: 'show_authored_card', card: 'depth-attention-overview', mode: 'navigate' }]) },
    expect: { events: [], actions: ['respond_text', 'show_authored_card'], modes: { show_authored_card: 'suggest' }, card: 'depth-attention-overview' },
  }] },
  { id: 'B-deeper', category: 'slash_deeper', start: { card: 'depth-attention-overview' }, turns: [{
    raw: 'Go deeper on this card.', slash: 'deeper',
    stub: { plan: plan('none', 'go_deeper', [{ type: 'show_authored_card', card: 'depth-attention-guided', mode: 'navigate' }, say('The Guided card puts numbers on it.')]) },
    expect: { jev: false, events: [], row: 'slash', actions: ['show_authored_card', 'respond_text'], modes: { show_authored_card: 'navigate' }, card: 'depth-attention-guided' },
  }] },
  { id: 'B-simplify', category: 'slash_simplify', start: { card: 'depth-attention-deep', part: 'causal-mask' }, turns: [{
    raw: 'Simplify this.', slash: 'simplify',
    stub: { plan: plan('none', 'go_shallower', [{ type: 'show_authored_card', card: 'depth-attention-overview', mode: 'navigate' }, say('The Overview shows the same rule without the maths.')]) },
    expect: { jev: false, events: [], row: 'slash', actions: ['show_authored_card', 'respond_text'], modes: { show_authored_card: 'navigate' }, card: 'depth-attention-overview' },
  }] },
  { id: 'B-deep-part', category: 'explicit_implementation', start: { card: 'depth-attention-deep', part: 'shapes' }, turns: [{
    raw: 'Show me where the mask is applied in the code.',
    stub: { jev: { attempt: 0 }, plan: plan('none', 'focus', [{ type: 'focus_part', card: 'depth-attention-deep', part_id: 'causal-mask', mode: 'navigate' }, say('masked_fill sets the later scores to −∞, then softmax.')], { explicit_request: 'Show me where the mask is applied' }) },
    expect: { events: [], actions: ['focus_part', 'respond_text'], modes: { focus_part: 'navigate' }, card: 'depth-attention-deep', part: 'causal-mask' },
  }] },
  { id: 'B-gap-long-reply', category: 'rabbit_hole', start: { card: 'c12-score-scaling' }, turns: [{
    raw: "Why does a smaller multiplier make the weights flatter? I don't get how the scores become weights at all.",
    stub: { jev: { attempt: 0, gaps: { softmax: 1 } },
      plan: plan('none', 'prerequisite', [say('Softmax turns scores into weights. It exponentiates each score. Then it divides by the sum. A smaller multiplier shrinks the gaps first.'), { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }]) },
    expect: { selected_includes: ['score-scaling/multiplier-changes-sharpness'], jev: true, larger: false, states: { 'score-scaling/multiplier-changes-sharpness': 'prerequisite_gap' }, row: 'gap', actions: ['respond_text', 'suggest_dive'], max_sentences: 2 },
  }] },
  { id: 'B-gap-unsure', category: 'evaluator_disagreement', start: { card: 'c12-score-scaling' }, turns: [{
    raw: 'I sort of follow the multiplier, but the weights part is fuzzy for me.',
    stub: { jev: { attempt: 0.2, gaps: { softmax: 0.5 } }, larger: { attempt: 0, gaps: { softmax: 1 } },
      plan: plan('none', 'prerequisite', [say('That step is softmax.'), { type: 'suggest_dive', concept: 'softmax', title: 'Softmax' }]) },
    expect: { jev: true, larger: true, states: { 'score-scaling/multiplier-changes-sharpness': 'prerequisite_gap' }, row: 'gap', actions: ['respond_text', 'suggest_dive'] },
  }] },
  { id: 'B-practice-pass', category: 'practice_evidence', start: { card: 'c12-score-scaling', practice: ['sixth'] }, turns: [{
    raw: 'Done.',
    stub: { jev: { attempt: 0 }, plan: plan('none', 'move_on', [say('Right: the multiplier 0 makes every visible score equal.')]) },
    expect: { jev: true, events: ['score-scaling/multiplier-changes-sharpness:pass'], states: { 'score-scaling/multiplier-changes-sharpness': 'understood' }, actions: ['respond_text'] },
  }] },
  { id: 'B-jev-error', category: 'evaluator_error', start: { card: 'c10-weighted-values' }, turns: [{
    raw: 'The output is a weighted average of the values.',
    stub: { jev: { error: 'Jev timed out after 800 ms' }, plan: plan('feynman', 'explain', [say('Yes, the values mixed by their weights.')]) },
    expect: { jev: true, larger: false, events: [], states: { 'attention-output/weighted-average': 'not_yet_observed' }, actions: ['respond_text'] },
  }] },
  { id: 'B-larger-error', category: 'evaluator_error', start: { card: 'c12-score-scaling' }, turns: [{
    raw: 'I sort of follow the multiplier, but the weights part is fuzzy for me.',
    stub: { jev: { attempt: 0.2, gaps: { softmax: 0.5 } }, larger: { error: 'The evaluator timed out' },
      plan: plan('feynman', 'clarify', [ask('Which part of the weights is fuzzy?', 'score-scaling/multiplier-changes-sharpness')]) },
    expect: { jev: true, larger: true, events: [], states: { 'score-scaling/multiplier-changes-sharpness': 'not_yet_observed' }, actions: ['ask_question'] },
  }] },
  { id: 'B-selection-zero', category: 'question_request', start: { card: 'c11-causal-mask', selected: 'causal-mask-table' }, turns: [{
    raw: 'Why is this zero?',
    stub: { jev: { attempt: 0 }, plan: plan('none', 'answer', [say('Every 0 is a later position: row i keeps columns 0 to i.')]) },
    expect: { selected_includes: ['causal-mask/applied-before-softmax'], jev: true, events: [], actions: ['respond_text'] },
  }] },
  { id: 'B-no-quiz', category: 'question_request', start: { card: 'c11-causal-mask', practice: ['target'] }, turns: [
    { raw: "Don't quiz me. Just explain it.",
      stub: { jev: { attempt: 0 }, plan: plan('feynman', 'explain', [say('Row i keeps columns 0 to i.'), ask('Which row?', 'causal-mask/reads-self-and-earlier', 'predict')], { constraints_add: ['no_quiz'] }) },
      expect: { events: ['causal-mask/reads-self-and-earlier:fail'], actions: ['respond_text'] } },
    { raw: 'And why?',
      stub: { jev: { attempt: 0, non_attempt: 1 }, plan: plan('feynman', 'explain', [ask('What do you think?', 'causal-mask/reads-self-and-earlier', 'predict'), say('Because a position is trained to predict the next one.')]) },
      expect: { events: [], actions: ['respond_text'] } },
  ] },
  { id: 'B-invalid-actions', category: 'action_validation', start: { card: 'c11-causal-mask' }, turns: [{
    raw: 'Tell me more about the mask.',
    stub: { jev: { attempt: 0 }, plan: plan('none', 'x', [{ type: 'show_authored_card', card: 'c99-made-up', mode: 'suggest' }, { type: 'open_dive', concept: 'softmax', title: 'Softmax' }, say('The mask keeps each row to itself and earlier columns.')]) },
    expect: { events: [], actions: ['respond_text'] },
  }] },
];

export const CATEGORIES = [...new Set(CORPUS.flatMap(trace => [trace.category, ...trace.turns.map(turn => turn.category).filter(Boolean)]))];
