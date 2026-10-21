// packages/control-plane/test/learn-rich-fixtures.js
// Fixtures for the rich-rubric and visual assessment tests (Tutor Tasks 13 and 14), taken from the draft's walkthroughs
// (C:/s/spec/tutor-workflow/draft.md "Argumentative writing", "Python debugging", "The water cycle", logistic regression).
// Each case carries the reply a correct evaluator would give. The unit tests use those replies as provider stubs (wiring
// only); C:/s/spec/tutor-workflow/real-model-eval-set.json is generated from the same cases, with the expected
// observations fixed before any real run.
import { ANA, act } from './learn-attempt-fixture.js';
import { readCoachingState } from '../src/learn-coaching-store.js';

export const ANA_EMAIL = `${ANA.userId}@test`; // learn-attempt-fixture.js authorize: the access email of ANA
const criterion = (criterionId, label, requirement, requiresReasoning, rubricVersion) => ({ criterionId, label, requirement, requiresReasoning, rubricVersion });

// --- argumentative writing: one paragraph proposing a change to school library hours ------------------------------------
export const WRITING = [
  criterion('claim', 'State a focused claim', 'States one focused proposal about school library hours that a school decision-maker could act on.', false, 'rubric-writing-1'),
  criterion('support', 'Identify relevant support and its provenance', 'Uses support relevant to the claim and says where it comes from, for example the supplied practice survey.', false, 'rubric-writing-1'),
  criterion('connection', 'Explain how the support bears on the claim', 'Explains how the support makes the proposed change reasonable, not only that both appear.', true, 'rubric-writing-1'),
  criterion('limitation', 'Acknowledge an important limitation', 'Acknowledges a limitation of the evidence or of the proposal, such as actual use, cost or staffing.', true, 'rubric-writing-1'),
];
export const WRITING_PROMPT = 'Write one paragraph proposing a change to the school library hours for the head teacher. Use the practice source card as your support.';
// The draft's fictional source card, labelled as such; a card on the learner's own board.
export const SURVEY_CARD = { id: 'src-survey', type: 'explanation', title: 'Fictional school scenario', body: 'The library closes when classes end. In a hypothetical survey, 18 of 30 students reported needing a quiet place after school. These invented numbers are not evidence about any real school.' };

const met = (criterionId, evidence, extra = {}) => ({ criterionId, version: 1, fit: 'met', reasoning: extra.reasoning ?? 'supported', evidence, alternative: false, uncertain: false, explanation: extra.explanation ?? 'The requirement is met by the quoted words.', ...extra });
const notMet = (criterionId, extra = {}) => ({ criterionId, version: 1, fit: 'not_met', reasoning: 'missing', evidence: [], alternative: false, uncertain: false, explanation: 'Not present in the paragraph.', ...extra });

