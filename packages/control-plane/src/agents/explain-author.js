// /explain v2 author and reviewer prompts and tools (EXP-T17; plan v2.1 sections 3.2, 3.3 and 3.5). The author writes a
// VisualSpec from the registered components only, or says what is missing as a structured capability gap. The reviewer is a
// separate call with its own context: it never sees the author's reasoning, only the request, the evidence, the spec, the
// compiled card and the rendered images.

export const GAP_NEEDS = Object.freeze(['math', 'steps', 'experiment', 'component', 'evidence', 'other']);

// The author's tool, built from the catalogue it is offered: the VisualSpec's exact shape (explain-contract.js
// visualSpecSchema), with component names limited to the registered ones. A real run with a bare object schema (2026-10-22,
// spend.md row 2) wrote "type" for "component" and invented hints; the schema states the shape instead of leaving it to prose.
const LABEL = { description: 'A label: plain text, or {"runs": [{"kind": "text", "text": "..."}, {"kind": "math", "tex": "..."}]} where math is supported.' };
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

Input fields: request (the learner's words, verbatim), brief (approved meaning and assumptions, when there was a review), context (attached material), evidence (records with ids and excerpts), catalogue (every component you may use, with its parameters, limits, layout hints and anchors), supported (which features the compiler can draw now), limits (counts the card must stay within), examples (optional).

Rules:
- Use only components named in catalogue, at their listed version, with only their listed parameters and hints, inside each parameter's type, min, max, maxLength and values. Never invent a component, parameter or anchor.
- Connections join anchors the catalogue lists ("<component id>.<anchor>").
- One idea per card. Prefer a complete static card; use time only when timing itself teaches the idea.
- Well-established textbook knowledge needs no evidence: explain it directly and correctly. Facts that depend on a specific source (a paper, a repository, a supplied document, a current or versioned product) come from the request, brief, context and evidence. Bind a claim to evidence ids from evidence only; never invent an id or a citation.
- examples show composition only. Never copy their wording, facts, numbers or titles.
- If the request needs something supported marks false (typeset math, named steps, experiments), a component the catalogue lacks, or a specific source that was not provided (only for a source-dependent, current or versioned claim), call the tool with kind capability_gap and say what is needed. Never draw a simpler substitute that hides the missing part.
- Stay within limits.
Call author_explanation exactly once.`;

export const REVIEW_TOOL = Object.freeze({
  name: 'review_explanation',
  description: 'The verdict on one explanation card: accept, or revise with findings.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['verdict', 'findings', 'captures'],
    properties: {
      verdict: { type: 'string', enum: ['accept', 'revise'] },
      captures: { type: 'array', description: 'One verdict per capture id you were shown.', items: { type: 'object', additionalProperties: false, required: ['id', 'ok'], properties: { id: { type: 'string' }, ok: { type: 'boolean' } } } },
      findings: {
        type: 'array', maxItems: 12,
        items: {
          type: 'object', additionalProperties: false, required: ['category', 'severity', 'message', 'specRepairable'],
          properties: {
            category: { type: 'string', enum: ['source', 'spec', 'component', 'renderer', 'budget'] },
            severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
            component: { type: 'string', description: 'The component id it concerns, when one.' },
            capture: { type: 'string', description: 'The capture id it was seen in, when one.' },
            message: { type: 'string' },
            specRepairable: { type: 'boolean', description: 'true when changing the spec (its layout hints or wording) can fix it; false for a source, component or renderer defect.' },
          },
        },
      },
    },
  },
});

export const EXPLAIN_REVIEW_SYSTEM = `You independently review one explanation card before a learner sees it. You did not write it.

Input: request (the learner's words), brief, evidence (records with excerpts), spec (the authored component JSON), card (the compiled card's text at each setting), and images: the rendered card, one per capture id.

Check: the card answers the request; every factual statement is correct, and one that depends on a specific source, current or versioned fact is supported by the brief, context or evidence; nothing is invented; labels and formulas read correctly in the images; nothing overlaps, is cut off or is too small to read; the card shows one idea clearly.
Give each capture you were shown a verdict. Accept only when there is no blocker or major finding. Categories: source (a claim the evidence does not support), spec (content or layout the spec can fix), component (a component draws wrongly), renderer (the image is wrong though the spec is right), budget (too much for one card).
Call ${REVIEW_TOOL.name} exactly once.`;
