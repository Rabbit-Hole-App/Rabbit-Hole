// Learn Artifact Generation v1 (docs/features/learn-artifact-generation.md).
// One registry of canvas learning primitives: what a generator - a / command
// today, the tutor later - may produce. Each entry is the contract: the JSON
// schema the model fills, a semantic check the schema cannot express, and the
// canvas block it becomes. Blocks are the existing LearningBlocks shapes, so
// there is no second schema per card. No generated code ever runs: every spec
// is data a fixed renderer draws.
//
// Pure (no env, no fetch) so the browser imports it too: the / picker hides a
// command whose family has nothing ready.
import { literalBreaksToNewlines } from './literal-breaks.js';
import { GRAPH_SCHEMA, validateGraph } from './learn-graph-schema.js';
import { VIDEO_SCHEMA, validateVideo } from './learn-video-schema.js';
import { SCENE_SCHEMA, validateScene } from './learn-scene-schema.js';
import { validateMathAnimation } from './learn-math-schema.js';
import { validateToolInput as validateSchema } from './learn-validation.js';
import { MATH_FORMAT } from './agents/math-format.js';
import { NUMBER_RULE } from './agents/learn-artifact.js';
import MATH_SCHEMA from '../../math-renderer/math-schema.json' with { type: 'json' };
import { EXPLANATION_BUDGET, EXPLANATION_CAPS, PARAGRAPH_MAX, validDepth } from './chat-depth.js';
import { parseTutorDiagram, tutorDiagramJsonSchema, tutorDiagramVisibleText } from '../../web/src/tutor-diagrams/spec.js'; // the card's own diagram library: one parser for the author, the validator and the renderer

const text = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
const list = (items, minItems, maxItems) => ({ type: 'array', minItems, maxItems, items });
const shape = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, required, properties });
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'artifact';
const fail = message => { throw new Error(message); };

const MERMAID_TYPES = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'gantt', 'pie', 'mindmap', 'timeline'];
const NODE_ID = /^[A-Za-z][\w-]{0,29}$/;
// Operation schemas the model fills for paid jobs. referenceImages is left
// out: a / command has no retrieved photo to reference.
const { referenceImages: _references, ...videoProperties } = VIDEO_SCHEMA.properties;
const VIDEO_OPERATION = { ...VIDEO_SCHEMA, properties: videoProperties };
const graphOperation = renderer => ({ ...GRAPH_SCHEMA, properties: { ...GRAPH_SCHEMA.properties, renderer: { type: 'string', enum: [renderer] } } });
const graphSpec = (renderer, spec) => {
  const checked = validateGraph(spec);
  if (checked.renderer !== renderer) fail(`Use the ${renderer} renderer`);
  return checked;
};

