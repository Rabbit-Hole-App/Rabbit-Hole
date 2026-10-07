// Task 11b Auto matrix (owner eighth message 2-4, ninth message, thirteenth message): every natural-language prompt the owner
// listed, the canvas it is asked on, and a stand-in plan a real Tutor might plausibly return. The stand-in is no expected
// answer: learn-tutor-auto.test.mjs checks only plumbing and obvious constraints on it. Task 11c-B adds the repository rows of
// the thirteenth message: on a repository canvas the router offers the handoff, and the stand-in chooses it (or not).
// Row: [group, prompt, context key, stand-in plan (reading fields, actions, reason_codes), input modality (default text)].
const say = text => ({ type: 'respond_text', text });
const make = (command, request) => ({ type: 'create_material', command, request });
const offerResearch = request => ({ type: 'suggest_research', request });
// Fix B1: a broad learning request reaches the Auto Tutor, which may offer a learning path (the learner starts it).
const offerJourney = request => ({ type: 'suggest_journey', request });
// Task 11c-B: the repository_context handoff, offered only on a repository canvas (structured state, never words).
const handoff = request => ({ type: 'handoff', capability: 'repository_context', request });
const ANSWER = 'Here is the short answer, in two plain sentences.';
const ask = (extra = {}) => ({ inferred_intent: 'ask', actions: [say(ANSWER)], reason_codes: ['respond_to_question'], ...extra });
const teach = (actions, codes, extra = {}) => ({ inferred_intent: 'teach', actions, reason_codes: codes, ...extra });
const local = { grounding_status: 'grounded', source_types_used: ['selected_material'] };
const known = { grounding_status: 'grounded', source_types_used: ['model_knowledge'] };

