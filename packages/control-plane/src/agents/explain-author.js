// /explain v2 author prompt and tool (EXP-T17; plan v2.1 sections 3.2, 3.3). The author writes a VisualSpec from the
// registered components only, or says what is missing as a structured capability gap. The independent image review is Lane
// D's (explain-review.js), a separate call that never sees the author's reasoning.
import { LIMITS as RUNTIME_LIMITS } from '../../../web/src/explain-program/limits.js';
import { CONTRACT_LIMITS, STATEFUL_CONTRACT } from '../../../web/src/explain-program/contract.js';
import { INPUT_TYPES_PROMPT_SENTENCE } from '../../../web/src/interact-control-catalogue.js';
import { RASTER_CAPABILITY, CYCLIC_CAPABILITY, MEDIUM_CAPABILITY, PROPS_CAPABILITY, FIGURES_CAPABILITY } from '../../../web/src/explain-program/stamps.js';

export const GAP_NEEDS = Object.freeze(['math', 'steps', 'experiment', 'component', 'evidence', 'other']);

// The author's tool, built from the catalogue it is offered: the VisualSpec's exact shape (explain-contract.js
// visualSpecSchema), with component names limited to the registered ones. A real run with a bare object schema (2026-10-22,
// spend.md row 2) wrote "type" for "component" and invented hints; the schema states the shape instead of leaving it to prose.
const LABEL = { description: 'A label: plain text, or {"runs": [{"kind": "text", "text": "<words>"}, {"kind": "math", "tex": "<LaTeX>"}]} where math is supported.' };
// explain-contract.js explanationPresentationSchema, typed down to each experiment's domain: an untyped experiments array let a
// live author write domain as a bare list [0.25, 1] (EXP-12 run v1-a, 2026-10-22), refused every round. Steps take no caption
// here: the compiler refuses captions (compile.js), so the author is never offered one.
const PRESENTATION = {
  type: 'object', additionalProperties: false, required: ['mode'],
  properties: {
    mode: { type: 'string', enum: ['static', 'steps', 'time'] },
    duration: { type: 'number', exclusiveMinimum: 0, maximum: 120, description: 'time mode only: seconds.' },
    steps: { type: 'array', maxItems: 12, description: 'steps mode only: 2 to 12 named moments.', items: { type: 'object', additionalProperties: false, required: ['id', 'title'], properties: { id: { type: 'string' }, title: { type: 'string', maxLength: 120 } } } },
    experiments: {
      type: 'array', maxItems: 4,
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'purpose', 'input', 'domain', 'affects', 'contrasts'],
        properties: {
          id: { type: 'string' },
          purpose: { type: 'string', maxLength: 300, description: 'The question moving the control answers.' },
          input: { type: 'string', description: '"<instance id>.<control>", a control listed under the controls of that component in the catalogue.' },
          domain: {
            description: 'The admitted values: an explicit list, or a range of at most 256 steps. Values stay inside the parameter range of the control and include the own value of the instance.',
            oneOf: [
              { type: 'object', additionalProperties: false, required: ['values'], properties: { values: { type: 'array', minItems: 2, maxItems: 64, items: { type: ['number', 'string'] } } } },
              { type: 'object', additionalProperties: false, required: ['min', 'max', 'step'], properties: { min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number', exclusiveMinimum: 0 } } },
            ],
          },
          affects: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'string' }, description: 'Component ids or "<instance id>.<object>" ids every setting visibly changes (with invariant: the ones that stay the same).' },
          contrasts: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', maxLength: 200 } },
          dependsOn: { type: 'array', maxItems: 8, items: { type: 'string' }, description: 'The inputs of other experiments this one is compared across.' },
          invariant: { type: 'boolean' },
        },
      },
    },
  },
};
// The program variant (explain sandbox plan 5.2): generated JavaScript plus its manifest. No hash, permission or limit field exists
// here: the host computes hashes and owns permissions and limits, so a model cannot supply them.
const NAME = { type: 'string', description: 'A name: a letter, then up to 31 letters, digits or underscores.' };
const PROGRAM_MANIFEST = {
  type: 'object', additionalProperties: false, required: ['title', 'summary', 'assumptions', 'description', 'inputs', 'readouts', 'capabilities'],
  properties: {
    title: { type: 'string', maxLength: 120 }, summary: { type: 'string', maxLength: 400, description: 'What the card shows, in plain words (no markup, no URL).' },
    description: { type: 'string', maxLength: 600, description: 'An accessible description of the picture for a learner who cannot see it.' },
    assumptions: { type: 'array', maxItems: 8, items: { type: 'string', maxLength: 300 }, description: 'What the program idealises or leaves out (for example small angles, no friction).' },
    inputs: {
      type: 'array', maxItems: 4, description: 'Controls the learner may move. A number has min, max (default inside) and optional step; a select has options [{value, label}] (default is one value). Select options combine to at most 64 states.',
      items: { type: 'object', additionalProperties: false, required: ['type', 'id', 'label', 'default'], properties: {
        type: { type: 'string', enum: ['number', 'select'] }, id: NAME, label: { type: 'string', maxLength: 60 }, unit: { type: 'string', maxLength: 16 }, default: { type: ['number', 'string'] },
        min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number', exclusiveMinimum: 0 },
        options: { type: 'array', minItems: 2, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['value', 'label'], properties: { value: { type: 'string', maxLength: 32 }, label: { type: 'string', maxLength: 60 } } } },
      } },
    },
    duration: { type: 'number', exclusiveMinimum: 0, maximum: 120, description: 'Seconds of playback. Omit for a card that does not change over time.' },
    cardDescription: { type: 'string' },
    instructions: { type: 'string' }, // the 300-character limit is added for /interact only (interactProgramSchema): the legacy request has no room for more schema bytes
    timeline: { type: 'object' },
    readouts: { type: 'array', maxItems: 8, description: 'Named numbers the frame reports (frame.readouts [{id, value}]) and the card labels.', items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: NAME, label: { type: 'string', maxLength: 60 }, unit: { type: 'string', maxLength: 16 }, decimals: { type: 'integer', minimum: 0, maximum: 6 } } } },
    capabilities: { type: 'array', maxItems: 16, items: { type: 'string' }, description: 'Only names listed under program.capabilities in the input.' },
  },
};
// With stateful programs on (explain-program.js statefulEnabled), the manifest may also declare a viewport, buttons and selectable
// objects (contract.js STATEFUL_CONTRACT); declaring any of them makes the program stateful.
const STATEFUL_MANIFEST = {
  viewport: { type: 'object', additionalProperties: false, required: ['width', 'height'], description: `Stateful programs only (required there): the frame size every frame has; width x height at most ${CONTRACT_LIMITS.viewportPixels} pixels (for example 1120 x 860 or 960 x 540).`, properties: { width: { type: 'number', exclusiveMinimum: 0, maximum: 4096 }, height: { type: 'number', exclusiveMinimum: 0, maximum: 4096 } } },
  actions: { type: 'array', maxItems: 8, description: 'Stateful programs only: buttons the learner presses; each press is one event {type:"action", action: id}.', items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: NAME, label: { type: 'string', maxLength: 60 } } } },
  targets: { type: 'array', maxItems: 8, description: 'Stateful programs only: frame objects the learner selects (by clicking or a button); id is the frame object id, drawn in every frame; each selection is one event {type:"select", target: id}.', items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: { type: 'string', maxLength: 64 }, label: { type: 'string', maxLength: 60 }, drag: { type: 'boolean', description: 'true: the learner can also drag it; each drag is events drag_start, drag_move (merged when fast) and drag_end with x, y in frame coordinates.' } } } },
};
export const STATEFUL_MANIFEST_PROPERTIES = STATEFUL_MANIFEST;
// Owner 2026-11-07: how many sentences each manifest text holds (the character limits are in the schema). Stated in the build prompts and in the correction call.
export const INSTRUCTIONS_MAX = 300;
export const MANIFEST_SENTENCES = Object.freeze({ summary: '1 to 2 sentences', description: '2 to 4 short sentences', instructions: '1 to 2 short sentences, only when the card needs usage instructions (how to use the controls); otherwise omit the field' });
export const programToolSchema = ({ stateful = false } = {}) => ({
  type: 'object', additionalProperties: false, required: ['source', 'manifest'], description: 'Required when kind is program.',
  properties: {
    source: { type: 'string', description: stateful
      ? 'An ES module with no import statements (the SDK is the global sdk). A program without state exports evaluate({ inputs, time, seed, state }) returning { frame, quantities }; a stateful program (its manifest declares viewport, actions or targets) also exports initialState({ inputs, seed }) and reduce({ state, event, inputs, time, seed }).'
      : 'An ES module that exports evaluate: export function evaluate({ inputs, time, seed, state }) { ... } returning { frame, quantities }. No import statements; the SDK is the global sdk.' },
    manifest: stateful ? { ...PROGRAM_MANIFEST, properties: { ...PROGRAM_MANIFEST.properties, ...STATEFUL_MANIFEST } } : PROGRAM_MANIFEST,
  },
});
export const PROGRAM_TOOL_SCHEMA = programToolSchema();

