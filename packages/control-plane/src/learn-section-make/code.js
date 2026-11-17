// Learn sections C §2: a code item. `source: 'repository'` is the source's own lines as repo-code cards (no model call for the card);
// `source: 'example'` is the typed /code command made with madeBy 'learn-section' (learn-primitives.js primitiveFor: 100 lines / 4000 characters).
import { symbolEnd } from '../learn-codebase-source-map.js';
import { SOURCE_MODULES_LINE, importsOf } from '../learn-primitives.js';

const MAX_CARD_LINES = 200, MAX_LABEL_WORDS = 6, MAX_REQUEST = 1000; // 1000: the artifact route's args cap (learn-artifact.js artifactFetch)
const int = { type: 'integer', minimum: 1 };

export const fields = {
  cards: {
    type: 'array', minItems: 1, maxItems: 6,
    description: 'For source repository: one card per anchor of the beat, in anchor order.',
    items: {
      type: 'object', additionalProperties: false, required: ['anchor', 'label'], properties: {
        anchor: { type: 'string', maxLength: 300, description: 'One of the beat\'s anchors, exactly as given.' },
        label: { type: 'string', maxLength: 60, description: 'The beat\'s idea in at most 6 words.' },
        ranges: { type: 'array', maxItems: 4, description: 'Lines to highlight; omitted, the anchor\'s own lines.', items: { type: 'object', additionalProperties: false, required: ['start', 'end'], properties: { start: int, end: int } } },
      },
    },
  },
  request: { type: 'string', maxLength: MAX_REQUEST, description: 'For source example: the /code request, from the template.' },
};
export const required = [];
export const tools = ['read_source', 'search_code'];

// Copied from learn-code-explain.js (enclosing, widen; not exported there): the innermost def or class holding a line, found by its keyword and the layout.
const HEADER = /^\s*(?:(?:async\s+)?def|class)\s+\w|^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/;
function enclosing(lines, line) {
  for (let l = Math.min(line, lines.length); l >= 1; l--) {
    if (!HEADER.test(lines[l - 1])) continue;
    const end = symbolEnd(lines, l);
    if (end >= line) return [l, end];
  }
  return null;
}
const widen = (lines, start, end) => {
  const a = enclosing(lines, start), b = enclosing(lines, end);
  return [Math.min(start, a?.[0] ?? start, b?.[0] ?? start), Math.max(end, a?.[1] ?? end, b?.[1] ?? end)];
};

// "path", "path:12" or "path:12-30" (brief spec A §4 anchors).
const parseAnchor = anchor => { const m = String(anchor).match(/^(.+?)(?::(\d+)(?:-(\d+))?)?$/); return m ? { path: m[1], start: m[2] ? Number(m[2]) : null, end: m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : null } : null; };

// Top-level Python module names of the source: "train.py" -> train, "pkg/x.py" -> pkg.
export const sourceModules = snapshot => [...new Set(Object.keys(snapshot?.files ?? {}).filter(p => p.endsWith('.py')).map(p => p.split('/')[0].replace(/\.py$/, '')))].sort();

function repositoryCards(input, ctx) {
  const anchors = ctx.beat?.anchors ?? [];
  if (!Array.isArray(input.cards) || !input.cards.length) return { error: `Give one card per anchor of the beat: ${anchors.join(', ')}` };
  const cards = [];
  for (const card of input.cards) {
    if (!anchors.includes(card.anchor)) return { error: `${card.anchor} is not one of this beat's anchors (${anchors.join(', ')})` };
    const at = parseAnchor(card.anchor), lines = ctx.snapshot?.files?.[at?.path]?.split('\n');
    if (!lines) return { error: `${card.anchor} is not a file at the pinned commit` };
    const start = at.start ?? 1, end = Math.min(at.end ?? lines.length, lines.length);
    if (start > lines.length || end < start) return { error: `${card.anchor} lies outside the file's ${lines.length} lines` };
    let [s, e] = widen(lines, start, end);
    if (e - s + 1 > MAX_CARD_LINES) [s, e] = [start, end]; // the enclosing symbol is too long: the anchor's own lines
    if (e - s + 1 > MAX_CARD_LINES) return { error: `${card.anchor} is ${e - s + 1} lines; a card holds at most ${MAX_CARD_LINES}: split the anchor` };
    const ranges = card.ranges?.length ? card.ranges : [{ start, end }];
    const out = ranges.find(r => !Number.isInteger(r.start) || !Number.isInteger(r.end) || r.end < r.start || r.start < s || r.end > e);
    if (out) return { error: `The highlight ${out.start}-${out.end} lies outside the card's lines ${s}-${e}` };
    const label = String(card.label ?? '').trim();
    if (!label || label.split(/\s+/).length > MAX_LABEL_WORDS) return { error: `Label each card with the beat's idea in at most ${MAX_LABEL_WORDS} words` };
    const nodeId = ctx.snapshot?.graph?.nodes?.find(n => n.path === at.path && n.line === s)?.id;
    cards.push({ path: at.path, start: s, end: e, ...(nodeId ? { nodeId } : {}), label, ranges: ranges.map((r, i) => ({ id: `r${i + 1}`, start: r.start, end: r.end })) });
  }
  return { perform: { op: 'codeCards', cards } };
}

function example(input, ctx) {
  const request = String(input.request ?? '').trim();
  if (!request) return { error: 'Write the /code request for this example' };
  if (request.length > MAX_REQUEST) return { error: `Keep the /code request under ${MAX_REQUEST} characters` };
  const modules = sourceModules(ctx.snapshot);
  const named = importsOf(request).find(name => modules.includes(name));
  if (named) return { error: `The example must import nothing from the source (${named}): standard library and numpy only` };
  // The answer's own imports and output are checked by the code_sample primitive (learn-primitives.js SECTION), which reads this context line.
  const line = modules.length ? `${SOURCE_MODULES_LINE}${modules.join(', ')}`.slice(0, 4000) : null;
  return { perform: { op: 'slash', line: `/code ${request}`, madeBy: 'learn-section', ...(line ? { context: line } : {}) } };
}

export async function validate(input, ctx) {
  const source = ctx.item?.source;
  if (source === 'repository') return repositoryCards(input, ctx);
  if (source === 'example') return example(input, ctx);
  return { error: 'A code item needs source repository or example' };
}
