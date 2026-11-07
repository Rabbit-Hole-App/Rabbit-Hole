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
import { MATH_FORMAT } from './agents/math-format.js';
import MATH_SCHEMA from '../../math-renderer/math-schema.json' with { type: 'json' };
import { DEFAULT_DEPTH, EXPLANATION_CAPS, validDepth } from './chat-depth.js';

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
    about: `A titled explanation in Markdown with optional folded extras (worked example, misconception). ${MATH_FORMAT}`,
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


// --- CORE.09: the shared Explanation teaching guidance, display-text budget and supported Mermaid ---------------------------------------
// Offered with make_explanation on every path (direct /explain, Quick Edit, the Tutor roadmap); the request's Depth objective and budget
// (chat-depth.js explanationTarget) follow it in the same tool description.
export const EXPLANATION_GUIDANCE = 'For make_explanation, the main body and optional section text support Markdown paragraphs, headings, lists, pipe tables and fenced mermaid flowcharts. Choose the form that makes the idea easiest to understand. Use a table to compare items across shared attributes. Use a Mermaid flowchart to explain branching decisions, relationships or a process. Include enough prose to explain what the learner should notice. Treat tables and diagrams as optional at every Depth. Choose the structure to suit the question. The main body must answer the learner\'s question on its own. Optional sections can add a worked example, prediction or further reasoning. Apply the requested Depth guidance and total character budget. Include the title, section labels, table cells, diagram labels and collapsed content in that budget. A table has leading and trailing pipes, a header row, a separator row and the same number of cells in every row. A diagram is one closed ```mermaid fence whose first line is flowchart TD or flowchart LR, followed only by node declarations with short quoted labels (A["Label"]) and arrow edges (A --> B, or A -->|plain label| B): no HTML, frontmatter, directives, hyperlinks, click handlers, styling commands or external assets.';

// The card's own patterns (Md.jsx lines()): an opening ``` takes its language token and ignores the rest of the line (so "mermaid extra" is a
// Mermaid fence), any line starting with ``` closes, and the card draws a diagram for /^mermaid$/i. Pinned against Md.jsx by explanation-validation.test.js.
const FENCE = /^\s*```\s*([\w+#.-]*)/;
const ID = '[A-Za-z][A-Za-z0-9_]{0,29}';
const LABEL = '"([^"<>`\\n]{1,80})"';
const NODE = `${ID}(?:\\[${LABEL}\\]|\\(${LABEL}\\)|\\{${LABEL}\\}|\\(\\[${LABEL}\\]\\))?`;
const NODE_LINE = new RegExp(`^${NODE}$`);
const EDGE_LINE = new RegExp(`^${NODE}\\s*(?:-->|---|-\\.->|==>)\\s*(?:\\|([^|"<>\\n]{1,60})\\|\\s*)?${NODE}$`);
const LABELS = new RegExp(LABEL, 'g');

// The visible words of one supported flowchart line: node labels, then the edge label.
const mermaidWords = line => [...line.matchAll(LABELS)].map(m => m[1]).concat((line.match(/\|([^|"<>\n]{1,60})\|/) || [])[1] || []);

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

// The problem with a Markdown string's Mermaid fences, or null: only a closed flowchart TD/LR of node declarations and arrow edges.
export function mermaidProblem(md) {
  for (const f of split(md).fences.filter(f => f.lang === 'mermaid')) {
    if (!f.closed) return 'explanation_bad_mermaid: a mermaid fence is not closed';
    const lines = f.lines.map(l => l.trim()).filter(Boolean);
    if (!/^flowchart (TD|LR)$/.test(lines[0] || '')) return 'explanation_bad_mermaid: a diagram must start with flowchart TD or flowchart LR';
    const bad = lines.slice(1).find(l => !NODE_LINE.test(l) && !EDGE_LINE.test(l));
    if (bad !== undefined) return `explanation_bad_mermaid: unsupported diagram line "${bad.slice(0, 60)}" (use node declarations A["Label"] and arrow edges A --> B or A -->|label| B only)`;
  }
  return null;
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

// The display text of one Markdown string in reading order: prose, headings, list items, table cells, code as literal text, Mermaid labels.
function markdownText(md) {
  const out = [];
  for (const line of split(md).prose) {
    if (typeof line !== 'string') { out.push(...(line.fence.lang === 'mermaid' ? line.fence.lines.flatMap(mermaidWords) : line.fence.lines)); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (!cells.every(c => /^:?-{3,}:?$/.test(c))) out.push(...cells.map(inlineText));
      continue;
    }
    out.push(inlineText(line.replace(/^\s*#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').replace(/^\s*>\s?/, '').replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+/, '')));
  }
  return out.join(' ');
}

// CORE.09: the counted display text of an Explanation block: title, body, then every section label and text (collapsed ones too),
// flattened, whitespace collapsed, trimmed, counted in Unicode code points. Pure: the Worker and the web may both import it.
export const explanationText = block => [block?.title ?? '', markdownText(block?.body), ...(block?.more || []).flatMap(s => [s?.label ?? '', markdownText(s?.text)])].join(' ').replace(/\s+/g, ' ').trim();
export const explanationChars = block => Array.from(explanationText(block)).length;

// -> null, or the validator's words: over the Depth's budget or an unsupported diagram. The repair (direct paths) reads them; the roadmap fails terminally.
export function explanationProblem(block, depth) {
  const cap = EXPLANATION_CAPS[validDepth(depth) || DEFAULT_DEPTH], used = explanationChars(block);
  if (used > cap) return `explanation_over_budget: the card has ${used} characters, the ${validDepth(depth) || DEFAULT_DEPTH} budget is ${cap} including the title, section labels, table cells, diagram labels and collapsed sections; shorten it.`;
  for (const text of [block?.body, ...(block?.more || []).map(s => s?.text)]) { const problem = mermaidProblem(text); if (problem) return problem; }
  return null;
}