export function authorTool(catalogue, { program = false, stateful = false } = {}) {
  const names = catalogue.map(entry => entry.name);
  const spec = {
    type: 'object', additionalProperties: false, required: ['version', 'id', 'title', 'components', 'presentation'],
    description: 'Required when kind is spec.',
    properties: {
      version: { type: 'integer', enum: [1] },
      id: { type: 'string', description: 'A short slug, letters, digits and dashes.' },
      title: { type: 'string' },
      components: {
        type: 'array', minItems: 1, maxItems: 40,
        items: {
          type: 'object', additionalProperties: false, required: ['id', 'component', 'version'],
          properties: {
            id: { type: 'string', description: 'The id of this instance, unique in the spec; anchors are "<id>.<anchor>".' },
            component: { type: 'string', enum: names, description: 'A catalogue component name.' },
            version: { type: 'integer', description: 'The catalogue version of that component.' },
            params: { type: 'object', description: 'Only the listed params of that component, within their limits.' },
            hints: { type: 'object', description: 'Only the listed hints of that component, within their limits; omit to use defaults.' },
            label: LABEL,
            evidence: { type: 'array', items: { type: 'string' }, description: 'Evidence record ids from the input only.' },
            part: { type: 'integer', minimum: 0, maximum: 3 },
            parent: { type: 'string', description: 'The id of a container component (catalogue container: true) this one sits inside.' },
            step: { type: 'string', description: 'Steps presentation only: the id of the step this component first appears on; omit for the first step. A child appears with its parent.' },
          },
        },
      },
      connections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to'], properties: { from: { type: 'string' }, to: { type: 'string' }, label: LABEL, kind: { type: 'string', enum: ['flow', 'relation', 'reference'] } } } },
      evidence: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['claim', 'target', 'evidence'], properties: { claim: { type: 'string' }, target: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } } },
      presentation: PRESENTATION,
      parts: { type: 'array', maxItems: 4, items: { type: 'object', additionalProperties: false, required: ['id', 'title'], properties: { id: { type: 'string' }, title: { type: 'string' } } } },
    },
  };
  return {
    name: 'author_explanation',
    description: program
      ? 'Return the explanation as one VisualSpec built only from the catalogue (kind spec: a static or stepped picture), as one JavaScript program with its manifest (kind program: anything interactive or that changes over time), or a capability gap when the request needs something neither can draw truthfully.'
      : 'Return the explanation as one VisualSpec built only from the catalogue, or a capability gap when the request needs something the catalogue or the supported features cannot draw truthfully.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['kind'],
      properties: {
        kind: { type: 'string', enum: program ? ['spec', 'program', 'capability_gap'] : ['spec', 'capability_gap'] },
        spec,
        ...(program ? { program: programToolSchema({ stateful }) } : {}),
        gap: {
          type: 'object', additionalProperties: false, required: ['needs', 'reason'], description: 'Required when kind is capability_gap.',
          properties: {
            needs: { type: 'array', items: { type: 'string', enum: GAP_NEEDS }, minItems: 1 },
            reason: { type: 'string', description: 'One or two plain sentences for the learner: what the explanation needs that is not available.' },
          },
        },
      },
    },
  };
}