// EXP-13 fix 2: one visual of the author's answer. k pins the branch, so the oneOf is exclusive (sent as anyOf where a provider refuses oneOf).
// The diagram spec is the TutorDiagram JSON with its own schema; parseTutorDiagram still checks what a schema cannot, after the fence is written.
// Owner review 2026-11-08: output tokens are latency, so our own keys are short (k kind, p prompt, a alt, c caption), the picture text is shorter than a
// saved fence allows (ILLUSTRATION_LIMITS still reads saved cards) and nothing the card does not show is asked for: the server numbers the picture ids.
export const AUTHOR_PICTURE_LIMITS = Object.freeze({ prompt: 200, alt: 120, caption: 100 });
// Owner 2026-11-08 (Codex set 3): every picture prompt ends with the no-text clause the picture templates use (explanation-picture-templates.js); a prompt without it gets it here,
// where the author's picture is read, so the image model is never asked for lettering. The author prompt is not changed; the saved prompt limit (600) holds the 200 + suffix.
export const NO_TEXT_SUFFIX = 'no text, labels, titles or icons';
export const withNoTextSuffix = prompt => { const p = String(prompt).trim(); return p.toLowerCase().endsWith(NO_TEXT_SUFFIX) ? p : `${p.replace(/[\s.,;:]+$/, '')}. ${NO_TEXT_SUFFIX}`; };
const VISUAL_ITEM = { oneOf: [
  shape({ k: { type: 'string', const: 'diagram' }, spec: tutorDiagramJsonSchema }),
  shape({ k: { type: 'string', const: 'picture' }, p: text(AUTHOR_PICTURE_LIMITS.prompt), a: text(AUTHOR_PICTURE_LIMITS.alt), c: text(AUTHOR_PICTURE_LIMITS.caption) }),
] };
// Owner M3 (2026-11-08): a key the author added that the schema does not declare (Gemini wrote `layers` on a comparison) is removed before the card is read,
// instead of costing a repair. Checked against the declared schema of that visual and of that diagram kind, recursively; each removal is reported.
const branchFor = (schema, value) => {
  const options = schema.oneOf ?? schema.anyOf;
  if (!options) return schema;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return options.find(o => Object.entries(o.properties ?? {}).some(([k, s]) => s?.const !== undefined && value[k] === s.const))
    ?? options.find(o => (o.required ?? []).every(k => Object.hasOwn(value, k))) ?? null;
};
function stripUnknown(value, schema, kind, out) {
  const s = schema && value && typeof value === 'object' ? branchFor(schema, value) : null;
  if (!s) return value;
  if (Array.isArray(value)) return s.items ? value.map(v => stripUnknown(v, s.items, kind, out)) : value;
  if (!s.properties) return value;
  const own = typeof value.kind === 'string' ? value.kind : typeof value.k === 'string' ? value.k : kind;
  return Object.fromEntries(Object.entries(value).filter(([key]) => Object.hasOwn(s.properties, key) || (out.push({ kind: own, key }), false))
    .map(([key, v]) => [key, stripUnknown(v, s.properties[key], own, out)]));
}
// -> { visuals, stripped: [{ kind, key }] }: the author's visuals with every undeclared key removed (an unknown kind or shape is left for the parser to name).
export function stripUnknownKeys(visuals) {
  const stripped = [];
  return { visuals: Array.isArray(visuals) ? visuals.map(v => stripUnknown(v, VISUAL_ITEM, null, stripped)) : visuals, stripped };
}
const MARKER = /[ \t]*\[\[visual:(\d+)\]\][ \t]*/g;
// The fence id of the picture at a 0-based position of visuals.
export const pictureId = i => `pic-${i + 1}`;
// visuals[i] of the author's answer as the rh-illustration spec the server makes and saves, or null when it is not a complete picture.
export const authorPicture = (v, i) => (v?.k === 'picture' && [v.p, v.a, v.c].every(x => typeof x === 'string' && x.trim()) ? { version: 1, id: pictureId(i), prompt: withNoTextSuffix(v.p), alt: v.a.trim(), caption: v.c.trim() } : null);
const visualFence = (v, i) => {
  // an incomplete picture keeps its fence, so the validator names what is missing
  const made = v?.k === 'diagram' ? ['rh-diagram', v.spec] : v?.k === 'picture' ? ['rh-illustration', authorPicture(v, i) ?? { version: 1, id: pictureId(i), prompt: v.p, alt: v.a, caption: v.c }] : null;
  return made ? '```' + made[0] + '\n' + JSON.stringify(made[1]) + '\n```' : null;
};
// The saved body: each first [[visual:N]] marker becomes visual N's fence on its own lines; an unknown or repeated marker is removed; a visual with no marker
// goes at the end (the layout settling then moves it between prose parts).
export function composeVisuals(body, visuals) {
  const placed = new Set();
  const out = String(body ?? '').replace(MARKER, (_, n) => {
    const i = Number(n) - 1, fence = placed.has(i) ? null : visualFence(visuals[i], i);
    if (fence) placed.add(i);
    return fence ? '\n\n' + fence + '\n\n' : '\n\n';
  });
  const rest = visuals.map((v, i) => (placed.has(i) ? null : visualFence(v, i))).filter(Boolean);
  return [out, ...rest].join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ready: a generator may produce it now. unavailable: what the learner is
// told when their command needs it. Which primitives are paid is the shared
// contract's call (primitive(id) in agent/slash.js); a paid one is only ever
// proposed - nothing runs before the learner confirms.
export const PRIMITIVES = {
  explanation: {
    ready: true,
    about: `A titled explanation in Markdown: prose, one to three visuals (at most two pictures), each with prose before and after it.`, // the maths line is under "# Numbers and maths" in EXPLANATION_GUIDANCE
    // EXP-13 (owner 2026-11-08, decision C1): no folded `more` sections on new cards; saved cards that have them still render and read (explanationFieldText, fieldText).
    // EXP-13 fix 2 (owner 2026-11-08): the author gives its visuals as structured fields, placed in the body by [[visual:N]] markers; the server writes the
    // rh-diagram / rh-illustration fences there, so the saved body is the one the card already renders. `visuals` comes BEFORE body: a streamed answer's
    // pictures start while the body is still being written (explanation-fast-chain.js). The author is always asked for visuals (learn-artifact.js
    // authorSchema, which also asks for at most three); a body that already holds its fences (the earlier answer shape) is still read as it is. More than three
    // visuals, or more than two pictures, are read and the extras dropped by the server (settleExplanationBody: owner review 2026-11-08, never repair what the server can drop).
    schema: shape({ title: text(120), visuals: list(VISUAL_ITEM, 1, 6), body: text(3000) }, ['title', 'body']),
    block: spec => ({ type: 'explanation', title: spec.title, body: spec.visuals ? composeVisuals(spec.body, spec.visuals) : spec.body, ...(spec.more?.length ? { more: spec.more } : {}) }),
  },
  table: {
    ready: true,
    about: 'A comparison table: 2-8 columns, 1-20 rows, each row one cell per column.',
    schema: shape({ title: text(120), caption: text(300, 0), columns: list(text(60), 2, 8), rows: list(list(text(200, 0), 2, 8), 1, 20) }, ['title', 'columns', 'rows']),
    check: spec => { if (spec.rows.some(row => row.length !== spec.columns.length)) fail('Every table row needs exactly one cell per column'); },
    block: spec => ({ type: 'table', title: spec.title, caption: spec.caption || '', columns: spec.columns, rows: spec.rows }),
  },
  flashcards: {
    ready: true,
    about: '2-12 flashcards, a short front and its answer on the back.',
    schema: shape({ cards: list(shape({ front: text(300), back: text(600) }), 2, 12) }),
    block: spec => ({ type: 'flashcards', cards: spec.cards }),
  },
  quiz: {
    ready: true,
    about: 'One multiple-choice question with 2-5 options, exactly one correct, and why it is correct.',
    schema: shape({ question: text(600), options: list(shape({ text: text(300), correct: { type: 'boolean' } }), 2, 5), why: text(800) }),
    check: spec => {
      if (spec.options.filter(option => option.correct).length !== 1) fail('A quiz needs exactly one correct option');
      if (new Set(spec.options.map(option => option.text.trim())).size !== spec.options.length) fail('Quiz options must differ');
    },
    block: spec => ({ type: 'quiz', question: spec.question, options: spec.options.map((option, index) => ({ key: 'ABCDE'[index], text: option.text, ...(option.correct ? { correct: true } : {}) })), why: spec.why, choice: null }),
  },
  challenge: {
    ready: true,
    about: 'A predict-first challenge: the learner commits a guess before the material. expects is a JSON array of 2 to 6 short strings, one key idea each, for example "expects": ["First key idea", "Second key idea"], never one string; it lists the key ideas a good answer contains. reveal is shown after.',
    schema: shape({ prompt: text(600), hint: text(300), expects: list(text(200), 2, 6), reveal: text(800) }),
    block: spec => ({ type: 'challenge', prompt: spec.prompt, hint: spec.hint, expects: spec.expects, reveal: spec.reveal, answer: null }),
  },
  explain_back: {
    ready: true,
    about: 'Ask the learner to explain the idea back in their own words; expects is a JSON array of 2 to 6 short strings, one key idea each, for example "expects": ["First key idea", "Second key idea"], never one string; it lists the key ideas a good explanation covers.',
    schema: shape({ prompt: text(600), hint: text(300), expects: list(text(200), 2, 6) }),
    block: spec => ({ type: 'challenge', mode: 'explain_back', prompt: spec.prompt, hint: spec.hint, expects: spec.expects, reveal: '', answer: null }),
  },
  code_sample: {
    ready: true,
    about: 'A short Python code sample to read, with a title and a one-line brief. It is shown, not run: never state its output.',
    schema: shape({ title: text(120), brief: text(400), code: text(2000) }),
    check: spec => { if (spec.code.split('\n').length > 60) fail('Keep the code sample under 60 lines'); },
    // ponytail: no output line - a generated sample's output would be a claim
    // nobody ran. Add one once samples execute before they are shown.
    block: spec => ({ type: 'snippet', title: spec.title, brief: spec.brief, code: spec.code }),
  },
  flow_diagram: {
    ready: true,
    about: 'A node-and-arrow flow diagram laid out automatically. 2-12 nodes (tone: input, step, repeat, output, note), edges point in the direction of flow or causality.',
    schema: shape({
      title: text(120),
      direction: { type: 'string', enum: ['DOWN', 'RIGHT'] },
      nodes: list(shape({ id: text(30), label: text(60), detail: text(60, 0), tone: { type: 'string', enum: ['input', 'step', 'repeat', 'output', 'note'] } }, ['id', 'label']), 2, 12),
      edges: list(shape({ source: text(30), target: text(30), label: text(60, 0) }, ['source', 'target']), 1, 20),
    }),
    check: spec => {
      const ids = new Set(spec.nodes.map(node => node.id));
      if (ids.size !== spec.nodes.length || spec.nodes.some(node => !NODE_ID.test(node.id))) fail('Flow nodes need unique simple ids');
      if (spec.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target)) fail('Every flow edge must join two different nodes of this diagram');
    },
    block: spec => ({ type: 'flow', title: spec.title, spec: { direction: spec.direction, nodes: spec.nodes, edges: spec.edges } }),
  },
  mermaid_diagram: {
    ready: true,
    about: `A Mermaid diagram (${MERMAID_TYPES.join(', ')}). Plain diagram source only: no click handlers, no init directives.`,
    schema: shape({ title: text(120), code: text(3000) }),
    check: spec => {
      const first = spec.code.trim().split('\n')[0].trim().split(/\s/)[0];
      if (!MERMAID_TYPES.includes(first)) fail(`Start the Mermaid source with one of: ${MERMAID_TYPES.join(', ')}`);
      if (/^\s*click\s/im.test(spec.code) || /%%\{|<script|javascript:/i.test(spec.code)) fail('Mermaid source may not contain click handlers, directives or scripts');
    },
    block: spec => ({ type: 'mermaid', title: spec.title, code: spec.code.trim(), showSource: false }),
  },
  walkthrough: {
    ready: true,
    about: 'A step-through walkthrough: 2-10 ordered steps, each a short label and an optional detail, plus the goal the learner steps toward.',
    schema: shape({ title: text(120), goal: text(300), steps: list(shape({ label: text(60), detail: text(60, 0) }, ['label']), 2, 10) }),
    // The walkthrough_v1 behaviour with its fixed controls; only the data is generated.
    block: spec => ({
      type: 'scene', title: spec.title, state: null, attempts: 0,
      spec: {
        type: 'interactive_scene', id: slug(spec.title), schemaVersion: 1, behaviorId: 'walkthrough_v1', renderer: 'svg', conceptIds: [],
        initialState: { steps: spec.steps.map((step, index) => ({ id: `step-${index + 1}`, label: step.label, ...(step.detail ? { detail: step.detail } : {}) })) },
        interactions: [
          { input: 'button', label: 'Back', action: 'previous_step' },
          { input: 'button', label: 'Next', action: 'advance_step' },
          { input: 'button', label: 'Reset', action: 'reset_attempt' },
        ],
        execution: { mode: 'illustration' }, buildGoal: spec.goal, checkGoal: spec.goal,
      },
    }),
  },
  interactive_graph: {
    ready: true,
    about: 'An interactive Desmos graph: expressions in Desmos LaTeX, optional parameter sliders and axes. For functions and their parameters.',
    schema: shape({ title: text(120), brief: text(400), spec: graphOperation('desmos') }),
    check: spec => { spec.spec = graphSpec('desmos', spec.spec); },
    block: spec => ({ type: 'graph', title: spec.title, brief: spec.brief, spec: spec.spec, state: {} }),
  },
  data_plot: {
    ready: true,
    about: 'A Plotly data plot: numeric line, scatter or bar traces. Set illustrative to true unless every number comes from the supplied context.',
    schema: shape({ title: text(120), brief: text(400), illustrative: { type: 'boolean' }, spec: graphOperation('plotly') }),
    check: spec => { spec.spec = graphSpec('plotly', spec.spec); },
    // Invented numbers are labelled on the card, whatever the model wrote.
    block: spec => ({ type: 'graph', title: spec.title, brief: spec.illustrative ? `${spec.brief}\n\n*Illustrative numbers, not measured results.*` : spec.brief, spec: spec.spec, state: {} }),
  },
  video_generate: {
    ready: true,
    about: 'A short generated video clip, only when motion or a physical process substantially helps. An AI illustration, never measured footage.',
    schema: shape({ title: text(120), caption: text(300), operation: VIDEO_OPERATION }),
    check: spec => { spec.operation = validateVideo(spec.operation); },
    block: spec => ({ type: 'video', mode: 'generate', title: spec.title, src: '', caption: spec.caption, operation: spec.operation, status: 'idle' }),
  },
  maths_animation: {
    // Verified 2026-09-29: small-math-renderer-dev rendered the sample end to
    // end (docs/features/learn-math-animation.md).
    ready: true,
    about: 'A rendered maths animation from validated steps (equation, plot, shapes, matrix). Steps only, never code.',
    schema: shape({ title: text(120), caption: text(300), operation: MATH_SCHEMA }),
    check: spec => { validateMathAnimation(spec.operation); },
    block: spec => ({ type: 'video', mode: 'generate', title: spec.title, src: '', caption: spec.caption, operation: spec.operation, status: 'idle' }),
  },
  blender_scene: {
    ready: true,
    about: 'A small technical 3D scene Blender builds (cubes, spheres, arrows, coordinate frames, camera frustums) with simple animations.',
    schema: shape({ title: text(120), brief: text(400), operation: SCENE_SCHEMA }),
    check: spec => { spec.operation = validateScene(spec.operation); },
    block: spec => ({ type: 'scene', title: spec.title, brief: spec.brief, operation: spec.operation, status: 'idle', modelUrl: '', camera: {}, autoRotate: false, animation: { autoplay: true }, animationTime: 0 }),
  },
  // An interactive explanation in the authored cards' frozen scene format (animation-scene.js, scene-evaluate.js), drawn by
  // AnimatedScene like nanogpt/board.js cardBlock's cards (owner, 2026-10-21: /explain and the Tutor's explanation material
  // only). The authoring contract and the gates that run the existing scene validators are server-only
  // (agents/learn-scene-author.js, learn-scene-gates.js); a scene that fails them never becomes a card.
  animation: {
    ready: true,
    about: 'An interactive visual explanation: a scene with controls the learner moves (toggles, choices, sliders over listed settings) and values that follow from them, drawn by the canvas\'s scene renderer. Use it when manipulating a value, stepping through a process or watching quantities change teaches the idea; otherwise make a text explanation.',
    // Scene JSON is long (authored cards run 6-30 thousand characters): this primitive only, subject to spend admission.
    maxTokens: 16000,
    schema: shape({
      title: text(120),
      calculation: { type: 'string', enum: ['live', 'precomputed', 'none'] },
      scene: shape({
        id: text(64), title: text(120), width: { type: 'number', minimum: 320, maximum: 1120 }, height: { type: 'number', minimum: 200, maximum: 860 },
        duration: { type: 'number', minimum: 0.5, maximum: 20 },
        inputs: list({ type: 'object' }, 0, 4), exampleData: { type: 'object' }, derived: { type: 'object' },
        objects: list(shape({ id: text(64), type: { type: 'string' }, part: { type: 'integer' }, semanticId: text(64), conceptId: text(64), initialState: { type: 'object' } }, ['id', 'type', 'initialState']), 1, 60),
        timeline: list({ type: 'object' }, 0, 80), camera: { type: 'object' }, presentation: { type: 'object' },
      }, ['id', 'duration', 'objects', 'timeline']),
    }, ['calculation', 'scene']),
    check: spec => { if (!(spec.title || spec.scene.title || '').trim()) fail('Give the card a title'); },
    block: spec => ({ type: 'animation', title: spec.title || spec.scene.title, scene: { ...spec.scene, title: spec.scene.title || spec.title },
      // A steps card opens on its first named step (EXP-T26 M2); every other card at its finished frame.
      time: spec.scene.presentation?.mode === 'steps' ? spec.scene.presentation.steps?.[0]?.at ?? spec.scene.duration : spec.scene.duration,
      selectedObject: null, marked: null, calculation: spec.calculation }),
  },
  // Not generated yet. Each says so rather than being faked with a simpler card.
  code_exercise: { ready: false, unavailable: "Code exercise generation isn't available yet. I can open a notebook or show a code sample instead." },
  narration: { ready: false, unavailable: "Narration isn't available yet." },
  knowledge_graph: { ready: false, unavailable: "Knowledge graph generation isn't available yet." },
  reference_attention: { ready: false, unavailable: "Animation generation isn't available yet." },
  '3d_model': { ready: false, unavailable: "3D model generation isn't available yet." },
  // Direct tools: found or inserted, never generated here.
  image: { ready: false, direct: true, unavailable: 'Images come from search: use /photos with what to look for.' },
  // Ready, but not a model-written card (direct): the server signs the plan from the learner's own request (chat-proposal-route.js) and the plan card's
  // Generate runs the job (image-jobs.js). artifactPlan keeps it out of the planning model's tools, so /api/learn/artifact never calls a model for it.
  image_generate: { ready: true, direct: true, unavailable: "Image generation is made from its plan card's Generate, not as a card the Tutor writes." },
  video: { ready: false, direct: true, unavailable: 'Existing clips are added from search or a link, not generated.' },
  notebook: { ready: false, direct: true },
  whiteboard: { ready: false, direct: true },
  paper: { ready: false, direct: true },
};

// Observed rendering characteristics (Tool Performance v1, 2026-09-29,
// docs/features/learn-tool-performance.md): infrastructure facts a caller can
// weigh, not tutor policy. Times are click to interactive on the parallel
// clone: typicalColdMs is a first use with nothing warmed, typicalWarmMs a
// repeat use; latencyClass is the realistic first use once the idle warm-up
// (learn-warmup.js) has run. instant <100 ms, fast <250, medium <800, slow
// beyond that, async = a generation job that finishes later. null = not
// measured (the primitive has no card of its own yet).
const perf = (latencyClass, typicalColdMs, typicalWarmMs, { canPrewarm = false, progressiveReady = false, asyncGeneration = false } = {}) =>
  ({ latencyClass, typicalColdMs, typicalWarmMs, canPrewarm, progressiveReady, asyncGeneration });
const PERF = {
  explanation: perf('instant', 59, 25), table: perf('instant', 89, 35), flashcards: perf('instant', 64, 24),
  quiz: perf('instant', 38, 36), challenge: perf('instant', 39, 28), explain_back: perf('instant', 34, 29),
  code_sample: perf('instant', 37, 25), code_exercise: perf('instant', 45, 23), walkthrough: perf('instant', 27, 28),
  animation: perf('instant', 43, 26), knowledge_graph: perf('instant', 27, 26), image: perf('instant', 31, 14),
  data_plot: perf('fast', 1719, 74, { canPrewarm: true, progressiveReady: true }),
  flow_diagram: perf('fast', 1497, 115, { canPrewarm: true, progressiveReady: true }),
  interactive_graph: perf('fast', 2652, 166, { canPrewarm: true, progressiveReady: true }),
  mermaid_diagram: perf('medium', 1078, 41, { canPrewarm: true, progressiveReady: true }),
  whiteboard: perf('medium', 831, 149, { canPrewarm: true, progressiveReady: true }),
  '3d_model': perf('medium', 675, 120, { progressiveReady: true }),
  video: perf('medium', 346, 18, { progressiveReady: true }),
  notebook: perf('slow', 5691, 3216, { canPrewarm: true, progressiveReady: true }),
  paper: perf('slow', 1678, 362, { progressiveReady: true }),
  video_generate: perf('async', null, null, { asyncGeneration: true }), maths_animation: perf('async', null, null, { asyncGeneration: true }),
  blender_scene: perf('async', null, null, { asyncGeneration: true }), image_generate: perf('async', null, null, { asyncGeneration: true }),
  narration: perf('async', null, null, { asyncGeneration: true }),
  reference_attention: perf('instant', null, null),
};
for (const [id, entry] of Object.entries(PRIMITIVES)) entry.perf = PERF[id] || perf(null, null, null);

export const isReady = id => PRIMITIVES[id]?.ready === true;

// Validate one generated spec against its primitive and return the canvas
// block. Throws with a message the model can act on for its one repair.
export function artifactBlock(id, spec) {
  const primitive = PRIMITIVES[id];
  if (!primitive?.ready) fail(`${id} is not a generatable primitive`);
  validateSchema(spec, primitive.schema, id);
  const copy = structuredClone(spec);
  primitive.check?.(copy);
  return primitive.block(copy);
}


// --- CORE.09: the shared Explanation teaching guidance, display-text budget and the card's diagram format ----------------------------------
// Offered with make_explanation on every path (direct /explain, Quick Edit, the Tutor roadmap); the request's Depth objective and budget
// (chat-depth.js explanationTarget) follow it in the same tool description, under "# Depth".
// Owner 2026-11-08 (clean-up): the guidance is sectioned with Markdown headings, the same text under each. Static sections here (the cached prefix); the sections that
// change per card follow in the same tool description: "# Depth" (chat-depth.js explanationTarget), "# Visuals for this card" (the plan, or EXPLANATION_VISUAL_RULES
// when no plan was made: learn-artifact.js) and "# Examples" (the references, explanation-references.js). Removed as dead text: the binary-tree operation paragraph
// (the server guard plainTreesUnlessBinary decides the layout) and the Depth-precedence clause for formula questions (the Depth section carries it).
export const EXPLANATION_GUIDANCE = [
  '# Card layout\n' + 'For make_explanation, write the title, then visuals, then one body in Markdown (paragraphs, headings and pipe tables); there are no folded sections. Lay the body out as prose, then a visual, then prose, and optionally a second and a third visual, each followed by prose: one to three visuals, at most two of them pictures, and every visual has paragraph text both before and after it. Write prose in short paragraphs of two or three sentences, at most about 220 characters each, separated by a blank line; never one long paragraph. Never write a bulleted or numbered list: parallel points go into a visual, a comparison diagram for 2-4 things side by side (each column a heading and up to 5 short items), a flow or sequence for steps, a tree for the parts of one thing; anything else is written as sentences. Each visual is one entry of visuals, either a diagram {"k":"diagram","spec":<the diagram>} or an illustration {"k":"picture","p":<prompt>,"a":<alt>,"c":<caption>}. Place each visual in the body with a line holding only its marker, [[visual:1]], [[visual:2]] or [[visual:3]] (its position in visuals), between two prose parts; never write a fence, JSON or a diagram label in the body. A table is not a visual: it may sit inside a prose part. Each visual must show what the learner\'s question asks and what the prose next to it explains, never decoration: its title, caption or labels name that idea in the same words the question or the neighbouring prose uses. Every visual has a title or caption (a diagram its title, an illustration its caption). An illustration is a picture made for you by an image model while you answer: p says what to draw in at most 200 characters (subject, view, style; no text or labels in the picture), a says what the picture shows for a reader who cannot see it in at most 120 characters, c is one line under the picture saying what to notice in at most 100 characters. Use a table to compare items across shared attributes. Fulfill every entry of requiredVisuals in the request at every Depth, including Overview, as a complete table, a valid diagram of the kind named or an illustration; when requiredVisuals lists diagrams or illustrations, the visuals are exactly those, that many of each kind and no other; shorten the prose to stay inside the same budget rather than omit it. When the request traces a worked case through a flow, give the flow a highlightPath (the node ids of the route in order, from the start node to an end node along existing edges) and also say the route in the caption in words (for example First check? Yes, then second check? Yes, so Approve). The body must answer the learner\'s question on its own. Apply the requested Depth guidance and character budget. Only prose counts toward the budget: paragraph, heading and list text; the title, tables, diagrams and illustrations do not count. A table has leading and trailing pipes, a header row, a separator row and the same number of cells in every row.',
  '# Numbers and maths\n' + NUMBER_RULE + ' ' + MATH_FORMAT + ' ' + 'Never invent the name of an object, tool, part, person or source; state only what you are certain is standard knowledge or what the request supplies.' + ' ' + 'Maths in any label, heading or item uses the card\'s $...$ delimiters, as in the prose ($p_i$, $H(p,q)$).',
  '# Diagram kinds and their fields\n' + 'The spec of a diagram is one TutorDiagram object {"version":1,"diagram":{"kind":...,"title":...}}; never write Mermaid, HTML or SVG. Kinds: flow for a process with decisions (nodes [{id,label,role:"process"|"decision"|"outcome"|"fork"|"merge"}], edges [{from,to,label?}], optional highlightPath [node ids] for a traced worked case: one connected acyclic graph with exactly one start node; a decision has two or three outgoing edges with distinct short labels such as Yes and No, each to its own node, and a failed check ends in its own outcome; a process has one outgoing edge, an outcome has none; use cycle or relationship for a loop; a fork starts parallel paths and a merge joins them); node labels are actions, verb first; a decision\'s label is a question; an outcome states the result; each branch of a decision must lead to the outcome that follows from that answer, and the title names the operation the flow describes (lookup, insert), comparison for items across attributes (columns [{heading,items:[1-5 texts]}], 2-4 columns); row i in every column is the same attribute in the same order, timeline for events in time (events [{time,label,detail?}]), sequence for two or more named parties that send things to each other (client and server, sender and receiver, a protocol, request and response; actors [{id,label}] 2-4, messages [{from,to,label}] between different actors); message labels say what is sent, never the actor\'s name, matrix for a grid (columns [...], rows [{heading,cells:[one per column]}]), layers for a stack (layers [{label,detail?}]), cycle for a repeating process (steps [...]; the steps are only the ones that repeat: setup or initialisation is stated in the prose or as the title, never as a step), figure for a labeled drawing (figure "cell"|"free-body"|"cross-section", callouts [{anchor,label,detail?}] with one callout per anchor: cell anchors membrane, nucleus, cytoplasm, mitochondrion; cross-section anchors top-layer, core, bottom-layer, interface; free-body anchors body or a direction that has a vector; free-body also takes vectors [{direction:"up"|"down"|"left"|"right",magnitude above zero,label}] with unique directions and an optional unit, and only free-body takes vectors and unit), tree for a hierarchy (nodes [{id,label,parent?,side?}], exactly one node without a parent, no cycles, side only for the binary layout), relationship for labeled links between things, reciprocal or cyclic allowed (nodes [{id,label}], edges [{from,to,label}]: different ends, every node linked, no repeated labeled pair); each thing is one node; every edge label is the relation as a verb phrase (raises, feeds back into, is measured by), never a bare noun or a placeholder such as input, output, compare, link, transformation for before and after (before {label,items}, after {label,items}, operation, optional links [{from,to,label?}] as zero-based item indexes); before and after are two states of the same thing, item i before matching item i after; operation names what changed, argument for claim and evidence (claim, support [{label,source?}], objections [{label,source?}] possibly empty, conclusion), number-line for values and intervals (min, max, markers [{value,label}] distinct and inside the range, optional intervals [{from,to,startClosed,endClosed,label}] increasing and inside the range; at least one marker or interval), coordinate-plot for data on two axes (x and y {label,min,max,unit?} with min below max, series [{label,kind:"line"|"scatter",points:[{x,y}]}] 1-3 series, points inside the axes, a line needs two points); axes are the two quantities; a line series is the function sampled at 7-12 x values across the axis; mark the points the prose names with their exact values; for schedules and piecewise-constant values, a line series with two points at each change (the same x, the old and the new y) so it draws as steps; when the prose describes a path or trajectory, draw it as a line series with its points in order, bar-chart for comparing quantities (unit?, bars [{label,value}] 2-8, values may be negative), t-account for debits and credits (account, unit?, debits and credits [{label,amount}] nonnegative with at most two decimals, at least one posting), waterfall for an opening value changed by signed steps (opening, unit?, changes [{label,amount}] with at most two decimals). IDs start with a letter. Labels are short single-line text: title at most 90 characters, optional caption 140, flow node label 60 and edge label 30.' + ' ' + 'For a binary tree use kind "tree" with layout "binary"; give each child its side.',
].join('\n\n');
// The rules that choose the visuals when the planner made no plan (timeout, error, flag off): type, kind, count. A planned card states its visuals as fact instead.
// Batch-1 review fix (owner 2026-11-09): the closing sentence of '# Visuals for this card' in BOTH forms (a planned card's statement and the unplanned rules block).
export const VISUAL_COMPLETE = 'The visual must contain the step or quantity the question is about: for a process, the action that produces the result (decrypt with the private key; the veto override; the frame popped at the base case); for a metric, the derived values (precision and recall from the four cells); for an operation on a structure, the structure with the operation applied. A visual that shows only the setup is incomplete.';
export const EXPLANATION_VISUAL_RULES = '# Visuals for this card\n' + 'Choose visuals in this order. 1) Type: objects, 3D shapes, anatomy, places, living things and how something looks always get a picture first, then a process diagram second only if the thing also does something; a diagram alone is wrong for them; a "how does X work" or "how does X happen" question about a physical object, place or natural event (a volcano erupting, an eclipse, an engine) gets a picture of it and the process diagram; processes, relationships, comparisons, hierarchies, quantities, algorithms and data structures get diagrams; never use a picture for a data structure, an algorithm or numbers; a 3D object or a repeating structure — a molecule, a crystal lattice, a gear train, a mesh — is a picture, never a tree, figure or layers. Digital, abstract or procedural subjects — email, DNS, network protocols, algorithms, software, data structures, mathematics — never get a picture. They get a diagram only. 2) Diagram kind, by the shape of the answer: cycle when the last step feeds the first; sequence whenever two or more named parties send things to each other (client and server, sender and receiver, a protocol, request and response); timeline for dates or eras; transformation for inputs becoming outputs; tree for splits, sub-parts or sub-calls; relationship for causes; layers only for a real ordered stack; a question about a formula, a metric, a loss or how a quantity behaves gets a coordinate-plot of the function, with y computed from the formula the prose states at 7-12 x values (two decimals), or a bar-chart of one worked example; the title or caption says \'worked example\'. A question comparing two distributions or sets of values gets two series on one plot or a grouped bar-chart; flow otherwise, a straight chain included (request, auth, handler, database). Three visuals are a maximum, not a target. Layers, matrix, comparison, flow, tree and figure cannot draw a shape, object, place or appearance; figure is only for a cell, a free-body diagram or a layered cross-section; comparison is for 2-4 separate items, never the parts of one thing. 3) Count: two visuals when the question names two things (X and Y, X vs Y) or asks both how something looks and how it works; otherwise one; a third only for a list of parallel points turned into a comparison, flow or tree. ' + VISUAL_COMPLETE;

// The card's own patterns (Md.jsx lines()): an opening ``` takes its language token and ignores the rest of the line, any line starting with
// ``` closes, and the card draws a TutorDiagram for /^rh-diagram$/i. Pinned against Md.jsx by explanation-validation.test.js.
const FENCE = /^\s*```\s*([\w+#.-]*)/;
const DIAGRAM = 'rh-diagram';
// EXP-13: an illustration the server makes with the image model before the card is saved (explanation-figures.js). One JSON object, these keys only.
export const ILLUSTRATION = 'rh-illustration';
export const ILLUSTRATION_LIMITS = Object.freeze({ id: 32, prompt: 600, alt: 200, caption: 140 });

// A fence that does not parse still counts as the literal lines, so a bad block cannot hide text; diagramProblem refuses it anyway.
const fenceWords = lines => { try { return tutorDiagramVisibleText(parseTutorDiagram(lines.join('\n'))).filter(Boolean); } catch { return lines; } };

// The fences of a Markdown string: -> [{ lang, lines, closed }] in order, plus the prose lines outside them.
function split(md) {
  const prose = [], fences = [];
  let open = null;
  for (const line of String(md ?? '').split('\n')) {
    const m = line.match(FENCE);
    if (open) { if (/^\s*```/.test(line)) { open.closed = true; fences.push(open); prose.push({ fence: open }); open = null; } else open.lines.push(line); continue; }
    if (m) { open = { lang: m[1].toLowerCase(), lines: [], closed: false }; continue; }
    prose.push(line);
  }
  if (open) { fences.push(open); prose.push({ fence: open }); }
  return { prose, fences };
}

