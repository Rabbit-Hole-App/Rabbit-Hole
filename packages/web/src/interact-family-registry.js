// The ONE place a scene family is added (brief 21, owner 2026-11-14): registerFamily(family). Everything that used to be a hand table per family is derived from the registered
// families here: the template roles and words (TEMPLATE_ROLES, TEMPLATE_WORDS, read by plan validation), the callout slots (CALLOUT_SLOTS), the template table the generator builds from (TEMPLATES)
// and the family list the pick, the design, the generator, the pins, the oracles and the check-map rows read (registeredFamilies). A family declares:
//   id, pickCriterion, templates (the template names it draws), templateData ({ name: { lanes, roles, independent?, words: [[path, maxChars, what]], callouts?: slots => quantity ids } }),
//   pins ({ families: { pin: { depth: planId } }, plans: { planId: [planName, depth, fixturesGroup] } }), checkMap ({ repoPath: [the tests that cover it] })      <- the LIGHT half
//   templateModules ({ name: module }), fixtureGroups(catalogueHash) -> { group: { name: plan } }, and the rest of the contract (interact-families.js documents it)  <- the HEAVY half
// Two halves because plan validation runs in the browser (the Chat proposal card) and must not load the generator, the templates or the brief expander (about 340 KB minified, KaTeX included): the
// light half of each built-in family is registered HERE, from interact-family-data-index.js (pure data, no imports); the full family modules register through the same call
// (interact-family-index.js registerBuiltinFamilies, called by the generator, the fixtures and interact-families.js) and take over their id: registering a known id with the same templates
// replaces its light entry by the full one. Adding a family: its data module in interact-family-data-index.js, its full module in interact-family-index.js, or registerFamily(module) for a test.
import { builtinFamilyData } from './interact-family-data-index.js';

const families = [], roles = {}, words = {}, callouts = {};
export const TEMPLATES = {}; // template -> module: filled by the full families (the light half has no template code)
const wordKey = path => path.split('.').join('_');
const same = (a, b) => a.length === b.length && a.every((name, i) => name === b[i]);

function tables(family) {
  for (const name of family.templates) {
    const { lanes = 0, roles: slotRoles, independent, words: list = [], callouts: shown } = family.templateData[name];
    roles[name] = Object.freeze({ lanes, roles: slotRoles, ...(independent ? { independent } : {}) });
    words[name] = Object.freeze(list.map(([path, max, what]) => Object.freeze({ path, key: wordKey(path), max, what })));
    if (shown) callouts[name] = shown; else delete callouts[name];
    if (family.templateModules?.[name]) TEMPLATES[name] = family.templateModules[name]; else delete TEMPLATES[name];
  }
}

// -> a function that takes the family out again (a test seam), or restores the light entry it replaced.
export function registerFamily(family) {
  const { id, templates: names, templateData } = family ?? {};
  if (typeof id !== 'string' || !id) throw new TypeError('a family needs an id');
  if (!Array.isArray(names) || !names.length || !templateData) throw new TypeError(`family ${id} needs templates and templateData`);
  for (const name of names) if (!templateData[name]) throw new TypeError(`family ${id}: template ${name} needs its templateData entry`);
  const at = families.findIndex(f => f.id === id);
  if (at >= 0) {
    const known = families[at];
    if (known === family) return () => {};
    if (!same(known.templates, names)) throw new TypeError(`family ${id} is already registered with other templates`);
    families[at] = family; tables(family); // the full module takes over the light entry
    return () => { families[at] = known; tables(known); };
  }
  for (const name of names) if (name in roles) throw new TypeError(`family ${id}: template ${name} already belongs to another family`);
  families.push(family); tables(family);
  return () => {
    families.splice(families.indexOf(family), 1);
    for (const name of names) { delete roles[name]; delete words[name]; delete callouts[name]; delete TEMPLATES[name]; }
  };
}

export const registeredFamilies = () => families;
export const isRegisteredTemplate = name => Object.hasOwn(roles, name);
export const TEMPLATE_ROLES = roles, TEMPLATE_WORDS = words, CALLOUT_SLOTS = callouts;
for (const family of builtinFamilyData) registerFamily(family);