export const EXPLAIN_AUTHOR_SYSTEM = `You author one explanation card as component JSON (a VisualSpec). Trusted code compiles, checks and renders it; you never write coordinates, styles, code or URLs.

Input fields: request (the learner's words, verbatim), brief (approved meaning and assumptions, when there was a review), context (attached material), evidence (records with ids and excerpts), catalogue (every component you may use, with its parameters, limits, layout hints and anchors), composition (how components combine into one card or a pager of sub-cards, with one worked example), supported (which features the compiler can draw now), limits (counts the card must stay within), examples (optional).

Rules:
- Use only components named in catalogue, at their listed version, with only their listed parameters and hints, inside each parameter's type, min, max, maxLength and values. Never invent a component, parameter or anchor.
- Connections join anchors the catalogue lists ("<component id>.<anchor>").
- With edit (an Edit of an existing card): request is the change asked for and edit.spec is the card's accepted spec. Return the whole revised spec: change what the request asks (content, labels, layout, relationships, steps, interactions), keep every other component, id, text and connection exactly as it was.
- One idea per card.
- With brief: make the card deliver what its summary says: draw the objects it names, make the change it names visible, show the relationship it names in labels or readouts, and give each control, button or selectable part the test it names. Never leave one out silently: if one cannot be drawn, return a capability_gap.
- Presentation (Lane B2's presentation contract, EXP-T26 M2, d77d668a, for component specs): choose the simplest that teaches. static (prefer it): the complete picture, no playback; a reveal or a highlight alone is static. steps: 2 to 12 named moments {id, title (at most 120 characters)}, each changing what is drawn (a highlight alone is not a step), earlier context staying visible: set step on the top component that first appears on each later step (components without step are drawn from the first; a connection appears with its later end); no step captions, put those words in a component on that step. time {duration}: only when timing itself is the lesson. experiments: one per control {id, purpose (the question moving it answers, at most 300 characters), input, domain, affects (ids of components every setting visibly changes), contrasts (1 to 8 short phrases naming what to compare), dependsOn?}; a control that changes nothing visible, or only moves a highlight, is refused. input is "<instance id>.<control>", a control listed under that component's catalogue entry controls; domain values stay inside the control's parameter range and include the instance's own value; affects names component ids or "<instance id>.<object>" ids; where a control declares an invariant (what moving it must not change), you may teach that: set invariant true, list in affects the objects that stay the same, and say in contrasts what stays the same and why. Use steps, time or experiments only where supported says true; otherwise report a capability_gap if the idea truly needs them.
- Formulas are math runs in TeX ({"runs": [{"kind": "text", "text": "Period: "}, {"kind": "math", "tex": "T = 2\pi\sqrt{L/g}"}]}), never calculator text like 2*pi*sqrt(L/g); code stays code. Where supported.math is false, a request whose idea needs a formula is a capability_gap.
- Well-established textbook knowledge needs no evidence: explain it directly and correctly. Facts that depend on a specific source (a paper, a repository, a supplied document, a current or versioned product) come from the request, brief, context and evidence. Bind a claim to evidence ids from evidence only; never invent an id or a citation.
- examples show composition only. Never copy their wording, facts, numbers or titles.
- If the request needs something supported marks false (typeset math, named steps, experiments), a component the catalogue lacks, or a specific source that was not provided (only for a source-dependent, current or versioned claim), call the tool with kind capability_gap and say what is needed. Never draw a simpler substitute that hides the missing part.
- Stay within limits. Every drawn text line is one object, and a part shows at most limits.objectsPerPart: a box is one object plus one per wrapped line of its label (about 27 characters per line at default width), a flow step adds its box, its lines and an arrow. Measured: a module with an 80-character label draws 4 objects, a 6-step flow of short steps 11. Keep labels short. Follow composition (card size, parts as a pager, overview and detail, containers): it is Lane A's, with the measured limits. A child inherits its parent's part, so set part on the top component of each sub-card, not on its children. Each distinct frame (every control value and pager part, times every step) is checked as its own image: at most limits.reviewedStates (6) per card, so keep control values x steps small. Connect only at anchors the catalogue entry declares; where a component names an anchor for its role (for example attention-steps output), connect there, not at a generic box side.
Call author_explanation exactly once.`;

