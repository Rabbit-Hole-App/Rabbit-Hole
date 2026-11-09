// E1 (docs/features/explain.md section 5 "Required visual contract", GAP-01, EXP-12-C02): the server-owned, versioned record of the tables and diagrams a
// learner explicitly asked a written Explanation for, and the pure check that the final card really contains them.
// The record is derived on the SERVER from the learner's own words (the direct request's args, or a Tutor step's accepted learner instruction), never from model
// output, and the author cannot turn a required visual into an optional one by omitting a flag. No LLM call classifies the request.
// A pure leaf like learn-primitives.js (no env, no fetch).
import { markdownIllustrations, markdownVisuals } from './learn-primitives.js';

export const VISUAL_REQUIREMENTS_VERSION = 1;

// What the card's diagram library draws (tutor-diagrams/spec.js), by the words a learner uses for it. The first match wins, most specific first.
const KINDS = [
  [/\b(?:binary(?: search)? trees?|bst|dendrograms?)\b/i, 'tree'],
  [/\bheat ?maps?\b/i, 'heatmap'], [/\bhistograms?\b/i, 'histogram'],
  [/\bbox[- ]?plots?\b/i, 'box-plot'], [/\bsample[- ]set diagrams?\b/i, 'sample-set'],
  // Owner B1 (2026-11-08): a decision tree stays a flow: a flow with decision nodes and Yes/No branches to outcomes is a faithful decision tree.
  [/\b(decision[- ]?trees?|flow ?charts?|flow ?diagrams?|decision diagrams?|process diagrams?|flow of)\b/i, 'flow'],
  [/\bsequence diagrams?\b/i, 'sequence'], [/\btimeline\b/i, 'timeline'], [/\bcycle diagrams?\b/i, 'cycle'], [/\blayer(s|ed)? diagrams?\b/i, 'layers'],
  [/\b(tree|hierarchy) diagrams?\b/i, 'tree'], [/\bcomparison diagrams?\b/i, 'comparison'], [/\bmatrix diagrams?\b/i, 'matrix'],
  [/\b(bar charts?|bar graphs?)\b/i, 'bar-chart'], [/\bnumber ?line\b/i, 'number-line'], [/\bt-?account\b/i, 't-account'], [/\bwaterfall (charts?|diagrams?)\b/i, 'waterfall'],
  [/\b(coordinate|scatter|line) (plots?|charts?)\b/i, 'coordinate-plot'], [/\bfree[- ]body diagrams?\b/i, 'figure'],
];
// Pictures that look like a request for a diagram but that the library does not draw: a clear outcome before any author call, never prose standing in.
const UNSUPPORTED = /\b(venn diagram|pie chart|mind ?map|uml|class diagram|er diagram|entity[- ]relationship|gantt|state (?:diagram|machine)|sankey|org(?:anisation|anization)? chart)\b/i;
// A topic word alone ("how a decision tree works", "the timeline of the war", "a t-account") is not a request for a picture: only the picture words are.
// EXP-13 fix 5b (owner 2026-11-08): plurals count too ("two diagrams", "diagrams"), and a picture word asks for an illustration ("two pictures", "a diagram and a picture").
const DIAGRAM_WORD = /\b(heat ?maps?|histograms?|box[- ]?plots?|sample[- ]set diagrams?|dendrograms?|diagrams?|flow ?charts?|bar charts?|bar graphs?|(?:coordinate|scatter|line) (?:plots?|charts?))\b/gi;
const PICTURE_WORD = /\b(pictures?|illustrations?|drawings?|images? of)\b/gi;
// How many of a kind a mention asks for: a number word just before it, else a plural is two and a singular one (a card holds at most three visuals, at most two pictures: owner 2026-11-08).
// The kind's count is the larger of one mention's count and the number of mentions brought in by an article or a number ("a flowchart and a bar chart"),
// so "a diagram ... the diagram" stays one. shortcut: wording heuristics like the rest of this record; upgrade when real requests show a miscount.
const NUMBER_WORD = /\b(a|an|one|single|1|two|2|both|pair of|couple of|three|3)\s+(?:[\w-]+\s+){0,2}$/i;
const NUMBERS = { a: 1, an: 1, one: 1, single: 1, 1: 1, two: 2, 2: 2, both: 2, 'pair of': 2, 'couple of': 2, three: 3, 3: 3 };
function asked(words, re) {
  let most = 0, introduced = 0, first = null;
  for (const m of words.matchAll(re)) {
    if (negated(words, m.index)) continue;
    const number = NUMBER_WORD.exec(words.slice(Math.max(0, m.index - 40), m.index));
    const n = number ? NUMBERS[number[1].toLowerCase()] : /s$/i.test(m[1].replace(/ of$/i, '')) ? 2 : 1;
    most = Math.max(most, n); if (number) introduced++; first ??= m;
  }
  return { count: Math.min(3, Math.max(most, introduced)), first };
}
// A table the learner is asking for, not the word in another sense. shortcut: wording heuristics (EX-01/EX-07 plus their variations), not a classifier; an
// unrecognised phrasing simply leaves the visual optional, as it was before this record. Upgrade when real requests show a missed phrasing.
const NOT_A_REQUEST = /\b(periodic table|table salt|table tennis|time ?table|water table|turn(?:ing)? the tables|table of contents|big picture|picture this|in the picture)\b/gi;
const TABLE_CUE = /\b(?:include|add|with|use|using|give|show|make|put|provide|create|in|as|into|and|plus)\b[^.?!\n]{0,40}\btables?\b|\btables?\s+(?:comparing|compares|of|showing|that|with|to|for|listing|summar)|\btabulate\b|\btabular\b|\btruth table\b/i;
const NEGATION = /\b(?:no|not|without|don'?t|do not|never|avoid|skip|exclude|rather than|instead of)\b[^.?!\n]*$/i;
const negated = (text, index) => NEGATION.test(text.slice(Math.max(0, index - 40), index));

// E3: a request to trace a worked case through a flow needs the validated highlightPath, not only a caption (EXP-12-C04).
const TRACE = /\b(trace|follow|walk(?:ing)? (?:me )?through|highlight(?:ing)?|mark the path|show the path)\b/i;
const clip = (text, max = 200) => String(text).replace(/\s+/g, ' ').trim().slice(0, max);
// EXP-13 fix 6b (owner 2026-11-08): a question about how something looks needs a picture even when it names none. "shape" is left out on purpose ("the
// shape of the curve"). The item is implied: it must be on the card (a missing one is the one repair) but it does not fix the mix, so a diagram may join it.
const LOOKS = /\b(?:looks? like|3d|anatomy)\b/i;
// EXP-13 fix 6a: the learner's words say the process repeats, so a branchless flow the author drew is a cycle (learn-artifact.js re-routes it).
export const repeats = text => /\b(?:cycles?|repeat(?:s|ed|ing)?|loops?|again|round|phases|recurring)\b/i.test(String(text ?? ''));
// Item 47: the learner's words are about messages passed between actors, so a last-resort simplified diagram is a sequence (learn-primitives.js simplifiedDiagram).
// shortcut: a word list like repeats; upgrade when real requests show a miss.
export const messaging = text => /\b(?:send|sends|sent|sending|messages?|handshake|exchanges?|exchanged|repl(?:y|ies|ied)|responds?|talks? to)\b/i.test(String(text ?? ''));
// The kind a last-resort simplified diagram takes for these words: cycle (repeat words, the same list as fix 6a), sequence (messages), else flow.
export const fallbackKind = text => (repeats(text) ? 'cycle' : messaging(text) ? 'sequence' : 'flow');

// -> { version, items: [{ id, kind: 'table'|'diagram'|'illustration', diagramKind?, purpose }] } (items may be empty; one item per asked diagram or picture), or { unsupported: 'one line for the learner' }.
export function deriveVisualRequirements(text) {
  const words = String(text ?? '').replace(NOT_A_REQUEST, ' ');
  const items = [];
  const unsupported = UNSUPPORTED.exec(words);
  if (unsupported && !negated(words, unsupported.index)) return { unsupported: `A ${unsupported[1].toLowerCase()} is not a picture Rabbit Hole draws yet, so nothing was made or charged. Ask for a flow, comparison, timeline, sequence, matrix, layers, cycle, tree, bar chart or another table or diagram it draws, or remove that request.` };
  const table = TABLE_CUE.exec(words);
  if (table && !negated(words, table.index + table[0].search(/tables?/i))) items.push({ kind: 'table', purpose: clip(words) });
  const diagrams = asked(words, DIAGRAM_WORD), pictures = asked(words, PICTURE_WORD);
  if (diagrams.count + pictures.count > 3 || pictures.count > 2) return { unsupported: 'A card holds at most three visuals (diagrams and pictures together), at most two of them pictures, so nothing was made or charged. Ask for fewer.' };
  const kind = diagrams.count ? KINDS.find(([re]) => re.test(words))?.[1] : null;
  // The named kind and a trace go with the first diagram; a second asked diagram may be any kind.
  for (let n = 0; n < diagrams.count; n++) items.push({ kind: 'diagram', ...(kind && !n ? { diagramKind: kind } : {}), ...(['flow', 'tree'].includes(kind) && !n && TRACE.test(words) ? { trace: true } : {}), purpose: clip(words) });
  for (let n = 0; n < pictures.count; n++) items.push({ kind: 'illustration', purpose: clip(words) });
  const looks = LOOKS.exec(words);
  if (!diagrams.count && !pictures.count && looks && !negated(words, looks.index)) items.push({ kind: 'illustration', implied: true, purpose: clip(words) });
  return { version: VISUAL_REQUIREMENTS_VERSION, items: items.map((item, i) => ({ id: `vr-${i + 1}`, ...item })) };
}
// The text a requirement is read from: a direct question's own words, or a Tutor step's accepted learner instruction (the planner's own title and goal are not the learner's request).
export const requirementText = ({ args, original, revisions } = {}) => [args, original, ...(revisions || []).map(r => (typeof r === 'string' ? r : r?.text))].filter(Boolean).join('\n');

// EXP-13 fix 5c: the visual mix the learner's words fix, { diagram, illustration } counts, or null when they name no diagram or picture (the author then chooses 1-3).
export const requiredMix = requirements => {
  const items = requirements?.items ?? [], n = kind => items.filter(i => i.kind === kind && !i.implied).length;
  const kind = items.find(i => i.kind === 'diagram' && i.diagramKind)?.diagramKind;
  return n('diagram') || n('illustration') ? { diagram: n('diagram'), illustration: n('illustration'), ...(kind ? { diagramKind: kind } : {}) } : null;
};

// The one wording a check failure uses, so the repair and the logs read the same reason: required_visual_missing | required_visual_invalid | explanation_visual_mix.
export function requiredVisualProblem(block, requirements) {
  const items = requirements?.items ?? [];
  if (!items.length) return null;
  const found = [block?.body, ...(block?.more || []).map(s => s?.text)].map(markdownVisuals);
  const of = { table: found.flatMap(f => f.tables), diagram: found.flatMap(f => f.diagrams), illustration: markdownIllustrations(block?.body) };
  const problems = [];
  for (const kind of ['table', 'diagram', 'illustration']) {
    const wanted = items.filter(i => i.kind === kind);
    if (!wanted.length) continue;
    const have = of[kind].filter(v => v.ok);
    const broken = of[kind].filter(v => !v.ok);
    for (const [n, item] of wanted.entries()) {
      const mine = have[n];
      if (!mine) problems.push(broken.length
        ? `required_visual_invalid: the learner asked for a ${kind} (${item.id}) and the card's ${kind} is not complete${broken[0].problem ? ` (${broken[0].problem})` : ''}; write it again as a complete ${kind === 'table' ? 'pipe table with leading and trailing pipes, a header row, a separator row and the same number of cells in every row' : kind === 'diagram' ? 'diagram spec that the diagram library accepts' : 'picture with p, a and c'}.`
        : `required_visual_missing: the learner asked for ${kind === 'illustration' ? 'an' : 'a'} ${kind} (${item.id}: "${item.purpose.slice(0, 120)}") and the card has ${n ? `only ${n}` : 'none'}; add it ${kind === 'table' ? 'in the card body' : 'to visuals, placed by its marker'}, shortening the prose to stay inside the budget.`);
      else if (kind === 'diagram' && item.diagramKind && mine.kind !== item.diagramKind) problems.push(`required_visual_invalid: the learner asked for a ${item.diagramKind} diagram (${item.id}) and the card's diagram is a ${mine.kind}; use the ${item.diagramKind} kind.`);
      else if (kind === 'diagram' && item.trace && ['flow', 'tree'].includes(mine.kind) && !mine.highlightPath) problems.push(`required_visual_invalid: the learner asked to trace a worked case through the ${mine.kind} (${item.id}); give it a highlightPath, the node ids of the route in order along its edges from the root or start node.`);
      else if (kind === 'diagram' && ['flow', 'tree'].includes(mine.kind) && /\byes\b/i.test(item.purpose) && /\bno\b/i.test(item.purpose)) {
        const labels = (mine.edgeLabels || []).map(l => String(l).trim().toLowerCase());
        if (!labels.includes('yes') || !labels.includes('no') || (mine.kind === 'flow' && (!mine.hasDecision || !mine.hasOutcome))) problems.push(`required_visual_invalid: the learner described Yes and No branches (${item.id}); the ${mine.kind} needs branches labelled Yes and No${mine.kind === 'flow' ? ', a decision node and an outcome node' : ' using child edgeLabel values'}.`);
      }
    }
  }
  // Visuals beyond the mix are dropped by the server before this check (learn-primitives.js settleExplanationBody); a caller that did not settle is told here.
  const mix = requiredMix(requirements), had = { diagram: of.diagram.length, illustration: of.illustration.length };
  if (!problems.length && mix && (had.diagram !== mix.diagram || had.illustration !== mix.illustration)) problems.push(`explanation_visual_mix: the learner asked for ${mix.diagram} diagram(s) and ${mix.illustration} picture(s); the card has ${had.diagram} and ${had.illustration}; give exactly that mix.`);
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
