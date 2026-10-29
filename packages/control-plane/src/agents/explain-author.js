// /explain v2 author prompt and tool (EXP-T17; plan v2.1 sections 3.2, 3.3). The author writes a VisualSpec from the
// registered components only, or says what is missing as a structured capability gap. The independent image review is Lane
// D's (explain-review.js), a separate call that never sees the author's reasoning.
import { LIMITS as RUNTIME_LIMITS } from '../../../web/src/explain-program/limits.js';
import { STATEFUL_CONTRACT } from '../../../web/src/explain-program/contract.js';

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
    readouts: { type: 'array', maxItems: 8, description: 'Named numbers the frame reports (frame.readouts [{id, value}]) and the card labels.', items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: NAME, label: { type: 'string', maxLength: 60 }, unit: { type: 'string', maxLength: 16 }, decimals: { type: 'integer', minimum: 0, maximum: 6 } } } },
    capabilities: { type: 'array', maxItems: 16, items: { type: 'string' }, description: 'Only names listed under program.capabilities in the input.' },
  },
};
// With stateful programs on (explain-program.js statefulEnabled), the manifest may also declare a viewport, buttons and selectable
// objects (contract.js STATEFUL_CONTRACT); declaring any of them makes the program stateful.
const STATEFUL_MANIFEST = {
  viewport: { type: 'object', additionalProperties: false, required: ['width', 'height'], description: 'Stateful programs only (required there): the frame size every frame has.', properties: { width: { type: 'number', exclusiveMinimum: 0, maximum: 4096 }, height: { type: 'number', exclusiveMinimum: 0, maximum: 4096 } } },
  actions: { type: 'array', maxItems: 8, description: 'Stateful programs only: buttons the learner presses; each press is one event {type:"action", action: id}.', items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: NAME, label: { type: 'string', maxLength: 60 } } } },
  targets: { type: 'array', maxItems: 8, description: 'Stateful programs only: frame objects the learner selects (by clicking or a button); id is the frame object id, drawn in every frame; each selection is one event {type:"select", target: id}.', items: { type: 'object', additionalProperties: false, required: ['id', 'label'], properties: { id: { type: 'string', maxLength: 64 }, label: { type: 'string', maxLength: 60 } } } },
};
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
- Draw only within program.frame (width and height); keep every object inside it for every admitted input and time, and keep text clear of moving parts. Use program.sdk for geometry and number formatting.
- Keep source under program.limits.sourceBytes and the manifest under program.limits.manifestBytes. Do not write hashes, versions, permissions or limits; the host sets them.
- Quote nothing from the examples; they show composition only.`;

// Appended after EXPLAIN_PROGRAM_RULES only when stateful programs are on: the contract itself is in program.stateful.
export const EXPLAIN_STATEFUL_RULES = `
Stateful programs. When the learner must press buttons or select parts of the picture and the card must remember what happened (an algorithm run step by step, a decision with consequences, a sequence of choices), write a stateful program as described in program.stateful: declare manifest.viewport, manifest.actions (buttons) and manifest.targets (selectable frame objects), and export initialState, reduce and evaluate. Without buttons or selections, write an ordinary program (no viewport, actions or targets).
- The state is the only memory: reduce returns the next state from the current state and one event, evaluate draws the state. The same seed and the same events in the same order must give the same state.
- Every frame has exactly manifest.viewport's size and draws every target under its own id. Show the result of each action in the picture, and keep the state small.`;
// What the author is told about the runtime (program.* in the input). evaluationMs is the runtime's own per-run deadline (limits.js). The SDK list mirrors packages/web/src/explain-program/sdk.js
// (a global `sdk`); the frame description mirrors contract.js Frame. Limits come from the contract, so they cannot drift.
export function programContext(limits, capabilities, { stateful = false } = {}) {
  return {
    capabilities,
    ...(stateful ? { stateful: STATEFUL_CONTRACT } : {}),
    limits: { sourceBytes: limits.sourceBytes, manifestBytes: limits.manifestBytes, objects: limits.objects, pointsPerObject: limits.pointsPerObject, pointsTotal: limits.pointsTotal, maxOutputBytes: limits.maxOutputBytes, inputs: limits.inputs, duration: limits.duration,
      evaluationMs: RUNTIME_LIMITS.interruptMs, evaluation: `each run is stopped after ${RUNTIME_LIMITS.interruptMs} ms of your own work: loading your source, evaluate and serialization, in a slow interpreter that can be several times slower on its first run. Keep it small: compute each curve once, a few hundred points in total at most, no long loops.` },
    frame: { returns: '{frame: {width, height, objects, readouts}, quantities: {name: number}}', width: 'default 960, at most 4096', height: 'default 540, at most 4096', readouts: '[{id, value}] for the ids declared in manifest.readouts' },
    objectKinds: {
      line: '{kind:"line", id, from:{x,y}, to:{x,y}, role?, opacity?}', arrow: '{kind:"arrow", id, from:{x,y}, to:{x,y}, role?, opacity?}',
      circle: '{kind:"circle", id, x, y, w (diameter), text?, role?, opacity?, rotation?}', box: '{kind:"box", id, x, y, w, h, text?, role?, opacity?, rotation?}',
      text: '{kind:"text", id, x, y, text or runs:[{kind:"text",text}|{kind:"math",tex}], align?:"start"|"middle", role?, opacity?}',
      polyline: '{kind:"polyline", id, points:[[x,y],...], clip?:{x,y,w,h}, role?, opacity?}',
    },
    ids: 'unique, 1 to 64 characters of letters, digits and _ . : -',
    roles: ['neutral', 'input', 'output', 'prediction', 'observed', 'learner', 'tutor', 'code', 'warning', 'success'],
    sdk: { global: 'sdk', note: 'generic helpers; they return the plain objects above', functions: [
      'sdk.clamp(v, lo, hi)', 'sdk.lerp(a, b, t)', 'sdk.linear([d0, d1], [r0, r1]) -> (v) => number', 'sdk.sample(f, from, to, count) -> [[x, y]...] (count + 1 points)', 'sdk.format(v, decimals = 2) -> string',
      'sdk.box(id, x, y, w, h, opts?)', 'sdk.circle(id, x, y, diameter, opts?)', 'sdk.text(id, x, y, text, opts?)', 'sdk.math(id, x, y, tex, opts?)',
      'sdk.line(id, x1, y1, x2, y2, opts?)', 'sdk.arrow(id, x1, y1, x2, y2, opts?)', 'sdk.polyline(id, points, opts?)', 'sdk.frame(objects, opts?) -> {objects, ...opts}',
    ] },
  };
}