export const WRITING_CASES = {
  // The draft's revised paragraph (step 4).
  proposalA: {
    text: 'Our library should stay open later. In this practice survey, 18 of 30 students report needing somewhere quiet after school. Later hours would give those students a quiet place to work after class. A short trial could test whether students use the extra time, if staffing allows.',
    reply: {
      criteria: [
        met('claim', ['Our library should stay open later.'], { reasoning: 'not_required' }),
        met('support', ['In this practice survey, 18 of 30 students report needing somewhere quiet after school.'], { reasoning: 'not_required' }),
        met('connection', ['Later hours would give those students a quiet place to work after class.']),
        met('limitation', ['A short trial could test whether students use the extra time, if staffing allows.']),
      ],
      factualClaims: [{ quote: '18 of 30 students report needing somewhere quiet after school', sourceId: 'S1', sourceQuote: '18 of 30 students reported needing a quiet place after school' }],
      notes: [],
    },
    expected: { claim: ['met'], support: ['met'], connection: ['met'], limitation: ['met'] },
  },
  // A different defensible proposal: two fixed evenings rather than later hours every day.
  proposalB: {
    text: 'Instead of staying open later every day, the library should open for one extra hour after school on Tuesdays and Thursdays. The fictional survey says 18 of 30 students need a quiet place after school, and two fixed evenings would give most of them a predictable place to study while asking less of the staff. The survey does not tell us which days students are free, so the librarian should ask before choosing the days.',
    reply: {
      criteria: [
        met('claim', ['the library should open for one extra hour after school on Tuesdays and Thursdays'], { reasoning: 'not_required', alternative: true }),
        met('support', ['The fictional survey says 18 of 30 students need a quiet place after school'], { reasoning: 'not_required' }),
        met('connection', ['two fixed evenings would give most of them a predictable place to study while asking less of the staff']),
        met('limitation', ['The survey does not tell us which days students are free']),
      ],
      factualClaims: [{ quote: '18 of 30 students need a quiet place after school', sourceId: 'S1', sourceQuote: '18 of 30 students reported needing a quiet place after school' }],
      notes: ['The tone is informal in places; that is not part of this rubric.'],
    },
    expected: { claim: ['met'], support: ['met'], connection: ['met'], limitation: ['met'] },
  },
  // The draft's first submission (step 1): a claim and its support, no connection, no limitation.
  incomplete: {
    text: 'Our library should stay open later. In this practice survey, 18 of 30 students report needing somewhere quiet after school.',
    reply: {
      criteria: [
        met('claim', ['Our library should stay open later.'], { reasoning: 'not_required' }),
        met('support', ['18 of 30 students report needing somewhere quiet after school'], { reasoning: 'not_required' }),
        { criterionId: 'connection', version: 1, fit: 'partial', reasoning: 'missing', evidence: ['Our library should stay open later. In this practice survey'], alternative: false, uncertain: false, explanation: 'The claim and the survey sit side by side; how later hours meet the need is not explained.' },
        notMet('limitation'),
      ],
      factualClaims: [], notes: [],
    },
    expected: { claim: ['met'], support: ['met'], connection: ['partial', 'not_met'], limitation: ['not_met'] },
  },
  // An unsupported factual claim beside the practice data.
  unsupportedFact: {
    text: 'Our library should stay open until 6 pm. Research proves that students who study in a library after school raise their grades by 30 percent. In the practice survey, 18 of 30 students said they need a quiet place after school, so later hours would give them one. We would still need to check whether enough staff can cover the extra time.',
    reply: {
      criteria: [
        met('claim', ['Our library should stay open until 6 pm.'], { reasoning: 'not_required' }),
        met('support', ['In the practice survey, 18 of 30 students said they need a quiet place after school'], { reasoning: 'not_required' }),
        met('connection', ['so later hours would give them one']),
        met('limitation', ['We would still need to check whether enough staff can cover the extra time.']),
      ],
      factualClaims: [
        // The model names a source that does not say this: code must keep it unverified.
        { quote: 'Research proves that students who study in a library after school raise their grades by 30 percent', sourceId: 'S1', sourceQuote: 'students who study in a library raise their grades' },
        { quote: '18 of 30 students said they need a quiet place after school', sourceId: 'S1', sourceQuote: '18 of 30 students reported needing a quiet place after school' },
      ],
      notes: [],
    },
    expected: { claim: ['met'], support: ['met', 'partial'], connection: ['met', 'partial'], limitation: ['met'], factualClaims: { unverified: ['Research proves'], source_cited: ['18 of 30'] } },
  },
  // Informal voice, every criterion met: style is not a criterion.
  informal: {
    text: 'honestly the library should just stay open till 5 on weekdays. the practice survey says 18 of 30 kids need somewhere quiet after school, and if the library is open they get that quiet spot instead of going home to a noisy house. but we dont actually know how many would really show up, so maybe try it for a month first.',
    reply: {
      criteria: [
        met('claim', ['the library should just stay open till 5 on weekdays'], { reasoning: 'not_required' }),
        met('support', ['the practice survey says 18 of 30 kids need somewhere quiet after school'], { reasoning: 'not_required' }),
        met('connection', ['if the library is open they get that quiet spot instead of going home to a noisy house']),
        met('limitation', ['we dont actually know how many would really show up']),
      ],
      factualClaims: [{ quote: '18 of 30 kids need somewhere quiet after school', sourceId: 'S1', sourceQuote: '18 of 30 students reported needing a quiet place after school' }],
      notes: ['Capitalisation and apostrophes are missing; that is not part of this rubric.'],
    },
    expected: { claim: ['met'], support: ['met'], connection: ['met', 'partial'], limitation: ['met'] },
  },
  // A tutor-written rewrite the learner accepted and submitted: assisted, whatever its quality.
  rewrite: {
    text: 'The school library should extend its hours until 5 pm on weekdays. In a practice survey, 18 of 30 students reported needing a quiet place to work after school, which suggests that later hours would meet a real need. Because the survey does not show how many students would actually come, a one-month trial with attendance counts would show whether the change is worth its staffing cost.',
    assistanceRefs: ['tutor_rewrite:paragraph-1'],
    reply: {
      criteria: [
        met('claim', ['The school library should extend its hours until 5 pm on weekdays.'], { reasoning: 'not_required', assistance: 'none' }),
        met('support', ['In a practice survey, 18 of 30 students reported needing a quiet place to work after school'], { reasoning: 'not_required', assistance: 'none' }),
        met('connection', ['which suggests that later hours would meet a real need'], { assistance: 'none' }),
        met('limitation', ['Because the survey does not show how many students would actually come'], { assistance: 'none' }),
      ],
      factualClaims: [], notes: [],
    },
    expected: { claim: ['met'], support: ['met'], connection: ['met'], limitation: ['met'], assistance: 'assisted' },
  },
};

