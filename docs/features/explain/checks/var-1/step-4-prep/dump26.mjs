const { diagramReferences } = await import('file:///C:/s/var-1/packages/web/src/tutor-diagrams/reference-library.js');
const ids = `log-feature-scale, learning-curves, search-grid-and-random, probability-calibration, acf-pacf-stems, ml-stable-diffusion-encoder-evaluation, figure-retro-neighbor-search, d2l-dropout-validation-metrics, d2l-minibatch-loss-by-wall-time, d2l-cnn-loss-and-accuracy, d2l-lag-regression-training-loss, d2l-forecast-one-step-refresh, d2l-forecast-feedback-error, d2l-forecast-damping-by-horizon, d2l-attention-pooling-local-prediction, d2l-attention-bandwidth-changes-fit, tree-impurity-mixtures, ensemble-votes, bias-variance-decomposition, boosting-signed-corrections, bayes-additive-log-scores, class-weighted-loss, permutation-feature-importance, feature-selection-stability, ml-label-prior-drift-comparison, ml-transformer-vocabulary-cross-entropy`.split(/,\s*/);
for (const id of ids) {
  const r = diagramReferences.find(x => x.id === id);
  if (!r) { console.log('MISSING', id); continue; }
  const d = r.spec.diagram;
  const txt = [d.title, d.caption, d.x?.label, d.y?.label, d.axis?.label, r.useWhen].filter(Boolean).join(' | ');
  console.log(`\n### ${id} [${d.kind}${d.variant ? '/' + d.variant : ''}] depths:${Object.keys(r.depths ?? {}).join(',') || '-'}`);
  console.log('text:', txt.slice(0, 420));
  if (d.kind === 'coordinate-plot') {
    for (const [i, s] of d.series.entries()) console.log(` series${i} "${s.label}" ${s.kind}${s.smooth === false ? ' step' : ''}`, s.samples ? 'samples ' + JSON.stringify(s.samples) : s.points.map(p => `${p.x},${p.y}`).join(' '));
    console.log(' axes x', JSON.stringify(d.x), 'y', JSON.stringify(d.y));
    for (const a of d.annotations ?? []) console.log(' ann', JSON.stringify(a));
  } else {
    console.log(' ', JSON.stringify(d, (k, v) => (k === 'title' || k === 'caption' ? undefined : v)).slice(0, 900));
  }
}
