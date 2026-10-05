// packages/control-plane/src/learn-journey-fixtures.js
// Deterministic journey planner outputs (architecture §11) for the keyless local stack and the e2e harness. The worker
// reaches them only through journeyCallModel (learn-journey-planners.js), which hands out fixtureModel when
// env.SMALL_ENV === 'test' && env.JOURNEY_MODEL_STUB === 'fixtures'; tests inject it directly. No paid call either way.
// Every output passes the planners' validators. Section plans use only make: { text } steps, so no artifact model runs.

// The spec's own path for logistic regression (rabbit-hole-adaptive-learning-path-v1.md, "Build and reason about a binary
// logistic regression classifier"); any other topic gets generic titles.
const LR_TITLES = ['Classification vs regression', 'From a linear score to probability', 'Sigmoid / logistic intuition', 'Decision boundaries and thresholds', 'Binary cross-entropy', 'Training with gradient descent', 'Build logistic regression from scratch', 'Evaluate the classifier'];
const titlesFor = t => (t.toLowerCase() === 'logistic regression' ? LR_TITLES : [
  `What ${t} is for`, `Foundations of ${t}`, `The core idea of ${t}`, `A worked example of ${t}`,
  'Predict before you look', `Common pitfalls with ${t}`, `Build ${t} yourself`, `Check your understanding of ${t}`]);
const OVERVIEW = [0, 2, 3]; // the sections a quick overview keeps; their ids stay s1, s3, s4
const PARTS = ['foundations', 'core', 'practice'];
const PART_OF = [0, 0, 1, 1, 1, 2, 2, 2]; // section index -> concept part
const CLAIMS = { foundations: ['vocabulary', 'motivation'], core: ['mechanism', 'prediction'], practice: ['application', 'pitfalls'] };
const EVIDENCE = ['explain', 'predict', 'apply'];

const topicOf = input => String(input?.topic || input?.prev?.target_topic || input?.path?.target_topic || '').trim().slice(0, 48) || 'this topic';
const slugOf = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '') || 'topic';
const missing = (own, have) => Object.fromEntries(Object.entries(own).filter(([id]) => !Object.hasOwn(have || {}, id)));

// 3 concepts (<slug>-foundations, -core, -practice), each the prerequisite of the next, 2 claims each.
function registryFor(topic) {
  const slug = slugOf(topic), concepts = {}, claims = {};
  PARTS.forEach((part, i) => {
    const id = `${slug}-${part}`, prerequisites = i ? [`${slug}-${PARTS[i - 1]}`] : [];
    concepts[id] = { label: `${topic}: ${part}`, names: [`${topic} ${part}`], prerequisites };
    for (const c of CLAIMS[part]) {
      claims[`${id}/${c}`] = {
        concept: id, statement: `The ${c} of ${topic} (${part}) can be explained in your own words.`,
        drawn: `the first worked ${topic} example, at its ${c} step`, ideas: [`names the ${c} of ${topic}`],
        misconceptions: [{ id: `${c}-confusion`, check: `confuses the ${c} of ${topic} with an unrelated idea` }], prerequisites,
      };
    }
  });
  return { concepts, claims };
}

// The ladder, prerequisite to advanced: a transfer mcq (set on a new case, not the drawn one), an explain-back, a prediction.
function probesFor(topic) {
  const slug = slugOf(topic), options = right => [{ id: 'a', label: right }, { id: 'b', label: 'Only on the example it was taught with' }, { id: 'c', label: 'It depends on the threshold' }];
  return [
    { id: 'p1', kind: 'mcq', prompt: `On a ${topic} case you have not seen before, which statement holds?`, options: options(`The ${topic} vocabulary applies the same way`),
      claims: [`${slug}-foundations/vocabulary`], purpose: 'transfer', transfer: true, key: { correct: 'a', misconceptions: { b: 'vocabulary-confusion' } } },
    { id: 'p2', kind: 'explain_back', prompt: `In one or two sentences, what is the core idea of ${topic}?`, claims: [`${slug}-core/mechanism`], purpose: 'explain_back', transfer: false },
    { id: 'p3', kind: 'prediction', prompt: `Predict: when you apply ${topic} to a new input, where does it work?`, options: options('Wherever its assumptions hold'),
      claims: [`${slug}-practice/application`], purpose: 'predict', transfer: false, key: { correct: 'a', misconceptions: { b: 'application-confusion' } } },
  ];
}

