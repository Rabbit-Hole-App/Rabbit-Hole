// A link kept as canvas context without a card (Start a rabbit hole, docs/features/start-sources.md): the link is resolved here
// into a small text note, which learn-context-docs.js stores as an ordinary context document. arXiv gives the title, authors and
// abstract; Wikipedia the article's introduction; a YouTube link and any other page give the name and address only, said in the
// note itself so the model never presents it as having read the page. No page is fetched, so there is nothing to guard against.
import { readArxivPaper } from './arxiv.js';
import { readWikipedia } from './learn-wiki.js';
import { classifyLink } from '../../web/src/link-kind.js';

const NOTE_LIMIT = 24000;
export async function linkNote(text, { readPaper = readArxivPaper, readWiki = readWikipedia } = {}) {
  const link = classifyLink(text);
  if (!link.ok) throw new Error(link.error);
  if (link.type === 'arxiv') {
    const paper = await readPaper(link.id);
    const lines = [`arXiv paper: ${paper.title}`, ...(paper.authors?.length ? [`Authors: ${paper.authors.join(', ')}`] : []), `Link: ${link.url}`, '', 'Abstract:', paper.abstract || '(no abstract)'];
    return { name: `${paper.title} (arXiv ${link.id})`, link, text: lines.join('\n').slice(0, NOTE_LIMIT) };
  }
  if (link.type === 'wikipedia') {
    const article = await readWiki(link.url);
    return { name: `${article.displayTitle || article.title} (Wikipedia)`, link, text: [`Wikipedia article: ${article.displayTitle || article.title}`, `Link: ${link.url}`, '', 'Introduction:', article.text].join('\n').slice(0, NOTE_LIMIT) };
  }
  const name = link.type === 'youtube' ? `YouTube video ${link.id}` : link.label;
  const kind = link.type === 'youtube' ? 'YouTube video' : 'Web page';
  return { name, link, text: [`${kind}: ${name}`, `Link: ${link.url}`, '', 'Only the name and address of this link are kept here. The page itself has not been read; ask the learner to select text or paste it if you need its content.'].join('\n') };
}
