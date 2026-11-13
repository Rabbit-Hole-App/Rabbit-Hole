export function pending(stage) {
  return { status: 'fail', artefacts: [], notes: `Stage ${stage} is reserved for a later deliverable` };
}
