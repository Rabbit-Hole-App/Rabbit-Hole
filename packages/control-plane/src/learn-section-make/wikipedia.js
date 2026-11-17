// Learn sections C §7: a Wikipedia item, a background definition: one section of an article read this turn, the defining sentences quoted.
// A quote that is not in the section makes the card without a highlight and records highlight 'not_found' (C §7e), never silently.
import { wikiTitle } from '../learn-wiki.js';
import { flat } from './arxiv.js';

const MAX_CARDS = 2, MAX_QUOTE_WORDS = 60;

export const fields = {
  title: { type: 'string', maxLength: 300, description: 'The article, as read this turn.' },
  section: { type: 'string', maxLength: 200, description: 'The section heading as read (Introduction for the opening).' },
  quote: { type: 'string', maxLength: 600, description: 'The 1-3 defining sentences, verbatim, at most 60 words.' },
};
export const required = ['title', 'section', 'quote'];
export const tools = ['search_wikipedia', 'read_wikipedia'];

// ctx.turn.wiki: { [title]: { sections } }, sections being read_wikipedia results ({ section, sectionTitle, text }) or { [heading]: text }.
const sectionsOf = entry => {
  const sections = entry?.sections ?? [];
  return Array.isArray(sections) ? sections : Object.entries(sections).map(([heading, value]) => (typeof value === 'string' ? { sectionTitle: heading, text: value } : { sectionTitle: heading, ...value }));
};
const key = title => { try { return wikiTitle(title).title; } catch { return null; } };

export async function validate(input, ctx) {
  if (ctx.beat?.anchors?.length) return { error: 'A Wikipedia card is for a background beat; this beat rests on the source, which we explain ourselves' };
  if ((ctx.earlier ?? []).filter(e => e.perform?.op === 'wiki').length >= MAX_CARDS) return { error: `At most ${MAX_CARDS} Wikipedia cards in a section` };
  const title = key(input.title);
  const article = Object.entries(ctx.turn?.wiki ?? {}).find(([t]) => key(t) === title)?.[1];
  if (!title || !article) return { error: `Read ${input.title} with read_wikipedia in this turn before pointing at it` };
  const wanted = String(input.section ?? '').trim().toLowerCase();
  const read = sectionsOf(article).find(s => String(s.sectionTitle ?? 'Introduction').toLowerCase() === wanted || String(s.section) === wanted);
  if (!read) return { error: `You did not read the section ${input.section} of ${input.title}; read it first, or name a section you read` };
  const quote = String(input.quote ?? '').trim(), words = quote.split(/\s+/).filter(Boolean).length;
  if (!words || words > MAX_QUOTE_WORDS) return { error: `Quote the 1-3 defining sentences verbatim, at most ${MAX_QUOTE_WORDS} words` };
  const found = flat(read.text).includes(flat(quote));
  return {
    perform: { op: 'wiki', title, section: Number.isInteger(read.section) ? read.section : 0, sectionTitle: read.sectionTitle ?? 'Introduction', quote: found ? quote : null },
    record: { highlight: found ? 'found' : 'not_found' },
  };
}
