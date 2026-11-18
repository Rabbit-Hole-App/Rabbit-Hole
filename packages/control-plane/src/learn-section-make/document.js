// Make, the document card: a reading for a beat, or the section notes (learn-section-make-spec.md §4; DECISIONS G, J; CONTRACT `perform.op: 'doc'`).
// The Tutor writes Markdown; the browser parses it into a doc card (newDocBlock + tryParseMarkdownToBlocks). Checked here (C §4c): only the doc card's block types,
// anything else kept as a paragraph with the fallback recorded (never dropped); word caps (reading 600, notes 300); no file names, paths or flags in prose (a path only
// inside a code block, which is a one to three line excerpt); every display equation has a sentence in words beside it; headings only in a reading.
import { PROSE_PATH } from '../learn-section-brief.js';

export const READING_WORDS = 600, NOTES_WORDS = 300, CODE_BLOCK_LINES = 3;
export const fields = {
  markdown: { type: 'string', description: 'The reading or the section notes, in Markdown, from the DOCUMENT template.' },
};
export const required = ['markdown'];
export const tools = [];

// ponytail: a line-level classifier, not a Markdown parser: fenced code and $$ blocks are tracked, every other line is judged on its own. Upgrade to the editor's
// own parser (tryParseMarkdownToBlocks runs only in the browser) if a fallback turns out wrong.
const KNOWN = [['heading', /^#{1,6}\s+\S/], ['quote', /^>\s?/], ['check', /^\s*[-*+]\s+\[[ xX]\]\s/], ['bullet', /^\s*[-*+]\s+\S/], ['numbered', /^\s*\d+[.)]\s+\S/], ['table', /^\s*\|.*\|\s*$/], ['divider', /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/]];
const UNKNOWN = [
  ['image', /^\s*!\[([^\]]*)\]\([^)]*\)\s*$/, m => m[1] || 'image'],
  ['html', /^\s*<\/?[a-zA-Z][^>]*>.*$/, m => m[0].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()],
  ['footnote', /^\s*\[\^[^\]]+\]:\s*(.*)$/, m => m[1]],
  ['setext', /^\s*={2,}\s*$/, () => null],
];
const FENCE = /^\s*```/, MATH = /^\s*\$\$/;

// -> { lines: [{ type, text }], fallbacks: [{ line, type }], errors }
export function classifyMarkdown(markdown) {
  const lines = String(markdown).replace(/\r\n/g, '\n').split('\n'), out = [], fallbacks = [], errors = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE.test(line) || MATH.test(line)) {
      const type = FENCE.test(line) ? 'codeBlock' : 'math', close = type === 'codeBlock' ? FENCE : /\$\$\s*$/;
      const oneLine = type === 'math' && /^\s*\$\$.+\$\$\s*$/.test(line);
      let j = i;
      if (!oneLine) { j = i + 1; while (j < lines.length && !close.test(lines[j])) j += 1; }
      if (j >= lines.length) { errors.push(`line ${i + 1}: a ${type === 'codeBlock' ? 'code block' : 'display equation'} is not closed`); j = lines.length - 1; }
      out.push({ type, text: lines.slice(i, j + 1).join('\n'), body: oneLine ? 1 : j - i - 1 });
      i = j;
      continue;
    }
    if (!line.trim()) { out.push({ type: 'blank', text: '' }); continue; }
    const known = KNOWN.find(([, re]) => re.test(line));
    if (known) { out.push({ type: known[0], text: line }); continue; }
    const unknown = UNKNOWN.map(([type, re, keep]) => { const m = re.exec(line); return m ? { type, kept: keep(m) } : null; }).find(Boolean);
    if (unknown) {
      fallbacks.push({ line: i + 1, type: unknown.type });
      if (unknown.kept) out.push({ type: 'paragraph', text: unknown.kept, fallback: unknown.type });
      else out.push({ type: 'blank', text: '' }); // a setext underline: its heading text above stays a paragraph
      continue;
    }
    out.push({ type: 'paragraph', text: line });
  }
  return { lines: out, fallbacks, errors };
}

const words = text => (String(text).match(/\S+/g) || []).length;
export async function validate(input, ctx) {
  const markdown = typeof input?.markdown === 'string' ? input.markdown.trim() : '';
  const role = ctx.item?.role === 'notes' || ctx.item?.id === 'notes' ? 'notes' : 'reading';
  if (!markdown) return { error: `markdown is the ${role}; it is empty` };
  const { lines, fallbacks, errors } = classifyMarkdown(markdown);
  const prose = lines.filter(l => l.type !== 'codeBlock' && l.type !== 'math' && l.type !== 'blank');
  const count = lines.filter(l => l.type !== 'codeBlock').reduce((n, l) => n + words(l.text), 0), cap = role === 'notes' ? NOTES_WORDS : READING_WORDS;
  if (count > cap) errors.push(`${role === 'notes' ? 'the notes are' : 'a reading is'} at most ${cap} words; this has ${count}`);
  if (prose.some(l => PROSE_PATH.test(l.text.replace(/\$[^$]*\$/g, '')))) errors.push('no file names, paths or flags in prose: a path goes only inside a one to three line code block with its line reference');
  if (lines.some(l => l.type === 'codeBlock' && (l.body < 1 || l.body > CODE_BLOCK_LINES))) errors.push(`a code block is a one to ${CODE_BLOCK_LINES} line excerpt with its line reference`);
  if (role === 'notes' && lines.some(l => l.type === 'heading')) errors.push('headings only in a reading: the notes are paragraphs and lists');
  const filled = lines.filter(l => l.type !== 'blank');
  filled.forEach((l, i) => { if (l.type === 'math' && filled[i - 1]?.type !== 'paragraph' && filled[i + 1]?.type !== 'paragraph') errors.push('every display equation has a sentence in words next to it'); });
  if (errors.length) return { error: [...new Set(errors)].join('; ') };
  const normalized = lines.map(l => l.text).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { perform: { op: 'doc', markdown: normalized }, record: { role, words: count, fallbacks } };
}