// ---- Program authoring (EXPLAIN_PROGRAM_ENABLED; explain sandbox plan 5.2) ----
// Appended to EXPLAIN_AUTHOR_SYSTEM only when the program route is on. The routing rule is about the kind of explanation, never a
// topic: the model picks spec or program from what the learner can do with the card.
export const EXPLAIN_PROGRAM_RULES = `

Program route. You may return kind program instead of kind spec. Choose by what the card must do, not by its subject:
- kind spec: a static picture or named steps that the catalogue can draw. Prefer it for diagrams, flows and architectures.
- kind program: the learner moves a control, the card changes with time, or numbers must be calculated and drawn. Never draw such an idea with catalogue components, and never replace a requested control or motion with a static picture. If neither kind can draw it truthfully, return a capability_gap.
A program is one ES module that EXPORTS evaluate, exactly: export function evaluate({ inputs, time, seed, state }) { ... } returning { frame, quantities }. A function that is only global is not found by the runtime. No import statement works (no module can load); the SDK is the global sdk, available before the module runs. It is pure: the same inputs, time and seed give the same result. It runs in an isolated interpreter with only the helpers listed in program.sdk; it has no network, storage, clock, timers, imports or DOM (Math.random is seeded from seed), and a run that exceeds program.limits is stopped.
- inputs holds one value per manifest input id (a number, or the id of the chosen option); time is the playback second (0 when the manifest has no duration); seed is an integer; state is null.
- Do all calculation in the program, from the learner's request and the context. Write the formulas the explanation needs; the host has no subject formulas. Report calculated values as quantities (name: number) and show the ones the learner should read as frame text, from the same variables that draw the picture, so the drawing and the numbers cannot disagree.
- Declare every control the learner is meant to move in manifest.inputs with a sensible domain, and any playback in manifest.duration (seconds). Input ids and readout ids share one namespace and must all differ. State assumptions and idealisations in manifest.assumptions. Keep one idea per card.
- Each run is stopped after ${RUNTIME_LIMITS.interruptMs} ms of your own work: loading your source, evaluate and serialization, in a slow interpreter that can be several times slower on its first run. Keep it small: compute each curve once, a few hundred points in total at most, no long loops.
- Draw only within program.frame (width and height); keep every object inside it for every admitted input and time, and keep text clear of moving parts. Use program.sdk for geometry and number formatting. When the picture is a trace of time spans (calls, tasks or intervals on one clock), a sampled contour or vector field, text with selectable evidence spans, an expandable rooted tree, or regions of the bundled sample image, call the matching program.sdk.medium helper (sdk.trace, sdk.field, sdk.evidence, sdk.expandableGraph, sdk.imageRegions, sdk.imageViews) and declare medium_visuals in manifest.capabilities; do not draw those by hand with line, polyline, box, arrow or text.
- When the card plays over time and the learner should read a moment as a time from some event, use the timeline field: displayOffset is added to elapsed time for display only, playbackRate is simulated seconds per wall second (pacing only, never the equations), markers [{id,label,time}] are named moments the scrubber lands on exactly. Do not draw a clock yourself; the program still receives elapsed time from 0 to duration. Put the card's teaching copy in manifest.cardDescription (2 to 4 short lines) and keep the frame to the picture, labels and numbers.
- Keep source under program.limits.sourceBytes and the manifest under program.limits.manifestBytes. Do not write hashes, versions, permissions or limits; the host sets them.
- Quote nothing from the examples; they show composition only.`;