export const MATRIX = [
  // ASK-LIKE: may simply answer; no forced sequence or material.
  ['ask-like', 'Why do we divide attention scores by sqrt(d)?', 'nano', ask({ grounding_status: 'grounded', source_types_used: ['canvas', 'model_knowledge'] })],
  ['ask-like', 'What does this line of code do?', 'code', ask(local)],
  ['ask-like', 'Why does this happen?', 'card', ask(local)],
  ['ask-like', 'What is the difference between precision and recall?', 'blank', ask(known)],
  // TEACH-LIKE: the Tutor decides explanation, activity, quiz.
  ['teach-like', 'Teach me backpropagation from scratch.', 'blank', teach([say(ANSWER), make('explain', 'backpropagation from the chain rule up, one layer at a time'), offerJourney('backpropagation')], ['advance_goal'], known)],
  ['teach-like', 'I want to understand transformers.', 'blank', teach([say(ANSWER), offerJourney('transformers')], ['advance_goal'])],
  ['teach-like', 'Help me really understand this function.', 'code', teach([say(ANSWER), make('walkthrough', 'what each line of the selected function does')], ['deepen_mechanism'], local)],
  ['teach-like', 'I keep getting gradient descent wrong.', 'blank', teach([say(ANSWER), make('quiz', 'three quick checks on the direction and size of a gradient step')], ['check_understanding'])],
  // RESEARCH-LIKE: Research is offered, never run inside the turn.
  ['research-like', 'Find the latest approaches to long-context attention and compare them.', 'blank', { inferred_intent: 'research', grounding_status: 'insufficient_evidence', source_types_used: ['model_knowledge'], actions: [say("I don't have reliable current information on the newest methods yet."), offerResearch('recent long-context attention approaches, compared')], reason_codes: ['respond_to_question'] }],
  ['research-like', 'Investigate why this library made this architecture choice.', 'code', { inferred_intent: 'research', grounding_status: 'partially_grounded', source_types_used: ['selected_material', 'model_knowledge'], actions: [say(ANSWER), offerResearch('why this library chose this architecture')], reason_codes: ['respond_to_question'] }],
  ['research-like', 'Look into the evidence for this claim and give me sources.', 'card', { inferred_intent: 'research', grounding_status: 'partially_grounded', source_types_used: ['selected_material'], actions: [{ ...say('The card states the claim, but I cannot point you to sources for it here.'), cites: [{ card: 'invented-card', source_index: 0 }] }, offerResearch('evidence for the claim on this card')], reason_codes: ['respond_to_question'] }],
  // DO-LIKE: help with the existing actions; never claim an action ran.
  ['do-like', 'Help me implement this function.', 'code', { inferred_intent: 'do', actions: [say(ANSWER), make('code', 'a step by step implementation of the selected function')], reason_codes: ['increase_interactivity'] }],
  ['do-like', 'Build a small classifier from this idea.', 'card', { inferred_intent: 'do', clarification_requested: true, actions: [say('Which data should it learn from: the example on the card, or your own?')], reason_codes: ['follow_learner_interest'] }],
  ['do-like', 'Fix this code.', 'code', { inferred_intent: 'do', ...local, actions: [say(ANSWER)], reason_codes: ['respond_to_question'] }],
  ['do-like', 'Lets reproduce this result.', 'card', { inferred_intent: 'do', actions: [say(ANSWER), make('notebook', 'a notebook to reproduce the result on the selected card')], reason_codes: ['increase_interactivity'] }],
  // EXPLICIT MOTION: the planner declares the override; the paid card still waits for Generate.
  ['explicit motion', 'Show me this with motion.', 'card', teach([say(ANSWER), make('animate', 'the gradient shrinking layer by layer')], ['vary_modality', 'deepen_mechanism'], { modality_override: 'motion' })],
  ['explicit motion', 'Animate how attention masking works.', 'nano', teach([say(ANSWER), make('animate', 'the mask hiding later positions as each token is read')], ['deepen_mechanism'], { modality_override: 'motion' })],
  // AMBIGUOUS: read from learner state and context, never by a keyword rule.
  ['ambiguous', 'Can we go deeper?', 'nanoCard', teach([say(ANSWER), { type: 'suggest_depth', card: 'depth-attention-overview', direction: 'deeper' }], ['deepen_mechanism'])],
  ['ambiguous', 'I still dont get it.', 'nanoCard', teach([say(ANSWER), make('diagram', 'where each token looks, step by step')], ['reduce_cognitive_load'])],
  ['ambiguous', 'What happens next?', 'nanoCard', ask({ reason_codes: ['advance_goal'] })],
  ['ambiguous', 'Can you show me another way?', 'card', teach([say(ANSWER), make('graph', 'the gradient size at each layer')], ['vary_modality', 'reduce_cognitive_load'])],
  ['ambiguous', 'This part confuses me.', 'card', teach([say(ANSWER)], ['reduce_cognitive_load'], local)],
  // NEGATIVE: Auto does not over-trigger expensive modes.
  ['negative', 'What is a tensor?', 'blank', ask({ ...known, actions: [say('A tensor is an array of numbers with any number of axes.')] })],
  ['negative', 'Explain projectile motion.', 'blank', teach([say(ANSWER), make('graph', 'the arc of a thrown ball over time')], ['advance_goal'], known)],
  ['negative', 'Can you research what this variable means?', 'code', ask({ ...local, actions: [say('x is the input the layer receives.')] })],
  // NINTH MESSAGE examples.
  ['ninth message', 'Teach me why softmax saturates.', 'nano', teach([say(ANSWER), make('graph', 'softmax output as one score grows')], ['deepen_mechanism'])],
  ['ninth message', 'I still dont understand why the gradients vanish.', 'card', teach([say(ANSWER), make('explain', 'why repeated small factors shrink the gradient')], ['reduce_cognitive_load'])],
  ['ninth message', 'Can you show me why this happens?', 'card', ask(local)],
  ['ninth message', 'Test whether I actually understand this.', 'card', teach([say('Try these two questions.'), make('practice', 'explain it back: why early layers learn slowly')], ['check_understanding'])],
  ['ninth message', 'Give me another way to understand this.', 'card', teach([say(ANSWER), make('diagram', 'the gradient passing back through the layers')], ['vary_modality', 'reduce_cognitive_load'])],
  ['ninth message', 'I dont get it.', 'card', teach([say(ANSWER)], ['reduce_cognitive_load'])],
  // THIRTEENTH MESSAGE rows that need no repository handoff.
  ['thirteenth message', 'What does a function mean in mathematics?', 'blank', ask(known)],
  ['thirteenth message', 'I still dont get attention. Show me another way.', 'nano', teach([say(ANSWER), make('walkthrough', 'one token reading the tokens before it')], ['vary_modality'])],
  // Task 11c-B: repository_context. The stand-in hands off when the answer needs the source; the code runs it through the route.
  ['thirteenth message', 'What does this function do?', 'repo', ask({ grounding_status: 'grounded', source_types_used: ['canvas'], actions: [handoff('what the function the learner is reading does, step by step')] })],
  ['thirteenth message', 'Who calls this?', 'repoCode', ask({ ...local, actions: [say('Callers are the places in the code that use the selected function.'), handoff('which functions call the selected function, and where')] })],
  // Offered but not needed: the supplied context suffices, so the stand-in just answers and nothing is handed off.
  ['thirteenth message', 'What is a tensor?', 'repo', ask({ ...known, actions: [say('A tensor is an array of numbers with any number of axes.')] })],
  // VOICE: the same path, input_modality voice, create_material allowed.
  ['voice', 'Why does gradient descent overshoot?', 'blank', ask({ ...known, actions: [say('A step that is too large jumps past the lowest point.')] }), 'voice'],
  ['voice', 'Teach me this visually.', 'card', teach([say(ANSWER), make('diagram', 'the gradient shrinking through the layers')], ['advance_goal']), 'voice'],
];
