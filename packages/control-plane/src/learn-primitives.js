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
import { GRAPH_SCHEMA, validateGraph } from './learn-graph-schema.js';
import { VIDEO_SCHEMA, validateVideo } from './learn-video-schema.js';
import { SCENE_SCHEMA, validateScene } from './learn-scene-schema.js';
import { validateMathAnimation } from './learn-math-schema.js';
import { validateToolInput as validateSchema } from './learn-validation.js';
import MATH_SCHEMA from '../../math-renderer/math-schema.json' with { type: 'json' };

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

// ready: a generator may produce it now. unavailable: what the learner is
// told when their command needs it. Which primitives are paid is the shared
// contract's call (primitive(id) in agent/slash.js); a paid one is only ever
// proposed - nothing runs before the learner confirms.
export const PRIMITIVES = {
  explanation: {
    ready: true,
    about: 'A titled explanation in Markdown with optional folded extras (worked example, misconception). Use $...$ for maths.',
    schema: shape({ title: text(120), body: text(2000), more: list(shape({ label: text(40), text: text(800) }), 0, 3) }, ['title', 'body']),
    block: spec => ({ type: 'explanation', title: spec.title, body: spec.body, ...(spec.more?.length ? { more: spec.more } : {}) }),
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
    about: 'A predict-first challenge: the learner commits a guess before the material. expects lists the key ideas a good answer contains; reveal is shown after.',
    schema: shape({ prompt: text(600), hint: text(300), expects: list(text(200), 2, 6), reveal: text(800) }),
    block: spec => ({ type: 'challenge', prompt: spec.prompt, hint: spec.hint, expects: spec.expects, reveal: spec.reveal, answer: null }),
  },
  explain_back: {
    ready: true,
    about: 'Ask the learner to explain the idea back in their own words; expects lists the key ideas a good explanation covers.',
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
    // ponytail: not ready until the manim worker (small-math-renderer-dev) is
    // deployed and one real render passes (docs/features/learn-math-animation.md).
    ready: false,
    unavailable: "Maths animation isn't available yet: its renderer isn't deployed.",
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
  // Not generated yet. Each says so rather than being faked with a simpler card.
  code_exercise: { ready: false, unavailable: "Code exercise generation isn't available yet. I can open a notebook or show a code sample instead." },
  narration: { ready: false, unavailable: "Narration isn't available yet." },
  knowledge_graph: { ready: false, unavailable: "Knowledge graph generation isn't available yet." },
  animation: { ready: false, unavailable: "Animation generation isn't available yet." },
  reference_attention: { ready: false, unavailable: "Animation generation isn't available yet." },
  '3d_model': { ready: false, unavailable: "3D model generation isn't available yet." },
  // Direct tools: found or inserted, never generated here.
  image: { ready: false, direct: true, unavailable: 'Images come from search: use /image with what to look for.' },
  image_generate: { ready: false, unavailable: "Image generation from a command isn't available yet. Use an Image card's Generate." },
  video: { ready: false, direct: true, unavailable: 'Existing clips are added from search or a link, not generated.' },
  notebook: { ready: false, direct: true },
  whiteboard: { ready: false, direct: true },
  paper: { ready: false, direct: true },
};

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

