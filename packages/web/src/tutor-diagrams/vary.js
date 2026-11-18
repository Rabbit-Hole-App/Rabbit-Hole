// VAR-1 step 3 (spec v1.1 section 3): varied inputs on references. A reference may carry `vary` next to useWhen / keywords (never inside spec.diagram):
//   vary: { 'series.0.points.2.y': [min, max, step], 'boxes.0.q3': [9, 14, 1, 'boxes.0.q1'] }
// A path walks spec.diagram (keys and array positions joined by dots) and must name a number. Each request draws one value per path from min to max in whole steps, keeping the
// decimals of min and step. An optional 4th element names another path this value may not fall below (q1 <= median <= q3): the min is bumped to that path's value, so an order
// holds by construction; that path is listed earlier in `vary`, or is a fixed number of the reference. After sampling, every derived field is set to what its inputs now give
// (derived.js refreshDerived), so no stale fence, mean line or softmax output survives; a set that must add up to 1 is drawn raw and normalised by the parser's own fill.
// A reference's text may write a computed number as {{d:path}} or {{d:path|decimals}} (path inside the diagram, as in the card prose tokens of explanation-tokens.js); the author is shown the
// number the sampled spec now has ("Mean prediction of 3.4"), never the token, so the label follows the inputs and a copied label cannot leave a token in a figure.
// Worked numbers never vary: varyProblems is the lint that fails a vary path whose number (or a number it derives) is typed into the reference's text, unless that text is a token.
// This module holds no subject-matter vocabulary. The seed is the request's `requestSeed`; the same seed, reference and id always give the same spec.
import { decimalsOf, derivedPaths, refreshDerived } from './derived.js';
import { seededRandom } from './random.js';
import { childDiagrams } from './spec.js';

const at = (root, path) => path.split('.').reduce((node, key) => (node !== null && typeof node === 'object' ? node[key] : undefined), root);
const setAt = (root, path, value) => { const keys = path.split('.'); keys.slice(0, -1).reduce((node, key) => node[key], root)[keys.at(-1)] = value; };
const refreshAll = (d, options) => { refreshDerived(d, options); for (const child of childDiagrams(d)) refreshAll(child.diagram, options); return d; };

// -> an error message, or null, for one vary entry against the diagram it varies.
function entryProblem(diagram, path, entry) {
  if (!Array.isArray(entry) || entry.length < 3 || entry.length > 4) return `${path}: write [min, max, step] (an order path may follow)`;
  const [min, max, step, after] = entry;
  if (![min, max, step].every(Number.isFinite)) return `${path}: min, max and step must be numbers`;
  if (!(step > 0) || min > max) return `${path}: needs min <= max and step > 0`;
  if (!Number.isFinite(at(diagram, path))) return `${path}: is not a number in the diagram`;
  if (after !== undefined && typeof after !== 'string') return `${path}: the order path must be a path string`;
  return null;
}

// The spec with every `vary` path redrawn, derived fields refreshed. Throws on a bad entry; callers that must not break a request catch it (explanation-references.js).
export function varySpec(spec, vary, seed, id = '') {
  const out = structuredClone(spec), diagram = out.diagram, random = seededRandom(`${seed}|${id}`), drawn = new Map();
  for (const [path, entry] of Object.entries(vary)) {
    const problem = entryProblem(diagram, path, entry);
    if (problem) throw new Error(`vary ${problem}`);
    const [min, max, step, after] = entry, places = Math.max(decimalsOf(min), decimalsOf(step));
    let first = 0;
    if (after !== undefined) {
      const floor = drawn.has(after) ? drawn.get(after) : (Object.hasOwn(vary, after) ? undefined : at(diagram, after));
      if (!Number.isFinite(floor)) throw new Error(`vary ${path}: order path ${after} must be listed before it or be a number of the diagram`);
      first = Math.max(0, Math.ceil((floor - min) / step - 1e-9));
    }
    const count = Math.floor((max - min) / step + 1e-9) + 1;
    if (first >= count) throw new Error(`vary ${path}: no value from ${min} to ${max} is at or above ${after}`);
    const value = Number((min + (first + Math.floor(random() * (count - first))) * step).toFixed(places));
    drawn.set(path, value);
    setAt(diagram, path, value);
  }
  refreshAll(diagram);
  return resolveTokens(out);
}

const TOKEN_AT = /\{\{d:([^{}\n|]*)(?:\|([0-3]))?\}\}/g;
// The spec with its tokens printed (the same object when it has none). Throws when a token names something that is not a number of the diagram.
export function resolveTokens(spec) {
  if (!/\{\{d:/.test(JSON.stringify(spec))) return spec;
  const out = structuredClone(spec), diagram = refreshAll(out.diagram);
  const print = value => (typeof value === 'string' ? value.replace(TOKEN_AT, (whole, path, places) => {
    const number = at(diagram, path.trim());
    if (!Number.isFinite(number)) throw new Error(`vary: ${whole} does not name a number of the diagram`);
    return places === undefined ? String(number) : number.toFixed(Number(places));
  }) : Array.isArray(value) ? value.map(print) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, print(child)])) : value);
  return { ...out, diagram: print(diagram) };
}

const strings = value => (typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);
const TOKEN = /\{\{d:[^{}\n]*\}\}/g;
const cites = (text, number) => new RegExp(`(?<![\\d.])${String(number).replace(/[-.]/g, '\\$&')}(?![\\d]|\\.\\d)`).test(text);

// The lint over one reference (or one depth variant, merged): every problem of its `vary`, as strings; none for a reference without `vary`. Static order check: an order path's own
// range must not top this one (else some draws have no room). Cited numbers: the number a vary path holds now, and every number a derived field of the diagram holds, must not be
// typed in the reference's text (any string of the spec, and useWhen) unless it is written as a {{d:path}} token.
export function varyProblems(ref) {
  if (!ref.vary) return [];
  const out = [], diagram = ref.spec.diagram, problems = [];
  for (const [path, entry] of Object.entries(ref.vary)) {
    const problem = entryProblem(diagram, path, entry);
    if (problem) { problems.push(problem); continue; }
    const after = entry[3];
    if (after !== undefined) {
      const earlier = Object.keys(ref.vary).indexOf(after) >= 0 && Object.keys(ref.vary).indexOf(after) < Object.keys(ref.vary).indexOf(path);
      const prev = Object.hasOwn(ref.vary, after) ? (earlier ? ref.vary[after][1] : undefined) : at(diagram, after);
      if (!Number.isFinite(prev)) problems.push(`${path}: order path ${after} must be listed before it or be a number of the diagram`);
      else if (prev > entry[1]) problems.push(`${path}: its max ${entry[1]} is below the top ${prev} of ${after}`);
    }
  }
  if (problems.length) return problems.map(p => `${ref.id}: vary ${p}`);
  const text = [...strings(ref.spec), ref.useWhen ?? ''].join('\n').replace(TOKEN, ' ');
  const cited = Object.keys(ref.vary).map(path => [path, at(diagram, path)]);
  const derived = refreshAll(structuredClone(diagram), { all: true }); // silent derived values too: a typed fence is as stale as a typed mean
  for (const path of derivedPaths(derived)) cited.push([`${path} (derived)`, at(derived, path)]);
  for (const [path, number] of cited) if (Number.isFinite(number) && cites(text, number)) out.push(`${ref.id}: ${path} holds ${number}, and ${number} is typed in the reference's text; write it as a {{d:path}} token or do not vary it`);
  return out;
}