// The problem with a Markdown string's diagram fences, or null. Every rh-diagram fence must be closed and pass parseTutorDiagram (topology,
// references, labelled branches, row widths) before anything is delivered. A Mermaid fence is the superseded format: the card still draws one
// from saved content, but new Explanation output is refused so the author writes the diagram as an rh-diagram spec instead.
export function diagramProblem(md) {
  for (const f of split(md).fences) {
    if (f.lang === 'mermaid') return 'explanation_bad_diagram: a mermaid fence is not accepted; write the diagram as one closed ```rh-diagram fence holding a TutorDiagram JSON spec';
    if (f.lang !== DIAGRAM) continue;
    if (!f.closed) return 'explanation_bad_diagram: an rh-diagram fence is not closed';
    try { parseTutorDiagram(f.lines.join('\n')); } catch (error) {
      const issues = Array.isArray(error?.issues) ? error.issues.slice(0, 3).map(i => `${i.path.join('.') || 'diagram'}: ${i.message}`).join('; ') : String(error?.message || 'invalid');
      return `explanation_bad_diagram: the rh-diagram spec is not valid (${issues.slice(0, 280)})`;
    }
  }
  return null;
}

// -> { ok: true, spec: { version, id, prompt, alt, caption } } | { ok: false, problem }. The renderer and the server read the same parse.
export function parseIllustration(lines) {
  let spec;
  try { spec = JSON.parse(Array.isArray(lines) ? lines.join('\n') : String(lines ?? '')); } catch { return { ok: false, problem: 'the rh-illustration fence must hold one JSON object' }; }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { ok: false, problem: 'the rh-illustration fence must hold one JSON object' };
  const extra = Object.keys(spec).filter(k => !['version', 'id', 'prompt', 'alt', 'caption'].includes(k));
  if (extra.length) return { ok: false, problem: `the rh-illustration object takes only version, id, prompt, alt and caption (not ${extra.slice(0, 3).join(', ')})` };
  if (spec.version !== 1) return { ok: false, problem: 'the rh-illustration version must be 1' };
  if (typeof spec.id !== 'string' || !new RegExp(`^[A-Za-z][A-Za-z0-9-]{0,${ILLUSTRATION_LIMITS.id - 1}}$`).test(spec.id)) return { ok: false, problem: `the rh-illustration id must be a letter then letters, digits or hyphens, at most ${ILLUSTRATION_LIMITS.id} characters` };
  for (const key of ['prompt', 'alt', 'caption']) {
    const value = typeof spec[key] === 'string' ? spec[key].trim() : '';
    if (!value) return { ok: false, problem: `the rh-illustration "${spec.id}" needs a ${key}` };
    if (Array.from(value).length > ILLUSTRATION_LIMITS[key]) return { ok: false, problem: `the rh-illustration "${spec.id}" ${key} is longer than ${ILLUSTRATION_LIMITS[key]} characters` };
  }
  return { ok: true, spec: { version: 1, id: spec.id, prompt: spec.prompt.trim(), alt: spec.alt.trim(), caption: spec.caption.trim() } };
}
// Every rh-illustration fence of a Markdown string, in order: -> [{ ok, spec?, problem? }]
export const markdownIllustrations = md => split(md).fences.filter(f => f.lang === ILLUSTRATION).map(f => (f.closed ? parseIllustration(f.lines) : { ok: false, problem: 'an rh-illustration fence is not closed' }));

