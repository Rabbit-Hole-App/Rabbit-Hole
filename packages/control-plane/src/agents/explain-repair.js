// /explain v2 repair prompt and tool (EXP-T19; plan v2.1 section 3.5). One bounded correction per round: layout through the
// declared repairable hints only, or, where the failure allows it, an explicit corrected spec.

export const REPAIR_TOOL = Object.freeze({
  name: 'repair_explanation',
  description: 'One correction for the failed explanation card: hint patches, a corrected spec, or none when it cannot be fixed here.',
  input_schema: {
    type: 'object', additionalProperties: false, required: ['operation'],
    properties: {
      operation: { type: 'string', enum: ['hints', 'spec', 'none'] },
      patches: {
        type: 'array', maxItems: 24, description: 'operation hints: layout changes, each a repairable hint of one component, within its limits.',
        items: { type: 'object', additionalProperties: false, required: ['component', 'hint', 'value'], properties: { component: { type: 'string', description: 'The component instance id.' }, hint: { type: 'string' }, value: {} } },
      },
      spec: { type: 'object', description: 'operation spec: the whole corrected VisualSpec. Allowed only when allowed includes spec.' },
      reason: { type: 'string', description: 'One sentence: what you changed, or why it cannot be fixed here.' },
    },
  },
});

export const EXPLAIN_REPAIR_SYSTEM = `You correct one explanation card that failed its checks. Input: request, spec (the card's component JSON), problems (trusted checks that refused it) or findings (an independent review of the rendered images, which you may also see), repairable (per component instance: the layout hints you may change and their limits), allowed (the operations you may use), roundsLeft.

- hints: change only listed repairable hints, inside their limits. Use this for overlap, crowding, cut-off or unreadable layout. Never change text, facts, components or connections this way.
- spec: return the whole corrected spec, changing only what the problems or findings name; keep everything else exactly as it was. Use only when allowed includes spec.
- none: when the fix needs a different component, a renderer or component change, a source you do not have, or anything outside allowed. Say why.
Call ${REPAIR_TOOL.name} exactly once.`;
