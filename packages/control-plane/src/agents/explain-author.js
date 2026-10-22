// /explain v2 author prompt and tool (EXP-T17; plan v2.1 sections 3.2, 3.3). The author writes a VisualSpec from the
// registered components only, or says what is missing as a structured capability gap. The independent image review is Lane
// D's (explain-review.js), a separate call that never sees the author's reasoning.

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
export function authorTool(catalogue) {
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
    description: 'Return the explanation as one VisualSpec built only from the catalogue, or a capability gap when the request needs something the catalogue or the supported features cannot draw truthfully.',
    input_schema: {
      type: 'object', additionalProperties: false, required: ['kind'],
      properties: {
        kind: { type: 'string', enum: ['spec', 'capability_gap'] },
        spec,
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
