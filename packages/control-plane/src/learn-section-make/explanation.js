// Make, the written explanation (learn-section-make-spec.md §1 as DECISIONS M reads it; Reviewer 2026-11-16 01:00; CONTRACT "Make: one module per tool").
// The browser runs `/explain <prompt>` exactly as a typed /explain, with the learner's depth and the source lines as `context`; the Tutor writes only the prompt.
// context: per anchor one header line `<path>:<start>-<end> @ <commit>` and the numbered lines read here at the pinned commit; for an item made for an earlier card's text
// (item.after), that passage first, under a header naming the card's kind and id. At most 300 lines and 8000 characters (the artifact route refuses a longer context):
// lines are cut from the end of the last block first, every header kept, the cut recorded. The prompt itself stays free of paths.
import { codeNameError } from '../learn-section-brief.js';
import { validDepth } from '../chat-depth.js';

export const PROMPT_MAX = 600, CONTEXT_LINES = 300, CONTEXT_CHARS = 8000;
export const fields = {
  prompt: { type: 'string', maxLength: PROMPT_MAX, description: 'The explanation request from the EXPLANATION template: one question at most, at most 600 characters, no file names, paths or flags; a code name only in backticks, as the source lines spell it.' },
};
export const required = ['prompt'];
export const tools = [];

const anchorOf = text => { const m = /^(.+?)(?::(\d+)(?:-(\d+))?)?$/.exec(String(text || '').trim()); return m ? { path: m[1], start: m[2] ? Number(m[2]) : null, end: m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : null } : null; };

// The earlier card's text, as the explanation's example (C §4, §6, §7, §10 pairings).
function pairBlock(earlier) {
  const p = earlier.perform || {}, card = earlier.cardId || 'not placed yet';
  const of = (kind, locator, lines) => ({ header: `${kind} ${locator} @ card ${card} (item ${earlier.itemId})`, lines });
  if (p.op === 'paper') return of('paper', p.id, (p.pages || []).map(page => `p${page.page}: ${page.quote || ''}`));
  if (p.op === 'wiki') return of('wiki', `${p.title} § ${p.section}`, String(p.quote || '').split('\n'));
  if (p.op === 'webpage') return of('webpage', p.url, (p.quotes || []).map(String));
  if (p.op === 'doc') return of('doc', earlier.itemId, String(p.markdown || '').split('\n'));
  return of(earlier.command, earlier.itemId, [JSON.stringify(p)]);
}

// -> { context, cutLines, blocks }
export function buildContext(blocks) {
  const total = () => blocks.reduce((n, b) => n + b.lines.length, 0);
  const text = () => blocks.map(b => [b.header, ...b.lines].join('\n')).join('\n\n');
  let cutLines = 0;
  const cutOne = () => { const b = [...blocks].reverse().find(x => x.lines.length); if (!b) return false; b.lines.pop(); cutLines += 1; return true; };
  while (total() > CONTEXT_LINES && cutOne());
  while (text().length > CONTEXT_CHARS && cutOne());
  return { context: text().slice(0, CONTEXT_CHARS), cutLines, blocks: blocks.map(b => ({ header: b.header, lines: b.lines.length })) };
}

const NUMBER = /\d+(?:\.\d+)?/g;
export async function validate(input, ctx) {
  const prompt = typeof input?.prompt === 'string' ? input.prompt.replace(/[ \t]+/g, ' ').trim() : '';
  if (!prompt) return { error: 'prompt is the explanation request; it is empty' };
  if (prompt.length > PROMPT_MAX) return { error: `prompt is at most ${PROMPT_MAX} characters; it has ${prompt.length}` };
  if ((prompt.match(/\?/g) || []).length > 1) return { error: 'prompt asks one question at most' };
  const blocks = [];
  if (ctx.item.after) {
    const earlier = (ctx.earlier || []).find(e => e.itemId === ctx.item.after);
    if (!earlier) return { error: `the earlier item ${ctx.item.after} this explanation is made for was not made` };
    blocks.push({ ...pairBlock(earlier), pair: true });
  }
  for (const anchor of ctx.beat?.anchors || []) {
    const a = anchorOf(anchor), read = a && ctx.readSource(a.path, a.start ?? 1, a.end ?? a.start ?? Infinity);
    if (!read) continue;
    blocks.push({ header: `${read.path}:${read.start}-${read.end} @ ${ctx.commit}`, lines: read.lines.map((line, i) => `${read.start + i}: ${line}`) });
  }
  const anchored = blocks.filter(b => !b.pair).map(b => b.lines.join('\n')).join('\n');
  const wrong = codeNameError(prompt, anchored);
  if (wrong) return { error: `prompt ${wrong}: the source lines travel with it separately` };
  const allowed = new Set(`${blocks.map(b => b.lines.join('\n')).join('\n')}\n${JSON.stringify(ctx.brief)}\n${ctx.item.request}\n${ctx.record || ''}`.match(NUMBER) || []);
  const invented = (prompt.match(NUMBER) || []).filter(n => !allowed.has(n));
  if (invented.length) return { error: `prompt uses ${invented.join(', ')}, which the source lines, the brief and the recorded run do not: use only their numbers` };
  const depth = ctx.beat?.background ? 'brief' : validDepth(ctx.depth) || 'balanced';
  const built = buildContext(blocks);
  return { perform: { op: 'slash', line: `/explain ${prompt}`, depth, ...(built.context ? { context: built.context } : {}) }, record: { depth, contextChars: built.context.length, cutLines: built.cutLines, blocks: built.blocks } };
}
