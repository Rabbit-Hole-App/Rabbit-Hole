// Versioned CardComposition v1 fixtures for the card UI (interact-composition-adapter.js documents the shape; interact-composition.js compileCardComposition builds
// the real one from sealed artifacts). These are built from the validated plan fixtures, in the same shape and with the same field names, so the card is exercised
// against the same Overview, Standard and Deep the other lanes use without sealing a program. The artifacts are references only (a fixture id), never source;
// the hashes are placeholders, not a claim of integrity.
const hex = char => char.repeat(64);
export function compositionFromPlan(plan, { planHash = hex('a') } = {}) {
  const t = plan.mode.timeline, scrubber = plan.controls.find(c => c.type === 'scrubber');
  const controls = plan.controls.map(c => ({ ...c, row: c.type === 'playback' || c.type === 'scrubber' ? 'transport' : 'controls' }));
  return {
    version: 1, planHash, depth: plan.depth, title: plan.title, cardDescription: plan.cardDescription,
    order: ['title', 'description', ...(plan.supportingVisuals.length ? ['supporting'] : []), 'main', ...(t ? ['transport'] : []), ...(controls.some(c => c.row === 'controls') ? ['controls'] : [])],
    supporting: plan.supportingVisuals.map(panel => ({
      id: panel.id, title: panel.title, artifact: { kind: panel.runtime.renderer, hash: hex('b'), program: { fixtureId: `fixture-${panel.id}` } }, runtime: panel.runtime,
      readoutIds: panel.readoutIds, parameterBindings: panel.parameterBindings, readOnly: true, snapshotTime: 0,
    })),
    main: {
      artifact: { kind: plan.scene.runtime.renderer, hash: hex('c') }, runtime: plan.scene.runtime, mode: plan.mode.kind, readoutIds: plan.scene.readoutIds,
      inputDefaults: Object.fromEntries(plan.controls.filter(c => c.binding.kind === 'input').map(c => [c.binding.id, c.default])), controls,
      timeline: t ? { label: t.label, unit: 's', end: t.end, displayOffset: t.displayOffset, markers: t.markers, playbackRate: t.playbackRate, initialTime: 0, initialPlayback: 'paused', step: scrubber?.step ?? 0.01 } : null,
      onInputChange: plan.mode.onInputChange,
    },
    envelopeHash: hex('d'),
  };
}
