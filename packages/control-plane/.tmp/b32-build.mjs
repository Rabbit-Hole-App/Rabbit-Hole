import { interactCapabilities } from '../../web/src/interact-control-catalogue.js';
import { parseScenePlan, planHash } from '../../web/src/interact-plan.js';
import { pinnedPlan } from '../src/interact-design-pin.js';
import { buildTemplate, templateGate } from '../src/interact-template.js';
import { fixtureContext } from '../src/interact-fixtures.js';
const capabilities = await interactCapabilities({ renderers: ['program'], inputsV2: true });
for (const [id, depth] of [['stepper-tree-motion-brief', 'brief'], ['stepper-vote-motion-balanced', 'balanced']]) {
  const plan = await pinnedPlan(id, { depth, evidence: [] });
  plan.scene.runtime.catalogueHash = capabilities.catalogueHash;
  const admitted = parseScenePlan(plan, capabilities);
  console.log(id, 'admit', admitted.ok, JSON.stringify(admitted.problems ?? []).slice(0, 1800));
  if (!admitted.ok) continue;
  console.log('gate', JSON.stringify(templateGate({ INTERACT_BUILD_KIND: 'template' }, plan)));
  const built = await buildTemplate({ id, plan, planHash: await planHash(plan), capabilities }, { ...fixtureContext(), adapters: {}, adapter: undefined });
  console.log('built', !!built.artifacts, JSON.stringify(built.details ?? built.problems ?? []).slice(0, 2500));
}