// After the pictures were made (explanation-figures.js): the fences whose picture could not be made are removed, the prose around them joined. ids: Set of ids to drop.
export function withoutIllustrations(md, ids) {
  const out = []; let open = null;
  for (const line of String(md ?? '').split('\n')) {
    if (open) { open.raw.push(line); if (/^\s*```/.test(line)) { const got = parseIllustration(open.lines); if (!(got.ok && ids.has(got.spec.id))) out.push(...open.raw); open = null; } else open.lines.push(line); continue; }
    const m = line.match(FENCE);
    if (m && m[1].toLowerCase() === ILLUSTRATION) { open = { lines: [], raw: [line] }; continue; }
    out.push(line);
  }
  if (open) out.push(...open.raw);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// The last attempt only (no repair left): every rh-diagram fence that is unclosed or does not parse is removed, so the written explanation is
// delivered without a diagram that cannot be drawn. A Mermaid fence is still refused, not dropped. -> { block, dropped }; the block is the same
// object when nothing was dropped.
const parses = lines => { try { parseTutorDiagram(lines.join('\n')); return true; } catch { return false; } };
// Owner 2026-11-08 (a card should not fail): an invalid diagram the one repair did not fix becomes, with no model call, a simpler diagram of its own labels in
// the order written; title and caption kept when they fit. Item 47 (owner 2026-11-08): its kind comes from the learner's words (prefer, chosen by the caller,
// learn-artifact.js): 'cycle' for repeat words (2-7 steps), 'sequence' for messages between actors when the diagram names at least two actors and a message
// between two of them, otherwise (or when that kind cannot be built) a straight flow (n1 -> n2 -> ..., each a process, the last the outcome).
// -> the parsed spec, or null when the fence is not JSON or fewer than two labels can be read.
const LABEL_LISTS = ['nodes', 'steps', 'events', 'layers', 'actors', 'messages', 'bars', 'changes', 'markers', 'callouts'];
const fit = (s, max) => { const t = String(s).replace(/\s+/g, ' ').trim(); return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, ''); };
const tryParse = spec => { try { return parseTutorDiagram(spec); } catch { return null; } };
function simplifiedSequence(d, head) {
  const actors = [], to = new Map();
  for (const a of Array.isArray(d.actors) ? d.actors : []) {
    const label = typeof a === 'string' ? a : a?.label;
    if (typeof label !== 'string' || !label.trim() || actors.length >= 4) continue;
    const id = `a${actors.length + 1}`; actors.push({ id, label: fit(label, 30) });
    for (const key of [a?.id, label]) if (typeof key === 'string' && !to.has(key.trim().toLowerCase())) to.set(key.trim().toLowerCase(), id); // a repeated id keeps its first actor
  }
  const end = v => (typeof v === 'string' ? to.get(v.trim().toLowerCase()) : undefined);
  const messages = (Array.isArray(d.messages) ? d.messages : []).map(m => ({ from: end(m?.from), to: end(m?.to), label: typeof m?.label === 'string' ? fit(m.label, 60) : '' }))
    .filter(m => m.from && m.to && m.from !== m.to && m.label).slice(0, 8);
  return actors.length >= 2 && messages.length ? tryParse({ version: 1, diagram: { ...head, kind: 'sequence', actors, messages } }) : null;
}
export function simplifiedDiagram(lines, prefer = 'flow') {
  let d; try { d = JSON.parse(lines.join('\n'))?.diagram; } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const list = LABEL_LISTS.map(k => d[k]).find(v => Array.isArray(v) && v.length >= 2) || [];
  const labels = [...new Set(list.map(x => (typeof x === 'string' ? x : x?.label)).filter(s => typeof s === 'string' && s.trim()).map(s => fit(s, 60)))].slice(0, 12);
  if (labels.length < 2 && prefer !== 'sequence') return null;
  const title = fit(typeof d.title === 'string' && d.title.trim() ? d.title : `${labels[0]} to ${labels.at(-1)}`, 90);
  const head = { title, ...(typeof d.caption === 'string' && d.caption.trim() ? { caption: fit(d.caption, 140) } : {}) };
  const chosen = prefer === 'sequence' ? simplifiedSequence(d, head)
    : prefer === 'cycle' && labels.length <= 7 ? tryParse({ version: 1, diagram: { ...head, kind: 'cycle', steps: labels.map(l => fit(l, 55)) } }) : null;
  if (chosen || labels.length < 2) return chosen;
  return tryParse({ version: 1, diagram: { ...head, kind: 'flow', nodes: labels.map((label, i) => ({ id: `n${i + 1}`, label, role: i === labels.length - 1 ? 'outcome' : 'process' })),
    edges: labels.slice(1).map((_, i) => ({ from: `n${i + 1}`, to: `n${i + 2}` })) } });
}
// simplify: an invalid closed diagram is replaced by simplifiedDiagram when it can be, else removed. -> { md, dropped (removed or replaced), simplified, kinds (of the simplified) }
function dropFrom(md, simplify = false, prefer = 'flow') {
  const out = [], kinds = []; let open = null, dropped = 0;
  for (const line of String(md ?? '').split('\n')) {
    if (open) {
      open.raw.push(line);
      if (/^\s*```/.test(line)) {
        if (open.lang === DIAGRAM && !parses(open.lines)) {
          dropped++;
          const spec = simplify && simplifiedDiagram(open.lines, prefer);
          if (spec) { kinds.push(spec.diagram.kind); out.push(open.raw[0], JSON.stringify(spec), line); }
        } else out.push(...open.raw);
        open = null;
      } else open.lines.push(line);
      continue;
    }
    const m = line.match(FENCE);
    if (m) { open = { lang: m[1].toLowerCase(), lines: [], raw: [line] }; continue; }
    out.push(line);
  }
  if (open) { if (open.lang === DIAGRAM) dropped++; else out.push(...open.raw); }
  return dropped ? { md: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), dropped, simplified: kinds.length, kinds } : { md, dropped: 0, simplified: 0, kinds };
}
export function dropInvalidDiagrams(block, { simplify = false, prefer = 'flow' } = {}) {
  const body = dropFrom(block?.body, simplify, prefer);
  const more = (block?.more || []).map(s => ({ s, d: dropFrom(s?.text, simplify, prefer) }));
  const dropped = body.dropped + more.reduce((n, { d }) => n + d.dropped, 0), kinds = [...body.kinds, ...more.flatMap(({ d }) => d.kinds)];
  if (!dropped) return { block, dropped: 0, simplified: 0, kinds: [] };
  return { block: { ...block, body: body.md, ...(block.more ? { more: more.map(({ s, d }) => (d.dropped ? { ...s, text: d.md } : s)) } : {}) }, dropped, simplified: kinds.length, kinds };
}