// Appended after EXPLAIN_PROGRAM_RULES only when stateful programs are on: the contract itself is in program.stateful.
export const EXPLAIN_STATEFUL_RULES = `
Stateful programs. When the learner must press buttons or select parts of the picture and the card must remember what happened (an algorithm run step by step, a decision with consequences, a sequence of choices), write a stateful program as described in program.stateful: declare manifest.viewport, manifest.actions (buttons) and manifest.targets (selectable frame objects), and export initialState, reduce and evaluate. Without buttons or selections, write an ordinary program (no viewport, actions or targets).
- The state is the only memory: reduce returns the next state from the current state and one event, evaluate draws the state. The same seed and the same events in the same order must give the same state.
- When the learner must move something by hand (place a point, slide a weight, arrange items), mark that target drag: true and update the state from the drag events; position things from event.x and event.y, never from a drag distance.
- Every frame has exactly manifest.viewport's size and draws every target under its own id. Show the result of each action in the picture, and keep the state small.`;
// What the author is told about the runtime (program.* in the input). evaluationMs is the runtime's own per-run deadline (limits.js). The SDK list mirrors packages/web/src/explain-program/sdk.js
// (a global `sdk`); the frame description mirrors contract.js Frame. Limits come from the contract, so they cannot drift.
export function programContext(limits, capabilities, { stateful = false, repair = false } = {}) {
  return {
    capabilities,
    ...(stateful ? { stateful: STATEFUL_CONTRACT } : {}),
    limits: { sourceBytes: limits.sourceBytes, manifestBytes: limits.manifestBytes, objects: limits.objects, pointsPerObject: limits.pointsPerObject, pointsTotal: limits.pointsTotal, heatCells: limits.heatCells, maxOutputBytes: limits.maxOutputBytes, inputs: limits.inputs, duration: limits.duration,
      evaluationMs: RUNTIME_LIMITS.interruptMs, evaluation: `each run is stopped after ${RUNTIME_LIMITS.interruptMs} ms of your own work: loading your source, evaluate and serialization, in a slow interpreter that can be several times slower on its first run. Keep it small: compute each curve once, a few hundred points in total at most, no long loops.` },
    frame: { returns: '{frame: {width, height, objects, readouts}, quantities: {name: number}}', width: 'default 960, at most 4096', height: 'default 540, at most 4096', readouts: '[{id, value}] for the ids declared in manifest.readouts' },
    objectKinds: {
      line: '{kind:"line", id, from:{x,y}, to:{x,y}, role?, opacity?}', arrow: '{kind:"arrow", id, from:{x,y}, to:{x,y}, role?, opacity?}',
      circle: '{kind:"circle", id, x, y, w (diameter), text?, role?, opacity?, rotation?}', box: '{kind:"box", id, x, y, w, h, text?, role?, opacity?, rotation?}',
      text: '{kind:"text", id, x, y, text or runs:[{kind:"text",text}|{kind:"math",tex}], align?:"start"|"middle", role?, opacity?}',
      polyline: '{kind:"polyline", id, points:[[x,y],...], clip?:{x,y,w,h}, role?, opacity?}',
      ...(!repair ? { heat_grid: '{kind:"heat_grid", id, x, y, cell (1–80 px), rows, cols, values:[finite numbers in row-major order], domain:[min,max], role?, opacity?}. Label the axes and color range with their units.' } : {}),
    },
    ids: 'unique, 1 to 64 characters of letters, digits and _ . : -',
    roles: ['neutral', 'input', 'output', 'prediction', 'observed', 'learner', 'tutor', 'code', 'warning', 'success'],
    sdk: { global: 'sdk', note: 'generic helpers; they return the plain objects above', functions: [
      'sdk.clamp(v, lo, hi)', 'sdk.lerp(a, b, t)', 'sdk.linear([d0, d1], [r0, r1]) -> (v) => number', 'sdk.sample(f, from, to, count) -> [[x, y]...] (count + 1 points)', 'sdk.format(v, decimals = 2) -> string',
      'sdk.box(id, x, y, w, h, opts?)', 'sdk.circle(id, x, y, diameter, opts?)', 'sdk.text(id, x, y, text, opts?)', 'sdk.math(id, x, y, tex, opts?)',
      'sdk.line(id, x1, y1, x2, y2, opts?)', 'sdk.arrow(id, x1, y1, x2, y2, opts?)', 'sdk.polyline(id, points, opts?)', 'sdk.frame(objects, opts?) -> {objects, ...opts}',
      ...(repair ? [] : ['sdk.heatGrid(id,{x,y,cell,rows,cols,values,domain:[min,max]}) -> object. Declare heat_grid. Share the domain.']), // authoring only, like the other helper docs
    ], visual: repair
      ? 'sdk.plot, sdk.graph, sdk.grid, sdk.geometry, sdk.timeline and sdk.readout return arrays of frame objects. Preserve the existing helper signatures and spread their results into frame.objects.'
      : {
        usage: 'Each helper takes a unique id and a layout rectangle {x,y,w,h} in frame coordinates, and returns an array. Spread it into frame.objects. All helpers together still share the frame object and point limits. Keep labels short and leave room for axes and labels. Use controls, time or state to change the displayed values.',
        plot: 'sdk.plot(id, {x,y,w,h,xDomain:[min,max],yDomain:[min,max],xLabel?,yLabel?,series:[{id,points:[[x,y],...],role?,kind?:"line"|"scatter"}],marker?:{x,y,role?,label?}}) for curves and scatter plots',
        graph: 'sdk.graph(id, {x,y,w,h,nodes:[{id,label,role?}],edges:[{from,to,label?}],active?:[nodeId,...]}) for directed acyclic graphs with 2–10 nodes and at most 12 edges. Node labels <=24 characters, edge labels <=14. Use a labeled route for each decision outcome.',
        grid: 'sdk.grid(id, {x,y,w,h,rows:[[number|string|null,...],...],rowLabels?,columnLabels?,active?:[[row,column],...],role?}) for 1–6 rows and columns with zero-based highlights. One row makes a strip.',
        geometry: 'sdk.geometry(id, {x,y,w,h,xDomain:[min,max],yDomain:[min,max],points?:[{id,at:[x,y],label?,role?}],segments?,vectors?,paths?}). Segments and vectors are {id,from:[x,y],to:[x,y],label?,role?}; paths are {id,points:[[x,y],...],role?}. Use equal pixels per unit for distances and angles.',
        timeline: 'sdk.timeline(id, {x,y,w,h,domain:[min,max],lanes:[{id,label,events:[{id,at,label,role?}]}],cursor?,unit?}) for ordered events with a cursor in domain units',
        readout: 'sdk.readout(id, {x,y,w,h,label,value,unit?,decimals?,role?}) for a formatted number inside the scene. Keep manifest readouts for values shown below the scene.',
      }, ...(!repair && capabilities?.includes(PROPS_CAPABILITY) ? { props: { // authoring only, like the other extension docs (the repair request's size budget)
        usage: 'Declare props in manifest.capabilities when using these helpers. Each returns an ARRAY of frame objects in frame coordinates (y down): spread it into frame.objects.',
        vector: 'sdk.vector(id, {x,y}, {value, direction:"up"|"down"|"left"|"right"|{x,y}} or {dx,dy}, {scale?, minLength?:12, label?, role?}) draws value x scale pixels from the point: an arrow from minLength up, a plain line below it, nothing at zero, and with label a text just past the tip. Use it for every velocity, acceleration and force arrow.',
        gate: 'sdk.gate(id, x, y, {open, w?:36, label?}) is a release gate centred on x: two strokes flat when closed, swung down when open, its label below them.',
        groundMark: 'sdk.groundMark(id, x, y, w, label?) is a horizontal mark centred on x with its label below it.',
      } } : {}), ...(!repair && capabilities?.includes(FIGURES_CAPABILITY) ? { figures: { // authoring only, like the other extension docs
        usage: 'Declare figures in manifest.capabilities when using these helpers. Each returns ONE frame object (not an array) in frame coordinates (y down): put it in frame.objects. The host draws the ticks, titles and gridlines.',
        axis: 'sdk.axis(id, {x,y,length,orientation:"x"|"y",min,max,ticks?,label,unit?,role?}): an x axis runs right from (x,y), a y axis runs UP from (x,y); keep 52 px free below an x axis, and 60 px to the left of a y axis and 28 px above it, for tick labels and its title.',
        plot: 'sdk.plot(id, {x,y,w,h,axes:{x:{label,min,max,unit?},y:{...}},series:[{label,kind:"line"|"scatter"|"step",points:[{x,y}]}]}) at least 200 x 160, at most 3 series of 24 points, every point inside the axes. (Without axes it is the earlier sdk.plot.)',
        diagram: 'sdk.diagram(spec, {x,y,w,id?}) draws a written diagram (spec is the diagram JSON) at width w; it is scaled down to fit the room below y.',
        callout: 'sdk.callout(x,y,lines,{id?,role?}): 1 to 4 text lines in stacked boxes beside an object; spread the result into frame.objects.',
        panel: 'sdk.panel({x,y,w,h,title,state,id?,role?}): a lane with a heading and state text; returns [lane box, title, state] (spread them); keep 28 px free above y.',
        stateReadouts: 'A manifest readout may be kind "state" with labels (2 to 6 texts); the frame reports one label as its value.',
      } } : {}), ...(!repair && capabilities?.includes('inputs_v2') ? { inputs_v2: { usage: INPUT_TYPES_PROMPT_SENTENCE } } : {}), // authoring only; the plan declares inputs_v2 only behind INTERACT_INPUTS_V2=on
      ...(!repair && capabilities?.includes(MEDIUM_CAPABILITY) ? { medium: {
        usage: 'Declare medium_visuals in manifest.capabilities when using one of these helpers. Use existing controls or state and spread the returned objects into frame.objects.',
        trace: 'sdk.trace(id,{x,y,w,h,domain:[min,max],unit?,lanes:[{id,label,spans:[{id,label,start,end,role?,detail?,parent?,dependsOn?:[id]}]}],cursor?,selected?}) for up to 12 time spans. Use original trace records when supplied; identify simulated traces.',
        field: 'sdk.field(id,{x,y,w,h,kind:"contour"|"vector",xDomain,yDomain,xLabel,yLabel,xUnit,yUnit,valueLabel,valueUnit,sample:(x,y)=>number|[u,v],samples?,levels?,maxMagnitude?}). Contours need levels; vectors need a fixed maxMagnitude. Use empty units for dimensionless axes.',
        evidence: 'sdk.evidence(id,{x,y,w,h,text,spans:[{id,start,end,citation?}],selected?}) uses half-open UTF-16 offsets into the exact text. Use plain citation labels from supplied evidence.',
        expandableGraph: 'sdk.expandableGraph(id,{x,y,w,h,nodes:[{id,label,role?}],edges:[{from,to,label?}],expanded?:[id],active?:[id]}) for 2–10 nodes in a rooted tree. Select which branch to open with an input.',
        image: 'For a demonstration on the bundled sample only, use sdk.imageRegions(id,{asset:"vlm-patch-source",x,y,w,h,regions:[{id,x,y,w,h}],selected?}) or sdk.imageViews(id,{asset:"vlm-patch-source",views:[{id,x,y,w,h,mode:"overview"|"detail"}],regions,selected?}). Region coordinates are normalized to the source image. This sample cannot represent a learner attachment.',
      } } : {}), ...(!repair && capabilities?.includes(CYCLIC_CAPABILITY) ? { cyclicGraph: { // authoring only, like the Medium and heat-grid docs: with all three stacked a maximal program no longer fits the repair request's size budget
        usage: 'Declare cyclic_networks in manifest.capabilities. sdk.cyclicGraph returns existing frame objects; spread them into frame.objects. Node target IDs are <graphId>.node.<nodeId>; keep selected node ID in schema 2 state. The normal card Reset clears state.',
        signature: 'sdk.cyclicGraph(id,{x,y,w,h,nodes:[{id,label,x,y,role?}],edges:[{from,to,label,via?:[[x,y],...],labelAt?:[x,y]}],selected?:nodeId|null})',
        layout: 'For 2–8 nodes and 1–12 directed edges. Cycles, reciprocal links and self-loops are supported. Node centers, via waypoints and labelAt are local to the graph rectangle. Supply well-separated positions and short edge labels explaining the relationship. Use via and labelAt when default routes collide. This is a bounded teaching diagram, not a force-directed graph explorer.',
      } } : {}), ...(!repair && capabilities?.includes(RASTER_CAPABILITY) ? { raster: { // authoring only, like the Medium, cyclic and heat-grid docs (the repair request carries the program and the problems)
        usage: 'Declare raster_visuals in manifest.capabilities. These helpers return ONE raster object, not an array. Numeric pixels only: no URLs or markup. Synthetic pixels illustrate a mechanism; never present them as real model output. Learner-uploaded image decoding is not available in this sandbox.',
        pixels: 'sdk.raster(id,{x,y,w,h,rows,cols,pixels}) uses flat row-major RGBA bytes (four integers 0–255 per pixel), with rows and cols each 1–64 and at most 4096 pixels. Recompute pixels from inputs/state to show bounded transformations.',
        mask: 'sdk.mask(id,{x,y,w,h,rows,cols,values,color?,opacity?}) uses one coverage value 0–1 per pixel; color is #RRGGBB (default #E5AA46), opacity 0–1 (default 1). Returns a transparent RGBA raster. Draw it after its source with exactly the same display bounds and pixel grid so the mask stays aligned; zero coverage preserves holes and background.',
        limits: 'At most 8192 raster pixels across the frame, and all existing output/size/runtime limits still apply. Scale is nearest-neighbor. Avoid expensive image processing or large inline arrays; use small synthetic images or supplied bounded pixel data.',
      } } : {}) },
  };
}