// --- Python debugging: the repaired accumulator with a substantial explanation -------------------------------------------
export const PYTHON = [
  criterion('trace', 'Trace the control flow', 'Explains where execution stops in the original function and why, for a multi-item input.', true, 'rubric-python-1'),
  criterion('repair', 'Repair and justify', 'Gives a corrected function and justifies it for a multi-item input and for an empty list.', true, 'rubric-python-1'),
];
export const PYTHON_PROMPT = 'This function should add up a list: def total(values): result = 0; for value in values: result += value; return result (with return inside the loop). Fix it and explain what the original did for [2, 3] and what yours does for [2, 3] and [].';
export const PYTHON_CASE = {
  content: {
    language: 'python',
    code: 'def total(values):\n    result = 0\n    for value in values:\n        result += value\n    return result\n',
    explanation: 'In the original, return is inside the loop, so after result becomes 2 on the first item of [2, 3] the function returns 2 and the second iteration never happens. I moved return after the loop so every value is added first: [2, 3] gives 5. For an empty list the loop body never runs, so it returns the starting 0 instead of None.',
  },
  reply: {
    criteria: [
      met('trace', ['return is inside the loop, so after result becomes 2 on the first item of [2, 3] the function returns 2']),
      met('repair', ['I moved return after the loop so every value is added first: [2, 3] gives 5.', 'For an empty list the loop body never runs, so it returns the starting 0 instead of None.', '    return result']),
    ],
    factualClaims: [], notes: [],
  },
  expected: { trace: ['met'], repair: ['met'] },
};

