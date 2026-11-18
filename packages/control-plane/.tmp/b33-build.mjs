import { interactCapabilities } from '../../web/src/interact-control-catalogue.js';
import { parseScenePlan, planHash } from '../../web/src/interact-plan.js';
import { pinnedPlan } from '../src/interact-design-pin.js';
import { buildTemplate } from '../src/interact-template.js';
import { fixtureContext } from '../src/interact-fixtures.js';
const capabilities = await interactCapabilities({ renderers: ['program'], inputsV2: true });
for (const [id, depth] of process.argv.slice(2).map(a => a.split(':'))) {
  const plan = await pinnedPlan(id, { depth, evidence: [] });
  plan.scene.runtime.catalogueHash = capabilities.catalogueHash;
  const admitted = parseScenePlan(plan, capabilities);
  console.log(id, 'admit', admitted.ok, JSON.stringify(admitted.problems ?? []).slice(0, 1500));
  if (!admitted.ok) continue;
  const built = await buildTemplate({ id, plan, planHash: await planHash(plan), capabilities }, { ...fixtureContext(), adapters: {}, adapter: undefined });
  console.log('built', !!built.artifacts, JSON.stringify(built.details ?? built.problems ?? []).slice(0, 2000));
}
