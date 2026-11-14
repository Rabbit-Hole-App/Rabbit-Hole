// The scene families the design can fill (brief 13), registered in ONE place (brief 21, owner 2026-11-14): registerFamily(family, { oracles }). A family module (web package) is added to the registry
// by listing it in packages/web/src/interact-family-index.js (the built-ins) or by calling registerFamily here; from the registered families are DERIVED: the pick's criteria list (INTERACT_FAMILIES:
// the pick, interact-design-pick.js, builds its `family` choice from it), the generator's template table and the template roles and words plan validation reads (packages/web/src/interact-family-registry.js),
// the pin families and their depth plans (interact-design-pin.js), the oracle lookup (interact-oracle.js interactOracle) and the check-map rows (scripts/ci/gen-family-check-map.mjs). No other registration is left.
//
// A family module exports (the shape is built where the vertical-throw one is, packages/web/src/interact-family-vertical-throw.js):
//   id, pickCriterion (what its scene SHOWS, never the subject), FAMILY ({ id, depths: { depth: { template, roles, inputs: [[inputId, 'range' | 'fixed']] } } }), INPUTS, ROLES, LIMITS, scalars,
//   referenceCheck(brief, depth), expandBrief, extractBrief, familyDescription(depth), formulaGrammar, formulaRules(depth) -> lines (the rules after the grammar),
//   templates (the names), templateData ({ name: { lanes, roles, independent?, words } }), templateModules ({ name: module }), context(...), optionally independent: { id, domain },
//   pins ({ families: { pin: { depth: planId } }, plans: { planId: [planName, depth, fixturesGroup] } }), fixtureGroups(catalogueHash) -> { group: { name: plan } }, checkMap ({ repoPath: [tests] }).
// Control-plane facets join here: `oracles` is a thunk returning this family's oracle functions (plan -> the trusted expected values, or null when the plan is not this family's), a thunk because
// interact-oracle.js and this file name each other. Everything reads the module: briefSchema(depth, module), fillSystem(depth, info, module), module.referenceCheck, generateProgram.
import { registerFamily as registerWeb, registeredFamilies } from '../../web/src/interact-family-registry.js';
import { registerBuiltinFamilies } from '../../web/src/interact-family-index.js';
import { briefSchema } from '../../web/src/interact-plan-brief.js';
import { standardTossDropOracle, deepTossDropOracle, overviewDropOracle, pendulumPeriodOracle, tossOverviewOracle, tossStandardOracle, tossDeepOracle, ledgeMoonOracle, verticalThrowOracle } from './interact-oracle.js';
import { curveLogisticOracle } from './interact-curve-oracle.js';

const facets = new Map(), entries = new WeakMap();
const entryOf = family => {
  let entry = entries.get(family);
  if (!entry) { entry = Object.freeze({ id: family.id, pickCriterion: family.pickCriterion, module: Object.freeze({ ...family, family: family.FAMILY, briefSchema: depth => briefSchema(depth, family) }), oracles: () => facets.get(family.id)?.() ?? [] }); entries.set(family, entry); }
  return entry;
};

// -> a function that takes the family out again (a test seam).
export function registerFamily(family, { oracles = () => [] } = {}) {
  const unregister = registerWeb(family);
  facets.set(family.id, oracles);
  return () => { unregister(); facets.delete(family.id); };
}

registerBuiltinFamilies(); // the full family modules take over the registry's light entries
const builtin = id => registeredFamilies().find(family => family.id === id);
registerFamily(builtin('vertical-throw'), { oracles: () => [standardTossDropOracle, deepTossDropOracle, overviewDropOracle, pendulumPeriodOracle, tossOverviewOracle, tossStandardOracle, tossDeepOracle, ledgeMoonOracle, verticalThrowOracle] });
registerFamily(builtin('curve-sliders'), { oracles: () => [curveLogisticOracle] });

export const verticalThrow = entryOf(builtin('vertical-throw'));
export const curveSliders = entryOf(builtin('curve-sliders'));
// The pick's family list, always the registered families (in registration order): reads like the array it replaced (map, find, filter, [0], length, iteration).
const now = () => registeredFamilies().map(entryOf);
export const INTERACT_FAMILIES = new Proxy([], {
  get: (_, key) => Reflect.get(now(), key), has: (_, key) => Reflect.has(now(), key), ownKeys: () => Reflect.ownKeys(now()), getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(now(), key),
});
