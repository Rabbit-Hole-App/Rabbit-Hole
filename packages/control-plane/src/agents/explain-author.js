// /explain v2 author prompt and tool (EXP-T17; plan v2.1 sections 3.2, 3.3). The author writes a VisualSpec from the
// registered components only, or says what is missing as a structured capability gap. The independent image review is Lane
// D's (explain-review.js), a separate call that never sees the author's reasoning.

export const GAP_NEEDS = Object.freeze(['math', 'steps', 'experiment', 'component', 'evidence', 'other']);

// The author's tool, built from the catalogue it is offered: the VisualSpec's exact shape (explain-contract.js
// visualSpecSchema), with component names limited to the registered ones. A real run with a bare object schema (2026-10-22,
// spend.md row 2) wrote "type" for "component" and invented hints; the schema states the shape instead of leaving it to prose.
const LABEL = { description: 'A label: plain text, or {"runs": [{"kind": "text", "text": "<words>"}, {"kind": "math", "tex": "<LaTeX>"}]} where math is supported.' };
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
      presentation: { type: 'object', additionalProperties: false, required: ['mode'], properties: { mode: { type: 'string', enum: ['static', 'steps', 'time'] }, duration: { type: 'number' }, steps: { type: 'array' }, experiments: { type: 'array' } } },
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
- Presentation (Lane B2's presentation contract, EXP-T26 M2, d77d668a, for component specs): choose the simplest that teaches. static (prefer it): the complete picture, no playback; a reveal or a highlight alone is static. steps: 2 to 12 named moments {id, title (at most 120 characters)}, each changing what is drawn (a highlight alone is not a step), earlier context staying visible: set step on the top component that first appears on each later step (components without step are drawn from the first; a connection appears with its later end); no step captions, put those words in a component on that step. time {duration}: only when timing itself is the lesson. experiments: one per control {id, purpose (the question moving it answers, at most 300 characters), input, domain, affects (ids of components every setting visibly changes), contrasts (1 to 8 short phrases naming what to compare), dependsOn?}; a control that changes nothing visible, or only moves a highlight, is refused. Use steps, time or experiments only where supported says true; otherwise report a capability_gap if the idea truly needs them.
- Formulas are math runs in TeX ({"runs": [{"kind": "text", "text": "Period: "}, {"kind": "math", "tex": "T = 2\pi\sqrt{L/g}"}]}), never calculator text like 2*pi*sqrt(L/g); code stays code. Where supported.math is false, a request whose idea needs a formula is a capability_gap.
- Well-established textbook knowledge needs no evidence: explain it directly and correctly. Facts that depend on a specific source (a paper, a repository, a supplied document, a current or versioned product) come from the request, brief, context and evidence. Bind a claim to evidence ids from evidence only; never invent an id or a citation.
- examples show composition only. Never copy their wording, facts, numbers or titles.
- If the request needs something supported marks false (typeset math, named steps, experiments), a component the catalogue lacks, or a specific source that was not provided (only for a source-dependent, current or versioned claim), call the tool with kind capability_gap and say what is needed. Never draw a simpler substitute that hides the missing part.
- Stay within limits. Every drawn text line is one object, and a part shows at most limits.objectsPerPart: a box is one object plus one per wrapped line of its label (about 27 characters per line at default width), a flow step adds its box, its lines and an arrow. Measured: a module with an 80-character label draws 4 objects, a 6-step flow of short steps 11. Keep labels short. Follow composition (card size, parts as a pager, overview and detail, containers): it is Lane A's, with the measured limits. A child inherits its parent's part, so set part on the top component of each sub-card, not on its children. Each step of each part is checked as its own image: parts x steps stays within limits.reviewedStates.
Call author_explanation exactly once.`;
