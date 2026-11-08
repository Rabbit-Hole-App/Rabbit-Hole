// Versioned CardComposition v1 fixtures for the card UI (interact-composition-adapter.js documents the shape). They are built from the
// validated plan fixtures, so the card is exercised against the same Overview, Standard and Deep the other lanes use, before the build lane's
// compileCardComposition exists. The artifacts are references only (a fixture id), never source.
export function compositionFromPlan(plan, { planHash = 'a'.repeat(64) } = {}) {
  const t = plan.mode.timeline;
  return {
    schemaVersion: 1, planHash, title: plan.title, cardDescription: plan.cardDescription, mode: plan.mode.kind,
    main: { kind: plan.scene.runtime.renderer },
    supporting: plan.supportingVisuals.map(panel => ({
      id: panel.id, title: panel.title, artifact: { kind: panel.runtime.renderer, program: { fixtureId: `fixture-${panel.id}` } },
      parameterBindings: panel.parameterBindings, readoutIds: panel.readoutIds,
    })),
    controls: plan.controls,
    timeline: t ? { label: t.label, start: t.start, end: t.end, displayOffset: t.displayOffset, markers: t.markers, playbackRate: t.playbackRate } : null,
    onInputChange: plan.mode.onInputChange,
  };
}