// ---- Item 47 (owner 2026-11-08): flow rules the server fixes itself, with no model call, before any repair ------------------------------------------------------
// On an rh-diagram flow that does not parse, in order: (1) label_trimmed: a node label over its limit is cut at a word boundary and the full label kept as the
// node's title (drawn as its tooltip); (2) one_branch_decision: a decision with one outgoing edge becomes a process; (3) flow_loop_to_cycle: a flow that is one
// closed loop (every node one edge in and one out, no start) becomes a cycle of the same steps in order, when it has 2-7 steps; (4) joined_roots: a second start
// whose edge end names another start by its label (an edge the author already wrote, with a label for an id) is attached as that edge's child; starts that are
// still separate (2 or 3 of them, each beginning its own sub-flow) are joined under one synthetic start, a decision named by the diagram's title whose branches
// are named by the starts. A node with no edge at all is never placed. Nothing else is invented. A fix is kept only when the whole diagram then parses; otherwise the author's diagram goes on, unchanged, to the one repair.
// -> { spec, kinds: [correction kind, ...] } or null.
const FLOW_LABEL = 60, NODE_TITLE = 240;
function correctedFlow(raw) {
  if (tryParse(raw)) return null;
  const d = structuredClone(raw?.diagram);
  if (d?.kind !== 'flow' || !Array.isArray(d.nodes) || !Array.isArray(d.edges) || !d.nodes.every(n => typeof n?.id === 'string' && typeof n.label === 'string')
    || !d.edges.every(e => typeof e?.from === 'string' && typeof e.to === 'string')) return null;
  const kinds = [];
  let issues = []; try { parseTutorDiagram({ version: 1, diagram: d }); } catch (error) { issues = Array.isArray(error?.issues) ? error.issues : []; }
  const long = new Set(issues.filter(i => i.path?.[1] === 'nodes' && i.path[3] === 'label' && /at most|too big|<=/i.test(i.message)).map(i => i.path[2])); // the limit check, or the source cap at twice it
  for (const i of long) { const n = d.nodes[i]; n.title = fit(n.label, NODE_TITLE); n.label = fit(n.label, FLOW_LABEL); kinds.push('label_trimmed'); }
  const ids = new Set(d.nodes.map(n => n.id)), out = id => d.edges.filter(e => e.from === id);
  for (const n of d.nodes) if (n.role === 'decision' && out(n.id).length === 1) { n.role = 'process'; kinds.push('one_branch_decision'); }
  const known = () => d.edges.filter(e => ids.has(e.from) && ids.has(e.to));
  const roots = () => d.nodes.filter(n => !known().some(e => e.to === n.id));
  if (!roots().length && d.nodes.length >= 2 && d.nodes.length <= 7 && known().length === d.edges.length && d.nodes.every(n => out(n.id).length === 1)) {
    const steps = []; const byId = new Map(d.nodes.map(n => [n.id, n]));
    for (let id = d.nodes[0].id; id && !steps.includes(id); id = out(id)[0]?.to) steps.push(id);
    if (steps.length === d.nodes.length && out(steps.at(-1))[0].to === steps[0]) {
      const cycle = tryParse({ version: 1, diagram: { title: d.title, ...(d.caption ? { caption: d.caption } : {}), kind: 'cycle', steps: steps.map(id => fit(byId.get(id).label, 55)) } });
      return cycle ? { spec: cycle, kinds: [...kinds, 'flow_loop_to_cycle'] } : null;
    }
  }
  if (roots().length >= 2) {
    const byLabel = new Map(roots().map(n => [n.label.trim().toLowerCase(), n.id]));
    for (const e of d.edges) {
      const id = !ids.has(e.to) && ids.has(e.from) && byLabel.get(e.to.trim().toLowerCase());
      if (id && id !== e.from) { e.to = id; kinds.push('joined_roots'); }
    }
    // Only starts of their own sub-flows are joined: a node with no edge at all is one the author did not connect, and placing it is a repair's job.
    const starts = roots();
    if (starts.length >= 2 && starts.length <= 3 && d.nodes.length < 12 && starts.every(n => out(n.id).length)) {
      const branches = starts.map(n => fit(n.label, 30));
      let id = 'start'; for (let k = 2; ids.has(id); k++) id = `start${k}`;
      // Owner M5 (2026-11-08): parallel inputs that converge (attention: Compute Q, K and V are three starts; Q and K meet at the similarity step and every
      // start reaches the weighted sum) run at the same time, so they are joined under a fork, not a decision whose branches would read as alternatives.
      const reach = from => { const seen = new Set(), todo = [from]; while (todo.length) for (const e of out(todo.pop())) if (!seen.has(e.to)) { seen.add(e.to); todo.push(e.to); } return seen; };
      const [first, ...others] = starts.map(n => reach(n.id));
      if ([...first].some(n => others.every(set => set.has(n)))) {
        d.nodes.unshift({ id, label: fit(d.title || 'Start', FLOW_LABEL), role: 'fork' });
        d.edges.unshift(...starts.map(n => ({ from: id, to: n.id })));
        if (Array.isArray(d.highlightPath) && starts.some(n => n.id === d.highlightPath[0])) d.highlightPath.unshift(id);
        kinds.push('joined_roots_fork');
      } else if (new Set(branches.map(b => b.toLowerCase())).size === branches.length && branches.every(Boolean)) {
        d.nodes.unshift({ id, label: fit(d.title || 'Start', FLOW_LABEL), role: 'decision' });
        d.edges.unshift(...starts.map((n, i) => ({ from: id, to: n.id, label: branches[i] })));
        if (Array.isArray(d.highlightPath) && starts.some(n => n.id === d.highlightPath[0])) d.highlightPath.unshift(id);
        kinds.push('joined_roots');
      }
    }
  }
  const spec = kinds.length ? tryParse({ version: 1, diagram: d }) : null;
  return spec ? { spec, kinds } : null;
}
// Owner 2026-11-08 (correct-SVG closing pass): a plain timeline (top-level events with dated text such as "27 BC") sent with the scaled-lanes layout and only
// empty lanes is the plain timeline the author wrote: the layout, domain and empty lanes are dropped. Kept only when the result parses. -> { spec, kinds } or null.
function correctedTimeline(raw) {
  if (tryParse(raw)) return null;
  const d = raw?.diagram;
  if (d?.kind !== 'timeline' || d.layout !== 'scaled-lanes' || !Array.isArray(d.events) || !d.events.length || !d.events.every(e => typeof e?.time === 'string')
    || (Array.isArray(d.lanes) && d.lanes.some(l => l?.intervals?.length || l?.events?.length))) return null;
  const { layout, domain, lanes, ...plain } = d;
  const spec = tryParse({ version: 1, diagram: plain });
  return spec ? { spec, kinds: ['timeline_plain'] } : null;
}
// Owner 2026-11-08 (arm E v2: the precision-recall matrix needed a repair at all three depths): a matrix the author wrote with the teaching layout but no row IDs gets
// one per row (the heading as a lowercase slug, row-N when it has none, made distinct); rows with fewer cells than columns, every row short by the same count, are padded
// with an em dash; a row with more cells than columns loses its trailing cells; rows that disagree with each other are left for the one repair. Kept only when the
// whole diagram then parses. -> { spec, kinds } or null.
function correctedMatrix(raw) {
  if (tryParse(raw)) return null;
  const d = structuredClone(raw?.diagram);
  if (d?.kind !== 'matrix' || !Array.isArray(d.columns) || !Array.isArray(d.rows) || !d.rows.length || !d.rows.every(r => r && typeof r === 'object' && Array.isArray(r.cells))) return null;
  const kinds = [], width = d.columns.length, diffs = d.rows.map(r => width - r.cells.length);
  if (diffs.some(x => x !== 0)) {
    const short = diffs.filter(x => x > 0), long = diffs.filter(x => x < 0);
    if (short.length && long.length) return null; // rows disagree with each other: the repair's
    if (short.length) { if (short.length !== diffs.length || new Set(short).size !== 1) return null; d.rows.forEach(r => { while (r.cells.length < width) r.cells.push('—'); }); kinds.push('matrix_cells_padded'); }
    else { d.rows.forEach(r => { r.cells = r.cells.slice(0, width); }); kinds.push('matrix_cells_trimmed'); }
  }
  if (d.layout === 'teaching' && d.rows.some(r => !r.id || typeof r.id !== 'string') || (d.layout === 'teaching' && new Set(d.rows.map(r => r.id)).size !== d.rows.length)) {
    const used = new Set();
    d.rows.forEach((r, i) => {
      const slug = String(r.heading ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
      let id = /^[a-z]/.test(slug) ? slug : `row-${i + 1}`, n = 2; while (used.has(id)) id = `${/^[a-z]/.test(slug) ? slug : 'row'}-${n++}`;
      used.add(id); r.id = id;
    });
    kinds.push('matrix_row_ids');
  }
  const spec = kinds.length ? tryParse({ version: 1, diagram: d }) : null;
  return spec ? { spec, kinds } : null;
}
// Owner 2026-11-08 (Gemini's repairs by cause): the field-level parser rules every kind shares, each fixed the way its message says and only when that is the whole problem:
// a string over its limit ("Use at most N characters") is cut at a word boundary (fit); an optional text that is blank or runs over several lines (detail, unit, caption, source)
// loses the blank or is joined onto one line; a transformation link or other mapping index that names an item that does not exist is dropped. Any other issue, or a fix that
// leaves the diagram invalid, hands the diagram back to the one repair unchanged. -> { spec, kinds } or null.
const OPTIONAL_TEXT = new Set(['detail', 'unit', 'caption', 'source', 'description']);
function correctedFields(raw) {
  const d = structuredClone(raw?.diagram);
  if (!d || typeof d !== 'object' || tryParse(raw)) return null;
  const kinds = new Set();
  for (let pass = 0; pass < 3; pass++) {
    let issues = []; try { parseTutorDiagram({ version: 1, diagram: d }); return kinds.size ? { spec: tryParse({ version: 1, diagram: d }), kinds: [...kinds] } : null; } catch (error) { issues = Array.isArray(error?.issues) ? error.issues : []; }
    if (!issues.length) return null;
    const at = path => path.slice(1).reduce((o, k) => (o == null ? o : o[k]), d);
    const drop = [];
    for (const issue of issues) {
      const path = Array.isArray(issue.path) ? issue.path : [], key = path.at(-1), parent = path.length > 1 ? at(path.slice(0, -1)) : d, message = String(issue.message ?? '');
      if (path[0] !== 'diagram' || path.length < 2) return null;
      if (parent && typeof parent === 'object' && OPTIONAL_TEXT.has(key) && !(key in parent)) continue; // two messages for one blank value: the first already dropped it
      const limit = message.match(/Use at most (\d+) characters/);
      if (limit && typeof parent?.[key] === 'string') { parent[key] = fit(parent[key], Number(limit[1])); kinds.add('field_trimmed'); continue; }
      if (/nonblank, single-line|Too small: expected string to have >=1 characters/.test(message) && typeof parent?.[key] === 'string' && OPTIONAL_TEXT.has(key)) {
        const joined = parent[key].replace(/\s+/g, ' ').trim();
        if (joined) parent[key] = joined; else delete parent[key];
        kinds.add(joined ? 'field_one_line' : 'field_blank_dropped'); continue;
      }
      if (/Mapping indices must refer to existing items/.test(message) && typeof key === 'number' && Array.isArray(parent)) { drop.push({ list: parent, index: key }); kinds.add('mapping_dropped'); continue; }
      if (path.at(-3) === 'links' && typeof path.at(-2) === 'number' && (key === 'from' || key === 'to')) { drop.push({ list: at(path.slice(0, -2)), index: path.at(-2) }); kinds.add('mapping_dropped'); continue; } // an index past the items: the same link as above
      return null;
    }
    const byList = new Map(); for (const { list, index } of drop) { if (!Array.isArray(list)) return null; (byList.get(list) ?? byList.set(list, new Set()).get(list)).add(index); }
    for (const [list, indices] of byList) for (const index of [...indices].sort((x, y) => y - x)) list.splice(index, 1);
    for (const holder of [d]) if (Array.isArray(holder.links) && !holder.links.length) delete holder.links;
  }
  return null;
}
// -> { md, corrections: { [kind]: count } }: every rh-diagram fence corrected where it can be (correctedFlow, correctedTimeline, correctedMatrix, correctedFields), the same string when none is.
export function correctDiagrams(md) {
  const out = [], corrections = {}; let open = null;
  for (const line of String(md ?? '').split('\n')) {
    if (open) {
      if (/^\s*```/.test(line)) {
        let raw = null; try { raw = JSON.parse(open.lines.join('\n')); } catch { /* not JSON: the repair's */ }
        const fixed = raw && (correctedFlow(raw) || correctedTimeline(raw) || correctedMatrix(raw) || correctedFields(raw));
        if (fixed) for (const kind of fixed.kinds) corrections[kind] = (corrections[kind] || 0) + 1;
        out.push(open.raw, ...(fixed ? [JSON.stringify(fixed.spec)] : open.lines), line); open = null;
      } else open.lines.push(line);
      continue;
    }
    const m = line.match(FENCE);
    if (m && m[1].toLowerCase() === DIAGRAM) { open = { lines: [], raw: line }; continue; }
    out.push(line);
  }
  if (open) out.push(open.raw, ...open.lines);
  return Object.keys(corrections).length ? { md: out.join('\n'), corrections } : { md, corrections };
}

// EXP-13 fix 6a (owner 2026-11-08, a re-route, never a refusal): when the learner's words say the process repeats, every rh-diagram flow with no decision
// and no branch (a straight chain) becomes a cycle of the same steps in order, title and caption kept. Any other diagram, or a chain the cycle kind cannot
// hold (more than 7 steps), is left as it is. -> the Markdown, unchanged when nothing was converted.
function chainAsCycle(spec) {
  const d = spec.diagram;
  if (d.kind !== 'flow' || d.nodes.some(n => n.role === 'decision')) return null;
  const next = new Map();
  for (const e of d.edges) { if (next.has(e.from)) return null; next.set(e.from, e.to); }
  const into = new Set(d.edges.map(e => e.to)), byId = new Map(d.nodes.map(n => [n.id, n]));
  const steps = [];
  for (let id = d.nodes.find(n => !into.has(n.id))?.id; id && steps.length <= d.nodes.length; id = next.get(id)) steps.push(fit(byId.get(id).label, 55));
  if (steps.length !== d.nodes.length) return null;
  try { return parseTutorDiagram({ version: 1, diagram: { title: d.title, ...(d.caption ? { caption: d.caption } : {}), kind: 'cycle', steps } }); } catch { return null; }
}
// Rewrites each valid rh-diagram fence through fn(parsed spec) -> a new spec or null (unchanged); an invalid diagram is left to the drop or repair path.
function mapDiagrams(md, fn) {
  const out = []; let open = null, changed = false;
  for (const line of String(md ?? '').split('\n')) {
    if (open) {
      if (/^\s*```/.test(line)) {
        let spec = null; try { spec = fn(parseTutorDiagram(open.lines.join('\n'))); } catch { /* an invalid diagram is the drop or repair path's */ }
        out.push(open.raw, ...(spec ? [JSON.stringify(spec)] : open.lines), line); changed ||= !!spec; open = null;
      } else open.lines.push(line);
      continue;
    }
    const m = line.match(FENCE);
    if (m && m[1].toLowerCase() === DIAGRAM) { open = { lines: [], raw: line }; continue; }
    out.push(line);
  }
  if (open) out.push(open.raw, ...open.lines);
  return changed ? out.join('\n') : md;
}
export const chainsAsCycles = md => mapDiagrams(md, chainAsCycle);

// Owner 2026-11-08: a protocol exchange drawn as a straight flow ("Client sends SYN" -> "Server replies SYN-ACK" -> "Client sends ACK" -> "Connection Established")
// is drawn as the sequence it is, with no model call. Only a flow with no decision that is one straight chain (each node at most one edge in and one out), and
// only when every step label reads "<party> <verb> <message>" with the verb from MESSAGE_VERBS; a last node with no such verb (an outcome) is dropped from the
// messages and becomes the caption when there is none. 2-4 parties and at least 2 distinct ones (so the subject changes at least once). A message goes to the
// next step's subject when that differs, else to the other party when there are exactly two, else the flow is left (ambiguous). A receive step names the
// receiver: its sender is the previous step's subject by the same rule, and the message the previous step already sent is not drawn twice.
// DECISION (owner 2026-11-08): "User submits form" -> "Server validates input" -> "Server stores record" stays a FLOW: validates and stores are not message
// verbs and nothing goes back to the user; a sequence needs every step to be a message.
// Extend this list (every inflection spelled out) when a new protocol prompt uses a new message verb.
const MESSAGE_VERBS = new Set(['send', 'sends', 'sent', 'reply', 'replies', 'replied', 'respond', 'responds', 'responded', 'return', 'returns', 'returned',
  'request', 'requests', 'requested', 'acknowledge', 'acknowledges', 'acknowledged', 'forward', 'forwards', 'forwarded', 'transmit', 'transmits', 'transmitted',
  'receive', 'receives', 'received']);
const RECEIVE_VERBS = new Set(['receive', 'receives', 'received']);
function flowAsSequence(spec) {
  const d = spec.diagram;
  if (d.kind !== 'flow' || d.nodes.some(n => n.role === 'decision')) return null;
  const next = new Map(), into = new Set();
  for (const e of d.edges) { if (next.has(e.from) || into.has(e.to)) return null; next.set(e.from, e.to); into.add(e.to); }
  const byId = new Map(d.nodes.map(n => [n.id, n])), labels = [];
  for (let id = d.nodes.find(n => !into.has(n.id))?.id; id && labels.length <= d.nodes.length; id = next.get(id)) labels.push(byId.get(id).label);
  if (labels.length !== d.nodes.length) return null;
  const words = labels.map(l => l.trim().split(/\s+/)), verb = w => MESSAGE_VERBS.has(w.toLowerCase());
  const outcome = words.at(-1).some(verb) ? null : labels.pop();
  if (outcome) words.pop();
  const steps = words.map(ws => { const i = ws.findIndex((w, k) => k > 0 && k < ws.length - 1 && verb(w)); return i < 0 ? null : { party: ws.slice(0, i).join(' '), receive: RECEIVE_VERBS.has(ws[i].toLowerCase()), message: ws.slice(i + 1).join(' ') }; });
  if (!steps.length || steps.some(s => !s)) return null;
  const key = s => s.toLowerCase(), parties = [];
  for (const s of steps) if (!parties.some(p => key(p) === key(s.party))) parties.push(s.party);
  if (parties.length < 2 || parties.length > 4) return null;
  const at = party => parties.findIndex(p => key(p) === key(party));
  const peer = (me, s) => (s && at(s.party) !== me ? at(s.party) : parties.length === 2 ? 1 - me : -1);
  const messages = [];
  for (const [j, s] of steps.entries()) {
    const me = at(s.party), them = peer(me, steps[s.receive ? j - 1 : j + 1]);
    if (them < 0) return null;
    const [from, to] = (s.receive ? [them, me] : [me, them]).map(i => `a${i + 1}`), last = messages.at(-1);
    if (!(s.receive && last && last.from === from && last.to === to && key(last.label) === key(s.message))) messages.push({ from, to, label: s.message });
  }
  const caption = d.caption || outcome;
  return tryParse({ version: 1, diagram: { title: d.title, ...(caption ? { caption } : {}), kind: 'sequence', actors: parties.map((label, i) => ({ id: `a${i + 1}`, label })), messages } });
}
// -> { md, count }: every valid rh-diagram flow that is a message exchange (flowAsSequence) redrawn as a sequence; md unchanged when count is 0.
export function flowsAsSequences(md) {
  let count = 0;
  const out = mapDiagrams(md, spec => { const seq = flowAsSequence(spec); if (seq) count++; return seq; });
  return { md: out, count };
}
// The binary tree layout fits only trees whose nodes have at most two children by definition (owner check 2026-11-08: a family tree and a folder tree came
// back binary in 4 of 4 runs). Outside a binary / heap / BST question, a binary tree is drawn as the ordinary tree: layout and sides removed, nothing else changed.
export const BINARY_WORDS = /\b(binary|heaps?|bst)\b/i;
const plainTree = doc => {
  const d = doc?.diagram;
  if (d?.kind !== 'tree' || d.layout !== 'binary') return null;
  const { layout, ...rest } = d;
  return parseTutorDiagram({ ...doc, diagram: { ...rest, nodes: d.nodes.map(({ side, ...node }) => node) } });
};
// The other direction (owner check 2026-11-08, second run: a stricter wording made the model skip the binary layout for heaps and traversals, 3 of 8): inside a
// binary / heap / BST question, an ordinary tree whose nodes all have at most two children is drawn binary, sides assigned in the order the children were written.
const binaryTree = doc => {
  const d = doc?.diagram;
  if (d?.kind !== 'tree' || d.layout === 'binary') return null;
  const kids = new Map();
  for (const n of d.nodes) if (n.parent !== undefined) kids.set(n.parent, [...(kids.get(n.parent) || []), n.id]);
  if ([...kids.values()].some(list => list.length > 2)) return null;
  const side = new Map([...kids.values()].flatMap(list => list.map((id, i) => [id, i ? 'right' : 'left'])));
  try { return parseTutorDiagram({ ...doc, diagram: { ...d, layout: 'binary', nodes: d.nodes.map(n => (side.has(n.id) ? { ...n, side: side.get(n.id) } : n)) } }); } catch { return null; }
};
// Trees follow the question, not the model's guess: binary layout exactly for binary / heap / BST questions (when the tree allows it), ordinary layout otherwise.
export const plainTreesUnlessBinary = (md, args) => mapDiagrams(md, BINARY_WORDS.test(String(args ?? '')) ? binaryTree : plainTree);
// Batch-1 review (owner audit 2026-11-09, card 09 database index): a tree with no layout (the binary guard just removed `binary`, or the author wrote none) is drawn by the legacy
// indented-list layout, which reads as a bulleted outline. When every node label is a short key (one token or two words, at most 12 characters: 50, 25, A, root), the Phase 02
// top-down `hierarchy` layout draws it as a tree instead; long-text hierarchies (sentence structure, folders, several-word labels) keep the outline, and a binary tree is never touched.
const SHORT_KEY = label => { const t = String(label ?? '').trim(); return t.length > 0 && t.length <= 12 && t.split(/\s+/).length <= 2; };
const hierarchyTree = doc => {
  const d = doc?.diagram;
  if (d?.kind !== 'tree' || d.layout !== undefined || !d.nodes.every(n => SHORT_KEY(n.label))) return null;
  try { return parseTutorDiagram({ ...doc, diagram: { ...d, layout: 'hierarchy' } }); } catch { return null; }
};
export function treesAsHierarchy(md) {
  let count = 0;
  const out = mapDiagrams(md, spec => { const tree = hierarchyTree(spec); if (tree) count++; return tree; });
  return { md: out, count };
}
// Owner E3 (2026-11-08), log only for now: diagram text with _, ^ or \ outside maths delimiters is maths the card will show as raw source (p_i, x^2).
const MATH_SPANS = /\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g;
export const bareMaths = text => /[_^\\]/.test(String(text ?? '').replace(MATH_SPANS, ''));
// -> the visible texts of the body's valid diagrams that hold bare maths.
export function diagramSmells(md) {
  const labels = [];
  mapDiagrams(md, doc => { for (const t of tutorDiagramVisibleText(doc)) if (typeof t === 'string' && bareMaths(t)) labels.push(t); return null; });
  return labels;
}
// Owner C1.1 (2026-11-08): a relationship draws each node once. The server sets the graph layout on every relationship; the graph layout refuses a
// disconnected one (each component would float apart), so that one keeps the pairs layout, unchanged.
const graphRelationship = doc => { const d = doc?.diagram; if (d?.kind !== 'relationship' || d.layout === 'graph') return null; try { return parseTutorDiagram({ ...doc, diagram: { ...d, layout: 'graph' } }); } catch { return null; } };
export const relationshipsAsGraphs = md => mapDiagrams(md, graphRelationship);

// E1: the tables and diagrams a Markdown string really holds, for the required-visual check (explanation-visuals.js). A pipe table is complete only with a header row, a
// separator row, at least one body row, at least two columns, the same cell count in every row and no empty header cell; a closed rh-diagram fence is ok only if
// parseTutorDiagram accepts it. -> { tables: [{ ok, problem? }], diagrams: [{ ok, kind?, edgeLabels?, hasDecision?, hasOutcome?, problem? }] }
const pipeCells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
function tableCheck(run) {
  const [head, rule, ...rows] = run.map(pipeCells);
  if (!rule || !rule.every(c => /^:?-{3,}:?$/.test(c)) || head.length !== rule.length) return { ok: false, problem: 'a pipe table needs a header row and a separator row of the same width' };
  if (head.length < 2 || head.some(c => !c)) return { ok: false, problem: 'a table needs at least two columns and no empty header cell' };
  if (!rows.length) return { ok: false, problem: 'the table has no body row' };
  if (rows.some(r => r.length !== head.length)) return { ok: false, problem: 'the table rows do not all have the same number of cells as the header' };
  return { ok: true };
}
export function markdownVisuals(md) {
  const { prose, fences } = split(md);
  const tables = []; let run = [];
  const flush = () => { if (run.length) tables.push(tableCheck(run)); run = []; };
  for (const line of prose) { if (typeof line === 'string' && /^\s*\|.*\|\s*$/.test(line)) run.push(line); else flush(); }
  flush();
  const diagrams = fences.filter(f => f.lang === DIAGRAM).map(f => {
    if (!f.closed) return { ok: false, problem: 'the rh-diagram fence is not closed' };
    try { const { diagram: d } = parseTutorDiagram(f.lines.join('\n')); return { ok: true, kind: d.kind, highlightPath: d.highlightPath ?? null, edgeLabels: d.kind === 'tree' ? d.nodes.map(n => n.edgeLabel).filter(Boolean) : (d.edges || []).map(e => e.label).filter(Boolean), hasDecision: (d.nodes || []).some(n => n.role === 'decision'), hasOutcome: (d.nodes || []).some(n => n.role === 'outcome') }; }
    catch (error) { return { ok: false, problem: (Array.isArray(error?.issues) ? error.issues.slice(0, 2).map(i => `${i.path.join('.') || 'diagram'}: ${i.message}`).join('; ') : String(error?.message || 'invalid')).slice(0, 200) }; }
  });
  return { tables, diagrams };
}

// Inline Markdown as the card's Md shows it (Md.jsx EMPHASIS + plain()): one left-to-right pass, so a code span is drawn literally (markers,
// links and underscores inside it count), bold and italic keep their inner text, an https link keeps its text and any other [a](b) is drawn as written.
const INLINE = /(`[^`\n]+`|\*\*[^*]+\*\*|\[[^\]\n]+\]\([^\s)]+\)|(?<![\w*/])\*(?![\s*])[^*\n]*?[^\s*]\*(?![\w*])|(?<![\w/.])_(?![\s_])[^_\n]*?[^\s_]_(?![\w/.]))/;
const mathText = s => s.replace(/\$\$([\s\S]*?)\$\$/g, '$1').replace(/\$([^$\n]+)\$/g, '$1');
const inlineText = s => s.split(INLINE).map((part, i) => {
  if (i % 2 === 0) return mathText(part);
  if (part.startsWith('`')) return part.slice(1, -1);
  if (part.startsWith('**')) return inlineText(part.slice(2, -2));
  const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
  if (link) return inlineText(link[1]);
  return part.startsWith('[') ? part : inlineText(part.slice(1, -1)); // ponytail: a source-reference pill (file.py:15) may draw different text than it matches; not mirrored
}).join('');

