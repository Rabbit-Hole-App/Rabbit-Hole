// LP1 Task 17 (owner, 2026-10-05): the small real-model journey corpus that e2e/journey-corpus-run.mjs runs. Four subjects
// of different shapes, so logistic regression cannot become the hidden template of every course, each through the whole
// chain (diagnostic, path, section 1, adapt by edit, adapt by evidence, one journey Tutor turn), plus three resolver probes.
// Final review A-I1: a fifth case, LAST so the owner's four domains finish first if the budget guard stops the run - a
// fast start (skip setup): no diagnostic, so the path draft starts from an empty registry and returns the whole registry
// in one journey_path call; path, section 1 and the Tutor turn only (no adapt stages, to save spend).
// Data only: the runner builds every planner input the way the journey route (control-plane/src/learn-journey.js) does.
//   text           the learner's opening message; journeyIntent reads the topic and stated constraints from it
//   intake         the intake answers, slot -> option id, applied with applyIntakeAnswer in the bank's order (goal,
//                  familiarity, depth); a slot the request already stated is never asked
//   slots          extra intake slots the brief fixes for the subject (coding = yes, no math), recorded as stated
//   diagnostic     true for every subject but the fast start (controller ruling, 2026-10-05): the quick overview runs one
//                  too, although journeyStep skips it for quick_overview in the product; its path is still capped at 3
//                  sections (AT-14). The fast start has none, as in the product.
//   adapt          false: no adapt_edit or adapt_evidence stage (the fast start); absent, both run as the subject says
//   edit           the learner edit of step (d), or null (no edit step); skip names a later section of the drafted path.
//                  The French Revolution skips one too (owner, 2026-10-05): its quick overview keeps the at-most-3 check,
//                  and it runs the diagnostic only by the controller ruling above
//   terms          words specific to the subject: no other subject's output may contain them (no topic leakage across
//                  domains, owner 2026-10-05; logistic regression's are the brief's hidden-template words). Whole words
//                  where a generic word would match: logistics, bisects and Jacobian pass
export const SUBJECTS = [
  { id: 'logistic-regression', shape: 'math/ML', text: 'I want to learn logistic regression', intake: { goal: 'intuition', familiarity: 'seen', depth: 'guided' }, slots: {}, diagnostic: true, edit: 'skip',
    terms: /\blogistic(?!s|al)|sigmoid|log-odds|\bspam\b|decision boundar/i },
  { id: 'photosynthesis', shape: 'conceptual science', text: 'Teach me photosynthesis', intake: { goal: 'intuition', familiarity: 'new', depth: 'guided' }, slots: { math: false }, diagnostic: true, edit: 'shorter',
    terms: /photosynth|chlorophyll|chloroplast|calvin cycle|stomata|thylakoid/i },
  { id: 'binary-search', shape: 'coding', text: 'I want to learn binary search in Python', intake: { goal: 'build', familiarity: 'parts', depth: 'guided' }, slots: { coding: true }, diagnostic: true, edit: 'practice',
    terms: /binary search|\bbisect(?:_left|_right)?\b/i },
  { id: 'french-revolution', shape: 'humanities', text: 'Give me a 10-minute overview of the French Revolution', intake: { goal: 'intuition' }, slots: {}, diagnostic: true, edit: 'skip',
    terms: /french revolution|bastille|robespierre|\bjacobins?\b|guillotine|estates[- ]general|louis xvi|marie antoinette/i },
  { id: 'vaccines-fast-start', shape: 'fast start (empty registry)', text: 'Teach me how vaccines train the immune system, skip setup and just start', intake: {}, slots: {}, diagnostic: false, edit: null, adapt: false,
    terms: /vaccin|antibod|antigen|immune system|lymphocyte|\b[bt][ -]cells?\b/i },
];

export const EDITS = {
  skip: title => `skip the section on ${title}`,
  shorter: () => 'make it shorter',
  practice: () => 'add more practice',
};

// The journey Tutor turn (f): a learner question about section 1's first claim, so it is on the section whatever the
// model drafted. It ends in a question mark, as a typed question does.
export const tutorQuestion = statement => `I am not sure I follow this one yet: ${statement} Why is that?`;

// Resolver rule 5 probes, on the binary-search subject. tray is the journey state trayFor (web/src/learn-journey.js)
// computes the open tray from: the intake's goal question (free text), its depth question (options only), the path preview.
export const RESOLVER_PROBES = [
  { id: 'free_text_answer', expect: 'tray_answer', tray: { state: 'intake', slots: {} }, text: 'I need to write one from memory for a coding interview next week' },
  { id: 'unrelated_question', expect: 'unrelated_question', tray: { state: 'intake', slots: { goal: 'build', familiarity: 'parts' } }, text: 'before that, is a Python list the same thing as an array?' },
  { id: 'path_edit', expect: 'path_edit', tray: { state: 'path_review' }, text: 'honestly I would rather see the recursive version before the loop one' },
];
export const RESOLVER_TOPIC = 'binary search in python';
