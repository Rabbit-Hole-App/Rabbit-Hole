// Read-only: how the roadmap one-call bound moves with the examples block (up to MAX_CONTEXT 14,000 chars). No network.
const root = 'C:/s/var-1';
const cp = p => import('file:///' + root + '/packages/control-plane/' + p);
const rg = await cp('src/roadmap/roadmap-generate.js');
const { requestSpendBound } = await cp('src/learn-spend.js');
const { prepareArtifactAuthorRequest } = await cp('src/learn-artifact.js');
const { diagramReferenceContext } = await cp('src/explanation-references.js');
const { toMicros } = await cp('src/learn-usage.js');
const { diagramReferences } = await import('file:///' + root + '/packages/web/src/tutor-diagrams/reference-library.js');
const log = console.log; console.log = () => {};
const rec = { format: 'explanation', passageText: 'A learning curve plots error against training set size.', documentText: null, stepTitle: 'Learning curves',
  stepGoal: 'How can learning curves show whether more data may help?', claimsToCover: ['Training error rises and validation error falls as data grows.'],
  learnerInstruction: { original: '', revisions: [] }, teachingScope: { kind: 'whole' }, depth: 'balanced', sourceRef: null, cardId: 'c', stepId: 's', proposalId: 'p', proposalVersion: 1, retry: 0 };
const recNoRef = { ...rec, stepTitle: 'Zebra stripes', stepGoal: 'Why do zebras have stripes?', passageText: 'Zebras have black and white stripes.' };
const out = {};
for (const [name, env] of [['plan-default (no Gemini key)', {}], ['roadmap-gemini profile (GEMINI_API_KEY set)', { GEMINI_API_KEY: 'x' }]]) {
  const row = {};
  for (const [label, r] of [['no reference matches', recNoRef], ['learning-curves reference (1 example)', rec]]) {
    const q = await rg.quoteRoadmapCard(env, r);
    const built = rg.authorInput(r, undefined, env), prepared = prepareArtifactAuthorRequest(env, built.input, built.options);
    const route = rg.authorRoute(env, prepared.model);
    const bodyBytes = new TextEncoder().encode(JSON.stringify(prepared.body)).length;
    const toolBytes = new TextEncoder().encode(JSON.stringify(prepared.body.tools)).length, sysBytes = new TextEncoder().encode(JSON.stringify(prepared.body.system)).length;
    const bound = requestSpendBound(prepared.body, route.model, route.provider);
    // worst case: the system gains a block of N chars; each char JSON-escaped (a double quote -> 2 bytes) or 3-byte UTF-8
    const pad = (n, ch) => ({ ...prepared.body, system: prepared.body.system + ch.repeat(n) });
    const b = body => requestSpendBound(body, route.model, route.provider);
    row[label] = { provider: route.provider, model: route.model, quoteBoundMicros: q.boundMicros, boundUsd: bound, bodyBytes, toolBytes, systemBytes: sysBytes, maxTokens: prepared.body.max_tokens,
      refsInBody: prepared.diagramReferences.map(x => x.id), refsContextChars: diagramReferenceContext(prepared.diagramReferences).length,
      plus14000_ascii_usd: b(pad(14000, 'a')), plus14000_quotes_usd: b(pad(14000, '"')), plus14000_cjk3byte_usd: b(pad(14000, '\u4e2d')),
      deltaMicros_ascii: toMicros(b(pad(14000, 'a'))) - toMicros(bound), deltaMicros_quotes: toMicros(b(pad(14000, '"'))) - toMicros(bound), deltaMicros_3byte: toMicros(b(pad(14000, '\u4e2d'))) - toMicros(bound),
      pctOfQuote_ascii: ((toMicros(b(pad(14000, 'a'))) - toMicros(bound)) / toMicros(bound) * 100).toFixed(1) + '%', pctOfQuote_quotes: ((toMicros(b(pad(14000, '"'))) - toMicros(bound)) / toMicros(bound) * 100).toFixed(1) + '%' };
  }
  out[name] = row;
}
// real worst example block among the library: 3 largest {id, spec} lines
const sizes = diagramReferences.map(r => JSON.stringify({ id: r.id, useWhen: r.useWhen, spec: r.spec, ...(r.detailSpec ? { detailSpec: r.detailSpec } : {}) }).length).sort((a, b) => b - a);
out.libraryLineSizes = { top5: sizes.slice(0, 5), median: sizes[Math.floor(sizes.length / 2)], over14000: sizes.filter(s => s > 14000).length };
console.log = log; log(JSON.stringify(out, null, 1));
