// What a Learn ask attaches besides the learner's words: the optional outline, paper,
// image, Wikipedia and video fields. Validated before anything is read, then at most one
// source is read for the model (one reader holds one thing). Used by apiAsk (index.js).
import { arxivId, paperDocument } from './arxiv.js';
import { paperSelectionImage } from './learn-preview-review.js';
import { isUploadedPaperId, paperIdentity, PAPER_PAGE_LIMIT } from './learn-paper.js';
import { isUploadedMediaId } from './learn-media.js';
import { validateOutline, renderOutline } from './learn-context.js';
import { wikiTitle } from './learn-wiki.js';
import { validateVideoContext } from './learn-youtube.js';
import { PAPER_CONTEXT_INSTRUCTION, IMAGE_CONTEXT_INSTRUCTION, WIKI_CONTEXT_INSTRUCTION, VIDEO_CONTEXT_INSTRUCTION, OUTLINE_CONTEXT_HEADER } from './agents/learn-chat.js';

// Throws the 400 message for the first malformed field; returns the validated video context.
export function validateLearnContext(body, conversation) {
  if (body.outline !== undefined) {
    try {
      if (conversation !== 'learn') throw new Error('Outline is a Learn idea');
      validateOutline(body.outline);
    } catch { throw new Error('Invalid lesson outline'); }
  }
  if (body.paper_context !== undefined) {
    try {
      // A learner's own upload is a paper too; only the source of the bytes differs.
      if (!isUploadedPaperId(body.paper_context?.id)) arxivId(body.paper_context?.id);
      if (conversation !== 'learn' || !Number.isInteger(body.paper_context?.page) || body.paper_context.page < 1 || body.paper_context.page > PAPER_PAGE_LIMIT) throw new Error('Invalid paper');
      if (body.paper_context.selection !== undefined) paperSelectionImage(body.paper_context.selection);
    } catch { throw new Error('Invalid Learn paper context'); }
  }
  // An image the learner dropped on the canvas. Only the id travels; the bytes
  // come from this learner's own R2 copy, stored at drop time.
  if (body.image_context !== undefined) {
    if (conversation !== 'learn' || !isUploadedMediaId(body.image_context?.id)) throw new Error('Invalid Learn image context');
  }
  // What the learner is reading on a wiki card, the way paper_context carries
  // the page: the section is the unit, and the selection is their own words.
  if (body.wiki_context !== undefined) {
    try {
      if (conversation !== 'learn') throw new Error('Wikipedia is a Learn idea');
      wikiTitle(body.wiki_context?.title);
      if (!Number.isInteger(body.wiki_context?.section) || body.wiki_context.section < 0 || body.wiki_context.section > 500) throw new Error('Invalid section');
      if (body.wiki_context.selection !== undefined && (typeof body.wiki_context.selection !== 'string' || body.wiki_context.selection.length > 2000)) throw new Error('Invalid selection');
    } catch { throw new Error('Invalid Learn Wikipedia context'); }
  }
  // What the learner is watching. No transcript in phase 1, so this is the
  // window on screen, not evidence - the instruction below says as much.
  let videoContext = null;
  if (body.video_context !== undefined) {
    try {
      if (conversation !== 'learn') throw new Error('Video is a Learn idea');
      videoContext = validateVideoContext(body.video_context);
    } catch { throw new Error('Invalid Learn video context'); }
  }
  return videoContext;
}

// The lesson's own table of contents, so a question about its structure is
// answered from the outline rather than inferred from the cards.
export function appendOutline(context, outline) {
  return outline?.length ? `${context}

${OUTLINE_CONTEXT_HEADER}
${renderOutline(outline)}` : context;
}

// The one source that rides, as { <kind>: ..., instruction } for the caller to merge beside its
// own context, or null. Blocks go to extraBlocks; a paper read joins papers, an article articles,
// the watched video foundVideos. Throws the 502 message when the source cannot be read.
// `read` carries the four readers so tests can stand in for the network.
export async function readLearnSource(env, body, app, { extraBlocks, papers, articles, foundVideos, videoContext }, read) {
  // One context at a time, and a reader outranks a card: paper, then image, then article,
  // then the video card the learner is watching.
  let source = null;
  if (body.paper_context) {
    try {
      // arXiv hands the model a public URL; an upload is private, so its bytes
      // ride along base64 the way a chat attachment does. Everything downstream
      // - the page, the region, the instruction - is identical either way.
      const paper = isUploadedPaperId(body.paper_context.id)
        ? await read.uploadedPaperAsDocument(env, paperIdentity(app), body.paper_context.id)
        : await read.readArxivPaper(body.paper_context.id);
      extraBlocks.push(paper.document || paperDocument(paper));
      if (body.paper_context.selection) extraBlocks.push(paperSelectionImage(body.paper_context.selection));
      papers.push({ id: paper.id, title: paper.title, pdfUrl: paper.pdfUrl ?? null });
      source = { paper: { id: paper.id, title: paper.title, page: body.paper_context.page, ...(body.paper_context.selection ? { selectedRegion: body.paper_context.selection.region } : {}) }, instruction: PAPER_CONTEXT_INSTRUCTION };
    } catch (error) { throw new Error('Could not read the referenced paper. Try again.'); }
  }
  // A dropped image rides the way an uploaded paper does: bytes as a block,
  // a line of context naming it. A paper outranks it - one reader, one thing.
  if (body.image_context && !body.paper_context) {
    try {
      const media = await read.uploadedMediaAsImage(env, paperIdentity(app), body.image_context.id);
      extraBlocks.push(media.image);
      source = { image: { title: media.title }, instruction: IMAGE_CONTEXT_INSTRUCTION };
    } catch (error) { throw new Error('Could not read that image. Drop it again.'); }
  }
  if (body.wiki_context && !body.paper_context && !body.image_context) {
    try {
      // The section comes from the rendered HTML, which carries ids the contents
      // list does not always name. Falling back to the lead answers the question;
      // failing the whole turn over a heading loses it.
      const article = await read.readWikipedia(body.wiki_context.title, body.wiki_context.section)
        .catch(() => read.readWikipedia(body.wiki_context.title, 0));
      articles?.set(article.title, article);
      source = {
        article: { title: article.displayTitle, section: article.sectionTitle, url: article.url, text: article.text, sections: article.toc.map(entry => entry.title), ...(body.wiki_context.selection ? { selected: body.wiki_context.selection } : {}) },
        instruction: WIKI_CONTEXT_INSTRUCTION,
      };
    } catch (error) { throw new Error('Could not read that Wikipedia article. Try again.'); }
  }
  if (videoContext) {
    // The card on screen counts as found, so the tutor can re-show it - but
    // with no passages read it is captionless as far as windows go.
    foundVideos.set(videoContext.videoId, { title: videoContext.title, hasCaptions: false, duration: null });
  }
  if (videoContext && !body.paper_context && !body.image_context && !body.wiki_context) {
    const seconds = value => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
    source = {
      video: { title: videoContext.title, url: `https://www.youtube.com/watch?v=${videoContext.videoId}${videoContext.start ? `&t=${videoContext.start}s` : ''}`, window: `${seconds(videoContext.start)}${videoContext.end != null ? ` to ${seconds(videoContext.end)}` : ''}` },
      instruction: VIDEO_CONTEXT_INSTRUCTION,
    };
  }
  return source;
}
