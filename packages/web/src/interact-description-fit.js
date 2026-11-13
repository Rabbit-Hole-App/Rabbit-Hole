import { contentHash } from './interact-plan.js';

// INT-06-C17 (docs/features/interact.md): does the card description render in 2 to 4 lines? Character count is no substitute, so the copy is
// measured with the card's own text style at each supported width and the result is a DescriptionFitSchema receipt (interact-plan.js) bound
// to the exact copy (descriptionHash) and the style version. descriptionFitProblems(plan, receipt) judges it (2 to 4 at every width).
//
// The one style the card draws the description with (InteractSupportPanels.jsx imports it, so the measured shell and the card cannot drift):
export const DESCRIPTION_STYLE = Object.freeze({
  className: 'shrink-0 text-sm leading-snug text-ink-2', // 14 px, line-height 1.375
  fontPx: 14,
  lineHeightPx: 19.25,
  insetPx: 34, // the card's px-4 padding both sides (32) plus its 1 px border both sides (2): text column = card width - insetPx
  focusMeasurePx: 760, // the description keeps a bounded column in wide Focus (focus-host.js READING_MAX), never one long line
});
// A card 320 px wide (the narrowest layout, card-layout.js FULL_WIDTH.baseline), 440 px (the compact card, LearningBlocks) and normal Focus.
export const DESCRIPTION_WIDTHS = Object.freeze([320, 440, DESCRIPTION_STYLE.focusMeasurePx + DESCRIPTION_STYLE.insetPx]);
export const DESCRIPTION_LINES = Object.freeze({ min: 2, max: 4 });
// 'measured' receipts come from the real styles in a real layout (domLineCounter, run by the render service); 'estimate' receipts come from
// the pure counter below and exist for tests and offline fixtures. A design is publishable only on a measured receipt.
export const STYLE_VERSION = 'card-description-v1';
export const isMeasured = receipt => receipt?.styleVersion === `${STYLE_VERSION}:measured`;

export const columnWidth = cardWidth => Math.min(DESCRIPTION_STYLE.focusMeasurePx, cardWidth - DESCRIPTION_STYLE.insetPx);

// ---- the pure counter: greedy word wrap over per-glyph advances (em) of the card's sans face. Deterministic, no DOM. -------------------
// shortcut: bucketed average advances, a few percent off the real face; the render service's measured receipt is the authority, this only
// makes offline fixtures and unit tests repeatable. Upgrade by loading real advance tables, never by loosening the 2 to 4 rule.
const NARROW = new Set("ijl.,:;'|!()[]/");
const WIDE = new Set('mwMW@%');
const advance = char => (char === ' ' ? 0.28 : NARROW.has(char) ? 0.3 : WIDE.has(char) ? 0.88 : char === '-' ? 0.36 : /[A-Z]/.test(char) ? 0.68 : /[0-9]/.test(char) ? 0.62 : /[frt]/.test(char) ? 0.4 : 0.56);
const wordWidth = (word, fontPx) => [...word].reduce((sum, char) => sum + advance(char), 0) * fontPx;
// One line of text at fontPx, from the same advance tables (the frame layout check measures labels with it).
export const textWidthPx = (text, fontPx) => wordWidth(String(text), fontPx);

export function estimateLines(text, columnPx, style = DESCRIPTION_STYLE) {
  const space = advance(' ') * style.fontPx;
  let lines = 1, used = 0;
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const width = wordWidth(word, style.fontPx);
    // A word longer than the column breaks across lines (overflow-wrap), as the browser breaks an unbroken run.
    if (width > columnPx) { if (used > 0) lines += 1; const extra = Math.ceil(width / columnPx) - 1; lines += extra; used = width - extra * columnPx; continue; }
    if (used === 0) used = width;
    else if (used + space + width <= columnPx) used += space + width;
    else { lines += 1; used = width; }
  }
  return lines;
}

// ---- the real counter: the card's own class in a hidden element of the real column width; lines = height / line-height. --------------
// For the trusted render service / a browser page, after fonts load. document is injected so nothing here touches a global.
export function domLineCounter(document, style = DESCRIPTION_STYLE) {
  return (text, width) => {
    const probe = document.createElement('p');
    probe.className = style.className;
    probe.textContent = text;
    Object.assign(probe.style, { position: 'absolute', visibility: 'hidden', pointerEvents: 'none', width: `${width}px`, margin: '0' });
    document.body.append(probe);
    const lines = Math.round(probe.getBoundingClientRect().height / style.lineHeightPx);
    probe.remove();
    return lines;
  };
}

// The injected interface. counter(text, columnPx) -> lines (sync or async). Default: the pure estimate.
// plan: any object with cardDescription. -> DescriptionFitSchema receipt (the lines are reported as counted, even when out of range;
// descriptionFitProblems says which widths fail).
// The description may carry the written card's inline math ($...$, rendered by the card's own MdInline). The estimate counts what is DRAWN: the delimiters go and each TeX command
// is about one glyph; the hash still covers the copy as written. A measured counter (the card's own element) sees the rendered text itself.
export const renderedDescription = text => String(text).replace(/\$([^$\n]+)\$/g, (_, tex) => tex.replace(/\\[A-Za-z]+/g, 'x').replace(/[{}^_\\]/g, ''));

export async function measureInteractDescription(plan, { counter = null, widths = DESCRIPTION_WIDTHS } = {}) {
  const text = plan.cardDescription;
  const count = counter ?? ((copy, column) => estimateLines(renderedDescription(copy), column));
  const measured = counter !== null;
  const rows = [];
  for (const cardWidth of widths) rows.push({ cardWidth, lines: Number(await count(text, columnWidth(cardWidth))) });
  return { descriptionHash: await contentHash(text), styleVersion: `${STYLE_VERSION}:${measured ? 'measured' : 'estimate'}`, widths: rows };
}

// The server lane's seam: ctx.descriptionFit(plan) -> Promise<receipt>. The default is the pure estimate for tests and offline fixtures;
// production injects the render-service measurer: (plan) => measureInteractDescription(plan, { counter: <the service's counter> }).
export const descriptionFit = plan => measureInteractDescription(plan);
