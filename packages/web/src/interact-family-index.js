// The full built-in scene families (brief 21): the generator, the fixtures and interact-families.js (the pick, the design, the oracles) call registerBuiltinFamilies() so each family's full module
// takes over its light entry in the registry (interact-family-registry.js). Not imported by plan validation: the family modules pull in the templates and the brief expander.
import { verticalThrow } from './interact-family-vertical-throw.js';
import { curveSliders } from './interact-family-curve-sliders.js';
import { registerFamily } from './interact-family-registry.js';

export const builtinFamilies = Object.freeze([verticalThrow, curveSliders]);
export const registerBuiltinFamilies = () => { for (const family of builtinFamilies) registerFamily(family); };
