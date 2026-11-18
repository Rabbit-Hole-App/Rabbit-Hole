// VAR-1 step 2: a number the figure computes is written in the prose as {{d:path}}, never typed. The server reads it from the card's own diagram (after the derived fields are
// filled) and prints it, so a varied or recomputed input moves every sentence that states it. Form: {{d:N.path}} (N = the card's Nth closed rh-diagram fence, from 1, body first then
// the folded sections) or {{d:path}} on a card with one diagram; {{d:path|1}} forces that many decimals. The path walks the parsed diagram, keys and array positions joined by dots.
import { parseTutorDiagram } from '../../web/src/tutor-diagrams/spec.js';
import { derivedPaths } from '../../web/src/tutor-diagrams/derived.js';
import { markdownFences } from './learn-primitives.js';

const TOKEN = /\{\{d:([^{}\n]*)\}\}/g, FENCE = /^\s*```\s*([\w+#.-]*)/;
export const hasToken = value => /\{\{d:/.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));
const textsOf = block => [block?.body, ...(block?.more || []).map(section => section?.text)];

// The card's closed rh-diagram fences in order -> parsed diagram, or null for one that does not parse (its own checks say why).
function diagramsOf(block) {
  const out = [];
  for (const md of textsOf(block)) for (const fence of markdownFences(md).fences) {
    if (fence.lang !== 'rh-diagram' || !fence.closed) continue;
    try { out.push(parseTutorDiagram(fence.lines.join('\n')).diagram); } catch { out.push(null); }
  }
  return out;
}

const number = (diagram, path) => path.reduce((node, key) => (node !== null && typeof node === 'object' ? node[key] : undefined), diagram);

// One token's text -> { text } or { problem } or { pending } (its diagram does not parse: the diagram's own problem is reported, and a token still there is refused at the end).
function resolve(inner, diagrams) {
  const [rawPath, rawPlaces, ...rest] = inner.split('|'), path = rawPath.trim().split('.');
  const places = rawPlaces === undefined ? null : /^\s*[0-3]\s*$/.test(rawPlaces) ? Number(rawPlaces) : NaN;
  const named = /^\d+$/.test(path[0]);
  const index = named ? Number(path[0]) : 1, rest2 = named ? path.slice(1) : path;
  const token = `{{d:${inner}}}`;
  if (rest.length || Number.isNaN(places) || !rest2.length || rest2.some(key => !key)) return { problem: `${token} is not a token: write {{d:N.path}} or {{d:N.path|decimals}} with decimals 0 to 3` };
  if (!named && diagrams.length !== 1) return { problem: `${token} needs the diagram number first when the card does not have exactly one diagram (this card has ${diagrams.length}): {{d:N.path}}` };
  if (index < 1 || index > diagrams.length) return { problem: `${token} names diagram ${index}, but the card has ${diagrams.length}` };
  const diagram = diagrams[index - 1];
  if (!diagram) return { pending: true };
  const value = number(diagram, rest2);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    const valid = derivedPaths(diagram).slice(0, 8).map(p => `${index}.${p}`);
    return { problem: `${token} does not name a number in diagram ${index}${valid.length ? `; the numbers the figure computes there are ${valid.join(', ')}` : ''}` };
  }
  return { text: places === null ? String(value) : value.toFixed(places) };
}

// -> { block, filled, authored, problem }. Prose lines only (a fence is left as written; a token inside one is refused later by hasToken). `authored` is the body as written, with its tokens.
export function fillTokens(block) {
  if (![block?.body, ...(block?.more || []).map(s => s?.text)].some(hasToken)) return { block, filled: 0, authored: null, problem: null };
  const diagrams = diagramsOf(block);
  let filled = 0, problem = null;
  const fill = md => {
    let inside = false;
    return String(md ?? '').split('\n').map(line => {
      if (FENCE.test(line)) { inside = !inside; return line; }
      return inside ? line : line.replace(TOKEN, (whole, inner) => {
        const got = resolve(inner, diagrams);
        if (got.text !== undefined) { filled++; return got.text; }
        if (got.problem) problem ??= got.problem;
        return whole;
      });
    }).join('\n');
  };
  const more = (block.more || []).map(section => (typeof section?.text === 'string' ? { ...section, text: fill(section.text) } : section));
  const next = { ...block, body: typeof block.body === 'string' ? fill(block.body) : block.body, ...(block.more ? { more } : {}) };
  return { block: next, filled, authored: block.body, problem: problem && `explanation_bad_token: ${problem}. A number the figure computes is written as {{d:N.path}} (the figure's own number, filled in by the server), never typed` };
}

// What is still a token after the fill and the diagram checks: the learner must never see one.
export const leftoverToken = (block, questions) => (hasToken([block?.body, ...(block?.more || []).map(s => s?.text), questions ?? null])
  ? 'explanation_bad_token: a {{d:...}} token was left in the card (its diagram is not valid, or it sits inside a diagram or a question); write tokens only in the prose, for a number of a valid diagram' : null);