// The display text of one Markdown string in reading order: prose, headings, list items, table cells, code as literal text, diagram labels.
// -> [{ text, prose }]: prose is paragraph, heading, list and code text (EXP-13: what the budget counts and term anchors may sit in); table cells and diagram words are not.
// An rh-illustration fence (EXP-13, new: no saved card has one, so DISPLAY_TEXT_VERSION is unchanged) shows no text in the body: its caption sits under the picture, outside the anchorable text.
function markdownPieces(md) {
  const out = [];
  for (const line of split(md).prose) {
    if (typeof line !== 'string') {
      if (line.fence.lang === ILLUSTRATION) continue;
      out.push(...(line.fence.lang === DIAGRAM ? fenceWords(line.fence.lines).map(text => ({ text, prose: false })) : line.fence.lines.map(text => ({ text, prose: true }))));
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (!cells.every(c => /^:?-{3,}:?$/.test(c))) out.push(...cells.map(c => ({ text: inlineText(c), prose: false })));
      continue;
    }
    out.push({ text: inlineText(line.replace(/^\s*#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').replace(/^\s*>\s?/, '').replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+/, '')), prose: true });
  }
  return out;
}
const markdownText = md => markdownPieces(md).map(p => p.text).join(' ');
const proseText = md => markdownPieces(md).filter(p => p.prose).map(p => p.text).join(' ').replace(/\s+/g, ' ').trim();

// E2 + EXP-13: which code points of explanationFieldText(md) are prose, so a term anchor can be refused when it sits in a table cell or a diagram label.
// The same collapse and trim as explanationFieldText, applied to the text and its flags together. -> boolean[] (one per code point of the field text)
export function explanationFieldProse(md) {
  const chars = [], flags = [];
  markdownPieces(md).forEach((p, i) => { if (i) { chars.push(' '); flags.push(false); } for (const c of p.text) { chars.push(c); flags.push(p.prose); } });
  const out = [];
  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) { if (out.length && !out.at(-1).space) out.push({ space: true, prose: false }); continue; }
    out.push({ space: false, prose: flags[i] });
  }
  if (out.at(-1)?.space) out.pop();
  return out.map(c => c.prose);
}

// E2: one Markdown field's canonical display text, the single mapping that term anchors, selections and highlights share (explanation-interactions.js DISPLAY_TEXT_VERSION).
export const explanationFieldText = md => markdownText(md).replace(/\s+/g, ' ').trim();

// CORE.09: the counted display text of an Explanation block: title, body, then every section label and text (collapsed ones too),
// flattened, whitespace collapsed, trimmed, counted in Unicode code points. Pure: the Worker and the web may both import it.
export const explanationText = block => [block?.title ?? '', markdownText(block?.body), ...(block?.more || []).flatMap(s => [s?.label ?? '', markdownText(s?.text)]),
  block?.illustration?.caption ?? '', ...(Array.isArray(block?.illustration?.callouts) ? block.illustration.callouts.map(c => c?.text ?? '') : [])].join(' ').replace(/\s+/g, ' ').trim();
export const explanationChars = block => Array.from(explanationText(block)).length;

// E3 (GAP-03, EXP-03-C02): an attached illustration's caption and callout text count toward the teaching cap with everything else, checked before a picture is attached by hand.
// Owner 2026-11-08 removed "Add illustration" from the card; a saved card's single block.illustration still renders, and this check stays for any caller that attaches one.
// ponytail: a card saved before E3 carries no Depth (block.depth), so its budget is unknown and the check passes; stamp the Depth and this tightens by itself.
export function illustrationProblem(block, illustration) {
  const level = validDepth(block?.depth);
  if (!level) return null;
  const cap = EXPLANATION_CAPS[level], used = explanationChars({ ...block, illustration: { ...(block.illustration || {}), ...illustration } });
  return used > cap ? `This explanation is at its ${level} limit (${used} of ${cap} characters with the picture's caption), so the illustration was not attached. Shorten the card or use a higher Depth, then add it again.` : null;
}

// EXP-13 (owner decision B): the budget counts prose only, paragraph, heading and list text of the body (and of a saved card's sections); the title, tables, diagrams and
// illustrations do not count. Code points, whitespace collapsed, like explanationChars.
export const explanationProseChars = block => Array.from([proseText(block?.body), ...(block?.more || []).map(s => proseText(s?.text))].filter(Boolean).join(' ')).length;

// EXP-13 layout: the body as parts in reading order, -> [{ kind: 'prose', text } | { kind: 'visual', visual: 'diagram'|'illustration', ok, words, name }]. A prose part needs
// paragraph, heading or list text (a table alone is not prose between visuals). words: the visual's own text (diagram title, caption and labels; illustration caption and alt).
function explanationParts(md) {
  const parts = []; let prose = [];
  const flush = () => { const text = prose.join(' ').replace(/\s+/g, ' ').trim(); if (text) parts.push({ kind: 'prose', text }); prose = []; };
  for (const line of split(md).prose) {
    if (typeof line === 'string') { if (!/^\s*\|.*\|\s*$/.test(line)) prose.push(markdownText(line)); continue; }
    const { lang, lines, closed } = line.fence;
    if (lang === DIAGRAM) {
      flush();
      let d = null; try { if (closed) d = parseTutorDiagram(lines.join('\n')); } catch { d = null; }
      parts.push({ kind: 'visual', visual: 'diagram', ok: !!d, words: d ? tutorDiagramVisibleText(d).filter(Boolean).join(' ') : '', name: d?.diagram?.title || d?.diagram?.caption || '' });
    } else if (lang === ILLUSTRATION) {
      flush();
      const got = closed ? parseIllustration(lines) : { ok: false };
      parts.push({ kind: 'visual', visual: 'illustration', ok: got.ok, words: got.ok ? `${got.spec.caption} ${got.spec.alt}` : '', name: got.ok ? got.spec.caption : '' });
    } else prose.push(lines.join(' '));
  }
  flush();
  return parts;
}

// Visual relevance (owner 2026-11-08): a deterministic word check, no model call. Content words: lowercased letters and digits, stop words removed, a simple plural stripped.
const STOP = new Set('a an and are as at be been but by can do does for from has have how in into is it its of on or that the their them then there these this those to was were what when where which while who why will with you your our we they he she his her not no yes than so if also each every one two more most some any all about over under between through'.split(' '));
const stem = w => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.length > 4 && /(?:ses|xes|zes|ches|shes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
export const contentWords = text => new Set((String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(w => !STOP.has(w) && (w.length > 1 || /\d/.test(w))).map(stem));

// -> null, or the one layout problem of a NEW card (the problem words name the repair). question: the learner's own words (direct) or the step's title and goal (Tutor).
export function explanationLayoutProblem(block, question = '') {
  if (block?.more?.length) return 'explanation_layout: a new card has no folded sections; put everything in the body.';
  const parts = explanationParts(block?.body), visuals = parts.filter(p => p.kind === 'visual');
  if (!visuals.length && block?.visualFallback === 'dropped') return null; // the server removed the only visual it could neither draw nor simplify (learn-artifact.js)
  if (!visuals.length) return 'explanation_missing_visual: the card needs one to three visuals, an rh-diagram or an rh-illustration fence, each with prose before and after it; add one that shows what the question asks.';
  if (visuals.length > 3) return `explanation_too_many_visuals: the card has ${visuals.length} visuals; keep one to three, each with prose before and after it.`;
  const pictures = visuals.filter(p => p.visual === 'illustration').length;
  if (pictures > 2) return `explanation_too_many_visuals: the card has ${pictures} pictures; keep at most two (diagrams may make up the rest).`;
  if (!/^P(?:VP){1,3}$/.test(parts.map(p => (p.kind === 'prose' ? 'P' : 'V')).join(''))) return 'explanation_layout: a visual needs prose before and after it; write prose, visual, prose (optionally visual, prose, up to three visuals), with paragraph or list text between two visuals.';
  const asked = contentWords(question);
  for (const [i, p] of parts.entries()) {
    if (p.kind !== 'visual' || !p.ok) continue; // a broken fence is diagramProblem's or the illustration check's to name
    const near = new Set([...asked, ...contentWords(parts[i - 1]?.text), ...contentWords(parts[i + 1]?.text)]);
    if (![...contentWords(p.words)].some(w => near.has(w))) return `explanation_visual_unrelated: the ${p.visual} "${String(p.name).slice(0, 80)}" names nothing from the question or the text around it; make it show what the question asks and the prose next to it explains, and name that idea in its ${p.visual === 'diagram' ? 'title, caption or labels' : 'caption and alt'}.`;
  }
  return null;
}

// -> null, or the validator's words for a NEW card: over the prose budget, the layout, and each broken diagram or illustration. When several are wrong, ONE message
// names them all, so the single repair can fix them together. The repair (direct paths) reads the words; the roadmap fails terminally.
// depth: kept for the callers; EXP-13 has one budget for every Depth (asked for 600, refused above 700).
export function explanationProblem(block, depth, question = '') {
  const cap = EXPLANATION_BUDGET.hard, used = explanationProseChars(block);
  const diagrams = [block?.body, ...(block?.more || []).map(s => s?.text)].map(diagramProblem).filter(Boolean);
  const pictures = markdownIllustrations(block?.body), ids = pictures.filter(p => p.ok).map(p => p.spec.id);
  const problems = [];
  if (used > cap) problems.push(`explanation_over_budget: the card has ${used} characters of prose (paragraph, heading and list text), the limit is ${cap} (aim for ${EXPLANATION_BUDGET.target}); the title, tables, diagrams and illustrations do not count; shorten the prose.`);
  problems.push(...diagrams);
  problems.push(...pictures.filter(p => !p.ok).map(p => `explanation_bad_illustration: ${p.problem}.`));
  if (new Set(ids).size !== ids.length) problems.push('explanation_bad_illustration: two rh-illustration fences share an id; give each its own.');
  const layout = explanationLayoutProblem(block, question); if (layout) problems.push(layout);
  return problems.length ? problems.join(' ') : null;
}

// ---- EXP-13 fix 1 (owner 2026-11-08, after the gpt-oss benchmark): what the server can fix is fixed here, never sent to the one repair ----------------
// The body as blocks in reading order: each fence its own block, other text split at blank lines. visual: 'diagram' | 'illustration' | null; ok: it parses.
function bodyBlocks(md) {
  const blocks = []; let open = null, run = [];
  const flush = () => { if (run.length) blocks.push({ lines: run, visual: null }); run = []; };
  const fence = ({ lang, lines }) => {
    const inner = lines.slice(1, /^\s*```/.test(lines.at(-1)) && lines.length > 1 ? -1 : undefined);
    const visual = lang === DIAGRAM ? 'diagram' : lang === ILLUSTRATION ? 'illustration' : null;
    let kind = null; if (visual === 'diagram') try { kind = JSON.parse(inner.join('\n'))?.diagram?.kind ?? null; } catch { /* unreadable: no kind */ }
    return { lines, fence: true, visual, kind, ok: visual === 'diagram' ? parses(inner) : visual === 'illustration' ? parseIllustration(inner).ok : true };
  };
  for (const line of String(md ?? '').split('\n')) {
    if (open) { open.lines.push(line); if (/^\s*```/.test(line)) { blocks.push(fence(open)); open = null; } continue; }
    const m = line.match(FENCE);
    if (m) { flush(); open = { lang: m[1].toLowerCase(), lines: [line] }; continue; }
    if (line.trim()) run.push(line); else flush();
  }
  if (open) blocks.push(fence(open));
  flush();
  return blocks;
}
// EXP-13 (owner 2026-11-08): how many Markdown lists the prose holds (a run of list items, blank lines and indented lines inside it), saved on the card as
// block.proseLists for measurement only: a list is never checked, repaired or shown differently.
export function proseListCount(md) {
  let n = 0, inList = false, fence = false;
  for (const line of String(md ?? '').split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; inList = false; continue; }
    if (fence || !line.trim()) continue;
    const item = /^\s*(?:[-*+]|\d{1,9}[.)])\s/.test(line);
    if (item && !inList) n++;
    inList = item || (inList && /^\s/.test(line));
  }
  return n;
}
const joinBlocks = blocks => blocks.map(b => b.lines.join('\n')).join('\n\n');
const layoutOk = md => /^P(?:VP){1,3}$/.test(explanationParts(md).map(p => (p.kind === 'prose' ? 'P' : 'V')).join(''));

// Every way to put the visuals (in their order) into the gaps of the other blocks: [[gap, ...]], gap = the number of other blocks before that visual.
const placements = (n, m, from = 0) => (m === 0 ? [[]] : Array.from({ length: n + 1 - from }, (_, k) => from + k).flatMap(g => placements(n, m - 1, g).map(rest => [g, ...rest])));

// A list item or heading is one unit; a paragraph line is split into sentences (shortcut: a sentence ends at . ! or ? before a space and a capital, digit
// or opening mark, so "e.g. The" splits too; upgrade if a real card shows a bad cut). Table rows and fences are never units: they do not count.
const PIPE = /^\s*\|.*\|\s*$/;
const unitsOf = line => (PIPE.test(line) ? null : /^\s*(?:#{1,6}\s|[-*+]\s|\d{1,9}[.)]\s)/.test(line) ? [line] : line.split(/(?<=[.!?]["')\]*_]?)\s+(?=[\p{Lu}\p{N}"'(*_$[])/u));

// -> the body with (1) visuals the server can drop dropped: pictures beyond the second go first, then more than three keeps the first three by position
// (owner 2026-11-08: at most three visuals, at most two of them pictures, for Recraft time and cost), and when the learner asked for a mix
// (mix = { diagram, illustration, diagramKind? }, explanation-visuals.js requiredMix) only that many of each kind are kept: a diagram of the asked kind
// first (an invalid one is then named for the repair rather than replaced by another kind), then valid ones, then by position;
// (2) the visuals moved, if their order is wrong, to the nearest gaps where each has prose before and after it; (3) prose over EXPLANATION_BUDGET.hard
// trimmed by whole sentences or list items from the end, every prose part keeping at least one. What cannot be settled is left for the validator to
// name. The same string when nothing changes.
// Owner 2026-11-08: a plain paragraph line over PARAGRAPH_MAX characters becomes several paragraphs, each its own block (a blank line between), packed from whole sentences
// (unitsOf) up to PARAGRAPH_MAX; a sentence longer than that stays whole and alone. Maths spans are masked while splitting, so a period inside $...$ never ends a sentence.
// Headings, list items, table rows, fences and visuals are never split. Only line breaks are added: the prose characters and the P/V pattern stay the same.
function splitLongParagraphs(blocks) {
  const out = []; let changed = false;
  const plain = line => !PIPE.test(line) && !/^s*(?:#{1,6}s|[-*+]s|d{1,9}[.)]s|[[visual:d+]])/.test(line);
  for (const block of blocks) {
    if (block.fence || block.visual) { out.push(block); continue; }
    let run = [];
    const flush = () => { if (run.length) out.push({ ...block, lines: run }); run = []; };
    for (const line of block.lines) {
      if (!plain(line) || Array.from(line).length <= PARAGRAPH_MAX) { run.push(line); continue; }
      const math = []; const masked = line.replace(MATH_SPANS, m => `\uE000${math.push(m) - 1}\uE001`);
      const sentences = (unitsOf(masked) || [masked]).map(s => s.replace(/\uE000(\d+)\uE001/g, (_, i) => math[i]));
      const paragraphs = [];
      for (const sentence of sentences) {
        const last = paragraphs.length - 1;
        if (last >= 0 && Array.from(`${paragraphs[last]} ${sentence}`).length <= PARAGRAPH_MAX) paragraphs[last] = `${paragraphs[last]} ${sentence}`; else paragraphs.push(sentence);
      }
      if (paragraphs.length < 2) { run.push(line); continue; }
      flush(); for (const p of paragraphs) out.push({ ...block, lines: [p] }); changed = true;
    }
    flush();
  }
  return changed ? out : blocks;
}

export function settleExplanationBody(md, mix = null) {
  md = literalBreaksToNewlines(md); // the same hotfix for a caller that did not go through learn-artifact (owner 2026-11-09)
  let blocks = bodyBlocks(md);
  const visuals = blocks.map((b, i) => (b.visual ? i : -1)).filter(i => i >= 0);
  const asked = i => !!mix?.diagramKind && blocks[i].kind === mix.diagramKind;
  const rank = list => list.sort((x, y) => (asked(y) - asked(x)) || (blocks[y].ok - blocks[x].ok) || x - y);
  const firstPictures = new Set(visuals.filter(i => blocks[i].visual === 'illustration').slice(0, 2));
  const keep = new Set(mix ? ['diagram', 'illustration'].flatMap(kind => rank(visuals.filter(i => blocks[i].visual === kind)).slice(0, mix[kind] || 0))
    : visuals.filter(i => blocks[i].visual !== 'illustration' || firstPictures.has(i)).slice(0, 3));
  let changed = keep.size !== visuals.length;
  blocks = blocks.filter((b, i) => !b.visual || keep.has(i));
  // Owner 2026-11-08: long paragraphs are split BEFORE the layout check, so the visuals have more gaps between prose to be placed in (Gemini's "a visual needs prose before and after it").
  { const split = splitLongParagraphs(blocks); if (split !== blocks) { blocks = split; changed = true; } }
  if (keep.size && !layoutOk(joinBlocks(blocks))) {
    const flow = blocks.filter(b => !b.visual), seen = blocks.filter(b => b.visual);
    const at = []; let n = 0; for (const b of blocks) { if (b.visual) at.push(n); else n++; }
    const build = gaps => { const out = []; flow.forEach((b, i) => { gaps.forEach((g, v) => { if (g === i) out.push(seen[v]); }); out.push(b); }); gaps.forEach((g, v) => { if (g === flow.length) out.push(seen[v]); }); return out; };
    const best = placements(flow.length, seen.length).map(gaps => ({ gaps, cost: gaps.reduce((sum, g, v) => sum + Math.abs(g - at[v]), 0) }))
      .sort((a, b) => a.cost - b.cost).find(({ gaps }) => layoutOk(joinBlocks(build(gaps))));
    if (best) { blocks = build(best.gaps); changed = true; }
  }
  const prose = () => explanationProseChars({ body: joinBlocks(blocks) });
  if (prose() > EXPLANATION_BUDGET.hard) {
    // units in reading order, each with its prose part (the parts are split by visuals)
    for (let part = 0, b = 0; b < blocks.length; b++) { if (blocks[b].visual) { part++; continue; } if (!blocks[b].fence) blocks[b] = { ...blocks[b], part, units: blocks[b].lines.map(unitsOf) }; }
    const count = part => blocks.reduce((sum, b) => sum + (b.part === part && b.units ? b.units.reduce((s, u) => s + (u ? u.length : 0), 0) : 0), 0);
    const render = b => (b.units ? { ...b, lines: b.units.map((u, i) => (u ? u.join(' ') : b.lines[i])).filter((line, i) => !b.units[i] || b.units[i].length) } : b);
    while (prose() > EXPLANATION_BUDGET.hard) {
      let cut = false;
      for (let b = blocks.length - 1; b >= 0 && !cut; b--) {
        const block = blocks[b];
        if (!block.units || count(block.part) < 2) continue;
        for (let l = block.units.length - 1; l >= 0 && !cut; l--) if (block.units[l]?.length) { block.units[l] = block.units[l].slice(0, -1); blocks[b] = render(block); blocks[b].units = block.units.filter(u => !u || u.length); cut = true; }
      }
      if (!cut) break;
      blocks = blocks.filter(b => b.lines.length);
      changed = true;
    }
  }
  return changed ? joinBlocks(blocks) : md;
}