// --- visual: drawings ----------------------------------------------------------------------------------------------------
export const SIGMOID = [criterion('sigmoid', 'Draw the sigmoid with labelled axes', 'An S-shaped curve rising from near 0 to near 1 as the score increases, with the vertical axis labelled as probability and the 0.5 threshold marked.', false, 'rubric-sigmoid-1')];
export const WATER = [
  criterion('evaporation', 'Explain evaporation', 'Shows liquid water becoming water vapour and rising into the air, without boiling.', false, 'rubric-water-1'),
  criterion('routes', 'Trace more than one route after rain', 'Shows at least two plausible routes for rain water that reaches the ground, such as running off to a stream and soaking into the soil.', false, 'rubric-water-1'),
];
const look = (criterionId, perception, fit, extra = {}) => ({ criterionId, version: 1, perception, read: extra.read ?? '', clarification: extra.clarification ?? null, fit, reasoning: extra.reasoning ?? (fit === 'met' ? 'not_required' : 'unclear'), evidence: extra.evidence ?? [], alternative: extra.alternative ?? false, uncertain: false, explanation: extra.explanation ?? '' });
export const VISUAL_CASES = {
  labelledSigmoid: {
    image: 'labelled-sigmoid.png', criteria: SIGMOID, prompt: 'Sketch the sigmoid that turns a score into a probability. Label the axes and mark the threshold.',
    reply: { readable: true, clarification: null, criteria: [look('sigmoid', 'clear', 'met', { read: 'S curve from 0 to 1, y axis "probability", dashed line at 0.5', evidence: ['vertical axis labelled probability', 'dashed line marked 0.5'] })], notes: [] },
    expected: { sigmoid: { perception: ['clear'], fit: ['met'] } },
  },
  ambiguousAxes: {
    image: 'ambiguous-axes.png', criteria: SIGMOID, prompt: 'Sketch the sigmoid that turns a score into a probability. Label the axes and mark the threshold.',
    // The model also offers a misconception reading: code must keep it unclear.
    reply: { readable: true, clarification: null, criteria: [look('sigmoid', 'unreadable', 'not_met', { read: 'an S-shaped curve; the axis labels are illegible scribbles', clarification: 'What did you label the vertical axis?', explanation: 'Misconception: the curve seems to exceed 1.' })], notes: [] },
    expected: { sigmoid: { perception: ['ambiguous', 'unreadable'], fit: ['unclear'] } },
  },
  waterAlternative: {
    image: 'water-alternative.png', criteria: WATER, prompt: 'A puddle gets smaller even though the water is not boiling. Draw where the water can go, and where rain goes after it reaches the ground.',
    reply: { readable: true, clarification: null, criteria: [
      look('evaporation', 'clear', 'met', { read: 'wavy arrow from the puddle up to the cloud labelled "evaporation"', evidence: ['arrow labelled evaporation from the puddle to the cloud'] }),
      look('routes', 'clear', 'met', { read: 'one arrow into the soil labelled "soaks in", one to the stream labelled "runoff"', evidence: ['arrow labelled soaks in going into the ground', 'arrow labelled runoff to the stream'], alternative: true }),
    ], notes: [] },
    expected: { evaporation: { perception: ['clear'], fit: ['met'] }, routes: { perception: ['clear'], fit: ['met'] } },
  },
  unreadableHandwriting: {
    image: 'unreadable-handwriting.png', criteria: WATER, prompt: 'A puddle gets smaller even though the water is not boiling. Draw where the water can go, and where rain goes after it reaches the ground.',
    reply: { readable: false, clarification: 'Could you type the labels on your arrows?', criteria: [], notes: [] },
    expected: { evaporation: { perception: ['ambiguous', 'unreadable'], fit: ['unclear'] }, routes: { perception: ['ambiguous', 'unreadable'], fit: ['unclear'] } },
  },
  // Clearly readable and conceptually wrong: a straight line past 1. The concept is judged, because perception is clear.
  clearWrongLine: {
    image: 'clear-wrong-line.png', criteria: SIGMOID, prompt: 'Sketch the sigmoid that turns a score into a probability. Label the axes and mark the threshold.',
    reply: { readable: true, clarification: null, criteria: [look('sigmoid', 'clear', 'not_met', { read: 'a straight line from 0 rising past 1 to 1.2; axes labelled probability and score (z); dashed 0.5 threshold', reasoning: 'not_required', explanation: 'A straight line that passes 1 is not an S-shaped curve bounded by 0 and 1.' })], notes: [] },
    expected: { sigmoid: { perception: ['clear'], fit: ['not_met', 'partial'] } },
  },
};

// A model stub answering with a fixed reply. It records each request; usage is reported so provenance carries a cost.
export function replying(reply, { usage = { input_tokens: 1800, output_tokens: 600 }, model = 'claude-opus-5-5', status = 200, text } = {}) {
  const calls = [];
  const callModel = async (_env, body, requested) => {
    calls.push({ body, model: requested });
    if (status !== 200) return Response.json({ error: 'upstream' }, { status });
    return Response.json({ model, usage, stop_reason: 'end_turn', content: [{ type: 'text', text: text ?? JSON.stringify(reply) }] });
  };
  return { calls, callModel };
}
export const dataOf = body => JSON.parse(String(body.messages[0].content[0]?.text ?? body.messages[0].content).replace(/^[^\n]*\n/, ''));

// ANA's board row holding the given cards (the canvas the attempt route authorized).
export function boardWith(sqlite, blocks, { id = 'board-ana-main' } = {}) {
  sqlite.prepare('INSERT OR REPLACE INTO learn_boards (id, org, owner_email, app, board, state_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, ANA.org, ANA_EMAIL, ANA.app, ANA.board, JSON.stringify({ blocks }), new Date().toISOString());
  return id;
}

// A coaching goal (no journey) whose criteria carry a rubric, and its current activity.
export async function coachingActivity(env, { label = 'Library hours paragraph', criteria = WRITING, prompt = WRITING_PROMPT, responseKind = 'text', sourceRefs = [], checkpoint } = {}) {
  await act(env, ANA, 'create_goal', { label, criteria });
  const goalId = (await readCoachingState(env, ANA)).activeGoalId;
  const state = (await act(env, ANA, 'activate_activity', { activity: { goalId, objective: label, prompt, responseKind, criterionRefs: criteria.map(c => ({ criterionId: c.criterionId, version: 1 })), sourceRefs, ...(checkpoint ? { checkpoint } : {}) } })).state;
  return { goalId, activity: state.activities.find(a => a.activityId === state.activeActivityId) };
}
