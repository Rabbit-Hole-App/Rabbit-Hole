// E1 (docs/features/explain.md section 5 "Required visual contract", GAP-01, EXP-12-C02): the server-owned, versioned record of the tables and diagrams a
// learner explicitly asked a written Explanation for, and the pure check that the final card really contains them.
// The record is derived on the SERVER from the learner's own words (the direct request's args, or a Tutor step's accepted learner instruction), never from model
// output, and the author cannot turn a required visual into an optional one by omitting a flag. No LLM call classifies the request.
// A pure leaf like learn-primitives.js (no env, no fetch).
import { markdownVisuals } from './learn-primitives.js';

export const VISUAL_REQUIREMENTS_VERSION = 1;

// What the card's diagram library draws (tutor-diagrams/spec.js), by the words a learner uses for it. The first match wins, most specific first.
const KINDS = [
  [/\b(decision[- ]?tree|flow ?chart|flow ?diagram|decision diagram|process diagram|flow of)\b/i, 'flow'],
  [/\bsequence diagram\b/i, 'sequence'], [/\btimeline\b/i, 'timeline'], [/\bcycle diagram\b/i, 'cycle'], [/\blayer(s|ed)? diagram\b/i, 'layers'],
  [/\b(tree|hierarchy) diagram\b/i, 'tree'], [/\bcomparison diagram\b/i, 'comparison'], [/\bmatrix diagram\b/i, 'matrix'],
  [/\b(bar chart|bar graph)\b/i, 'bar-chart'], [/\bnumber ?line\b/i, 'number-line'], [/\bt-?account\b/i, 't-account'], [/\bwaterfall (chart|diagram)\b/i, 'waterfall'],
  [/\b(coordinate|scatter|line) (plot|chart)\b/i, 'coordinate-plot'], [/\bfree[- ]body diagram\b/i, 'figure'],
];
// Pictures that look like a request for a diagram but that the library does not draw: a clear outcome before any author call, never prose standing in.
const UNSUPPORTED = /\b(venn diagram|pie chart|mind ?map|uml|class diagram|er diagram|entity[- ]relationship|gantt|state (?:diagram|machine)|heat ?map|sankey|histogram|org(?:anisation|anization)? chart)\b/i;
const DIAGRAM_WORD = /\b(diagram|flow ?chart|decision[- ]?tree|bar chart|bar graph|number ?line|t-?account|(?:coordinate|scatter|line) (?:plot|chart)|timeline)\b/i;
// A table the learner is asking for, not the word in another sense. shortcut: wording heuristics (EX-01/EX-07 plus their variations), not a classifier; an
// unrecognised phrasing simply leaves the visual optional, as it was before this record. Upgrade when real requests show a missed phrasing.
const NOT_A_REQUEST = /\b(periodic table|table salt|table tennis|time ?table|water table|turn(?:ing)? the tables|table of contents)\b/gi;
const TABLE_CUE = /\b(?:include|add|with|use|using|give|show|make|put|provide|create|in|as|into|and|plus)\b[^.?!\n]{0,40}\btables?\b|\btables?\s+(?:comparing|compares|of|showing|that|with|to|for|listing|summar)|\btabulate\b|\btabular\b|\btruth table\b/i;
const NEGATION = /\b(?:no|not|without|don'?t|do not|never|avoid|skip|exclude|rather than|instead of)\b[^.?!\n]*$/i;
const negated = (text, index) => NEGATION.test(text.slice(Math.max(0, index - 40), index));

const clip = (text, max = 200) => String(text).replace(/\s+/g, ' ').trim().slice(0, max);

// -> { version, items: [{ id, kind: 'table'|'diagram', diagramKind?, purpose }] } (items may be empty), or { unsupported: 'one line for the learner' }.
export function deriveVisualRequirements(text) {
  const words = String(text ?? '').replace(NOT_A_REQUEST, ' ');
  const items = [];
  const unsupported = UNSUPPORTED.exec(words);
  if (unsupported && !negated(words, unsupported.index)) return { unsupported: `A ${unsupported[1].toLowerCase()} is not a picture Rabbit Hole draws yet, so nothing was made or charged. Ask for a flow, comparison, timeline, sequence, matrix, layers, cycle, tree, bar chart or another table or diagram it draws, or remove that request.` };
  const table = TABLE_CUE.exec(words);
  if (table && !negated(words, table.index + table[0].search(/tables?/i))) items.push({ kind: 'table', purpose: clip(words) });
  const diagram = DIAGRAM_WORD.exec(words);
  if (diagram && !negated(words, diagram.index)) {
    const kind = KINDS.find(([re]) => re.test(words))?.[1];
    items.push({ kind: 'diagram', ...(kind ? { diagramKind: kind } : {}), purpose: clip(words) });
  }
  return { version: VISUAL_REQUIREMENTS_VERSION, items: items.map((item, i) => ({ id: `vr-${i + 1}`, ...item })) };
}
// The text a requirement is read from: a direct question's own words, or a Tutor step's accepted learner instruction (the planner's own title and goal are not the learner's request).
export const requirementText = ({ args, original, revisions } = {}) => [args, original, ...(revisions || []).map(r => (typeof r === 'string' ? r : r?.text))].filter(Boolean).join('\n');

// The one wording a check failure uses, so the repair and the logs read the same reason: required_visual_missing | required_visual_invalid.
export function requiredVisualProblem(block, requirements) {
  const items = requirements?.items ?? [];
  if (!items.length) return null;
  const found = [block?.body, ...(block?.more || []).map(s => s?.text)].map(markdownVisuals);
  const tables = found.flatMap(f => f.tables), diagrams = found.flatMap(f => f.diagrams);
  const problems = [];
  for (const kind of ['table', 'diagram']) {
    const wanted = items.filter(i => i.kind === kind);
    if (!wanted.length) continue;
    const have = (kind === 'table' ? tables : diagrams).filter(v => v.ok);
    const broken = (kind === 'table' ? tables : diagrams).filter(v => !v.ok);
    for (const [n, item] of wanted.entries()) {
      const mine = have[n];
      if (!mine) problems.push(broken.length
        ? `required_visual_invalid: the learner asked for a ${kind} (${item.id}) and the card's ${kind} is not complete${broken[0].problem ? ` (${broken[0].problem})` : ''}; write it again as a complete ${kind === 'table' ? 'pipe table with leading and trailing pipes, a header row, a separator row and the same number of cells in every row' : 'closed rh-diagram fence that the diagram library accepts'}.`
        : `required_visual_missing: the learner asked for a ${kind} (${item.id}: "${item.purpose.slice(0, 120)}") and the card has none; add it in the card body, shortening the prose to stay inside the budget.`);
      else if (kind === 'diagram' && item.diagramKind && mine.kind !== item.diagramKind) problems.push(`required_visual_invalid: the learner asked for a ${item.diagramKind} diagram (${item.id}) and the card's diagram is a ${mine.kind}; use the ${item.diagramKind} kind.`);
      else if (kind === 'diagram' && mine.kind === 'flow' && /\byes\b/i.test(item.purpose) && /\bno\b/i.test(item.purpose)) {
        const labels = (mine.edgeLabels || []).map(l => String(l).trim().toLowerCase());
        if (!labels.includes('yes') || !labels.includes('no') || !mine.hasDecision || !mine.hasOutcome) problems.push(`required_visual_invalid: the learner described Yes and No branches (${item.id}); the flow needs a decision node, edges labelled Yes and No, and an outcome node.`);
      }
    }
  }
  return problems.length ? problems.join(' ') : null;
}

// After an OPTIONAL diagram was dropped (learn-primitives.js dropInvalidDiagrams): the prose must not still point at the figure that is gone.
// shortcut: a wording check on the prose outside fences; upgrade when a dropped diagram is seen to leave a pointer this misses.
const POINTER = /\b(?:diagram|figure|flow ?chart|chart|illustration)\b[^.\n]{0,60}\b(?:above|below|here|shown|shows|following|next|overleaf)\b|\b(?:see|in|from|as)\s+(?:the|this)\s+(?:diagram|figure|flow ?chart|chart)\b|\b(?:above|below|following)\s+(?:diagram|figure|flow ?chart|chart)\b/i;
export function danglingFigureProblem(block) {
  const prose = [block?.body, ...(block?.more || []).map(s => s?.text)].map(md => String(md ?? '').replace(/```[\s\S]*?```/g, ' ')).join('\n');
  return POINTER.test(prose) ? 'explanation_bad_diagram: an optional diagram could not be drawn and was dropped, but the text still points at it; write the explanation without referring to a figure.' : null;
}

// The saved provenance: the record with each item marked satisfied by the final card (only called after requiredVisualProblem returned null).
export const boundRequirements = requirements => ({ version: VISUAL_REQUIREMENTS_VERSION, items: requirements.items.map(item => ({ ...item, satisfied: true })) });