// A draft: 8 sections, or 3 for an overview, whose concepts come along in concepts_added when the registry lacks them (a
// quick overview has no diagnostic). A revision (input.prev): the previous sections unchanged, one version up.
function pathFor(topic, input) {
  const prev = input?.prev;
  if (prev) {
    return { path: { ...prev, version: prev.version + 1, change: { source: input.evidence ? 'evidence' : 'learner_edit', reason: 'Fixture revision: the sections are unchanged.', evidence_refs: input.evidence?.refs ?? [], sections_changed: [] } },
      concepts_added: { concepts: {}, claims: {} }, ambiguous: false };
  }
  const slug = slugOf(topic), depth = input?.intake?.slots?.depth, titles = titlesFor(topic), own = registryFor(topic);
  const sections = (depth === 'overview' ? OVERVIEW : titles.map((_, i) => i)).map(i => {
    const part = PART_OF[i], concept = `${slug}-${PARTS[part]}`;
    return {
      id: `s${i + 1}`, title: titles[i], purpose: `Why ${titles[i]} matters on the way to ${topic}.`, kind: 'core',
      target_concepts: [concept], prerequisites: part ? [`${slug}-${PARTS[part - 1]}`] : [],
      expected_evidence: [{ claim: `${concept}/${CLAIMS[PARTS[part]][i % 2]}`, kind: i === 7 ? 'transfer' : EVIDENCE[part] }],
      depth: depth === 'overview' || depth === 'deep' ? depth : 'guided', status: 'upcoming', generation_state: 'not_generated',
    };
  });
  return {
    path: { version: 1, goal: `Understand ${topic}`, target_topic: topic, grounding: { kind: 'topic' }, diagnostic_evidence_refs: [], sections, current_section_id: null,
      change: { source: 'draft', reason: 'First draft.', evidence_refs: [], sections_changed: [] } },
    concepts_added: { concepts: missing(own.concepts, input?.registry?.concepts), claims: missing(own.claims, input?.registry?.claims) },
    ambiguous: false,
  };
}

// Three spoken steps, no artifact, no checks.
function sectionFor(input) {
  const s = input?.section || {}, title = s.title || 'this section';
  const claims = Object.keys(input?.registry?.claims || {}).filter(id => (s.target_concepts || []).includes(id.split('/')[0])).slice(0, 3);
  const step = (step_id, role, text) => ({ step_id, role, make: { text }, claims });
  return {
    section_id: s.id, path_version: input?.path?.version, learning_objective: `Explain ${title} in your own words.`,
    target_concepts: s.target_concepts || [], prerequisite_evidence: (s.prerequisites || []).map(concept => ({ concept, state: 'not_yet_observed' })),
    teaching_sequence: [
      step('frame', 'framing', `Here is where ${title} fits in the path.`),
      step('explain', 'explanation', `The idea behind ${title}, on the first worked example.`),
      step('predict', 'prediction', 'Before we go on: what would you predict for a new case?'),
    ],
    checks: [], completion_evidence: claims.map(claim => ({ claim, minimum: 'attempted' })),
  };
}

// Rule 5 as a model would mostly read it: words typed into a free-text tray answer it, unless they open like a question.
const QUESTION = /^\s*(what|why|how|when|where|who|which|can|could|should|is|are|do|does)\b/i;

export function fixtureFor(task, input) {
  const topic = topicOf(input);
  switch (task) {
    case 'journey_resolver': return input?.tray?.free_text && !QUESTION.test(String(input?.text ?? '')) ? { kind: 'tray_answer' } : { kind: 'unrelated_question' };
    case 'journey_diagnostic': return { registry: registryFor(topic), probes: probesFor(topic) };
    case 'journey_path': case 'journey_adapt': return pathFor(topic, input);
    case 'journey_section': return sectionFor(input);
    default: throw new Error(`No journey fixture for ${task}`);
  }
}

// A callModel(env, body, model, org): the role is the one tool's name, the input is the user message's JSON.
export async function fixtureModel(_env, body) {
  const task = body.tools[0].name, text = body.messages[0].content;
  const input = JSON.parse(text.slice(text.indexOf('input = ') + 'input = '.length));
  return Response.json({ model: 'fixture', stop_reason: 'tool_use', content: [{ type: 'tool_use', name: task, input: fixtureFor(task, input) }] });
}