// ---- /interact Scene Builder (new flow only; INT-04, docs/features/interact.md section 5) ----
// The approved ScenePlan is the authoritative content: the builder implements it and never rewrites it. One call returns every artifact
// (the main scene and up to two support panels); trusted code seals, binds and composes them (interact-build.js). The legacy author prompt
// and tool above are untouched and still serve legacy jobs.
// interact-models.js schemaProblems supports a fixed keyword subset; the strict contract validators run on the reply regardless, so a
// keyword outside the subset is relaxed to its nearest supported form (exclusiveMinimum becomes minimum) for the provider-facing schema only.
const checkable = schema => (Array.isArray(schema) ? schema.map(checkable) : schema && typeof schema === 'object'
  ? Object.fromEntries(Object.entries(schema).map(([key, value]) => [key === 'exclusiveMinimum' ? 'minimum' : key, key === 'properties' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, checkable(v)])) : checkable(value)])) : schema);
export const INTERACT_BUILD_TOOL_NAME = 'build_scene';
// catalogue: the declarative catalogue, offered only when a panel was approved as renderer spec (specPanels).
export function interactBuildSchema({ catalogue = [], stateful = false, specPanels = false } = {}) {
  const spec = authorTool(catalogue, { program: true, stateful }).input_schema.properties.spec;
  // /interact only (the legacy request has no room for more schema bytes): the 300-character instructions limit, and state readouts (kind, labels) for the card's text states.
  const program = programToolSchema({ stateful }), readouts = program.properties.manifest.properties.readouts;
  const withLimit = { ...program, properties: { ...program.properties, manifest: { ...program.properties.manifest, properties: { ...program.properties.manifest.properties, instructions: { type: 'string', maxLength: INSTRUCTIONS_MAX, description: 'Only if needed: how to use the controls.' },
    // Typed for /interact (the legacy schema leaves it a free object): a fast author that is not told the shape leaves the approved timeline out (run 6, google-low, 2026-11-13).
    timeline: { type: 'object', additionalProperties: false, description: 'The approved timeline, copied from the plan: label, playbackRate (simulated seconds per second), displayOffset and the markers with their times.', properties: { label: { type: 'string', maxLength: 40 }, displayOffset: { type: 'number' }, playbackRate: { type: 'number' },
      markers: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id', 'label', 'time'], properties: { id: NAME, label: { type: 'string', maxLength: 40 }, time: { type: 'number' } } } } } },
    readouts: { ...readouts, items: { ...readouts.items, properties: { ...readouts.items.properties, kind: { type: 'string', enum: ['number', 'state'], description: 'number (the default) or state: a state readout reports one of its labels as text.' }, labels: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string', maxLength: 40 }, description: 'state readouts only: the allowed texts, each once (the list is unique); the frame reports exactly one of them.' } } } } } } } };
  const panel = {
    type: 'object', additionalProperties: false, required: ['kind'],
    description: 'Exactly the renderer this panel was approved with (plan runtime.renderer): spec for the declarative catalogue, program for a JavaScript program.',
    properties: { kind: { type: 'string', enum: ['spec', 'program'] }, ...(specPanels ? { spec } : {}), program: withLimit },
  };
  return checkable({
    type: 'object', additionalProperties: false, required: ['kind'],
    properties: {
      kind: { type: 'string', enum: ['scene', 'capability_gap'] },
      main: { ...panel, description: 'Required when kind is scene: the main scene artifact.' },
      supporting: { type: 'array', maxItems: 2, description: 'Required when kind is scene: one entry per approved supporting panel, with exactly its approved id; [] when the plan has none.',
        items: { type: 'object', additionalProperties: false, required: ['id', 'artifact'], properties: { id: { type: 'string' }, artifact: panel } } },
      gap: { type: 'object', additionalProperties: false, required: ['needs', 'reason'], description: 'Required when kind is capability_gap.',
        properties: { needs: { type: 'array', items: { type: 'string', enum: GAP_NEEDS }, minItems: 1 }, reason: { type: 'string', description: 'One or two plain sentences: what the approved plan needs that cannot be built.' } } },
    },
  });
}

// Every length, count and range limit of the program manifest, read from the schema the provider is given, so the prompt and the schema cannot drift. A reply over one of them is refused
// whole (then corrected once, interact-build.js), so the builder is told the numbers instead of having to learn them from a refusal.
function manifestLimits(schema, path = '') {
  if (!schema || typeof schema !== 'object') return [];
  const own = ['maxLength', 'maxItems', 'maximum'].filter(key => typeof schema[key] === 'number').map(key => `${path} ${schema[key]}`);
  return [...(path ? own : []), ...Object.entries(schema.properties ?? {}).flatMap(([name, child]) => manifestLimits(child, path ? `${path}.${name}` : name)), ...(schema.items ? manifestLimits(schema.items, `${path}[]`) : [])];
}
export const MANIFEST_LIMITS_TEXT = `Manifest limits (a longer text, a longer list or a larger number is refused, never cut: characters for text, items for a list, the value for a number): ${manifestLimits({ properties: { ...PROGRAM_MANIFEST.properties, ...STATEFUL_MANIFEST } }).join(', ')}, instructions ${INSTRUCTIONS_MAX}; source ${CONTRACT_LIMITS.sourceBytes} bytes, manifest ${CONTRACT_LIMITS.manifestBytes} bytes, frame objects ${CONTRACT_LIMITS.objects}. Sentences: manifest.summary ${MANIFEST_SENTENCES.summary}; manifest.description ${MANIFEST_SENTENCES.description}; manifest.instructions ${MANIFEST_SENTENCES.instructions} (they show below the description, above the scene). Never put instructions or explanation in the drawn frame text below the scene or the controls. Composed cards (this flow): a timed plan REQUIRES manifest.timeline with exactly these keys and no others (not unit, start, end, initialTime or initialPlayback): label (the plan's timeline label), displayOffset (the plan's displayOffset as a number evaluated at the default inputs), playbackRate (the plan's) and markers [{id, label, time}] (the plan's markers, same ids and labels, each time a number evaluated at the default inputs); manifest.duration is the longest admitted end in seconds. An untimed plan has neither duration nor timeline. Never write manifest.cardDescription (the host shows the plan's description). Helper minimums that fail a render when violated: sdk.timeline needs w at least 160 and h at least 78; sdk.readout needs h at least 28 and w wide enough for its whole text 'label: value unit' (about 9 pixels per character); the whole frame is at most 60 objects, so count them for the largest input and drop tick labels, repeated captions or trails first.`;

export const INTERACT_BUILD_SYSTEM = `You build the runnable artifacts of ONE already approved scene plan (a ScenePlan). Trusted code seals, checks, composes and renders what you return; an independent reviewer then looks at the actual rendered card. The plan was designed, reviewed and approved by the learner: you implement it exactly and you never change it.

Input fields: approvedPlan (the whole plan: title, story, cardDescription, scene, mode, controls, supportingVisuals, claims), planHash, depth, panels (for main and each supporting panel: its approved runtime, and for a support its readoutIds and parameterBindings), controlBindings (the exact native declaration each approved control must have), timeline (the exact endpoint, origin, pacing and markers the program must declare), program (limits, capabilities, SDK helpers), and, only when a panel is a spec, spec (catalogue, composition, limits). evidence (records) when supplied.

Rules:
- The plan is authoritative. Keep its Title, cardDescription and Story as they are: they are shown by the card from the plan, so do NOT set manifest.cardDescription, do NOT draw the Story or the description in a scene, and do not add captions, notes, takeaways or any explanatory text below a scene or below its controls. A scene draws only what the plan's scene.description, entities and observations name: its objects, axes, units, labels and live readouts.
- Return kind scene with main and supporting, or kind capability_gap with what cannot be built. Never remove a promised control, panel or motion to pass a check, and never invent a control the plan does not list.
- Every panel uses EXACTLY the renderer, SDK tuple, helpers and capabilities of its approved runtime (panels[].runtime): a program for runtime.renderer program, a spec for spec. Declare exactly runtime.requiredCapabilities in manifest.capabilities and no others, and call every runtime.requiredHelpers helper. A panel built another way is refused, not accepted.
- supporting has exactly one entry per approved supporting panel, with its approved id, in any order; none added, none dropped. A supporting panel is a read-only snapshot at time zero of the main input state: no duration, no timeline, no actions, no targets, and no input except the ones parameterBindings fills (declare each toInputId as a number or select input whose range contains the main control's range). It draws its own title and labels inside its picture.
- Controls: declare in manifest.inputs, manifest.actions and manifest.targets exactly the controlBindings with in manifest.* (same id, type, label, unit, default, min, max, step, options). Playback and the scrubber are the card's native transport: declare manifest.duration and manifest.timeline, and no control for them. Reset is the card's own and needs no declaration. No other control.
- Time: evaluate receives elapsed seconds from 0 and must not draw a clock of its own. manifest.duration is the LONGEST endpoint over the whole input range (timeline.durationSeconds); manifest.timeline carries label, displayOffset, playbackRate and markers exactly as timeline gives them for the default inputs. Compute positions from the elapsed time and the inputs only, so the same time gives the same picture however fast it plays; playbackRate paces the wall clock only. The held, released or compared objects must agree at every time you are asked about, including time 0.
- Numbers: compute every quantity from its equation in the program, in the plan's units and sign convention (up positive when the plan says so). Report each quantity named in scene.quantities that an observation uses, and each scene.readoutIds entry, in the returned quantities and frame.readouts under the plan's own id, from the same variables that draw the picture, so the drawing and the numbers cannot disagree. Every readout id and every named quantity is emitted at EVERY time and input state as a finite number, never null, a string or absent: one the plan ties to a single moment (for example the velocity 0.1 s before the top) is still reported at every time, as its own constant value. Declare every learner-facing measurement in manifest.readouts (label and unit) and report it in frame.readouts: the card draws them in its own readouts row, so never draw a readout's value as scene text.
- Stay in program.limits, use only the program.sdk helpers, keep one idea per card, no import statements, no network, no hash, version, permission or limit fields. Do not copy any example wording.
- ${MANIFEST_LIMITS_TEXT} Keep every frame at most 1120 x 860 pixels (the default is 960 x 540): the reviewer receives each capture as an image. Declare the frame 640 wide by 400 to 440 high (schema 2: 640 x 420), text at or above the floors (body 15 px, heading 17 px, display 20 px), so the card is never scaled up. When the panel's runtime lists the props capability (sdk-7), draw every velocity, acceleration or force arrow with sdk.vector (its label comes with it, just past the tip) and a release gate with sdk.gate; never place a label at a fixed offset from an arrow's tail. When the panel's runtime lists the figures capability (sdk-8), draw every axis and plot with sdk.axis and sdk.plot, never with hand-drawn lines, and a static structure (parts, a flow, a comparison) with sdk.diagram.
Call ${INTERACT_BUILD_TOOL_NAME} exactly once.`;
