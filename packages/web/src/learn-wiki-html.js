// Turning a Wikipedia article into something safe to render inside the canvas.
//
// Anyone can edit Wikipedia, so this is the least trusted input the product
// renders. Parsoid output happens to carry no <script>, which is exactly why a
// strip-list feels sufficient and is not: the `style` attribute survives
// Wikimedia's own sanitiser, and one `position:fixed;inset:0` on any element
// puts an editor's markup over our canvas and composer, on our origin, looking
// like part of the app. No script required.
//
// So: an allowlist, closed over three axes - element names, attribute names,
// and href schemes. Anything unnamed is dropped.
//
// The policy is data and pure functions, tested in node. The walk that applies
// it needs a DOM and is covered by the browser check.

import { classifyHref, absoluteUrl, rewriteSrcset } from './learn-wiki-links.js';

// Removed with their contents. Unwrapping these would paste stylesheet text or
// script source into the article as visible words.
const DROP = new Set(['script', 'style', 'link', 'base', 'meta', 'head', 'title', 'noscript', 'iframe', 'object', 'embed', 'applet', 'form', 'input', 'button', 'select', 'textarea', 'svg', 'canvas', 'audio', 'video', 'source', 'track', 'template', 'slot']);

// Kept as themselves. Anything else is unwrapped - its text survives, its
// element does not - so an unknown tag can never carry behaviour.
const KEEP = new Set([
  'section', 'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  'a', 'img', 'figure', 'figcaption',
  'b', 'strong', 'i', 'em', 'u', 's', 'small', 'sub', 'sup', 'mark',
  'code', 'pre', 'kbd', 'samp', 'var', 'blockquote', 'cite', 'q', 'abbr', 'time', 'data', 'ruby', 'rt', 'rp', 'bdi', 'wbr',
  // MathML renders natively; its children are markup, not behaviour.
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'ms', 'mtext', 'mspace', 'mfrac', 'msqrt', 'mroot',
  'msup', 'msub', 'msubsup', 'munder', 'mover', 'munderover', 'mmultiscripts', 'mtable', 'mtr', 'mtd', 'mstyle', 'mpadded', 'mphantom', 'menclose', 'mfenced', 'merror',
]);

// No `style`, so no overlay. No `on*`, because they are not named here and
// nothing that is not named survives. `href` never passes through as written -
// the classifier decides what it becomes.
// `src` and `srcset` are safe to name only because every other element that
// can carry them - script, iframe, embed, video, source - is dropped outright,
// so an image is the one thing left that can have one, and it is rewritten to
// an absolute https URL below or removed.
const ATTRIBUTES = new Set(['id', 'alt', 'title', 'dir', 'lang', 'colspan', 'rowspan', 'span', 'width', 'height', 'typeof', 'datetime', 'value', 'start', 'reversed', 'src', 'srcset', 'data-mw-section-id']);

// `class` is not on that list, and passing it through would have re-opened the
// exact hole the allowlist exists to close. This app is Tailwind: every utility
// used anywhere in the bundle is reachable by name alone, so an editor writing
// `class="fixed inset-0 z-50 bg-white"` - which MediaWiki's own sanitiser
// permits - would cover the canvas and the composer with their own markup, on
// our origin, without a line of CSS or script.
//
// Prefixing every token makes an article's classes name-space of their own:
// `fixed` becomes `wiki-fixed`, which matches nothing.
export const wikiClass = value => String(value || '').split(/\s+/).filter(Boolean).map(token => `wiki-${token}`).join(' ');

// Article furniture that means nothing outside Wikipedia: the edit pencils, and
// the raster duplicate of every MathML block that renders alongside it.
const FURNITURE = '.mw-editsection, .mwe-math-fallback-image-inline, .mwe-math-fallback-image-display, .noprint, .mw-empty-elt, link, style, meta';

export const dropsEntirely = tag => DROP.has(String(tag || '').toLowerCase());
export const keepsElement = tag => KEEP.has(String(tag || '').toLowerCase());
export const keepsAttribute = name => ATTRIBUTES.has(String(name || '').toLowerCase());

// One delegated click handler reads these off the nearest anchor, so the walk
// records the decision rather than the raw href.
export function linkAttributes(href, current) {
  const link = classifyHref(href, current);
  if (link.kind === 'external') return { 'data-wiki': 'external', href: link.url, target: '_blank', rel: 'noreferrer nofollow' };
  // Stripping href also strips what makes an anchor a link: it stops being
  // announced as one and stops being reachable by keyboard. These put both
  // back; LearnWiki treats Enter on one as a press.
  const navigable = { role: 'link', tabindex: '0' };
  if (link.kind === 'article') return { ...navigable, 'data-wiki': 'article', 'data-wiki-title': link.title, ...(link.anchor ? { 'data-wiki-anchor': link.anchor } : {}) };
  if (link.kind === 'section' && link.anchor) return { ...navigable, 'data-wiki': 'section', 'data-wiki-anchor': link.anchor };
  if (link.kind === 'reference') return { ...navigable, 'data-wiki': 'reference', 'data-wiki-anchor': link.anchor };
  if (link.kind === 'file') return { ...navigable, 'data-wiki': 'file', 'data-wiki-title': link.title };
  // A red link and anything unusable keep their text and lose the affordance:
  // no href, so the app's global link styling has nothing to dress up.
  return { 'data-wiki': 'dead' };
}

// `title` is the article being rendered, so a link into it scrolls rather than
// refetching the page already on screen.
export function sanitizeArticle(html, title) {
  const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const root = parsed.body;
  root.querySelectorAll(FURNITURE).forEach(node => node.remove());
  // Snapshot first: the walk replaces elements, and a live list would skip.
  for (const element of [...root.querySelectorAll('*')]) {
    if (!element.isConnected) continue;
    const tag = element.tagName.toLowerCase();
    if (dropsEntirely(tag)) { element.remove(); continue; }
    if (!keepsElement(tag)) { element.replaceWith(...element.childNodes); continue; }
    // Read before stripping: `href` is deliberately not on the allowlist, so by
    // the time the loop below has run there is nothing left to classify and
    // every link would silently become a dead one.
    const href = element.getAttribute('href');
    const classes = wikiClass(element.getAttribute('class'));
    for (const attribute of [...element.attributes]) {
      if (!keepsAttribute(attribute.name)) element.removeAttribute(attribute.name);
    }
    if (classes) element.setAttribute('class', classes);
    if (tag === 'a') {
      for (const [name, value] of Object.entries(linkAttributes(href, title))) element.setAttribute(name, value);
    } else if (tag === 'img') {
      const src = absoluteUrl(element.getAttribute('src'));
      if (!src) { element.remove(); continue; }
      element.setAttribute('src', src);
      element.setAttribute('loading', 'lazy');
      element.setAttribute('referrerpolicy', 'no-referrer');
      const srcset = rewriteSrcset(element.getAttribute('srcset'));
      if (srcset) element.setAttribute('srcset', srcset); else element.removeAttribute('srcset');
    }
  }
  return root.innerHTML;
}

// href is read before the walk strips it, so this has to run on the sanitized
// output's data attributes instead. Kept beside the policy it depends on.
export function sectionInView(container) {
  if (!container) return 0;
  const top = container.getBoundingClientRect().top;
  let current = 0;
  for (const section of container.querySelectorAll('[data-mw-section-id]')) {
    if (section.getBoundingClientRect().top - top > 8) break;
    const index = Number(section.getAttribute('data-mw-section-id'));
    if (Number.isInteger(index)) current = index;
  }
  return current;
}
