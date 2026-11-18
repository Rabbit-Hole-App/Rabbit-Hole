import { pathToFileURL } from 'node:url';
const { quoteRoadmapCard, authorInput } = await import(pathToFileURL('C:/s/gen1-g6/packages/control-plane/src/roadmap/roadmap-generate.js').href);
const { prepareArtifactAuthorRequest } = await import(pathToFileURL('C:/s/gen1-g6/packages/control-plane/src/learn-artifact.js').href);
const { requestSpendBound } = await import(pathToFileURL('C:/s/gen1-g6/packages/control-plane/src/learn-spend.js').href);
const { toMicros } = await import(pathToFileURL('C:/s/gen1-g6/packages/control-plane/src/learn-usage.js').href);
const rec = { format: 'explanation', passageText: 'A passage.', documentText: null, stepTitle: 'Gini impurity', stepGoal: 'What does Gini impurity measure?', claimsToCover: [], learnerInstruction: { original: '', revisions: [] }, teachingScope: { kind: 'whole' }, depth: 'balanced', sourceRef: null, cardId: 'c', stepId: 's', proposalId: 'p', proposalVersion: 1, retry: 0 };
for (const [name, env] of [['roadmap-gemini', { GEMINI_API_KEY: 'k', FIREWORKS_API_KEY: 'k', EXPLANATION_INTERACTIONS: 'true' }], ['plan-default (Opus)', {}]]) {
  const q = await quoteRoadmapCard(env, rec);
  const b = authorInput(rec, undefined, env), p = prepareArtifactAuthorRequest(env, b.input, b.options);
  const bare = toMicros(requestSpendBound(p.body, p.model, q.provider === 'subscription' ? 'anthropic' : q.provider));
  console.log(name, 'bare author bound', bare, 'quote now', q.boundMicros, '(+', q.boundMicros - bare, ')');
}
