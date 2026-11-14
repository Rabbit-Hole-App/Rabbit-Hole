// The light half of the built-in scene families (brief 21): pure data modules, no imports, registered by interact-family-registry.js when it loads, so plan validation in the browser knows each
// family's template roles and words. A new family adds its data module here and its full module to interact-family-index.js.
import { verticalThrowData } from './interact-family-vertical-throw-data.js';
import { curveData } from './interact-curve-data.js';

export const builtinFamilyData = Object.freeze([verticalThrowData, curveData]);
